import { prisma } from "../src/lib/prisma";

async function main() {
  const storeId = "cmgo4mnx100027kdwdsqz7xyl";
  const weekId = "2025-W42";

  const schedule = await prisma.schedule.findUnique({
    where: {
      storeId_isoWeek: { storeId, isoWeek: weekId },
    },
    include: {
      assignments: {
        where: {
          workType: {
            name: { contains: 'Security', mode: 'insensitive' },
          },
        },
        include: {
          workType: true,
          employee: true,
        },
      },
    },
  });

  if (!schedule) {
    console.log("No schedule found!");
    return;
  }

  console.log(`Security assignments in ${weekId}:\n`);
  schedule.assignments.forEach(a => {
    const time = `${a.startTime.toISOString().substr(11, 5)}-${a.endTime.toISOString().substr(11, 5)}`;
    console.log(`  ${a.day} ${time}: ${a.employee?.name || 'OPEN SHIFT'} (${a.workType.name})`);
  });

  // Also check who Ismail is
  const ismail = await prisma.employee.findFirst({
    where: {
      storeId,
      name: { contains: 'Ismail', mode: 'insensitive' },
    },
  });

  if (ismail) {
    console.log(`\nFound Ismail: ${ismail.name} (${ismail.id})`);
    
    const ismailAssignments = await prisma.assignment.findMany({
      where: {
        scheduleId: schedule.id,
        employeeId: ismail.id,
      },
      include: { workType: true },
    });

    console.log(`\nIsmail's current assignments: ${ismailAssignments.length}`);
    ismailAssignments.forEach(a => {
      const time = `${a.startTime.toISOString().substr(11, 5)}-${a.endTime.toISOString().substr(11, 5)}`;
      console.log(`  ${a.day} ${time}: ${a.workType.name}`);
    });
  } else {
    console.log("\nIsmail not found in database!");
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
