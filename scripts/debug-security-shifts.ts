import { prisma } from "../src/lib/prisma";

async function main() {
  const storeId = "cm3rz95if0000q6jbwkxdn0r6";
  const weekId = "2025-W42";

  console.log("Looking for Security shifts...\n");

  // Check shift templates
  const templates = await prisma.shiftTemplate.findMany({
    where: { storeId },
    include: { workType: true },
  });

  console.log(`Total shift templates: ${templates.length}`);
  const securityTemplates = templates.filter(t => 
    t.workType.name.toLowerCase().includes('security')
  );
  console.log(`Security templates: ${securityTemplates.length}`);
  securityTemplates.forEach(t => {
    console.log(`  - ${t.workType.name}: days=${JSON.stringify(t.days)}, ${t.startTime.toISOString().substr(11, 5)}-${t.endTime.toISOString().substr(11, 5)}`);
  });

  // Check schedule
  const schedule = await prisma.schedule.findUnique({
    where: {
      storeId_isoWeek: { storeId, isoWeek: weekId },
    },
    include: {
      assignments: {
        include: {
          workType: true,
          employee: true,
        },
      },
    },
  });

  if (!schedule) {
    console.log("\nNo schedule found for this week!");
    return;
  }

  console.log(`\nTotal assignments: ${schedule.assignments.length}`);
  const securityAssignments = schedule.assignments.filter(a => 
    a.workType.name.toLowerCase().includes('security')
  );
  
  console.log(`Security assignments: ${securityAssignments.length}`);
  securityAssignments.forEach(a => {
    console.log(`  - ${a.day}: ${a.startTime.toISOString().substr(11, 5)}-${a.endTime.toISOString().substr(11, 5)}`);
    console.log(`    Employee: ${a.employee?.name || 'OPEN SHIFT (no employee)'}`);
    console.log(`    employeeId: ${a.employeeId || 'null'}`);
  });

  // Check if there are assignments without employees
  const openAssignments = schedule.assignments.filter(a => !a.employeeId);
  console.log(`\nTotal open assignments (no employee): ${openAssignments.length}`);
  
  const openSecurityAssignments = openAssignments.filter(a => 
    a.workType.name.toLowerCase().includes('security')
  );
  console.log(`Open Security assignments: ${openSecurityAssignments.length}`);
  openSecurityAssignments.forEach(a => {
    console.log(`  - ${a.day}: ${a.startTime.toISOString().substr(11, 5)}-${a.endTime.toISOString().substr(11, 5)} (${a.workType.name})`);
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
