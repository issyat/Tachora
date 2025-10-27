/**
 * Debug Alice Johnson's hours specifically
 */

async function debugAliceHours() {
  console.log("🔍 Debugging Alice Johnson's hours specifically...");
  
  const testData = {
    question: "Show me Alice Johnson's weekly hours and target",
    context: {
      storeId: "cmh4856yc00017k1gces2wru3",
      isoWeek: "2025-W43"
    },
    includeOtherStores: false
  };
  
  try {
    console.log("📝 Asking specifically about Alice Johnson...");
    
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
    
    console.log("\n📊 LLM RESPONSE ABOUT ALICE:");
    console.log(result.answer);
    
    console.log("\n🔍 ANALYSIS:");
    
    if (result.answer.includes('Alice Johnson')) {
      console.log("✅ Alice Johnson is mentioned in the response");
      
      // Try to extract her hours from the response
      const aliceMatch = result.answer.match(/Alice Johnson[^.]*?(\d+\.?\d*)\s*hours?[^.]*?target[^.]*?(\d+\.?\d*)\s*hours?/i);
      if (aliceMatch) {
        const scheduledHours = parseFloat(aliceMatch[1]);
        const targetHours = parseFloat(aliceMatch[2]);
        const deficit = targetHours - scheduledHours;
        
        console.log(`📊 Alice's hours from LLM response:`);
        console.log(`   - Scheduled: ${scheduledHours} hours`);
        console.log(`   - Target: ${targetHours} hours`);
        console.log(`   - Deficit: ${deficit} hours`);
        
        if (deficit > 0) {
          console.log(`✅ Alice should be under target (deficit: ${deficit} hours)`);
        } else {
          console.log(`❌ Alice meets/exceeds target (surplus: ${-deficit} hours)`);
        }
      }
    } else {
      console.log("❌ Alice Johnson is NOT mentioned in the response");
    }
    
    console.log("\n📋 Check the server console logs for:");
    console.log("- 👤 [ANSWERPACK] Alice Johnson: target X minutes");
    console.log("- 🧪 [ANSWERPACK] TEMP: Alice Johnson hours: Xh → Yh");
    console.log("- 🔍 [ANSWERPACK] Hours data for LLM: Alice Johnson entry");
    console.log("- 🎯 [ANSWERPACK] Employees under target: should include Alice");
    
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

// Instructions
console.log(`
🚀 To debug Alice Johnson's hours:

1. Make sure the development server is running:
   npm run dev

2. Run this debug:
   node debug-alice-hours.js

3. Check BOTH the response AND the server console logs

This will help us see exactly what's happening with Alice's hours calculation.
`);

// Only run if called directly
if (typeof window === 'undefined' && require.main === module) {
  debugAliceHours();
}