import { prisma } from "../src/lib/prisma";

async function main() {
  const stores = await prisma.store.findMany({
    select: { id: true, name: true },
  });

  console.log(`Total stores: ${stores.length}\n`);

  for (const store of stores) {
    console.log(`\n=== ${store.name} ===`);
    
    // Get latest schedule
    const schedules = await prisma.schedule.findMany({
      where: { storeId: store.id },
      orderBy: { isoWeek: 'desc' },
      take: 1,
    });

    if (schedules.length === 0) {
      console.log("No schedules found");
      continue;
    }

    const schedule = schedules[0];
    console.log(`Week: ${schedule.isoWeek}`);

    // Get ALL assignments for this schedule
    const assignments = await prisma.assignment.findMany({
      where: { scheduleId: schedule.id },
      include: {
        workType: true,
        employee: true,
      },
    });

    console.log(`\nTotal assignments: ${assignments.length}`);

    // Group by work type
    const byWorkType: Record<string, { total: number; assigned: number; open: number }> = {};
    
    assignments.forEach(a => {
      const wt = a.workType.name;
      if (!byWorkType[wt]) {
        byWorkType[wt] = { total: 0, assigned: 0, open: 0 };
      }
      byWorkType[wt].total++;
      if (a.employeeId) {
        byWorkType[wt].assigned++;
      } else {
        byWorkType[wt].open++;
      }
    });

    console.log('\nBreakdown by work type:');
    Object.entries(byWorkType).forEach(([wt, stats]) => {
      console.log(`  ${wt}: ${stats.total} total (${stats.assigned} assigned, ${stats.open} open)`);
    });

    // Show Security details
    const securityAssignments = assignments.filter(a => 
      a.workType.name.toLowerCase().includes('security')
    );

    if (securityAssignments.length > 0) {
      console.log('\nSecurity assignments detail:');
      securityAssignments.forEach(a => {
        const time = `${a.startTime.toISOString().substr(11, 5)}-${a.endTime.toISOString().substr(11, 5)}`;
        const employee = a.employee ? a.employee.name : 'OPEN (no employee)';
        const status = a.employeeId ? 'ASSIGNED' : 'OPEN';
        console.log(`  ${a.day} ${time}: ${employee} [${status}]`);
      });
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
