/**
 * Debug script to test cross-store employee functionality
 * This will help us see exactly what data is being returned
 */

async function debugCrossStoreData() {
  console.log("🔍 Debugging cross-store employee data...");
  
  const testData = {
    question: "Who is under their weekly target?",
    context: {
      storeId: "cmh4856yc00017k1gces2wru3", // Replace with actual store ID
      isoWeek: "2025-W43"
    },
    includeOtherStores: false // Explicitly test with cross-store disabled
  };
  
  try {
    console.log("📝 Sending request to AnswerPack API...");
    
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
    
    console.log("\n📊 METADATA ANALYSIS:");
    console.log("- Fetch time:", result.metadata.fetchTime + "ms");
    console.log("- Record counts:", result.metadata.recordCounts);
    console.log("- Sources:", result.metadata.sources);
    
    console.log("\n🔍 CROSS-STORE INFO:");
    // The crossStoreInfo should be in the raw data that was fetched
    // Let's see if we can extract it from the LLM response or if we need to modify the API
    
    console.log("\n📝 LLM RESPONSE:");
    console.log(result.answer);
    
    console.log("\n🎯 WHAT TO LOOK FOR:");
    console.log("- Does the response mention cross-store employees?");
    console.log("- Are the assumptions section accurate about cross-store data?");
    console.log("- Do the hours look complete for employees who work multiple stores?");
    
    // Check if the response mentions cross-store
    if (result.answer.includes('cross-store') || result.answer.includes('Cross-store')) {
      console.log("✅ Response mentions cross-store functionality");
    } else {
      console.log("❌ Response does NOT mention cross-store functionality");
    }
    
    // Check assumptions section
    if (result.answer.includes('Cross-store setting is disabled, so only hours worked at this store are considered')) {
      console.log("❌ LLM is making incorrect assumption about cross-store hours");
    } else {
      console.log("✅ LLM assumptions look better");
    }
    
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

// Instructions
console.log(`
🚀 To run this debug test:

1. Start the development server:
   npm run dev

2. In another terminal, run:
   node test-cross-store-debug.js

3. Check the console output to see if cross-store data is being processed correctly
`);

// Only run if called directly
if (typeof window === 'undefined' && require.main === module) {
  debugCrossStoreData();
}