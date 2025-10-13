import { runEvalQuery } from "../src/server/schedule/eval-query";
import { search_employee } from "../src/server/schedule/tools/name";

// Mock snapshot data for testing
const mockSnapshot = {
  version: "test-v1",
  store: {
    id: "test-store",
    name: "Test Store",
    city: "Test City",
    country: "Test Country"
  },
  isoWeek: "2024-W42",
  generatedAt: new Date().toISOString(),
  employees: [
    {
      id: "emp-1",
      name: "Alice Johnson",
      storeId: "test-store",
      contractType: "FULL_TIME",
      weeklyMinutesTarget: 2400,
      weeklyMinutes: 1800, // 30 hours worked
      canWorkAcrossStores: true,
      workTypeIds: ["wt-1", "wt-2"],
      availability: []
    },
    {
      id: "emp-2",
      name: "Carol Davis",
      storeId: "test-store",
      contractType: "PART_TIME",
      weeklyMinutesTarget: 1800,
      weeklyMinutes: 1080, // 18 hours worked
      canWorkAcrossStores: false,
      workTypeIds: ["wt-1"],
      availability: []
    },
    {
      id: "emp-3",
      name: "David Wilson",
      storeId: "test-store",
      contractType: "STUDENT",
      weeklyMinutesTarget: 960,
      weeklyMinutes: 720, // 12 hours worked
      canWorkAcrossStores: false,
      workTypeIds: ["wt-3"],
      availability: []
    }
  ],
  assignments: [
    {
      id: "assign-1",
      day: "MON",
      start: "09:00",
      end: "17:00",
      workTypeId: "wt-1",
      workTypeName: "Cashier",
      employeeId: "emp-1",
      employeeName: "Alice Johnson",
      durationMins: 480
    },
    {
      id: "assign-2",
      day: "TUE",
      start: "14:00",
      end: "22:00",
      workTypeId: "wt-1",
      workTypeName: "Cashier",
      employeeId: "emp-2",
      employeeName: "Carol Davis",
      durationMins: 480
    },
    {
      id: "assign-3",
      day: "WED",
      start: "10:00",
      end: "18:00",
      workTypeId: "wt-3",
      workTypeName: "Stock Clerk",
      employeeId: "emp-3",
      employeeName: "David Wilson",
      durationMins: 480
    }
  ],
  openShifts: [
    {
      id: "open-1",
      day: "MON",
      start: "14:00",
      end: "22:00",
      workTypeId: "wt-1",
      workTypeName: "Cashier",
      workTypeColor: "#3b82f6",
      reasons: [],
      candidates: []
    },
    {
      id: "open-2",
      day: "TUE",
      start: "09:00",
      end: "17:00",
      workTypeId: "wt-2",
      workTypeName: "Manager",
      workTypeColor: "#10b981",
      reasons: [],
      candidates: []
    }
  ],
  templates: []
};

// Mock facts object
const mockFacts = {
  snapshot: mockSnapshot,
  employees: mockSnapshot.employees,
  assignments: mockSnapshot.assignments,
  openShifts: mockSnapshot.openShifts
};

