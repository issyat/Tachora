/**
 * Check which AI Assistant is currently active
 */

require('dotenv').config({ path: '.env' });
require('dotenv').config({ path: '.env.local' });

console.log('\n🤖 AI Assistant Status Check\n');
console.log('━'.repeat(60));

const answerPackEnabled = process.env.NEXT_PUBLIC_ANSWERPACK_ASSISTANT === 'true';
const useToolAdvisor = process.env.NEXT_PUBLIC_USE_TOOL_ADVISOR === 'true';
const llmAssistantV2 = process.env.LLM_ASSISTANT_V2 === 'true';

console.log('\nEnvironment Variables:');
console.log('  NEXT_PUBLIC_ANSWERPACK_ASSISTANT:', process.env.NEXT_PUBLIC_ANSWERPACK_ASSISTANT || 'NOT SET');
console.log('  NEXT_PUBLIC_USE_TOOL_ADVISOR:', process.env.NEXT_PUBLIC_USE_TOOL_ADVISOR || 'NOT SET');
console.log('  LLM_ASSISTANT_V2:', process.env.LLM_ASSISTANT_V2 || 'NOT SET');

console.log('\n━'.repeat(60));

if (answerPackEnabled) {
  console.log('\n🎯 Currently Using: ANSWERPACK ASSISTANT (NEW)');
  console.log('   ├─ Single data fetch');
  console.log('   ├─ LLM reasons over JSON');
  console.log('   ├─ 4-section format (Scope/Assumptions/Sources/Answer)');
  console.log('   └─ Read-only Q&A system');
} else if (useToolAdvisor) {
  console.log('\n🎯 Currently Using: TOOL-BASED ADVISOR (V2)');
  console.log('   ├─ Regex-based intent extraction (tool-intent.ts)');
  console.log('   ├─ Multiple focused DB queries');
  console.log('   ├─ Template-based responses');
  console.log('   └─ File: src/server/copilot/tool-intent.ts');
} else if (llmAssistantV2) {
  console.log('\n🎯 Currently Using: LLM-BASED ASSISTANT (V2)');
  console.log('   ├─ GPT-4 intent extraction (intent-extractor.ts)');
  console.log('   ├─ Multiple focused DB queries');
  console.log('   ├─ Natural language responses');
  console.log('   └─ File: src/server/copilot/tools/intent-extractor.ts');
} else {
  console.log('\n🎯 Currently Using: CHAT ASSISTANT (V1 - OLD)');
  console.log('   ├─ Basic chat interface');
  console.log('   └─ File: src/app/(protected)/schedule/components/ScheduleChatAssistant.tsx');
}

console.log('\n━'.repeat(60));

console.log('\n💡 To Switch Assistants:\n');
console.log('1. AnswerPack Assistant (NEW - recommended):');
console.log('   Set NEXT_PUBLIC_ANSWERPACK_ASSISTANT=true in .env.local\n');
console.log('2. Tool-Based Advisor (Current V2):');
console.log('   Set NEXT_PUBLIC_USE_TOOL_ADVISOR=true in .env\n');
console.log('3. LLM-Based Assistant (Alternative V2):');
console.log('   Set NEXT_PUBLIC_USE_TOOL_ADVISOR=false');
console.log('   Set LLM_ASSISTANT_V2=true in .env\n');

console.log('━'.repeat(60));
console.log();
