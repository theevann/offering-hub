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
      country: true,
      city: true,
      latitude: true,
      longitude: true,
      timezone: true
    }
  });
}

module.exports = { getActiveGroups };