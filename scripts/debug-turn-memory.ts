/**
 * Debug Turn Memory Save/Load
 */

import { saveTurnMemory, loadTurnMemory, createShiftOptions } from "../src/server/preview/turn-memory";
import { interpretReply } from "../src/server/preview/reply-interpreter";

// Mock data
const userId = "user_2plj0wCiCn8jSE7lFD16QGUPaB4"; // Replace with actual user ID from logs
const storeId = "test-store";
const weekId = "2025-W42";
const threadId = "chat";

const mockCandidates = [
  {
    shiftId: "template-1-WED",
    templateId: "template-1",
    label: "Morning (09:00-15:00)",
    startTime: "09:00",
    endTime: "15:00",
    durationHours: 6,
    fits: true,
    reason: undefined,
  },
  {
    shiftId: "template-2-WED",
    templateId: "template-2",
    label: "Afternoon (15:00-20:00)",
    startTime: "15:00",
    endTime: "20:00",
    durationHours: 5,
    fits: false,
    reason: "Ends at 20:00, Bob's availability ends at 19:00",
  },
];

async function main() {
  console.log("🧪 Testing Turn Memory Save/Load\n");
  console.log("=".repeat(80));

  console.log("\n📝 Test 1: Saving turn memory...");
  const options = createShiftOptions(mockCandidates);
  console.log("Created options:", options);

  await saveTurnMemory(userId, storeId, weekId, threadId, {
    mode: "shift_assignment",
    scope: {
      empId: "emp-123",
      day: "WED",
      role: "Sales Associate",
    },
    threadId,
    entities: {
      employeeId: "emp-123",
      employeeName: "Bob Smith",
      day: "WED",
      role: "Sales Associate",
      storeId,
      weekId,
    },
    lastQuestion: {
      id: "select_shift",
      text: "Which shift would you like to assign to Bob Smith?",
      timestamp: Date.now(),
    },
    options,
  });

  console.log("\n🔄 Test 2: Loading turn memory immediately...");
  const loaded = await loadTurnMemory(userId, storeId, weekId, threadId);
  if (loaded) {
    console.log("✅ Turn memory loaded successfully!");
    console.log("Scope:", loaded.scope);
    console.log("Employee:", loaded.entities.employeeName);
    console.log("Day:", loaded.entities.day);
    console.log("Options:", loaded.options.length);
    console.log(
      "Options detail:",
      loaded.options.map((o) => ({
        optionId: o.optionId,
        label: o.label,
        fits: o.fits,
      })),
    );
  } else {
    console.log("⚠️ Turn memory NOT found!");
  }

  console.log("\n🚫 Test 3: Loading with different user ID (should fail)...");
  const loadedWrong = await loadTurnMemory("wrong-user", storeId, weekId, threadId);
  if (loadedWrong) {
    console.log("⚠️ UNEXPECTED: Should not have found turn memory!");
  } else {
    console.log("✅ Correctly returned null for wrong user");
  }

  console.log("\n🗣️ Test 4: Testing reply interpretation...");
  const testInputs = ["yes", "morning", "1", "oui", "no"];
  for (const input of testInputs) {
    const result = interpretReply(input, loaded);
    console.log(`"${input}" →`, {
      intent: result.intent,
      confidence: result.confidence.toFixed(2),
      optionId: result.optionId,
    });
  }

  console.log("\n" + "=".repeat(80));
  console.log("✅ Debug complete!");
}

main().catch((error) => {
  console.error("❌ Debug script failed", error);
});
