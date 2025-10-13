/**
 * Test script to diagnose "Bob hours" query issue
 */

import { ensureManager } from "@/server/manager";
import { buildScheduleFacts } from "@/server/schedule/facts-builder";
import { runEvalQuery } from "@/server/schedule/eval-query";
import { findEmployee } from "@/server/schedule/find-employee";

async function main() {
  const storeId = "cmgo4mnx100027kdwdsqz7xyl";
  const weekId = "2025-W42";
  const managerId = "cmgo4mnu000007kdwp9j9xhkv";

  console.log("Building schedule facts...");
  const facts = await buildScheduleFacts({
    managerId,
    storeId,
    weekId,
  });

  const snapshot = facts.minimalSnapshot;
  if (!snapshot) {
    console.error("No minimal snapshot available");
    return;
  }

  console.log("\n=== Snapshot Info ===");
  console.log("Version:", snapshot.version);
  console.log("Size:", (snapshot.sizeBytes! / 1024).toFixed(2), "KB");
  console.log("Employees:", snapshot.employees.length);
  console.log("Assignments:", snapshot.assignments.length);
  console.log("Open shifts:", snapshot.openShifts.length);

  console.log("\n=== Testing find_employee for 'bob' ===");
  const findResult = await findEmployee({ query: "bob" }, { storeId, managerId });
  console.log("Find result:", JSON.stringify(findResult, null, 2));

  if (findResult.ok && findResult.employees && findResult.employees.length > 0) {
    const bobEmployee = findResult.employees[0];
    console.log("\n=== Bob Employee ===");
    console.log("ID:", bobEmployee.id);
    console.log("Name:", bobEmployee.name);

    // Test 1: Find Bob in employees array
    console.log("\n=== Test 1: Find Bob in employees array ===");
    const query1 = `employees[?id=='${bobEmployee.id}']`;
    const result1 = runEvalQuery({
      version: snapshot.version,
      snapshot,
      expr: query1,
    });
    console.log("Query:", query1);
    console.log("Result:", JSON.stringify(result1, null, 2));

    // Test 2: Get Bob's weekly minutes
    console.log("\n=== Test 2: Get Bob's weekly minutes ===");
    const query2 = `employees[?id=='${bobEmployee.id}'].weeklyMinutes | [0]`;
    const result2 = runEvalQuery({
      version: snapshot.version,
      snapshot,
      expr: query2,
    });
    console.log("Query:", query2);
    console.log("Result:", JSON.stringify(result2, null, 2));

    // Test 3: Get Bob's assignments
    console.log("\n=== Test 3: Get Bob's assignments ===");
    const query3 = `assignments[?employeeId=='${bobEmployee.id}']`;
    const result3 = runEvalQuery({
      version: snapshot.version,
      snapshot,
      expr: query3,
    });
    console.log("Query:", query3);
    console.log("Result:", JSON.stringify(result3, null, 2));

    // Test 4: Calculate Bob's total hours from assignments
    console.log("\n=== Test 4: Calculate Bob's total hours from assignments ===");
    const query4 = `sum(assignments[?employeeId=='${bobEmployee.id}'].durationMins)`;
    const result4 = runEvalQuery({
      version: snapshot.version,
      snapshot,
      expr: query4,
    });
    console.log("Query:", query4);
    console.log("Result:", JSON.stringify(result4, null, 2));

    // Test 5: Alternative calculation using weeklyMinutes
    console.log("\n=== Test 5: Get weeklyMinutes directly ===");
    const query5 = `employees[?id=='${bobEmployee.id}'] | [0].weeklyMinutes`;
    const result5 = runEvalQuery({
      version: snapshot.version,
      snapshot,
      expr: query5,
    });
    console.log("Query:", query5);
    console.log("Result:", JSON.stringify(result5, null, 2));

    // Test 6: Simple name search
    console.log("\n=== Test 6: Find by name contains ===");
    const query6 = `employees[?contains(name, 'Bob')]`;
    const result6 = runEvalQuery({
      version: snapshot.version,
      snapshot,
      expr: query6,
    });
    console.log("Query:", query6);
    console.log("Result:", JSON.stringify(result6, null, 2));
  }

  // Show all employees for reference
  console.log("\n=== All Employees ===");
  const allEmployeesQuery = "employees[*].{id: id, name: name, hours: weeklyMinutes}";
  const allEmployeesResult = runEvalQuery({
    version: snapshot.version,
    snapshot,
    expr: allEmployeesQuery,
  });
  console.log(JSON.stringify(allEmployeesResult.result, null, 2));

  console.log("\n=== All Assignments Sample ===");
  const assignmentsQuery = "assignments[0:5]";
  const assignmentsResult = runEvalQuery({
    version: snapshot.version,
    snapshot,
    expr: assignmentsQuery,
  });
  console.log(JSON.stringify(assignmentsResult.result, null, 2));
}

main().catch(console.error);
