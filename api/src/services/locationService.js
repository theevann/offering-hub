const { createLogger } = require("../utils/logger");
const log = createLogger("location");

const prisma = require("../db/prismaClient");
const { Prisma } = require("@prisma/client");
const { createHash } = require("node:crypto");

const GOOGLE_QUERY_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// This service will contain logic related to resolving and standardizing location information for parsed offerings.

// 0. Normalise: lowercase, trim, remove punctuation
// 1 A Google Maps URL is present in the message
// 2 Alias match - Venue name match
// 3 Google Places text search
// 4 Google Geocode <- not needed if we can get lat/lng from places search...
// 5 Group fallback

function normalizeLocation(text) {
    if (!text || typeof text !== "string")
        return "";

    return text
        .toLowerCase()
        .normalize("NFD")
        .replace(/\p{M}/gu, "")          // Remove accent marks
        .replace(/[^\p{L}\p{N}\s]/gu, " ") // Keep letters across languages
        .replace(/\s+/g, " ")
        .trim();
}

function buildVenueScope(group) {
    switch (group.type) {
        case "PRESENT":
            const conditions = [];
            if (group.country) {
                conditions.push(Prisma.sql`v.country = ${group.country}`);
            }
            if (group.adminArea) {
                conditions.push(Prisma.sql`v."adminArea" = ${group.adminArea}`);
            }
            if (group.city) {
                conditions.push(Prisma.sql`v.city = ${group.city}`);
            }
            if (conditions.length === 0) return null;
            return Prisma.join(conditions, " AND ");

        case "COUNTRY":
            if (!group.country) return null;
            return Prisma.sql`v.country = ${group.country}`;

        case "REGION":
            if (!group.country || !group.adminArea) return null;
            return Prisma.sql`
            v.country = ${group.country}
            AND v."adminArea" = ${group.adminArea}
        `;

        case "CITY":
            if (!group.country || !group.city) return null;
            return Prisma.sql`
            v.country = ${group.country}
            AND v.city = ${group.city}
            ${group.adminArea
                    ? Prisma.sql`AND v."adminArea" = ${group.adminArea}`
                    : Prisma.empty
                }
        `;

        case "VENUE":
            if (!group.venueId) return null;
            return Prisma.sql`v.id = ${group.venueId}`;

        default:
            return null;
    }
}

async function searchAliases(parsedLocation, group) {
    const normalizedLocationName = normalizeLocation(parsedLocation?.locationName);
    if (!normalizedLocationName || !group) return null;

    const scopeParsed = buildVenueScope({
        type: "PRESENT",
        country: parsedLocation?.country,
        adminArea: parsedLocation?.adminArea,
        city: parsedLocation?.city,
    });

    if (scopeParsed) {
        log.debug("Alias search scope for parsed location:", JSON.stringify(scopeParsed?.values, null, 2));

        const exactMatchesFromParsed = await prisma.$queryRaw`
            SELECT a.*, row_to_json(v) AS venue
            FROM "VenueAlias" a
            JOIN "Venue" v ON v.id = a."venueId"
            WHERE ${scopeParsed}
            AND a."normalizedAlias" = ${normalizedLocationName}
            AND a.source <> 'GOOGLE_QUERY'
            ORDER BY a.id
        `;

        if (exactMatchesFromParsed.length > 0) {
            if (exactMatchesFromParsed.length > 1) {
                log.warn(`Multiple exact alias matches found for ${normalizedLocationName} in parsed location scope:`, exactMatchesFromParsed.map(a => a.alias));
            } else {
                log.debug(`Exact alias match found for ${normalizedLocationName} in parsed location scope:`, exactMatchesFromParsed[0].alias);
                return exactMatchesFromParsed[0];
            }
        }
    } else {
        log.debug("No parsed location scope");
    }

    const scopeGroup = buildVenueScope(group);
    if (!scopeGroup) return null;

    log.debug("Alias search scope for group location:", JSON.stringify(scopeGroup?.values, null, 2));

    const exactMatchesFromGroup = await prisma.$queryRaw`
        SELECT a.*, row_to_json(v) AS venue
        FROM "VenueAlias" a
        JOIN "Venue" v ON v.id = a."venueId"
        WHERE ${scopeGroup}
          AND a."normalizedAlias" = ${normalizedLocationName}
          AND a.source <> 'GOOGLE_QUERY'
        ORDER BY a.id
        LIMIT 1
    `;

    return exactMatchesFromGroup[0] ?? null;

    // if (exactMatchesFromGroup.length > 0) {
    //     return exactMatchesFromGroup[0];
    // }

    // const fuzzyMatches = await prisma.$queryRaw`
    //     SELECT a.*, row_to_json(v) AS venue, similarity(a."normalizedAlias", ${normalizedLocationName}) AS "similarityScore"
    //     FROM "VenueAlias" a
    //     JOIN "Venue" v ON v.id = a."venueId"
    //     WHERE ${scopeGroup}
    //     AND similarity(a."normalizedAlias", ${normalizedLocationName}) > 0.6
    //     ORDER BY similarity(a."normalizedAlias", ${normalizedLocationName}) DESC
    //     LIMIT 3;
    // `;

    // log.info('Fuzzy alias search results for', normalizedLocationName, JSON.stringify(fuzzyMatches, null, 2));

    // return fuzzyMatches[0] ?? null;
}

