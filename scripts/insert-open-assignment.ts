import { prisma } from "@/lib/prisma";

async function main() {
  const [storeId, weekId, day, role, start, end] = process.argv.slice(2);

  if (!storeId || !weekId || !day || !role || !start || !end) {
    console.error("Usage: npx tsx scripts/insert-open-assignment.ts <storeId> <weekId> <DAY> <RoleName> <HH:MM> <HH:MM>");
    process.exit(1);
  }

  const schedule = await prisma.schedule.findUnique({
    where: { storeId_isoWeek: { storeId, isoWeek: weekId } },
    select: { id: true },
  });

  if (!schedule) {
    console.error(`No schedule found for store ${storeId} week ${weekId}`);
    process.exit(1);
  }

  const workType = await prisma.workType.findFirst({
    where: {
      storeId,
      name: role,
    },
    select: { id: true },
  });

  if (!workType) {
    console.error(`No work type named ${role} found for store ${storeId}`);
    process.exit(1);
  }

  const startDate = new Date(`1970-01-01T${start}:00Z`);
  const endDate = new Date(`1970-01-01T${end}:00Z`);

  const existing = await prisma.assignment.findFirst({
    where: {
      scheduleId: schedule.id,
      day,
      startTime: startDate,
      endTime: endDate,
      workTypeId: workType.id,
    },
    select: { id: true },
  });

  if (existing) {
    console.log(`An assignment already exists for ${role} ${day} ${start}-${end} (id=${existing.id})`);
    process.exit(0);
  }

  const template = await prisma.shiftTemplate.findFirst({
    where: {
      storeId,
      workTypeId: workType.id,
      startTime: startDate,
      endTime: endDate,
    },
    select: { id: true },
  });

  const assignment = await prisma.assignment.create({
    data: {
      scheduleId: schedule.id,
      day,
      startTime: startDate,
      endTime: endDate,
      workTypeId: workType.id,
      employeeId: null,
      sourceTemplateId: template?.id ?? null,
    },
    select: { id: true },
  });

  console.log(`Created open assignment ${assignment.id} for ${role} ${day} ${start}-${end}`);
}

main()
  .catch((error) => {
    console.error("Insert open assignment failed", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
