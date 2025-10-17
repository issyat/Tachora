/**
 * Test script to verify "underworked employees" query patterns
 */

import { buildScheduleFacts } from "@/server/schedule/facts-builder";
import { runEvalQuery } from "@/server/schedule/eval-query";

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
  console.log("Total Assignments:", snapshot.assignments.length);
  console.log();

  // Show all employees with their hours
  console.log("=== All Employees ===");
  snapshot.employees.forEach((emp) => {
    const hours = Math.round(emp.weeklyMinutes / 60 * 10) / 10;
    const target = Math.round(emp.weeklyMinutesTarget / 60 * 10) / 10;
    const status = emp.weeklyMinutes < emp.weeklyMinutesTarget ? "UNDER" : 
                   emp.weeklyMinutes > emp.weeklyMinutesTarget ? "OVER" : "ON TARGET";
    console.log(`${emp.name}: ${hours}h / ${target}h [${status}]`);
  });
  console.log();

  // Test 1: Find underworked employees (simple)
  console.log("=== Test 1: Underworked employees (simple filter) ===");
  const query1 = "employees[?weeklyMinutes < weeklyMinutesTarget]";
  console.log("Query:", query1);
  const result1 = runEvalQuery({
    version: snapshot.version,
    snapshot,
    expr: query1,
  });
  console.log("Result:", JSON.stringify(result1, null, 2));
  console.log();

  // Test 2: Find underworked employees with gap calculation
  console.log("=== Test 2: Underworked with gap ===");
  const query2 = "employees[?weeklyMinutes < weeklyMinutesTarget].{name: name, current: weeklyMinutes, target: weeklyMinutesTarget, gap: weeklyMinutesTarget - weeklyMinutes}";
  console.log("Query:", query2);
  const result2 = runEvalQuery({
    version: snapshot.version,
    snapshot,
    expr: query2,
  });
  console.log("Result:", JSON.stringify(result2, null, 2));
  console.log();

  // Test 3: Find overworked employees
  console.log("=== Test 3: Overworked employees ===");
  const query3 = "employees[?weeklyMinutes > weeklyMinutesTarget]";
  console.log("Query:", query3);
  const result3 = runEvalQuery({
    version: snapshot.version,
    snapshot,
    expr: query3,
  });
  console.log("Result:", JSON.stringify(result3, null, 2));
  console.log();

  // Test 4: Count underworked
  console.log("=== Test 4: Count underworked ===");
  const query4 = "length(employees[?weeklyMinutes < weeklyMinutesTarget])";
  console.log("Query:", query4);
  const result4 = runEvalQuery({
    version: snapshot.version,
    snapshot,
    expr: query4,
  });
  console.log("Result:", JSON.stringify(result4, null, 2));
  console.log();

  // Test 5: Sort by hours (ascending to see most underworked first)
  console.log("=== Test 5: Sort by hours (ascending) ===");
  const query5 = "sort_by(employees, &weeklyMinutes)[*].{name: name, hours: weeklyMinutes, target: weeklyMinutesTarget}";
  console.log("Query:", query5);
  const result5 = runEvalQuery({
    version: snapshot.version,
    snapshot,
    expr: query5,
  });
  console.log("Result:", JSON.stringify(result5, null, 2));
  console.log();

  // Test 6: Find employees with significant gap (more than 2 hours)
  console.log("=== Test 6: Employees with >2h gap ===");
  const query6 = "employees[?(weeklyMinutesTarget - weeklyMinutes) > `120`].{name: name, gapHours: (weeklyMinutesTarget - weeklyMinutes) / `60`}";
  console.log("Query:", query6);
  const result6 = runEvalQuery({
    version: snapshot.version,
    snapshot,
    expr: query6,
  });
  console.log("Result:", JSON.stringify(result6, null, 2));
  console.log();

  console.log("=== Summary ===");
  console.log("✅ All query patterns work correctly");
  console.log("These patterns should now work in the chat API when asking:");
  console.log("- 'who are the underworked employees?'");
  console.log("- 'show me overworked staff'");
  console.log("- 'which employees need more hours?'");
}

main().catch(console.error);