async function getVenueFromPlaceId(googlePlaceId) {
    if (!googlePlaceId) return null;

    return await prisma.venue.findUnique({
        where: { googlePlaceId },
    });
}

async function addNewVenueFromPlaces(place) {
    const city = place.addressComponents?.find(
        c => c.types?.includes("locality") || c.types?.includes("postal_town"))?.longText ?? null;
    const adminArea = place.addressComponents?.find(c => c.types?.includes("administrative_area_level_1"))?.longText ?? null;
    const country = place.addressComponents?.find(c => c.types?.includes("country"))?.longText ?? null;

    return prisma.venue.upsert({
        where: { googlePlaceId: place.id },
        update: {},
        create: {
            displayName: place.displayName.text,
            normalizedName: normalizeLocation(place.displayName.text),
            address: place.formattedAddress,
            city: city,
            adminArea: adminArea,
            country: country,
            googlePlaceId: place.id,
            mapsUrl: place.googleMapsUri,
            latitude: place.location.latitude,
            longitude: place.location.longitude,
        },
        select: {
            id: true,
            displayName: true,
            city: true,
            adminArea: true,
            country: true,
            googlePlaceId: true,
            latitude: true,
            longitude: true,
        }
    });

}

async function addVenueAlias(venueId, aliasText, source, similarityScore = 0) {
    const normalizedAlias = normalizeLocation(aliasText);
    if (!venueId || !normalizedAlias) return null;

    return prisma.venueAlias.upsert({
        where: {
            venueId_normalizedAlias: { venueId, normalizedAlias },
        },
        update: {},
        create: {
            alias: aliasText,
            normalizedAlias: normalizedAlias,
            venueId: venueId,
            source: source,
            confidence: similarityScore,
        },
    });

}

function buildPlacesTextQuery(location, group) {
    if (!location) return null;

    const hasExplicitGeography =
        location.city || location.adminArea || location.country;

    const geography = hasExplicitGeography
        ? [location.city, location.adminArea, location.country]
        : [group?.city || group?.adminArea, group?.country];

    const parts = [
        location.locationName,
        location.addressFragment,
        ...geography
    ];

    return parts
        .map(part => part?.trim())
        .filter(Boolean)
        .join(", ") || null;
}

function buildPlacesRequest(parsedLocation, group) {
    if (!parsedLocation?.locationName && !parsedLocation?.addressFragment && !parsedLocation?.city) {
        log.info("No location name, address fragment or city provided, skipping Places text search.");
        return null;
    }

    const textQuery = buildPlacesTextQuery(parsedLocation, group);
    if (!textQuery) {
        return null;
    }

    const payload = {
        textQuery,
    };

    if (Number.isFinite(group?.latitude) && Number.isFinite(group?.longitude)) {
        payload.locationBias = {
            circle: {
                center: {
                    latitude: group.latitude,
                    longitude: group.longitude
                },
                radius: (group?.radiusKm ?? 0) * 1000
            }
        };
    }

    return payload;
}

