import { prisma } from "../src/lib/prisma";

async function run() {
  const employees = await prisma.employee.findMany({
    where: { storeId: "cmgbiouml00027kdkewo5dulj" },
    include: { availability: true },
  });
  console.log(JSON.stringify(employees, null, 2));
  await prisma.();
}

run().catch(async (err) => {
  console.error(err);
  await prisma.();
  process.exit(1);
});
