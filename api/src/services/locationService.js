const prisma = require("../db/prismaClient");

// This service will contain logic related to resolving and standardizing location information for parsed offerings.

// 0. Normalise: lowercase, trim, remove punctuation
// 1 A Google Maps URL is present in the message
// 2 Alias match - Venue name match
// 3 Google Places text search
// 4 Google Geocode <- not needed if we can get lat/lng from places search...
// 5 Group fallback

function normalizeLocation(text) {
  if (!text || typeof text !== "string") return "";
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function searchAliases(normalizedLocationName) {
    if (!normalizedLocationName) return null;

    let aliasMatch = await prisma.venueAlias.findFirst({
        where: {
            normalizedAlias: normalizedLocationName
        },
        include: { venue: true }
    })

    if (!aliasMatch) {
        const aliases = await prisma.$queryRaw`
            SELECT a.*, v.*, similarity(a."normalizedAlias", ${normalizedLocationName}) AS "similarityScore"
            FROM "VenueAlias" a
            JOIN "Venue" v ON v.id = a."venueId"
            WHERE similarity(a."normalizedAlias", ${normalizedLocationName}) > 0.6
            ORDER BY similarity(a."normalizedAlias", ${normalizedLocationName}) DESC
            LIMIT 3;
        `;

        console.log('Fuzzy alias search results for', normalizedLocationName, aliases);
        
        if (aliases.length > 0) {
            aliasMatch = aliases[0]; // Take the best match for now, can be improved later
        }
    }

    return aliasMatch
}

async function addNewVenueFromPlaces(place) {
    return prisma.venue.create({
        data: {
            displayName: place.displayName.text,
            normalizedName: normalizeLocation(place.displayName.text),
            address: place.formattedAddress,
            googlePlaceId: place.id,
            mapsUrl: place.googleMapsUri,
            latitude: place.location.latitude,
            longitude: place.location.longitude,
        },
        select: {
            id: true,
            displayName: true,
            googlePlaceId: true,
            latitude: true,
            longitude: true,
        }
    });

}

async function addVenueAlias(venueId, aliasText, source, similarityScore = 0) {
    const normalizedAlias = normalizeLocation(aliasText);
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

function buildPlacesTextQuery(parsedLocation, group) {
    const parts = [];
    if (parsedLocation?.locationName) parts.push(parsedLocation.locationName.trim());
    if (parsedLocation?.addressFragment) parts.push(parsedLocation.addressFragment.trim());
    if (group?.city) parts.push(group.city.trim());
    if (group?.adminArea) parts.push(group.adminArea.trim());
    if (group?.country) parts.push(group.country.trim());

    const query = parts.filter(Boolean).join(", ").trim();
    return query || null;
}

async function searchGooglePlacesText(parsedLocation, group) {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
        console.log("GOOGLE_MAPS_API_KEY is not set. Skipping Places text search.");
        return null;
    }

    const textQuery = buildPlacesTextQuery(parsedLocation, group);
    if (!textQuery) {
        return null;
    }

    try {
        const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Goog-Api-Key": apiKey,
                "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location,places.googleMapsUri"
            },
            body: JSON.stringify({ textQuery })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.log(`Google Places text search failed (${response.status}): ${errorText}`);
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

        // console.log("Google Places text search results for query:", textQuery, JSON.stringify(data, null, 2));
        
        const topPlace = data?.places?.[0];
        if (!topPlace?.location) return null;

        return topPlace;
    } catch (error) {
        console.log("Google Places text search error:", error.message);
        return null;
    }
}

async function resolveLocation(parsedLocation, group) {
    //if not locationName or addressFragment is present, return null
    if (!parsedLocation?.locationName?.trim() && !parsedLocation?.addressFragment?.trim()) {
        return null;
    }

    const location = {
        source: "UNKNOWN",
        longitude: null,
        latitude: null,
        venueId: null,
    };

    const normalizedLocationName = normalizeLocation(parsedLocation.locationName);
    
    // 1 - Google maps url (TODO)


    // 2 - Alias table search
    const aliasMatch = await searchAliases(normalizedLocationName);
    
    if (aliasMatch) {
        // Add new alias if the parsed location name is different from the existing normalized alias
        if (normalizedLocationName && aliasMatch.normalizedAlias !== normalizedLocationName) {
            const aliasText = parsedLocation.locationName;
            try {
                await addVenueAlias(aliasMatch.venueId, aliasText, "FUZZY_MATCH", aliasMatch.similarityScore);
            } catch (error) {
                console.log("Failed to add new venue alias:", error.message);
            }
        }
        location.source = "ALIAS_MATCH";
        location.venueId = aliasMatch.venueId ?? null;
        location.latitude = aliasMatch.venue?.latitude ?? null;
        location.longitude = aliasMatch.venue?.longitude ?? null;
        return location;
    }


    // 3 - Google Places text search
    const topPlace = await searchGooglePlacesText(parsedLocation, group);
    
    if (topPlace?.id && topPlace?.displayName?.text) {
        // Add to venue table if not already present
        let venue = await prisma.venue.findUnique({ where: { googlePlaceId: topPlace.id } });
        if (!venue) {
            try {
                venue = await addNewVenueFromPlaces(topPlace);
                location.venueId = venue.id;
                console.log("Added new venue from Google Places data:", venue.displayName);
            } catch (error) {
                console.log("Failed to add new venue from Google Places data:", error.message);
            }
        }

        // Add alias for the place name
        if (venue) {
            try {
                await addVenueAlias(venue.id, topPlace.displayName.text, "GOOGLE_PLACE");
                if (normalizedLocationName && normalizeLocation(topPlace.displayName.text) !== normalizedLocationName) {
                    await addVenueAlias(venue.id, parsedLocation.locationName, "GOOGLE_PLACE");
                }
            } catch (error) {
                console.log("Failed to add venue alias for Google Place:", error.message);
            }
        }
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

module.exports = { resolveLocation, buildPlacesTextQuery };
