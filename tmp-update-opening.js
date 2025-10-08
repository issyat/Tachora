import { PrismaClient } from './src/generated/prisma/index.js';

const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe("UPDATE \"public\".\"Store\" SET \"openingTime\" = COALESCE(\"openingTime\", TIME '09:00');");
  const stores = await prisma.$queryRawUnsafe('SELECT id, "openingTime", "closingTime" FROM "Store" LIMIT 5;');
  console.log(stores);
}

main()
  .catch((err) => console.error(err))
  .finally(async () => {
    await prisma.$disconnect();
  });