const { createLogger } = require("../utils/logger");
const log = createLogger("prismaClient");

const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require('@prisma/adapter-pg');

const connectionString = `${process.env.DATABASE_URL}`
if (!connectionString || connectionString === 'undefined') {
  log.error('DATABASE_URL is not set');
  process.exit(1);
}

log.debug('Database client configured')
// log.debug(`Using DATABASE_URL: ${connectionString}`)


const adapter = new PrismaPg({ connectionString })
const prisma = new PrismaClient({ adapter })

module.exports = prisma;