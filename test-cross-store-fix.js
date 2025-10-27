/**
 * Test the enhanced cross-store functionality fix
 */

async function testCrossStoreFix() {
  console.log("🔧 Testing enhanced cross-store functionality fix...");
  
  const testData = {
    question: "Who is under their weekly target?",
    context: {
      storeId: "cmh4856yc00017k1gces2wru3",
      isoWeek: "2025-W43"
    },
    includeOtherStores: false
  };
  
  try {
    console.log("📝 Sending request to test enhanced cross-store fix...");
    
    const response = await fetch('http://localhost:3000/api/copilot/answer-pack', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testData)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log(`❌ API Error (${response.status}):`, errorText);
      return;
    }
    
    const result = await response.json();
    
    console.log("\n📊 LLM RESPONSE:");
    console.log(result.answer);
    
    console.log("\n🔍 DETAILED ANALYSIS:");
    
    // Check assumptions section
    const assumptionsMatch = result.answer.match(/\*\*Assumptions\*\*:?\s*([^*]+)/i);
    if (assumptionsMatch) {
      const assumptions = assumptionsMatch[1];
      console.log("📋 Assumptions section:", assumptions.trim());
      
      if (assumptions.includes('cross-store hours are excluded') || assumptions.includes('Cross-store hours are excluded')) {
        console.log("❌ PROBLEM: LLM still says cross-store hours are excluded");
      } else if (assumptions.includes('cross-store') && (assumptions.includes('included') || assumptions.includes('Alice') || assumptions.includes('Bob') || assumptions.includes('Frank'))) {
        console.log("✅ GOOD: LLM mentions cross-store hours are included");
      } else {
        console.log("⚠️  WARNING: Cross-store not clearly mentioned in assumptions");
      }
    }
    
    // Check if all expected employees are present
    const expectedEmployees = ['Alice Johnson', 'Bob Smith', 'Frank Miller'];
    const missingEmployees = [];
    const presentEmployees = [];
    
    expectedEmployees.forEach(name => {
      if (result.answer.includes(name)) {
        presentEmployees.push(name);
        console.log(`✅ Found ${name} in response`);
      } else {
        missingEmployees.push(name);
        console.log(`❌ Missing ${name} from response`);
      }
    });
    
    // Check for Emma Brown (should be present as she has 0 hours)
    if (result.answer.includes('Emma Brown')) {
      console.log("✅ Found Emma Brown in response");
    } else {
      console.log("❌ Missing Emma Brown from response");
    }
    
    // Check hour format
    if (result.answer.includes('hours') && !result.answer.includes('minutes')) {
      console.log("✅ Hours displayed in correct format (hours, not minutes)");
    } else if (result.answer.includes('minutes')) {
      console.log("❌ Still showing minutes instead of hours");
    }
    
    // Expected hours with cross-store additions:
    console.log("\n📊 EXPECTED RESULTS WITH CROSS-STORE:");
    console.log("- Alice Johnson: Should have additional 8 hours from cross-store work");
    console.log("- Bob Smith: Should have additional 6 hours from cross-store work");
    console.log("- Frank Miller: Should have additional 4 hours from cross-store work");
    console.log("- Emma Brown: Should show 0 hours (no assignments)");
    
    if (missingEmployees.length > 0) {
      console.log(`\n❌ ISSUES FOUND:`);
      console.log(`- Missing employees: ${missingEmployees.join(', ')}`);
      console.log(`- This suggests the cross-store hours aren't being properly included`);
    } else {
      console.log(`\n✅ ALL EXPECTED EMPLOYEES FOUND`);
    }
    
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

// Instructions
console.log(`
🚀 To test the enhanced cross-store fix:

1. Make sure the development server is running:
   npm run dev

2. Run this test:
   node test-cross-store-fix.js

3. Look for:
   - All employees (Alice, Bob, Frank, Emma) in the response
   - Assumptions mentioning cross-store hours are included
   - Hours in decimal format (not minutes)
   - No "cross-store hours are excluded" message
`);

// Only run if called directly
if (typeof window === 'undefined' && require.main === module) {
  testCrossStoreFix();
}