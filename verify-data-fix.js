/**
 * Verify the exact data being sent to the LLM
 */

async function verifyDataFix() {
  console.log("🔍 Verifying the exact data being sent to LLM...");
  
  const testData = {
    question: "Who is under their weekly target?",
    context: {
      storeId: "cmh4856yc00017k1gces2wru3",
      isoWeek: "2025-W43"
    },
    includeOtherStores: false
  };
  
  try {
    console.log("📝 Sending request to verify data...");
    
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
    
    console.log("\n🔍 CRITICAL CHECKS:");
    
    // Check if Alice Johnson is mentioned
    if (result.answer.includes('Alice Johnson')) {
      console.log("✅ Alice Johnson is included in response");
    } else {
      console.log("❌ Alice Johnson is MISSING from response - this is the main problem!");
    }
    
    // Check assumptions
    if (result.answer.includes('cross-store hours are excluded') || result.answer.includes('Cross-store hours are excluded')) {
      console.log("❌ CRITICAL: LLM still says cross-store hours are excluded");
    } else if (result.answer.includes('cross-store') && result.answer.includes('included')) {
      console.log("✅ LLM correctly mentions cross-store hours are included");
    } else {
      console.log("⚠️  Cross-store not mentioned in assumptions");
    }
    
    // Count employees mentioned
    const employees = ['Alice Johnson', 'Bob Smith', 'Carol Davis', 'David Wilson', 'Frank Miller', 'Grace Lee', 'Emma Brown'];
    const mentionedEmployees = employees.filter(name => result.answer.includes(name));
    
    console.log(`\n📋 Employees mentioned: ${mentionedEmployees.length}`);
    mentionedEmployees.forEach(name => console.log(`   ✅ ${name}`));
    
    const missingEmployees = employees.filter(name => !result.answer.includes(name));
    if (missingEmployees.length > 0) {
      console.log(`\n❌ Missing employees: ${missingEmployees.length}`);
      missingEmployees.forEach(name => console.log(`   ❌ ${name}`));
    }
    
    console.log("\n🎯 EXPECTED BEHAVIOR:");
    console.log("- Alice Johnson should be included (she has cross-store hours)");
    console.log("- Bob Smith should show increased hours (has cross-store hours)");
    console.log("- Frank Miller should show increased hours (has cross-store hours)");
    console.log("- Emma Brown should show 0 hours");
    console.log("- Assumptions should mention cross-store hours are INCLUDED");
    
    // Look for the backend logs in the console to verify data processing
    console.log("\n📋 Check the server console logs for:");
    console.log("- 🧪 [ANSWERPACK] TEMP: Marked [employee] as cross-store for testing");
    console.log("- 🧪 [ANSWERPACK] TEMP: Added [X] minutes for [employee] from other stores");
    console.log("- 🔍 [ANSWERPACK] Hours data for LLM: (should show cross-store employees)");
    
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

// Instructions
console.log(`
🚀 To verify the data fix:

1. Make sure the development server is running:
   npm run dev

2. Run this verification:
   node verify-data-fix.js

3. Check both the response AND the server console logs

The server logs will show exactly what data is being processed and sent to the LLM.
`);

// Only run if called directly
if (typeof window === 'undefined' && require.main === module) {
  verifyDataFix();
}