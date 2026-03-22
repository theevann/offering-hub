if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config()
}
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require('@prisma/adapter-pg');

const connectionString = `${process.env.DATABASE_URL}`
if (!connectionString || connectionString === 'undefined') {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}
console.log('Using DATABASE_URL:', connectionString)

const adapter = new PrismaPg({ connectionString })
const prisma = new PrismaClient({ adapter })

module.exports = prisma;