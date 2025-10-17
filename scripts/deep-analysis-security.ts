import { prisma } from "../src/lib/prisma";
import { buildScheduleFacts } from "../src/server/schedule/facts-builder";

async function main() {
  console.log("=== DEEP ANALYSIS: WHY AI SAYS 'ALL SECURITY SHIFTS ASSIGNED' ===\n");

  const storeId = "cmgvcp11r00027kks9vebuo7q";
  const weekId = "2025-W42";

  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { managerId: true, name: true },
  });

  if (!store) {
    console.log("❌ Store not found!");
    return;
  }

  console.log("STEP 1: CHECK RAW DATABASE DATA");
  console.log("=" .repeat(60));

  // Check templates
  const templates = await prisma.shiftTemplate.findMany({
    where: {
      storeId,
      workType: { name: { contains: 'Security', mode: 'insensitive' } },
    },
    include: { workType: true },
  });

  console.log(`\n✓ Security Templates in DB: ${templates.length}`);
  templates.forEach((t, i) => {
    const days = t.days as Record<string, boolean>;
    console.log(`  ${i + 1}. ${t.startTime.toISOString().substr(11, 5)}-${t.endTime.toISOString().substr(11, 5)} on ${Object.keys(days).filter(k => days[k]).join(', ')}`);
  });

  // Check schedule and assignments
  const schedule = await prisma.schedule.findUnique({
    where: { storeId_isoWeek: { storeId, isoWeek: weekId } },
    include: {
      assignments: {
        where: {
          day: 'MON',
          workType: { name: { contains: 'Security', mode: 'insensitive' } },
        },
        include: { employee: true, workType: true },
      },
    },
  });

  console.log(`\n✓ Security Assignments in DB for MON: ${schedule?.assignments.length || 0}`);
  if (schedule?.assignments.length) {
    schedule.assignments.forEach((a, i) => {
      console.log(`  ${i + 1}. ${a.startTime.toISOString().substr(11, 5)}-${a.endTime.toISOString().substr(11, 5)} → ${a.employee?.name || 'OPEN'}`);
    });
  } else {
    console.log("  (No actual assignments in DB - only templates exist)");
  }

  console.log("\n\nSTEP 2: CHECK WHAT buildScheduleFacts() RETURNS");
  console.log("=" .repeat(60));

  const facts = await buildScheduleFacts({
    storeId,
    weekId,
    managerId: store.managerId,
  });

  console.log(`\n✓ Total assignments facts-builder sees: ${facts.totals.assignments}`);
  console.log(`✓ Assigned: ${facts.totals.assigned}`);
  console.log(`✓ Unassigned: ${facts.totals.unassigned}`);

  // Check openShifts array
  const securityOpenShifts = facts.openShifts.filter(s => 
    s.workTypeName.toLowerCase().includes('security') && s.day === 'MON'
  );

  console.log(`\n✓ Open Security shifts on MON: ${securityOpenShifts.length}`);
  if (securityOpenShifts.length > 0) {
    securityOpenShifts.forEach((s, i) => {
      console.log(`  ${i + 1}. ${s.start}-${s.end} (${s.candidates.length} candidates)`);
    });
  } else {
    console.log("  ❌ NO OPEN SHIFTS! This is why AI says 'all assigned'");
  }

  // Check snapshot
  const securityInSnapshot = facts.snapshot.assignments.filter(a =>
    a.workTypeName.toLowerCase().includes('security') && a.day === 'MON'
  );

  console.log(`\n✓ Security assignments in snapshot for MON: ${securityInSnapshot.length}`);
  securityInSnapshot.forEach((a, i) => {
    console.log(`  ${i + 1}. ${a.start}-${a.end} → ${a.employeeName || 'UNASSIGNED'} (ID: ${a.id})`);
  });

  console.log("\n\nSTEP 3: CHECK LLM TOOL - analyze_shift_candidates");
  console.log("=" .repeat(60));

  // Simulate what analyze_shift_candidates sees
  const { analyzeShiftCandidates } = await import("../src/server/preview/llm-handlers");
  
  try {
    const result = await analyzeShiftCandidates({
      storeId,
      weekId,
      managerId: store.managerId,
      employeeId: null,
      employeeName: "ismail",
      day: "MON",
      workTypeName: "Security",
      startTime: null,
      endTime: null,
    });

    console.log(`\n✓ analyze_shift_candidates result:`);
    console.log(`  Open shifts found: ${result.openShifts.length}`);
    
    if (result.openShifts.length > 0) {
      result.openShifts.forEach((s, i) => {
        console.log(`  ${i + 1}. ${s.start}-${s.end} (candidates: ${s.candidates.length})`);
      });
    } else {
      console.log("  ❌ NO OPEN SHIFTS! This is what AI sees!");
      console.log(`  Reason: ${result.reason || 'Unknown'}`);
    }
  } catch (error) {
    console.log(`\n❌ Error calling analyze_shift_candidates:`);
    console.log(error);
  }

  console.log("\n\nSTEP 4: ROOT CAUSE ANALYSIS");
  console.log("=" .repeat(60));

  if (templates.length === 0) {
    console.log("\n❌ PROBLEM: No Security templates exist in DB");
    console.log("   FIX: Create Security shift templates");
  } else if (securityOpenShifts.length === 0) {
    console.log("\n❌ PROBLEM: Templates exist BUT facts.openShifts is empty");
    console.log("   This means buildOpenShiftFacts() is not seeing the virtual assignments");
    console.log("\n   CHECKING: Is expandShiftTemplates() being called?");
    
    // Check if allAssignments includes template-based ones
    const templateBasedIds = securityInSnapshot.filter(a => 
      a.id.startsWith('template-')
    );
    
    console.log(`\n   Virtual assignments in snapshot: ${templateBasedIds.length}`);
    if (templateBasedIds.length > 0) {
      console.log("   ✓ expandShiftTemplates() IS creating virtual assignments");
      console.log("\n   BUT buildOpenShiftFacts() is NOT receiving them!");
      console.log("\n   🔍 LIKELY CAUSE:");
      console.log("      Line 918 in facts-builder.ts might not be using allAssignments");
      console.log("      OR there's a filtering issue in buildOpenShiftFacts()");
      
      // Check if they have employeeId
      const virtualWithEmployees = templateBasedIds.filter(a => a.employeeId);
      console.log(`\n   Virtual assignments WITH employeeId: ${virtualWithEmployees.length}`);
      console.log(`   Virtual assignments WITHOUT employeeId: ${templateBasedIds.length - virtualWithEmployees.length}`);
      
      if (virtualWithEmployees.length === templateBasedIds.length) {
        console.log("\n   ❌ ALL virtual assignments have employeeId set!");
        console.log("      This means they're being filtered out as 'assigned'");
        console.log("      Check expandShiftTemplates() - it should set employeeId=undefined for open shifts");
      }
    } else {
      console.log("   ❌ expandShiftTemplates() is NOT creating virtual assignments");
      console.log("      OR they're not making it into allAssignments");
    }
  } else if (securityInSnapshot.length === 0) {
    console.log("\n❌ PROBLEM: No Security assignments in snapshot at all");
    console.log("   expandShiftTemplates() failed or returned empty");
  } else {
    console.log("\n✅ Everything looks good in the data!");
    console.log("   The problem might be in the LLM handler or query logic");
  }

  console.log("\n\nSTEP 5: CHECK THE ACTUAL FIX");
  console.log("=" .repeat(60));

  const fs = await import('fs/promises');
  const factsBuilderCode = await fs.readFile('src/server/schedule/facts-builder.ts', 'utf-8');
  const line918 = factsBuilderCode.split('\n')[917]; // 0-indexed

  console.log(`\nLine 918 in facts-builder.ts:`);
  console.log(`  ${line918.trim()}`);

  if (line918.includes('allAssignments')) {
    console.log("\n✅ Fix is in place: using allAssignments");
  } else {
    console.log("\n❌ Fix NOT applied: still using context.assignments");
    console.log("   This is the bug - buildOpenShiftFacts() doesn't see virtual assignments");
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
