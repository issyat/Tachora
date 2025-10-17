import { prisma } from "@/lib/prisma";

async function main() {
  const [storeId, weekId, day, role] = process.argv.slice(2);

  if (!storeId || !weekId || !day || !role) {
    console.error("Usage: npx tsx scripts/debug-open-assignments.ts <storeId> <weekId> <DAY> <RoleName>");
    process.exit(1);
  }

  const schedule = await prisma.schedule.findUnique({
    where: { storeId_isoWeek: { storeId, isoWeek: weekId } },
    select: { id: true, isoWeek: true },
  });

  if (!schedule) {
    console.log(`No schedule found for store ${storeId} week ${weekId}`);
    return;
  }

  const assignments = await prisma.assignment.findMany({
    where: {
      scheduleId: schedule.id,
      day,
      workType: { name: role },
    },
    select: {
      id: true,
      day: true,
      startTime: true,
      endTime: true,
      employeeId: true,
      workType: { select: { name: true } },
    },
    orderBy: { startTime: "asc" },
  });

  if (!assignments.length) {
    console.log(`No assignments found for ${role} on ${day}`);
    return;
  }

  console.log(`Assignments for ${role} on ${day}:`);
  assignments.forEach((assignment) => {
    const start = assignment.startTime instanceof Date ? assignment.startTime.toISOString().slice(11, 16) : assignment.startTime;
    const end = assignment.endTime instanceof Date ? assignment.endTime.toISOString().slice(11, 16) : assignment.endTime;
    const status = assignment.employeeId ? `ASSIGNED to ${assignment.employeeId}` : "OPEN";
    console.log(`- ${assignment.id}: ${start}-${end} -> ${status}`);
  });
}

main()
  .catch((error) => {
    console.error("Debug script failed", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
