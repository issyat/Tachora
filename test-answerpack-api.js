/**
 * Test the AnswerPack API to see what data is being returned for unassigned shifts
 */

async function testAnswerPackAPI() {
  console.log("🔍 Testing AnswerPack API...");
  
  const testData = {
    question: "How many unassigned shifts do we have this week?",
    context: {
      storeId: "store_1", // Replace with actual store ID
      isoWeek: "2025-W43"
    },
    includeOtherStores: false
  };
  
  try {
    const response = await fetch('http://localhost:3000/api/copilot/answer-pack', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testData)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log("❌ API Error:", response.status, errorText);
      return;
    }
    
    const result = await response.json();
    console.log("✅ API Response:");
    console.log("Answer:", result.answer);
    console.log("Metadata:", result.metadata);
    
  } catch (error) {
    console.error("❌ Error calling API:", error.message);
  }
}

// Run the test
testAnswerPackAPI();