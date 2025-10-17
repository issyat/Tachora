import { buildScheduleFacts } from "../src/server/schedule/facts-builder";
import { prisma } from "../src/lib/prisma";

async function main() {
  const storeId = "cmgo4mnx100027kdwdsqz7xyl";
  const weekId = "2025-W42";

  // Get the manager ID from the store
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { managerId: true },
  });

  if (!store) {
    console.log("Store not found!");
    return;
  }

  console.log("Building schedule facts (what the AI sees)...\n");

  const facts = await buildScheduleFacts({
    storeId,
    weekId,
    managerId: store.managerId,
  });

  console.log("=== SCHEDULE FACTS ===");
  console.log(`Total assignments: ${facts.totals.assignments}`);
  console.log(`Assigned: ${facts.totals.assigned}`);
  console.log(`Unassigned (OPEN): ${facts.totals.unassigned}`);

  console.log("\n=== OPEN SHIFTS ===");
  const securityShifts = facts.openShifts.filter(shift => 
    shift.workTypeName.toLowerCase().includes('security')
  );

  console.log(`Total open Security shifts: ${securityShifts.length}`);
  
  securityShifts.forEach((shift, i) => {
    console.log(`\n  Shift ${i + 1}:`);
    console.log(`    Day: ${shift.day}`);
    console.log(`    Time: ${shift.start}-${shift.end}`);
    console.log(`    Work Type: ${shift.workTypeName}`);
    console.log(`    Candidates: ${shift.candidates.length}`);
    if (shift.candidates.length > 0) {
      console.log(`    Top candidates:`);
      shift.candidates.slice(0, 3).forEach(c => {
        console.log(`      - ${c.name} (score: ${c.score})`);
      });
    }
  });

  console.log("\n=== ALL SECURITY ASSIGNMENTS (including assigned) ===");
  const allSecurity = facts.snapshot.assignments.filter(a =>
    a.workTypeName.toLowerCase().includes('security')
  );

  console.log(`Total Security assignments: ${allSecurity.length}`);
  allSecurity.forEach((a, i) => {
    console.log(`\n  Assignment ${i + 1}:`);
    console.log(`    ID: ${a.id}`);
    console.log(`    Day: ${a.day}`);
    console.log(`    Time: ${a.start}-${a.end}`);
    console.log(`    Employee: ${a.employeeName || 'OPEN'}`);
  });
}

main()
  .catch(console.error)
  .finally(() => process.exit());
