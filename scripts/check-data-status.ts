import { prisma } from "../src/lib/prisma";

async function main() {
  // Find stores
  const stores = await prisma.store.findMany({
    select: { id: true, name: true },
  });

  console.log(`Stores: ${stores.length}`);
  stores.forEach(s => console.log(`  - ${s.name} (${s.id})`));

  if (stores.length === 0) {
    console.log("\nNo stores found!");
    return;
  }

  const storeId = stores[0].id;
  console.log(`\nUsing store: ${stores[0].name}`);

  // Check shift templates
  const templates = await prisma.shiftTemplate.findMany({
    where: { storeId },
    include: { workType: true },
  });

  console.log(`\nShift templates: ${templates.length}`);
  templates.forEach(t => {
    console.log(`  - ${t.workType.name}: days=${JSON.stringify(t.days)}`);
  });

  // Check work types
  const workTypes = await prisma.workType.findMany({
    where: { storeId },
  });

  console.log(`\nWork types: ${workTypes.length}`);
  workTypes.forEach(wt => {
    console.log(`  - ${wt.name}`);
  });

  // Check schedules
  const schedules = await prisma.schedule.findMany({
    where: { storeId },
    select: { id: true, isoWeek: true, version: true },
  });

  console.log(`\nSchedules: ${schedules.length}`);
  schedules.forEach(s => {
    console.log(`  - ${s.isoWeek} (version ${s.version})`);
  });

  if (schedules.length > 0) {
    const latestSchedule = schedules[schedules.length - 1];
    const assignments = await prisma.assignment.findMany({
      where: { scheduleId: latestSchedule.id },
      include: { workType: true, employee: true },
    });

    console.log(`\nAssignments in ${latestSchedule.isoWeek}: ${assignments.length}`);
    const grouped = assignments.reduce((acc, a) => {
      const key = a.workType.name;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    Object.entries(grouped).forEach(([role, count]) => {
      console.log(`  - ${role}: ${count}`);
    });

    const openAssignments = assignments.filter(a => !a.employeeId);
    console.log(`\n  Open (unassigned): ${openAssignments.length}`);
    openAssignments.forEach(a => {
      console.log(`    - ${a.day} ${a.workType.name}`);
    });
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
