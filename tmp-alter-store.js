import { PrismaClient } from './src/generated/prisma/index.js';

const prisma = new PrismaClient();

async function main() {
  await prisma.\$executeRawUnsafe('ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "openingTime" TIME;');
  await prisma.\$executeRawUnsafe("UPDATE \"Store\" SET \"openingTime\" = COALESCE(\"openingTime\", TIME '09:00');");
  const columns = await prisma.\$queryRawUnsafe(
    "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='Store';",
  );
  console.log(columns);
}

main()
  .catch((err) => {
    console.error(err);
  })
  .finally(async () => {
    await prisma.\$disconnect();
  });
