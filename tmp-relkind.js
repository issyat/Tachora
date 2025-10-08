import { PrismaClient } from './src/generated/prisma/index.js';

const prisma = new PrismaClient();

async function main() {
  const info = await prisma.$queryRawUnsafe("SELECT relname, relkind FROM pg_catalog.pg_class WHERE relname = 'Store';");
  console.log(info);
}

main()
  .catch((err) => {
    console.error(err);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });