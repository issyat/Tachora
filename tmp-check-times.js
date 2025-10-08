import { PrismaClient } from './src/generated/prisma/index.js';

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.$queryRawUnsafe('SELECT openingTime::text as opening, closingTime::text as closing FROM "Store" LIMIT 5;');
  console.log(rows);
}

main().finally(async () => {
  await prisma.$disconnect();
});