async function testAIInteractions() {
  console.log("🧪 Testing AI Scheduling Assistant Interactions\n");

  console.log("✅ Using mock schedule data");
  console.log(`📊 Store: ${mockSnapshot.store.name}, Week: ${mockSnapshot.isoWeek}`);
  console.log(`👥 Employees: ${mockSnapshot.employees.length}, Assignments: ${mockSnapshot.assignments.length}, Open Shifts: ${mockSnapshot.openShifts.length}\n`);

  // Test cases covering different query types
  const testCases = [
    {
      name: "Employee Hours Query",
      setup: async () => {
        // Test find_employee
        const employeeResult = search_employee(mockFacts.snapshot, 'Carol');
        console.log(`👤 find_employee("Carol") result: ${JSON.stringify(employeeResult)}`);

        if (employeeResult) {
          // Test eval_query with the found employee
          const hoursQuery = `snapshot.employees[name = "${employeeResult.name}"].weeklyMinutes / 60`;
          const hoursResult = await runEvalQuery({
            version: mockFacts.snapshot.version,
            facts: mockFacts,
            expr: hoursQuery
          });
          console.log(`📊 eval_query("${hoursQuery}") result: ${JSON.stringify(hoursResult)}`);
          return hoursResult.ok && typeof hoursResult.result === 'number';
        }
        return false;
      }
    },
    {
      name: "Unassigned Shifts Query",
      setup: async () => {
        const mondayQuery = "snapshot.openShifts[day='MON']";
        const mondayResult = await runEvalQuery({
          version: mockFacts.snapshot.version,
          facts: mockFacts,
          expr: mondayQuery
        });
        console.log(`📊 eval_query("${mondayQuery}") result: ${JSON.stringify(mondayResult)}`);
        return mondayResult.ok && Array.isArray(mondayResult.result);
      }
    },
    {
      name: "Total Shifts Count",
      setup: async () => {
        const totalQuery = "$count(snapshot.assignments)";
        const totalResult = await runEvalQuery({
          version: mockFacts.snapshot.version,
          facts: mockFacts,
          expr: totalQuery
        });
        console.log(`📊 eval_query("${totalQuery}") result: ${JSON.stringify(totalResult)}`);
        return totalResult.ok && typeof totalResult.result === 'number';
      }
    },
    {
      name: "Role-Specific Query",
      setup: async () => {
        const cashierQuery = "snapshot.openShifts[workTypeName='Cashier']";
        const cashierResult = await runEvalQuery({
          version: mockFacts.snapshot.version,
          facts: mockFacts,
          expr: cashierQuery
        });
        console.log(`📊 eval_query("${cashierQuery}") result: ${JSON.stringify(cashierResult)}`);
        return cashierResult.ok && Array.isArray(cashierResult.result);
      }
    },
    {
      name: "Total Scheduled Hours",
      setup: async () => {
        const totalHoursQuery = "$sum(snapshot.assignments[employeeId].durationMins) / 60";
        const totalHoursResult = await runEvalQuery({
          version: mockFacts.snapshot.version,
          facts: mockFacts,
          expr: totalHoursQuery
        });
        console.log(`📊 eval_query("${totalHoursQuery}") result: ${JSON.stringify(totalHoursResult)}`);
        return totalHoursResult.ok && typeof totalHoursResult.result === 'number';
      }
    },
    {
      name: "Employee List Query",
      setup: async () => {
        const employeeListQuery = "snapshot.employees.{name: name, hours: weeklyMinutes / 60}";
        const employeeListResult = await runEvalQuery({
          version: mockFacts.snapshot.version,
          facts: mockFacts,
          expr: employeeListQuery
        });
        console.log(`📊 eval_query("${employeeListQuery}") result: ${JSON.stringify(employeeListResult)}`);
        return employeeListResult.ok && Array.isArray(employeeListResult.result);
      }
    },
    {
      name: "Invalid Query Handling",
      setup: async () => {
        const invalidQuery = "invalid.query.syntax";
        const invalidResult = await runEvalQuery({
          version: mockFacts.snapshot.version,
          facts: mockFacts,
          expr: invalidQuery
        });
        console.log(`📊 eval_query("${invalidQuery}") result: ${JSON.stringify(invalidResult)}`);
        return !invalidResult.ok && invalidResult.error !== undefined;
      }
    }
  ];

  let passedTests = 0;
  let totalTests = testCases.length;

  for (const testCase of testCases) {
    console.log(`\n🧪 Testing: ${testCase.name}`);

    try {
      const success = await testCase.setup();
      if (success) {
        console.log(`✅ ${testCase.name} - PASSED`);
        passedTests++;
      } else {
        console.log(`❌ ${testCase.name} - FAILED`);
      }
    } catch (error) {
      console.log(`❌ ${testCase.name} - ERROR: ${error}`);
    }
  }

  console.log(`\n📊 Test Results: ${passedTests}/${totalTests} tests passed`);

  if (passedTests === totalTests) {
    console.log("🎉 All tests passed! The AI assistant core functionality is working correctly.");
  } else {
    console.log("⚠️  Some tests failed. Check the output above for details.");
  }

  console.log("\n📋 Recommended Test Prompts for Manual Testing:");
  console.log("• How many hours did Carol work this week?");
  console.log("• What unassigned shifts are there on Monday?");
  console.log("• How many total shifts are there this week?");
  console.log("• How many Cashier shifts are unassigned?");
  console.log("• What's the total scheduled hours this week?");
  console.log("• Show me all employees and their hours");
  console.log("• What's the weather like today? (should refuse)");
  console.log("• What's Carol's email address? (should refuse)");
}

testAIInteractions().catch(console.error);