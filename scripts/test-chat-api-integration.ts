/**
 * Integration test for the chat API
 * Tests the full API endpoint with real scenarios
 */

async function testChatAPI(message: string, storeId: string, weekId: string) {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`Testing: "${message}"`);
  console.log(`${"=".repeat(70)}\n`);

  try {
    const response = await fetch("http://localhost:3000/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Note: In production, you'd need proper authentication headers
      },
      body: JSON.stringify({
        message,
        storeId,
        weekId,
      }),
    });

    if (!response.ok) {
      console.error("❌ API error:", response.status, response.statusText);
      const errorData = await response.json();
      console.error("Error details:", errorData);
      return;
    }

    const data = await response.json();
    
    console.log("✅ Response received\n");
    console.log("Reply:", data.reply);
    
    if (data.metrics) {
      console.log("\nMetrics:");
      console.log("- Latency:", data.metrics.latencyMs, "ms");
      console.log("- Tool calls:", data.metrics.toolCalls);
      console.log("- Snapshot size:", data.metrics.snapshotSizeKB, "KB");
      console.log("- Truncated:", data.metrics.truncated ?? false);
    }

    // Check for problematic phrases
    const problematicPhrases = [
      "tool error",
      "contact support",
      "manual review",
      "retry later",
      "Unable to calculate",
    ];

    const hasProblematicPhrase = problematicPhrases.some(phrase =>
      data.reply.toLowerCase().includes(phrase.toLowerCase())
    );

    if (hasProblematicPhrase) {
      console.log("\n⚠️ WARNING: Response contains problematic phrases!");
      console.log("The response should be improved to avoid technical errors.");
    } else {
      console.log("\n✅ Response looks good - no technical errors exposed");
    }

    // Check for proper formatting
    const lines = data.reply.split('\n').filter((l: string) => l.trim());
    if (lines.length > 8) {
      console.log(`\n⚠️ WARNING: Response has ${lines.length} lines (should be ≤8)`);
    } else {
      console.log(`\n✅ Response length is good (${lines.length} lines)`);
    }

  } catch (error) {
    console.error("❌ Test failed:", error);
  }
}

async function main() {
  const storeId = "cmgo4mnx100027kdwdsqz7xyl";
  const weekId = "2025-W42";

  console.log("Starting chat API integration tests...");
  console.log("Make sure the Next.js dev server is running on http://localhost:3000");
  console.log("\nNote: These tests require authentication. Run them in the browser console with proper session.");

  // Test 1: Simple hours query
  await testChatAPI("bob hours", storeId, weekId);

  // Wait between tests
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Test 2: More natural phrasing
  await testChatAPI("how many hours does Bob have this week", storeId, weekId);

  // Wait between tests
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Test 3: With full name
  await testChatAPI("Bob Smith hours", storeId, weekId);

  // Wait between tests
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Test 4: Different employee
  await testChatAPI("Alice hours", storeId, weekId);

  console.log("\n" + "=".repeat(70));
  console.log("Integration tests complete");
  console.log("=".repeat(70));
}

if (require.main === module) {
  main().catch(console.error);
}

export { testChatAPI };
