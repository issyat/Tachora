/**
 * Test script to verify the unassigned shifts fix
 * Run this after starting the development server
 */

async function testUnassignedShiftsFix() {
    console.log("🔍 Testing unassigned shifts fix...");

    const testQuestions = [
        "How many unassigned shifts do we have this week?",
        "What shifts need coverage?",
        "Show me all open positions",
        "Which days have unassigned shifts?",
    ];

    const testData = {
        context: {
            storeId: "cmh4856yc00017k1gces2wru3", // Replace with actual store ID
            isoWeek: "2025-W43"
        },
        includeOtherStores: false
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
            console.log("✅ Answer:", result.answer.substring(0, 200) + "...");
            console.log("📊 Metadata:", {
                fetchTime: result.metadata.fetchTime + "ms",
                recordCounts: result.metadata.recordCounts,
                sources: result.metadata.sources
            });

        } catch (error) {
            console.error(`❌ Error testing "${question}":`, error.message);
        }
    }
}

// Instructions for running the test
console.log(`
🚀 To run this test:

1. Start the development server:
   npm run dev

2. In another terminal, run:
   node test-unassigned-fix.js

3. Check the console output to see if the LLM can now properly answer unassigned shift questions
`);

// Only run if called directly (not imported)
if (typeof window === 'undefined' && require.main === module) {
    testUnassignedShiftsFix();
}