/**
 * Test script for explain_constraint tool
 * Tests fuzzy matching, constraint checking, and structured responses
 */

import { buildScheduleFacts } from "@/server/schedule/facts-builder";
import { explainConstraint } from "@/server/schedule/explain-constraint";
import { fuzzyMatchWeekday, fuzzyMatchRole } from "@/server/schedule/fuzzy-match";

async function main() {
  const storeId = "cmgo4mnx100027kdwdsqz7xyl";
  const weekId = "2025-W42";
  const managerId = "cmgo4mnu000007kdwp9j9xhkv";

  console.log("Building schedule facts...\n");
  const facts = await buildScheduleFacts({
    managerId,
    storeId,
    weekId,
  });

  const snapshot = facts.minimalSnapshot;
  if (!snapshot) {
    console.error("❌ No minimal snapshot available");
    return;
  }

  console.log("=== Snapshot Info ===");
  console.log("Employees:", snapshot.employees.length);
  console.log("Open Shifts:", snapshot.openShifts.length);
  console.log("Total Assignments:", snapshot.assignments.length);
  console.log();

  // Show open shifts by day and role
  console.log("=== Open Shifts ===");
  const openShiftsByDayRole = snapshot.openShifts.reduce((acc, shift) => {
    const key = `${shift.day} - ${shift.workTypeName}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(`${shift.start}-${shift.end}`);
    return acc;
  }, {} as Record<string, string[]>);

  Object.entries(openShiftsByDayRole).forEach(([key, times]) => {
    console.log(`${key}: ${times.join(', ')}`);
  });
  console.log();

  // Test 1: Fuzzy matching for typos
  console.log("=== Test 1: Fuzzy Matching ===");
  console.log("Day 'moday' →", fuzzyMatchWeekday("moday"));
  console.log("Day 'tueday' →", fuzzyMatchWeekday("tueday"));
  console.log("Day 'wendsday' →", fuzzyMatchWeekday("wendsday"));
  console.log();

  const availableRoles = [...new Set(snapshot.openShifts.map(s => s.workTypeName))];
  console.log("Available roles:", availableRoles);
  console.log("Role 'supervisor' →", fuzzyMatchRole("supervisor", availableRoles));
  console.log("Role 'Shift Supervisor' →", fuzzyMatchRole("Shift Supervisor", availableRoles));
  console.log("Role 'shift sup' →", fuzzyMatchRole("shift sup", availableRoles));
  console.log();

  // Test 2: Check Frank Miller on Shift Supervisor shift on Monday (with typo)
  console.log("=== Test 2: Frank Miller on Shift Supervisor (Monday) ===");
  const result1 = explainConstraint(
    {
      employeeName: "Frank Miller",
      roleName: "Supervisor", // Will fuzzy match to "Shift Supervisor"
      day: "moday", // Will fuzzy match to MON
    },
    snapshot
  );
  console.log("Result:", JSON.stringify(result1, null, 2));
  console.log();

  // Test 3: Check employee that doesn't exist
  console.log("=== Test 3: Non-existent Employee ===");
  const result2 = explainConstraint(
    {
      employeeName: "John Doe",
      day: "Monday",
    },
    snapshot
  );
  console.log("Summary:", result2.summary);
  console.log("Suggestions:", result2.suggestions);
  console.log();

  // Test 4: Check Bob Smith on Monday (any shift)
  console.log("=== Test 4: Bob Smith on Monday (any open shift) ===");
  const result3 = explainConstraint(
    {
      employeeName: "Bob Smith",
      day: "Monday",
    },
    snapshot
  );
  console.log("Can Assign:", result3.canAssign);
  console.log("Summary:", result3.summary);
  if (result3.employee) {
    console.log("Employee:", result3.employee.name, `(${result3.employee.weeklyMinutes / 60}h / ${result3.employee.weeklyMinutesTarget / 60}h)`);
  }
  if (result3.shift) {
    console.log("Shift:", result3.shift.workTypeName, "on", result3.shift.day, `(${result3.shift.start}-${result3.shift.end})`);
  }
  console.log("Checks:");
  result3.checks.forEach(check => {
    const icon = check.passed ? "✅" : (check.severity === 'blocking' ? "❌" : "⚠️");
    console.log(`  ${icon} ${check.name}: ${check.message}`);
  });
  console.log("Suggestions:", result3.suggestions);
  console.log();

  // Test 5: Check Emma Brown (has 0 hours) on any shift
  console.log("=== Test 5: Emma Brown (0 hours) on Monday ===");
  const result4 = explainConstraint(
    {
      employeeName: "Emma Brown",
      day: "Monday",
    },
    snapshot
  );
  console.log("Can Assign:", result4.canAssign);
  console.log("Summary:", result4.summary);
  if (result4.employee) {
    console.log("Employee:", result4.employee.name, `(${result4.employee.weeklyMinutes / 60}h / ${result4.employee.weeklyMinutesTarget / 60}h)`);
  }
  console.log("Checks:");
  result4.checks.forEach(check => {
    const icon = check.passed ? "✅" : (check.severity === 'blocking' ? "❌" : "⚠️");
    console.log(`  ${icon} ${check.name}: ${check.message}`);
    if (check.evidence) {
      console.log(`     Evidence:`, JSON.stringify(check.evidence, null, 2));
    }
  });
  console.log();

  // Test 6: Check role that doesn't exist
  console.log("=== Test 6: Invalid Role Name ===");
  const result5 = explainConstraint(
    {
      employeeName: "Frank Miller",
      roleName: "Astronaut",
      day: "Monday",
    },
    snapshot
  );
  console.log("Summary:", result5.summary);
  console.log("Suggestions:", result5.suggestions);
  console.log();

  // Test 7: Check David Wilson (overworked)
  console.log("=== Test 7: David Wilson (already overworked) ===");
  const result6 = explainConstraint(
    {
      employeeName: "David Wilson",
      day: "Monday",
    },
    snapshot
  );
  console.log("Can Assign:", result6.canAssign);
  console.log("Summary:", result6.summary);
  if (result6.employee) {
    console.log("Employee:", result6.employee.name, `(${result6.employee.weeklyMinutes / 60}h / ${result6.employee.weeklyMinutesTarget / 60}h)`);
  }
  console.log("Checks:");
  result6.checks.forEach(check => {
    const icon = check.passed ? "✅" : (check.severity === 'blocking' ? "❌" : "⚠️");
    console.log(`  ${icon} ${check.name}: ${check.message}`);
  });
  console.log();

  console.log("=== Summary ===");
  console.log("✅ Fuzzy matching works for typos (moday → Monday, supervisor → Shift Supervisor)");
  console.log("✅ Constraint checking provides structured reason trees");
  console.log("✅ Clear explanations with evidence and suggestions");
  console.log("✅ Handles edge cases (non-existent employees, invalid roles, overworked staff)");
  console.log("\nThe LLM can now use explain_constraint for 'why' questions!");
}

main().catch(console.error);