function getGoogleQueryHash(payload) {
    // buildPlacesRequest uses a fixed property order. Hash the exact body sent to Google;
    // bump the version if request defaults or resolution semantics change.
    return `gplaces:v1:${createHash("sha256").update(JSON.stringify(payload)).digest("hex")}`;
}

async function findGoogleQueryVenue(queryHash) {
    const matches = await prisma.venueAlias.findMany({
        where: {
            normalizedAlias: queryHash,
            source: "GOOGLE_QUERY",
            updatedAt: { gt: new Date(Date.now() - GOOGLE_QUERY_CACHE_TTL_MS) },
        },
        include: { venue: true },
        take: 2,
    });
    // The existing constraint is per venue, so a hash can have conflicting matches.
    if (matches.length > 1) {
        log.warn("Ambiguous Google query cache entry:", queryHash);
    }
    return matches.length === 1 ? matches[0].venue : null;
}

async function saveGoogleQueryVenue(queryHash, payload, venueId) {
    return prisma.venueAlias.upsert({
        where: { venueId_normalizedAlias: { venueId, normalizedAlias: queryHash } },
        create: {
            alias: payload.textQuery,
            normalizedAlias: queryHash,
            venueId,
            source: "GOOGLE_QUERY",
        },
        // Refresh this venue's mapping. Expired mappings to other venues remain ignored.
        update: { alias: payload.textQuery, updatedAt: new Date() },
    });
}

async function searchGooglePlacesText(payload) {
    if (!payload) return null;
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
        log.warn("GOOGLE_MAPS_API_KEY is not set. Skipping Places text search.");
        return null;
    }

    log.debug("Searching Google Places with query:", payload.textQuery);

    try {
        const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Goog-Api-Key": apiKey,
                "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location,places.googleMapsUri,places.primaryType,places.types,places.addressComponents"
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            log.warn(`Google Places text search failed (${response.status}): ${errorText}`);
            return null;
        }

        const data = await response.json();
        // const data = {"places": [
        //     {
        //     "id": "ChIJgTRUFQAT4ToR1FSjX3mYxXI",
        //     "formattedAddress": "Midigama, Ahangama 80650, Sri Lanka",
        //     "location": {
        //         "latitude": 5.9647799,
        //         "longitude": 80.3915415
        //     },
        //     "googleMapsUri": "https://maps.google.com/?cid=8270183937798788308&g_mp=Cidnb29nbGUubWFwcy5wbGFjZXMudjEuUGxhY2VzLlNlYXJjaFRleHQQAhgEIAA",
        //     "displayName": {
        //         "text": "Unsung",
        //         "languageCode": "en"
        //     }
        //     },
        //     {
        //     "id": "ChIJ55hrSXQV4ToR4ka2flVpSrc",
        //     "formattedAddress": "XCFQ+V73, 34 Weligama By Pass Rd, Weligama 81700, Sri Lanka",
        //     "location": {
        //         "latitude": 5.971097299999999,
        //         "longitude": 80.4268312
        //     },
        //     "googleMapsUri": "https://maps.google.com/?cid=13207484673136412386&g_mp=Cidnb29nbGUubWFwcy5wbGFjZXMudjEuUGxhY2VzLlNlYXJjaFRleHQQAhgEIAA",
        //     "displayName": {
        //         "text": "Weligama Beach",
        //         "languageCode": "en"
        //     }
        //     }
        // ]};

        // log.info("Google Places text search results for query:", textQuery, JSON.stringify(data, null, 2));

        // log.info("Google Places text search results:", data?.places?.map(place => ({
        //     id: place.id,
        //     displayName: place.displayName?.text,
        //     formattedAddress: place.formattedAddress,
        //     latitude: place.location?.latitude,
        //     longitude: place.location?.longitude
        // })));

        const topPlace = data?.places?.[0];
        if (!Number.isFinite(topPlace?.location?.latitude) ||
            !Number.isFinite(topPlace?.location?.longitude)) return null;

        return topPlace;
    } catch (error) {
        log.warn("Google Places text search error:", error.message);
        return null;
    }
}

