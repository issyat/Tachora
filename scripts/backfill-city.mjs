import { PrismaClient } from "../src/generated/prisma/default.js";

const prisma = new PrismaClient();

async function main() {
  const result = await prisma.$executeRawUnsafe('UPDATE "Store" SET "city" = $1 WHERE "city" IS NULL OR "city" = $2', 'Brussels', '');
  console.log(`Backfilled rows: ${result}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
