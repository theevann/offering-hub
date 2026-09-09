const { createLogger } = require("../utils/logger");
const log = createLogger("location");

const prisma = require("../db/prismaClient");
const { Prisma } = require("@prisma/client");

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
            ORDER BY a.id
        `;

        if (exactMatchesFromParsed.length > 0) {
            if (exactMatchesFromParsed.length > 1) {
                log.info(`Multiple exact alias matches found for ${normalizedLocationName} in parsed location scope:`, exactMatchesFromParsed.map(a => a.alias));
            } else {
                log.info(`Exact alias match found for ${normalizedLocationName} in parsed location scope:`, exactMatchesFromParsed[0].alias);
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

    return prisma.venue.create({
        data: {
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

    const existingAlias = await prisma.venueAlias.findFirst({
        where: {
            venueId: venueId,
            normalizedAlias: normalizedAlias,
        },
    });

    if (existingAlias) {
        return existingAlias;
    }

    return prisma.venueAlias.create({
        data: {
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

async function searchGooglePlacesText(parsedLocation, group) {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
        log.warn("GOOGLE_MAPS_API_KEY is not set. Skipping Places text search.");
        return null;
    }

    if (!parsedLocation?.locationName && !parsedLocation?.addressFragment && !parsedLocation?.city) {
        log.info("No location name, address fragment or city provided, skipping Places text search.");
        return null;
    }

    const textQuery = buildPlacesTextQuery(parsedLocation, group);
    if (!textQuery) {
        return null;
    }

    let payload = {
        textQuery,
    };

    if (group?.latitude && group?.longitude) {
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

    log.debug("Searching Google Places with query:", textQuery);

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
        if (!topPlace?.location) return null;

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
        // ### For now, we will not do fuzzy matching and send to gmaps if the alis is not an exact match. ###
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


    // 3 - Google Places text search
    const topPlace = await searchGooglePlacesText(parsedLocation, group);
    // log.info("Top Google Place result:", JSON.stringify(topPlace, null, 2));

    if (topPlace?.id && topPlace?.displayName?.text) {
        let venue = await getVenueFromPlaceId(topPlace.id) || await addNewVenueFromPlaces(topPlace);
        location.venueId = venue.id;

        await addVenueAlias(venue.id, topPlace.displayName.text, "GOOGLE_PLACE");
        if (normalizeLocation(topPlace.displayName.text) !== normalizedLocationName) {
            await addVenueAlias(venue.id, parsedLocation.locationName, "GOOGLE_PLACE");
        }

        log.info("Found venue on Google Places:", venue.displayName, venue.city ?? "", venue.country ?? "");
    }

    if (topPlace?.location?.latitude != null && topPlace?.location?.longitude != null) {
        location.source = "GOOGLE_PLACE";
        location.latitude = topPlace.location.latitude;
        location.longitude = topPlace.location.longitude;
        return location;
    }

    // 4 - Group center fallback
    if (group?.latitude != null && group?.longitude != null) {
        location.source = "GROUP_FALLBACK";
        location.latitude = group.latitude;
        location.longitude = group.longitude;
        return location;
    }

    return location;
}

module.exports = { resolveLocation, buildPlacesTextQuery, normalizeLocation, searchAliases, buildVenueScope };
