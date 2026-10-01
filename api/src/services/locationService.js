const { createLogger } = require("../utils/logger");
const log = createLogger("location");

const prisma = require("../db/prismaClient");
const { Prisma } = require("@prisma/client");
const { createHash } = require("node:crypto");
const { normalizeOfferingLocation } = require("../utils/offeringLocation");

const GOOGLE_QUERY_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// Resolve physical destinations separately from the community area used for discovery.

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
    switch (group?.type) {
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
    const normalizedVenueName = normalizeLocation(parsedLocation?.venueName);
    if (!normalizedVenueName) return null;

    // Explicit geography takes precedence: never retry the same name in another
    // area's group scope when the message already identifies its geography.
    const scope = hasExplicitGeography(parsedLocation)
        ? buildVenueScope({ type: "PRESENT", ...parsedLocation })
        : buildVenueScope(group);
    if (!scope) return null;

    const matches = await prisma.$queryRaw`
        SELECT a.*, row_to_json(v) AS venue
        FROM "VenueAlias" a
        JOIN "Venue" v ON v.id = a."venueId"
        WHERE ${scope}
          AND a."normalizedAlias" = ${normalizedVenueName}
          AND a.source <> 'GOOGLE_QUERY_CACHE'
        ORDER BY a.id
        LIMIT 2
    `;

    if (matches.length > 1) {
        log.warn("Ambiguous venue alias:", parsedLocation.venueName);
        return null;
    }
    return matches[0] ?? null;
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

    const geography = hasExplicitGeography(location)
        ? [location.city, location.adminArea, location.country]
        : [group?.city || group?.adminArea, group?.country];

    const parts = [
        location.venueName,
        location.address,
        ...geography
    ];

    return parts
        .map(part => part?.trim())
        .filter(Boolean)
        .join(", ") || null;
}

function buildPlacesRequest(parsedLocation, group) {
    if (!parsedLocation?.venueName && !parsedLocation?.address && !hasExplicitGeography(parsedLocation)) {
        log.info("No venue, address or geography provided; skipping Places text search.");
        return null;
    }

    const textQuery = buildPlacesTextQuery(parsedLocation, group);
    if (!textQuery) {
        return null;
    }

    const payload = {
        textQuery,
    };

    if (!hasExplicitGeography(parsedLocation) && Number.isFinite(group?.latitude) && Number.isFinite(group?.longitude)) {
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
    return `gplaces:v2:${createHash("sha256").update(JSON.stringify(payload)).digest("hex")}`;
}

async function findGoogleQueryVenue(queryHash) {
    const matches = await prisma.venueAlias.findMany({
        where: {
            normalizedAlias: queryHash,
            source: "GOOGLE_QUERY_CACHE",
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
            source: "GOOGLE_QUERY_CACHE",
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
        const topPlace = data?.places?.[0];
        if (!Number.isFinite(topPlace?.location?.latitude) ||
            !Number.isFinite(topPlace?.location?.longitude)) return null;

        return topPlace;
    } catch (error) {
        log.warn("Google Places text search error:", error.message);
        return null;
    }
}

function hasExplicitGeography(location) {
    return Boolean(location?.city || location?.adminArea || location?.country);
}

function unknownLocation() {
    return { source: "UNKNOWN", latitude: null, longitude: null, venueId: null };
}

function groupFallback(group) {
    if (!Number.isFinite(group?.latitude) || !Number.isFinite(group?.longitude)) {
        return unknownLocation();
    }
    return {
        source: "GROUP_FALLBACK",
        latitude: group.latitude,
        longitude: group.longitude,
        venueId: null,
    };
}

function locationFromVenue(venue, source) {
    return {
        source,
        latitude: venue.latitude,
        longitude: venue.longitude,
        venueId: venue.id,
    };
}

function isAreaResult(place) {
    const areaTypes = [
        "country", "administrative_area_level_1", "administrative_area_level_2",
        "administrative_area_level_3", "locality", "postal_town", "sublocality",
        "sublocality_level_1", "neighborhood", "postal_code", "political",
        "beach",
    ];
    const types = place.primaryType ? [place.primaryType] : (place.types || []);
    return types.some(type => areaTypes.includes(type));
}

async function resolveNamedVenue(location, group) {
    // Only explicitly named venues enter the alias and venue-query cache paths.
    const alias = await searchAliases(location, group);
    if (alias?.venue && Number.isFinite(alias.venue.latitude) && Number.isFinite(alias.venue.longitude)) {
        return locationFromVenue({ ...alias.venue, id: alias.venueId }, "ALIAS_MATCH");
    }

    const payload = buildPlacesRequest(location, group);
    const queryHash = getGoogleQueryHash(payload);
    const cachedVenue = await findGoogleQueryVenue(queryHash);
    if (cachedVenue) {
        await addVenueAlias(cachedVenue.id, location.venueName, "GOOGLE_PLACE");
        return locationFromVenue(cachedVenue, "GOOGLE_QUERY_CACHE");
    }

    const place = await searchGooglePlacesText(payload);
    // A search for a venue that returns only a city is not a resolved venue.
    if (!place?.id || !place.displayName?.text || isAreaResult(place)) return null;

    const venue = await getVenueFromPlaceId(place.id) || await addNewVenueFromPlaces(place);
    await addVenueAlias(venue.id, place.displayName.text, "GOOGLE_PLACE");
    await addVenueAlias(venue.id, location.venueName, "GOOGLE_PLACE");
    await saveGoogleQueryVenue(queryHash, payload, venue.id);
    return locationFromVenue(venue, "GOOGLE_PLACE");
}

async function resolveAddressOrArea(location, group) {
    const payload = buildPlacesRequest(location, group);
    const place = await searchGooglePlacesText(payload);
    if (!place) return null;

    const isArea = isAreaResult(place);
    // An area-only search must not turn the first business in that area into
    // the offering's location. These results never create venues or aliases.
    if (!location.address && !isArea) return null;
    return {
        source: isArea ? "GOOGLE_AREA" : "GOOGLE_ADDRESS",
        latitude: place.location.latitude,
        longitude: place.location.longitude,
        venueId: null,
    };
}

async function resolveLocation(parsedLocation, group) {
    const location = normalizeOfferingLocation(parsedLocation);

    // Online-only offerings belong in local discovery, but have no physical venue.
    if (location.modes.length === 1 && location.modes[0] === "online") return groupFallback(group);

    // Home visits resolve the service area only, even if extraction accidentally
    // includes the provider's own venue or address.
    const physicalLocation = !location.modes.includes("at_provider")
        ? { ...location, venueName: null, address: null }
        : location;

    if (physicalLocation.venueName) {
        const venue = await resolveNamedVenue(physicalLocation, group);
        if (venue) return venue;
    }

    // If a named venue could not be found, its stated address/area can still
    // locate the offering approximately without inventing a venue association.
    const addressOrArea = { ...physicalLocation, venueName: null };
    if (addressOrArea.address || hasExplicitGeography(addressOrArea)) {
        const resolved = await resolveAddressOrArea(addressOrArea, group);
        if (resolved) return resolved;
    }

    // Do not replace an explicitly stated area with an unrelated group area.
    if (hasExplicitGeography(physicalLocation)) return unknownLocation();
    return groupFallback(group);
}

module.exports = { resolveLocation, buildPlacesTextQuery, normalizeLocation, searchAliases, buildVenueScope };
