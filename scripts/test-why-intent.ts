/**
 * Test "Why" Question Intent Classification
 * 
 * Tests the LLM's ability to distinguish between:
 * 1. "Why can't assign [EMPLOYEE] to [ROLE]?" → explain_constraint
 * 2. "Why are [ROLE] shifts not assigned?" → Query openShifts
 */

const queries = [
  {
    query: "why can't assign Frank Miller on the supervisor shift on monday?",
    expectedIntent: "explain_constraint",
    expectedParams: {
      employeeName: "Frank Miller",
      roleName: "supervisor",
      day: "monday"
    }
  },
  {
    query: "why Supervisor shifts are not assigned on monday?",
    expectedIntent: "query_open_shifts", 
    expectedParams: {
      roleName: "Supervisor",
      day: "monday"
    }
  },
  {
    query: "why shift supervisor are not assigned on monday?",
    expectedIntent: "query_open_shifts",
    expectedParams: {
      roleName: "shift supervisor", 
      day: "monday"
    }
  }
];

console.log("Query Intent Classification Test\n");
console.log("=" .repeat(80));

queries.forEach((test, idx) => {
  console.log(`\n${idx + 1}. Query: "${test.query}"`);
  console.log(`   Expected Intent: ${test.expectedIntent}`);
  console.log(`   Expected Params:`, JSON.stringify(test.expectedParams, null, 2));
  console.log(`   
   Analysis:
   - Contains employee name? ${/Frank|Miller/i.test(test.query) ? 'YES → explain_constraint' : 'NO → query_open_shifts'}
   - Pattern "why [ROLE] shifts not assigned"? ${/why\s+\w+\s+shifts?\s+(are\s+)?not\s+assigned/i.test(test.query) ? 'YES → query_open_shifts' : 'NO'}
   - Pattern "why can't assign [NAME]"? ${/why\s+(can't|cannot)\s+assign\s+\w+/i.test(test.query) ? 'YES → explain_constraint' : 'NO'}
  `);
});

console.log("\n" + "=".repeat(80));
console.log("\nKey Distinction:");
console.log("✅ 'Why can't assign FRANK to X?' → explain_constraint (specific employee)");
console.log("✅ 'Why are SUPERVISOR SHIFTS not assigned?' → query openShifts (role inquiry)");
console.log("\nThe LLM prompt now explicitly teaches this distinction.");
