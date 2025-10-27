/**
 * Test script to verify cross-store employee hours are properly calculated
 * Run this after starting the development server
 */

async function testCrossStoreHours() {
  console.log("🔍 Testing cross-store employee hours calculation...");
  
  const testQuestions = [
    "Who is under their weekly target?",
    "Show me all employee hours this week",
    "Which employees need more hours?",
    "Who has the biggest hour deficit?",
  ];
  
  const testData = {
    context: {
      storeId: "cmh4856yc00017k1gces2wru3", // Replace with actual store ID
      isoWeek: "2025-W43"
    },
    includeOtherStores: false // Test with cross-store disabled to ensure cross-store employees still get full hours
  };
  
  for (const question of testQuestions) {
    console.log(`\n📝 Testing: "${question}"`);
    
    try {
      const response = await fetch('http://localhost:3000/api/copilot/answer-pack', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...testData,
          question: question
        })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.log(`❌ API Error (${response.status}):`, errorText);
        continue;
      }
      
      const result = await response.json();
      console.log("✅ Answer:", result.answer.substring(0, 300) + "...");
      console.log("📊 Metadata:", {
        fetchTime: result.metadata.fetchTime + "ms",
        recordCounts: result.metadata.recordCounts,
        sources: result.metadata.sources
      });
      
      // Check if the answer mentions cross-store employees or includes hours from multiple stores
      if (result.answer.includes('cross') || result.answer.includes('stores')) {
        console.log("✅ Cross-store functionality appears to be working");
      }
      
    } catch (error) {
      console.error(`❌ Error testing "${question}":`, error.message);
    }
  }
  
  console.log(`
📋 What to look for in the results:
- Employees who can work across stores should show their TOTAL weekly hours from ALL stores
- Hours should be displayed in decimal format (e.g., 32.0 hours, not 1920 minutes)
- Cross-store employees should have accurate deficit/surplus calculations
- The system should mention if cross-store data is included
  `);
}

// Instructions for running the test
console.log(`
🚀 To run this test:

1. Start the development server:
   npm run dev

2. In another terminal, run:
   node test-cross-store-hours.js

3. Check that cross-store employees show their complete weekly hours from all stores
`);

// Only run if called directly (not imported)
if (typeof window === 'undefined' && require.main === module) {
  testCrossStoreHours();
}