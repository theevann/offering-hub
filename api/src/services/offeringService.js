const { createLogger } = require("../utils/logger");
const log = createLogger("offering");

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
    },
    orderBy: { startTime: "asc" },
    include: {
      group: true,
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

async function getNearbyOfferings({ lat, lng, radiusKm, limit = 50, offset = 0 }) {
  const radiusMeters = radiusKm * 1000;
  log.info(`Searching for offerings near (${lat}, ${lng}) within ${radiusKm} km, limit ${limit}, offset ${offset}`);

  // PostGIS selects the nearby IDs and calculates their distance.
  const nearby = await prisma.$queryRaw`
    WITH user_location AS (
      SELECT ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography AS geom
    )
    SELECT
      o.id,
      ST_AsGeoJSON(o.location)::json AS location,
      ROUND(
        (ST_Distance(o.location, ul.geom) / 1000.0)::numeric,
        3
      ) AS "distanceKm"
    FROM "Offering" o
    CROSS JOIN user_location ul
    WHERE
      o.location IS NOT NULL
      AND (o."expiresAt" IS NULL OR o."expiresAt" > now())
      AND (
        o.category IN ('SERVICE', 'RENTAL', 'SALE')
        OR o."startTime" IS NULL
        OR o."startTime" >= date_trunc('day', now()) - interval '1 day'
        OR o."endTime" > now()
      )
      AND ST_DWithin(o.location, ul.geom, ${radiusMeters})
    ORDER BY "distanceKm" ASC, o.id ASC
    LIMIT ${limit}
    OFFSET ${offset}
  `;

  if (!nearby.length) return [];

  // Prisma returns every supported scalar field and the related records.
  const offerings = await prisma.offering.findMany({
    where: { id: { in: nearby.map((offering) => offering.id) } },
    include: {
      venue: true,
      group: true,
      media: true,
    },
  });

  // An IN query has no guaranteed order; restore the spatial query's order.
  const byId = new Map(offerings.map((offering) => [offering.id, offering]));
  return nearby
    .filter(({ id }) => byId.has(id))
    .map(({ id, location, distanceKm }) => ({
      ...byId.get(id),
      location,
      distanceKm,
    }));
}

async function getOfferingById(id) {
  const offering = await prisma.offering.findUnique({
    where: { id },
    include: {
      venue: true,
      group: { select: { name: true, timezone: true } },
      processingJob: {
        include: {
          rawMessages: {
            select: { id: true, rawText: true, timestamp: true, createdAt: true },
            orderBy: [{ timestamp: "asc" }, { createdAt: "asc" }],
          },
        },
      },
      media: { select: { id: true, type: true, url: true } },
    },
  });

  if (!offering) return null;

  const rawMessages = offering.processingJob?.rawMessages || [];

  return {
    ...offering,
    rawMessages,
  };
}

module.exports = { getAllOfferings, getNearbyOfferings, getOfferingById };
