const prisma = require("../db/prismaClient");


async function getAllOfferings() {
  const now = new Date();

  return await prisma.offering.findMany({
    where: {
      OR: [
        {
          startTime: {
            gte: now,
          },
        },
        {
          AND: [
            {
              startTime: null,
            },
            {
              expiresAt: {
                gt: now,
              },
            },
          ],
        },
      ],
      // rawMessage: {
      //   is: {
      //     parsingStatus: "PARSED_OK",
      //   },
      // },
    },
    orderBy: { startTime: "asc" },
    include: {
      rawMessage: {
        select: {
          rawText: true,
          senderPhone: true,
          group: {
            select: {
              id: true,
              sourceId: true,
              name: true,
              country: true,
              city: true,
              latitude: true,
              longitude: true,
              timezone: true,
            },
          },
        },
      },
      venue: {
        select: {
          displayName: true,
          address: true,
          googlePlaceId: true,
          latitude: true,
          longitude: true,
        },
      },
    },
  });
}

async function getNearbyOfferings({ lat, lng, radiusKm, limit = 50 }) {
  const radiusMeters = radiusKm * 1000;

  return await prisma.$queryRaw`
    WITH user_location AS (
      SELECT ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography AS geom
    )
    SELECT
      o.id,
      o.category,
      o.title,
      o.description,
      o."startTime",
      o."endTime",
      o."pricingType",
      o.price,
      o.links,
      o."locationSource",
      o."locationText",
      o.latitude,
      o.longitude,
      o."venueId",
      o."groupId",
      o."rawMessageId",
      o."createdAt",
      o."updatedAt",
      o."expiresAt",
      ROUND(
        (ST_Distance(o.location, ul.geom) / 1000.0)::numeric,
        3
      ) AS "distanceKm"
    FROM "Offering" o
    CROSS JOIN user_location ul
    WHERE
      o.location IS NOT NULL
      AND (o."expiresAt" IS NULL OR o."expiresAt" > now())
      AND (o."startTime" IS NULL OR o."startTime" > now())
      AND ST_DWithin(o.location, ul.geom, ${radiusMeters})
    ORDER BY "distanceKm" ASC
    LIMIT ${limit}
  `;
}

async function getAllRawMessages_deprecated() {
  return await prisma.offering.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      rawMessage: {
        select: {
          id: true,
          parsingStatus: true,
          parsingNotes: true,
          messageId: true,
          senderId: true,
          senderName: true,
          senderPhone: true,
          timestamp: true,
          group: {
            select: {
              id: true,
              sourceId: true,
              name: true,
              country: true,
              city: true,
              timezone: true,
            },
          },
        },
      },
    },
  });
}

module.exports = { getAllOfferings, getNearbyOfferings, getAllRawMessages_deprecated };
