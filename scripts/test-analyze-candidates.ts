/**
 * Test script for analyze_shift_candidates flow
 * 
 * Tests the new state machine workflow:
 * 1. User: "assign bob on wed sales associate"
 * 2. AI: analyze_shift_candidates → Lists options
 * 3. User: "morning"
 * 4. State resolves "morning" → specific shiftId
 * 5. AI: create_preview with shiftId
 */

import { handleAnalyzeCandidates, type HandlerDependencies } from '@/server/preview/llm-handlers';
import { getState, resolveSelection, clearState } from '@/server/preview/conversation-state';
import { prisma } from '@/lib/prisma';

async function testAnalyzeCandidatesFlow() {
  try {
    console.log('🧪 Testing analyze_shift_candidates flow\n');

    // Setup: Get Bob's employee ID
    const bob = await prisma.employee.findFirst({
      where: {
        firstName: 'Bob',
        lastName: 'Johnson',
      },
      select: {
        id: true,
        storeId: true,
        firstName: true,
        lastName: true,
        availability: true,
      },
    });

    if (!bob) {
      console.error('❌ Bob Johnson not found in database');
      return;
    }

    console.log('✅ Found Bob Johnson:', bob.id);
    console.log('   Store ID:', bob.storeId);
    console.log('   Availability:', JSON.stringify(bob.availability, null, 2), '\n');

    // Get active schedule for Bob's store
    const schedule = await prisma.schedule.findFirst({
      where: {
        storeId: bob.storeId,
        status: 'DRAFT',
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        weekId: true,
      },
    });

    if (!schedule) {
      console.error('❌ No draft schedule found for store');
      return;
    }

    console.log('✅ Found draft schedule:', schedule.id);
    console.log('   Week ID:', schedule.weekId, '\n');

    // Test 1: Call analyze_shift_candidates
    console.log('📋 Test 1: Calling handleAnalyzeCandidates...');
    console.log('   Employee: Bob Johnson');
    console.log('   Day: WED');
    console.log('   Role: Sales Associate\n');

    const testUserId = 'test-user-123';
    const handlerDeps: HandlerDependencies = {
      prisma,
      userId: testUserId,
    };

    const result = await handleAnalyzeCandidates(
      {
        employeeId: bob.id,
        day: 'WED',
        role: 'Sales Associate',
      },
      {
        storeId: bob.storeId,
        weekId: schedule.weekId,
      },
      handlerDeps
    );

    console.log('📤 Result:');
    console.log(JSON.stringify(result, null, 2), '\n');

    if (!result.ok) {
      console.error('❌ Handler returned error:', result.error);
      return;
    }

    // Test 2: Check conversation state was locked
    console.log('🔒 Test 2: Checking locked context...');
    const state = getState(testUserId, bob.storeId, schedule.weekId);
    
    if (!state?.lockedContext) {
      console.error('❌ Context was not locked!');
      return;
    }

    console.log('✅ Context locked:');
    console.log('   Employee:', state.lockedContext.employeeName);
    console.log('   Day:', state.lockedContext.day);
    console.log('   Role:', state.lockedContext.role, '\n');

    // Test 3: Check candidates were stored
    console.log('📦 Test 3: Checking stored candidates...');
    if (!state.candidates || state.candidates.length === 0) {
      console.error('❌ No candidates stored!');
      return;
    }

    console.log(`✅ ${state.candidates.length} candidates stored:`);
    state.candidates.forEach((c, i) => {
      console.log(`   ${i + 1}. ${c.label} - Fits: ${c.fits ? '✅' : '❌'}${c.reason ? ` (${c.reason})` : ''}`);
    });
    console.log();

    // Test 4: Resolve free-text selection
    console.log('🔍 Test 4: Resolving user selections...');
    
    const testInputs = ['morning', 'afternoon', '1', 'first'];
    for (const input of testInputs) {
      const resolved = resolveSelection(testUserId, bob.storeId, schedule.weekId, input);
      if (resolved) {
        console.log(`   "${input}" → ${resolved.label} (${resolved.shiftId})`);
      } else {
        console.log(`   "${input}" → ❌ No match`);
      }
    }
    console.log();

    // Test 5: Get morning shift candidate
    const morningCandidate = resolveSelection(testUserId, bob.storeId, schedule.weekId, 'morning');
    if (!morningCandidate) {
      console.error('❌ Could not resolve "morning" to shift');
      return;
    }

    console.log('✅ Test 5: Morning shift resolved:');
    console.log('   Shift ID:', morningCandidate.shiftId);
    console.log('   Label:', morningCandidate.label);
    console.log('   Fits:', morningCandidate.fits ? '✅' : '❌');
    console.log('   Template ID:', morningCandidate.templateId, '\n');

    // Cleanup
    console.log('🧹 Cleaning up test state...');
    clearState(testUserId, bob.storeId, schedule.weekId);
    console.log('✅ Test state cleared\n');

    console.log('🎉 All tests passed!');
    console.log('\n📝 Next steps:');
    console.log('   1. Test in actual chat UI');
    console.log('   2. Try: "assign bob on wed sales associate"');
    console.log('   3. AI should list options with "morning" ✅ and "afternoon" ❌');
    console.log('   4. Reply: "morning"');
    console.log('   5. AI should create preview with morning shift only');

  } catch (error) {
    console.error('❌ Test failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

testAnalyzeCandidatesFlow();