async function resolveLocation(parsedLocation, group) {
    parsedLocation = parsedLocation || {};

    const location = {
        source: "UNKNOWN",
        longitude: null,
        latitude: null,
        venueId: null,
    };

    // if not locationName or addressFragment is present, return null
    // if (!parsedLocation?.locationName?.trim() && !parsedLocation?.addressFragment?.trim()) {
    //     return location;
    // }

    const normalizedLocationName = normalizeLocation(parsedLocation.locationName);

    // 1 - Google maps url (TODO)


    // 2 - Alias table search
    const aliasMatch = await searchAliases(parsedLocation, group);

    if (aliasMatch) {
        // ### For now, we will not do fuzzy matching and send to gmaps if the alias is not an exact match. ###
        // Add new alias if the parsed location name is different from the existing normalized alias
        // if (aliasMatch.normalizedAlias !== normalizedLocationName && aliasMatch.similarityScore > 0.8) {
        //     await addVenueAlias(aliasMatch.venueId, parsedLocation.locationName, "FUZZY_MATCH", aliasMatch.similarityScore);
        // }
        // log.info("Top Alias result:", aliasMatch?.alias, "| Venue:", aliasMatch?.venue?.displayName, "| Similarity Score:", aliasMatch?.similarityScore || 1);

        log.info("Alias result:", aliasMatch?.alias, "| Venue:", aliasMatch?.venue?.displayName);


        location.source = "ALIAS_MATCH";
        location.venueId = aliasMatch.venueId ?? null;
        location.latitude = aliasMatch.venue?.latitude ?? null;
        location.longitude = aliasMatch.venue?.longitude ?? null;
        return location;
    }
    log.info("No alias match found for:", normalizedLocationName);


    // 3 - Exact Google query cache. The request already contains its geographic context;
    const payload = buildPlacesRequest(parsedLocation, group);
    const queryHash = payload ? getGoogleQueryHash(payload) : null;
    const cachedVenue = queryHash ? await findGoogleQueryVenue(queryHash) : null;
    if (cachedVenue) {
        await addVenueAlias(cachedVenue.id, parsedLocation.locationName, "GOOGLE_PLACE");
        log.info("Google query cache hit:", payload.textQuery, "| Venue:", cachedVenue.displayName);
        return {
            source: "ALIAS_MATCH",
            venueId: cachedVenue.id,
            latitude: cachedVenue.latitude,
            longitude: cachedVenue.longitude,
        };
    }

    // 4 - Google Places text search
    const topPlace = await searchGooglePlacesText(payload);
    // log.info("Top Google Place result:", JSON.stringify(topPlace, null, 2));

    if (topPlace?.id && topPlace?.displayName?.text) {
        let venue = await getVenueFromPlaceId(topPlace.id) || await addNewVenueFromPlaces(topPlace);
        location.venueId = venue.id;

        await addVenueAlias(venue.id, topPlace.displayName.text, "GOOGLE_PLACE");
        if (normalizeLocation(topPlace.displayName.text) !== normalizedLocationName) {
            await addVenueAlias(venue.id, parsedLocation.locationName, "GOOGLE_PLACE");
        }

        await saveGoogleQueryVenue(queryHash, payload, venue.id);

        log.info("Found venue on Google Places:", venue.displayName, venue.city ?? "", venue.country ?? "");
    }

    if (topPlace?.location?.latitude != null && topPlace?.location?.longitude != null) {
        location.source = "GOOGLE_PLACE";
        location.latitude = topPlace.location.latitude;
        location.longitude = topPlace.location.longitude;
        return location;
    }

    // 5 - Group center fallback
    if (group?.latitude != null && group?.longitude != null) {
        location.source = "GROUP_FALLBACK";
        location.latitude = group.latitude;
        location.longitude = group.longitude;
        return location;
    }

    return location;
}

module.exports = { resolveLocation, buildPlacesTextQuery, normalizeLocation, searchAliases, buildVenueScope };
