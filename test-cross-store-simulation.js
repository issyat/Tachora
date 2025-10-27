/**
 * Test the simulated cross-store functionality
 */

async function testCrossStoreSimulation() {
  console.log("🧪 Testing simulated cross-store functionality...");
  
  const testData = {
    question: "Who is under their weekly target?",
    context: {
      storeId: "cmh4856yc00017k1gces2wru3",
      isoWeek: "2025-W43"
    },
    includeOtherStores: false // Test with cross-store disabled to see if cross-store employees still get full hours
  };
  
  try {
    console.log("📝 Sending request to test cross-store simulation...");
    
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
    
    console.log("\n🔍 ANALYSIS:");
    
    // Check if cross-store is mentioned
    if (result.answer.includes('cross-store') || result.answer.includes('Cross-store')) {
      console.log("✅ Cross-store functionality is mentioned in the response");
    } else {
      console.log("❌ Cross-store functionality is NOT mentioned in the response");
    }
    
    // Check if hours are displayed properly
    if (result.answer.includes('hours') && !result.answer.includes('minutes')) {
      console.log("✅ Hours are displayed in hour format (not minutes)");
    } else if (result.answer.includes('minutes')) {
      console.log("❌ Still showing minutes instead of hours");
    }
    
    // Check assumptions section
    if (result.answer.includes('Cross-store setting is disabled, so only hours worked at this store are considered')) {
      console.log("❌ LLM is making incorrect assumption about cross-store hours");
    } else if (result.answer.includes('cross-store') && result.answer.includes('included')) {
      console.log("✅ LLM correctly mentions cross-store hours are included");
    }
    
    // Look for specific employees that should have additional hours
    const crossStoreEmployees = ['Alice Johnson', 'Bob Smith', 'Frank Miller'];
    crossStoreEmployees.forEach(name => {
      if (result.answer.includes(name)) {
        console.log(`✅ Found ${name} in the response`);
      }
    });
    
    console.log("\n📋 Expected behavior:");
    console.log("- Alice Johnson should have ~8 additional hours from cross-store work");
    console.log("- Bob Smith should have ~6 additional hours from cross-store work");  
    console.log("- Frank Miller should have ~4 additional hours from cross-store work");
    console.log("- LLM should mention cross-store hours are included in assumptions");
    console.log("- All hours should be displayed in decimal format (e.g., 32.0 hours)");
    
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

// Instructions
console.log(`
🚀 To test the cross-store simulation:

1. Make sure the development server is running:
   npm run dev

2. Run this test:
   node test-cross-store-simulation.js

3. Check the output to see if cross-store functionality is working

Note: This uses simulated cross-store data for testing purposes.
`);

// Only run if called directly
if (typeof window === 'undefined' && require.main === module) {
  testCrossStoreSimulation();
}