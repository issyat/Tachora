import { prisma } from "../src/lib/prisma";
import { buildScheduleFacts } from "../src/server/schedule/facts-builder";

async function main() {
  console.log("=== DIAGNOSING SECURITY SHIFT PROBLEM ===\n");

  const storeId = "cmgvcp11r00027kks9vebuo7q"; // Grand Place
  const weekId = "2025-W42";

  // Get manager ID
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { managerId: true, name: true },
  });

  if (!store) {
    console.log("Store not found!");
    return;
  }

  console.log(`Store: ${store.name}`);
  console.log(`Store ID: ${storeId}`);
  console.log(`Week: ${weekId}\n`);

  // 1. Check shift templates
  console.log("=== 1. SHIFT TEMPLATES IN DATABASE ===");
  const templates = await prisma.shiftTemplate.findMany({
    where: {
      storeId,
      workType: {
        name: { contains: 'Security', mode: 'insensitive' },
      },
    },
    include: {
      workType: true,
    },
  });

  console.log(`Total Security templates: ${templates.length}\n`);
  templates.forEach((t, i) => {
    const days = Object.entries(t.days as Record<string, boolean>)
      .filter(([_, active]) => active)
      .map(([day]) => day)
      .join(', ');
    console.log(`Template ${i + 1}:`);
    console.log(`  ID: ${t.id}`);
    console.log(`  Time: ${t.startTime.toISOString().substr(11, 5)}-${t.endTime.toISOString().substr(11, 5)}`);
    console.log(`  Days: ${days}`);
    console.log(`  Work Type: ${t.workType?.name}\n`);
  });

  // 2. Check actual assignments in database
  console.log("=== 2. ACTUAL ASSIGNMENTS IN DATABASE ===");
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
          employee: true,
          workType: true,
          sourceTemplate: true,
        },
      },
    },
  });

  if (schedule) {
    console.log(`Schedule ID: ${schedule.id}`);
    console.log(`Security assignments in database: ${schedule.assignments.length}\n`);
    
    schedule.assignments.forEach((a, i) => {
      console.log(`Assignment ${i + 1}:`);
      console.log(`  ID: ${a.id}`);
      console.log(`  Day: ${a.day}`);
      console.log(`  Time: ${a.startTime.toISOString().substr(11, 5)}-${a.endTime.toISOString().substr(11, 5)}`);
      console.log(`  Employee: ${a.employee?.name || 'OPEN'}`);
      console.log(`  Template ID: ${a.sourceTemplateId || 'none'}\n`);
    });
  } else {
    console.log("No schedule found in database!\n");
  }

  // 3. Check what the AI sees (with our fix)
  console.log("=== 3. WHAT THE AI SEES (with expandShiftTemplates fix) ===");
  const facts = await buildScheduleFacts({
    storeId,
    weekId,
    managerId: store.managerId,
  });

  console.log(`Total assignments AI sees: ${facts.totals.assignments}`);
  console.log(`Assigned: ${facts.totals.assigned}`);
  console.log(`Unassigned (OPEN): ${facts.totals.unassigned}\n`);

  const securityShifts = facts.openShifts.filter(shift => 
    shift.workTypeName.toLowerCase().includes('security')
  );

  console.log(`Open Security shifts AI sees: ${securityShifts.length}\n`);
  securityShifts.forEach((shift, i) => {
    console.log(`Open Shift ${i + 1}:`);
    console.log(`  Day: ${shift.day}`);
    console.log(`  Time: ${shift.start}-${shift.end}`);
    console.log(`  Candidates: ${shift.candidates.length}`);
    if (shift.candidates.length > 0) {
      console.log(`  Top candidates: ${shift.candidates.slice(0, 3).map(c => c.name).join(', ')}`);
    }
    console.log('');
  });

  // 4. Check ALL Security assignments (filled + open)
  console.log("=== 4. ALL SECURITY ASSIGNMENTS (filled + open) ===");
  const allSecurity = facts.snapshot.assignments.filter(a =>
    a.workTypeName.toLowerCase().includes('security') && a.day === 'MON'
  );

  console.log(`Total Security assignments on Monday: ${allSecurity.length}\n`);
  allSecurity.forEach((a, i) => {
    console.log(`Assignment ${i + 1}:`);
    console.log(`  ID: ${a.id}`);
    console.log(`  Time: ${a.start}-${a.end}`);
    console.log(`  Employee: ${a.employeeName || '❌ OPEN'}`);
    console.log(`  Template ID: ${a.sourceTemplateId}\n`);
  });

  // 5. Diagnosis
  console.log("=== 5. DIAGNOSIS ===\n");
  
  const templatesCount = templates.filter(t => {
    const days = t.days as Record<string, boolean>;
    return days.MON;
  }).length;
  
  const dbAssignmentsCount = schedule?.assignments.filter(a => a.day === 'MON').length || 0;
  const aiSeesCount = allSecurity.length;
  const openCount = securityShifts.length;

  console.log(`✓ Templates for Monday: ${templatesCount}`);
  console.log(`✓ Database assignments for Monday: ${dbAssignmentsCount}`);
  console.log(`✓ AI sees total: ${aiSeesCount} (${openCount} open, ${aiSeesCount - openCount} filled)`);
  console.log('');

  if (templatesCount === 2 && dbAssignmentsCount === 0 && openCount === 2) {
    console.log("✅ CORRECT BEHAVIOR:");
    console.log("   - 2 templates exist");
    console.log("   - 0 assignments in database");
    console.log("   - expandShiftTemplates() creates 2 virtual assignments");
    console.log("   - AI sees 2 OPEN Security shifts");
    console.log("   - User CAN assign Ismail to either shift");
    console.log("\n✅ THE FIX IS WORKING! Test in the UI now.");
  } else if (templatesCount === 2 && dbAssignmentsCount > 0 && openCount < 2) {
    console.log("⚠️ PARTIAL PROBLEM:");
    console.log("   - 2 templates exist");
    console.log(`   - ${dbAssignmentsCount} assignment(s) in database`);
    console.log(`   - AI sees ${openCount} open shift(s)`);
    console.log("\n🔍 Need to check:");
    console.log("   1. Are the DB assignments filled (employeeId set)?");
    console.log("   2. Is expandShiftTemplates() deduplicating correctly?");
  } else if (openCount === 0) {
    console.log("❌ PROBLEM FOUND:");
    console.log("   - Templates exist but AI sees 0 open shifts");
    console.log("   - This means ALL shifts are assigned/filled");
    console.log("\n🔧 FIX NEEDED:");
    console.log("   1. Check if buildOpenShiftFacts() is using allAssignments");
    console.log("   2. Verify expandShiftTemplates() is being called");
    console.log("   3. Check if assignments have employeeId = null");
  }

  // 6. Check employees who can work Security
  console.log("\n=== 6. EMPLOYEES WHO CAN WORK SECURITY ===");
  const securityEmployees = await prisma.employee.findMany({
    where: {
      storeId,
      roles: {
        some: {
          workType: {
            name: { contains: 'Security', mode: 'insensitive' },
          },
        },
      },
    },
    select: {
      id: true,
      name: true,
    },
  });

  console.log(`Employees with Security role: ${securityEmployees.length}`);
  securityEmployees.forEach((emp, i) => {
    console.log(`  ${i + 1}. ${emp.name} (${emp.id})`);
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
