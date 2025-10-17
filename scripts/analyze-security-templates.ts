import { prisma } from "../src/lib/prisma";

async function main() {
  const storeId = "cmgo4mnx100027kdwdsqz7xyl";
  const weekId = "2025-W42";

  console.log("=== SECURITY SHIFT TEMPLATES ===\n");

  // Get Security shift templates
  const securityWorkType = await prisma.workType.findFirst({
    where: {
      storeId,
      name: { contains: 'Security', mode: 'insensitive' },
    },
  });

  if (!securityWorkType) {
    console.log("No Security work type found!");
    return;
  }

  const templates = await prisma.shiftTemplate.findMany({
    where: {
      storeId,
      workTypeId: securityWorkType.id,
    },
  });

  console.log(`Total Security templates: ${templates.length}\n`);
  
  const mondayTemplates = templates.filter(t => {
    const days = t.days as Record<string, boolean>;
    return days && days.MON === true;
  });

  console.log(`Security templates for MONDAY: ${mondayTemplates.length}`);
  mondayTemplates.forEach((t, idx) => {
    const start = t.startTime.toISOString().substr(11, 5);
    const end = t.endTime.toISOString().substr(11, 5);
    console.log(`  Template ${idx + 1}: ${start}-${end} (ID: ${t.id})`);
  });

  console.log("\n=== ACTUAL ASSIGNMENTS IN WEEK ===\n");

  // Get schedule
  const schedule = await prisma.schedule.findUnique({
    where: {
      storeId_isoWeek: { storeId, isoWeek: weekId },
    },
    include: {
      assignments: {
        where: {
          workTypeId: securityWorkType.id,
          day: 'MON',
        },
        include: {
          employee: true,
        },
      },
    },
  });

  if (!schedule) {
    console.log("No schedule found for this week!");
    return;
  }

  console.log(`Actual Security assignments on MONDAY: ${schedule.assignments.length}`);
  schedule.assignments.forEach((a, idx) => {
    const start = a.startTime.toISOString().substr(11, 5);
    const end = a.endTime.toISOString().substr(11, 5);
    const employee = a.employee ? a.employee.name : 'OPEN/FREE';
    const status = a.employeeId ? 'ASSIGNED' : 'OPEN';
    console.log(`  Assignment ${idx + 1}: ${start}-${end} → ${employee} [${status}]`);
    console.log(`    Template ID: ${a.sourceTemplateId || 'none'}`);
  });

  console.log("\n=== ANALYSIS ===\n");
  console.log(`Templates for Monday: ${mondayTemplates.length}`);
  console.log(`Assignments for Monday: ${schedule.assignments.length}`);
  
  if (mondayTemplates.length > schedule.assignments.length) {
    console.log(`\n⚠️  MISSING ASSIGNMENTS!`);
    console.log(`${mondayTemplates.length - schedule.assignments.length} template(s) not converted to assignments`);
    console.log(`This means the schedule was not regenerated from templates.`);
  } else if (mondayTemplates.length === schedule.assignments.length) {
    console.log(`\n✓ All templates converted to assignments`);
    const openAssignments = schedule.assignments.filter(a => !a.employeeId);
    if (openAssignments.length > 0) {
      console.log(`${openAssignments.length} assignment(s) are OPEN and available!`);
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
