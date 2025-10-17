#!/usr/bin/env tsx
/**
 * Quick Redis Inspection Tool
 * Shows all turn memory keys and their contents
 */

import { kvGet } from '../src/server/chat/kv-store';

async function main() {
  console.log('🔍 Inspecting turn memory for test user...\n');

  const userId = 'user_2pq7FZB9WKVLkEiTWbfaW5JZg6O'; // Ismail's Clerk ID
  const storeId = 'cmgvcp11r00027kks9vebuo7q'; // Medium Retail Store
  const weekId = '2025-W42'; // Test week
  const threadId = 'chat';
  
  const key = `turn:${userId}:${storeId}:${weekId}:${threadId}`;
  
  console.log(`Looking for key: ${key}\n`);
  
  const data = await kvGet(key);
  
  if (!data) {
    console.log('❌ No turn memory found');
    console.log('\nPossible reasons:');
    console.log('  1. No conversation started yet (navigate to chat and ask a question)');
    console.log('  2. Turn memory expired (45 min TTL)');
    console.log('  3. Wrong userId/storeId/weekId/threadId');
    console.log('  4. Redis connection issue');
    console.log('\n💡 To fix:');
    console.log('  1. Start a conversation: "can you assign ismail to security on mon afternoon?"');
    console.log('  2. AI should respond with 2 shift options');
    console.log('  3. Run this script again immediately');
    return;
  }
  
  console.log('✅ Turn Memory Found!\n');
  
  const turnMem = data as any;
  console.log('📋 Turn Memory Contents:');
  console.log(`   Mode: ${turnMem.mode}`);
  console.log(`   Scope:`, JSON.stringify(turnMem.scope, null, 2));
  console.log(`   Last Question ID: ${turnMem.lastQuestion?.id}`);
  console.log(`   Last Question Text: ${turnMem.lastQuestion?.text}`);
  console.log(`   Options Count: ${turnMem.options?.length || 0}`);
  
  if (turnMem.options && turnMem.options.length > 0) {
    console.log(`\n   📝 Shift Options:`);
    turnMem.options.forEach((opt: any, idx: number) => {
      console.log(`      ${idx + 1}. ${opt.label || `${opt.startTime}-${opt.endTime}`}`);
      console.log(`         optionId: ${opt.optionId}`);
      console.log(`         shiftId: ${opt.shiftId}`);
      console.log(`         index: ${opt.index}`);
      console.log(`         fits: ${opt.fits}`);
      console.log(`         timeOfDay: ${opt.timeOfDay}`);
      console.log();
    });
    
    console.log('\n✅ Options are stored correctly!');
    console.log('   Now when user types "1", it should:');
    console.log('   1. Match regex /^(\\d+)$/');
    console.log('   2. Convert "1" → index 0 (zero-based)');
    console.log('   3. Call findOption(turnMemory, { index: 0 })');
    console.log('   4. Return the first option from the array above');
    console.log('   5. Create a preview with that shift');
  } else {
    console.log('\n❌ NO OPTIONS STORED');
    console.log('   This is the bug! handleAnalyzeCandidates should save options to turn memory.');
    console.log('   Check llm-handlers.ts line ~362 - saveTurnMemory() call');
  }
}

main().catch(console.error);
