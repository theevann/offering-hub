const prisma = require("../db/prismaClient");

async function getActiveGroups() {
  return await prisma.group.findMany({
    where: {
      active: true
    },
    select: {
      id: true,
      whatsappId: true,
      name: true,
      type: true,
      country: true,
      adminArea: true,
      city: true,
      latitude: true,
      longitude: true,
      radiusKm: true,
      timezone: true,
      venueId: true
    }
  });
}

module.exports = { getActiveGroups };
