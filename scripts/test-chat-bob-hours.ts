/**
 * Test the chat API with "bob hours" query
 * Simulates the full flow to ensure the fix works
 */

import { auth } from "@clerk/nextjs/server";
import { ensureManager } from "@/server/manager";
import { buildScheduleFacts } from "@/server/schedule/facts-builder";
import { runEvalQuery } from "@/server/schedule/eval-query";
import { findEmployee } from "@/server/schedule/find-employee";

async function simulateChatQuery(message: string, storeId: string, weekId: string, managerId: string) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`User query: "${message}"`);
  console.log(`${"=".repeat(60)}\n`);

  // Step 1: Build schedule facts
  console.log("Step 1: Building schedule facts...");
  const facts = await buildScheduleFacts({
    managerId,
    storeId,
    weekId,
  });

  const minimalSnapshot = facts.minimalSnapshot;
  if (!minimalSnapshot) {
    console.error("❌ No minimal snapshot available");
    return;
  }

  console.log("✅ Snapshot built:", {
    version: minimalSnapshot.version,
    sizeKB: (minimalSnapshot.sizeBytes! / 1024).toFixed(2),
    employees: minimalSnapshot.employees.length,
    assignments: minimalSnapshot.assignments.length,
  });

  // Step 2: Simulate LLM calling find_employee
  console.log("\nStep 2: Simulating LLM calling find_employee...");
  const findResult = await findEmployee({ query: "bob" }, { storeId, managerId });
  
  if (!findResult.ok) {
    console.log("❌ Find employee failed:", findResult.error);
    console.log("Hint:", (findResult as any).hint);
    return;
  }

  if (!findResult.employees || findResult.employees.length === 0) {
    console.log("❌ No employees found");
    console.log("Hint:", (findResult as any).hint);
    return;
  }

  const employee = findResult.employees[0];
  console.log("✅ Found employee:", employee.name, `(${employee.id})`);

  // Step 3: Simulate LLM calling eval_query to get hours
  console.log("\nStep 3: Simulating LLM calling eval_query...");
  const expr = `employees[?id=='${employee.id}'] | [0].weeklyMinutes`;
  console.log("Query:", expr);

  const queryResult = runEvalQuery({
    version: minimalSnapshot.version,
    snapshot: minimalSnapshot,
    expr,
  });

  if (!queryResult.ok) {
    console.log("❌ Query failed:", queryResult.error);
    console.log("Hint:", (queryResult as any).hint);
    console.log("Metrics:", queryResult.metrics);
    
    // Try alternative query
    console.log("\nStep 3b: Trying alternative query...");
    const altExpr = `employees[?name=='${employee.name}'] | [0].weeklyMinutes`;
    console.log("Alternative query:", altExpr);
    
    const altResult = runEvalQuery({
      version: minimalSnapshot.version,
      snapshot: minimalSnapshot,
      expr: altExpr,
    });
    
    if (altResult.ok) {
      console.log("✅ Alternative query succeeded:", altResult.result, "minutes");
      const hours = Math.round((altResult.result as number) / 60 * 10) / 10;
      console.log(`   = ${hours} hours`);
    } else {
      console.log("❌ Alternative query also failed:", altResult.error);
    }
    return;
  }

  console.log("✅ Query succeeded:", queryResult.result, "minutes");
  console.log("Metrics:", queryResult.metrics);

  const minutes = queryResult.result as number;
  const hours = Math.round(minutes / 60 * 10) / 10;
  
  console.log(`\n${"=".repeat(60)}`);
  console.log(`📊 Final Answer: ${employee.name} has ${minutes} minutes (${hours} hours) scheduled`);
  console.log(`${"=".repeat(60)}\n`);

  // Step 4: Generate user-friendly response
  console.log("Step 4: Expected LLM response format:\n");
  console.log(`${employee.name} is scheduled for ${hours} hours this week`);
  console.log(`• Currently has ${minutes} minutes of shifts assigned`);
  console.log(`• Target: ${minimalSnapshot.employees.find(e => e.id === employee.id)?.weeklyMinutesTarget || 0} minutes`);
  const delta = minutes - (minimalSnapshot.employees.find(e => e.id === employee.id)?.weeklyMinutesTarget || 0);
  if (delta < 0) {
    console.log(`• Needs ${Math.abs(delta)} more minutes to reach target`);
  } else if (delta > 0) {
    console.log(`• ${delta} minutes over target`);
  } else {
    console.log(`• Exactly at target hours`);
  }
  console.log(`→ Review ${employee.name}'s schedule in the assignments view`);
}

async function main() {
  const storeId = "cmgo4mnx100027kdwdsqz7xyl";
  const weekId = "2025-W42";
  const managerId = "cmgo4mnu000007kdwp9j9xhkv";

  // Test various queries
  await simulateChatQuery("bob hours", storeId, weekId, managerId);
  
  console.log("\n\n");
  
  await simulateChatQuery("how many hours does Bob have", storeId, weekId, managerId);
  
  console.log("\n\n");
  
  await simulateChatQuery("Bob Smith hours", storeId, weekId, managerId);
}

main().catch(console.error);
