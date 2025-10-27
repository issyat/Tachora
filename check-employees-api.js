/**
 * Check current employee status via API call
 */

async function checkEmployeeStatus() {
  console.log("🔍 Checking current employee status...");
  
  try {
    // Make a request to get current data
    const response = await fetch('http://localhost:3000/api/copilot/answer-pack', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        question: "Show me all employees and their cross-store status",
        context: {
          storeId: "cmh4856yc00017k1gces2wru3",
          isoWeek: "2025-W43"
        },
        includeOtherStores: false
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log(`❌ API Error (${response.status}):`, errorText);
      return;
    }
    
    const result = await response.json();
    
    console.log("📊 Current Response:");
    console.log(result.answer);
    
    console.log("\n📋 Metadata:");
    console.log("- Record counts:", result.metadata.recordCounts);
    console.log("- Sources:", result.metadata.sources);
    
    // Check if cross-store info is mentioned
    if (result.answer.includes('cross-store') || result.answer.includes('Cross-store')) {
      console.log("\n✅ Cross-store functionality is mentioned in response");
    } else {
      console.log("\n❌ Cross-store functionality is NOT mentioned in response");
    }
    
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

// Instructions
console.log(`
🚀 To check employee status:

1. Make sure the development server is running:
   npm run dev

2. Run this script:
   node check-employees-api.js

This will show us the current employee data and cross-store status.
`);

// Only run if called directly
if (typeof window === 'undefined' && require.main === module) {
  checkEmployeeStatus();
}