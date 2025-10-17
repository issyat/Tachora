import { prisma } from "@/lib/prisma";

async function main() {
  const storeId = "cmgo4mnx100027kdwdsqz7xyl";
  const weekId = "2025-W42";
  const employeeName = "Alice";

  const schedule = await prisma.schedule.findUnique({
    where: { storeId_isoWeek: { storeId, isoWeek: weekId } },
    include: {
      assignments: {
        include: {
          employee: true,
          workType: true,
        },
      },
    },
  });

  if (!schedule) {
    console.log("No schedule found for", storeId, weekId);
    return;
  }

  console.log("Schedule version", schedule.version, "assignment count", schedule.assignments.length);

  const aliceAssignments = schedule.assignments.filter(
    (assignment) => assignment.employee?.name?.toLowerCase().includes(employeeName.toLowerCase()),
  );

  if (aliceAssignments.length === 0) {
    console.log("No assignments found for employee containing name:", employeeName);
  } else {
    console.log(`Found ${aliceAssignments.length} assignments for ${employeeName}:`);
    for (const assignment of aliceAssignments) {
      console.log({
        id: assignment.id,
        day: assignment.day,
        start: assignment.startTime.toISOString(),
        end: assignment.endTime.toISOString(),
        workType: assignment.workType?.name,
        employee: assignment.employee?.name,
      });
    }
  }
}

main()
  .catch((error) => {
    console.error("Debug script failed", error);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
