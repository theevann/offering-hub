const prisma = require("../db/prismaClient");

async function getAllOfferings() {
  return await prisma.offering.findMany({
    where: {
      // startTime: {
      //   gte: new Date(),
      // },
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
          group: {
            select: {
              id: true,
              whatsappId: true,
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
    },
  });
}

async function getAllRawMessages() {
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
              whatsappId: true,
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

module.exports = { getAllOfferings, getAllRawMessages };
