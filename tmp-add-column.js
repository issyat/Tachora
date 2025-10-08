import { PrismaClient } from './src/generated/prisma/index.js';

const prisma = new PrismaClient();

async function main() {
  try {
    await prisma.$executeRawUnsafe('ALTER TABLE "public"."Store" ADD COLUMN "openingTime" TIME;');
    console.log('column added');
  } catch (err) {
    console.error('error', err);
  }
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  });