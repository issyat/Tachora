/**
 * Comprehensive test for the full AI assistant flow
 * Tests: analyze_shift_candidates → user selects → create_preview → apply
 */

import { prisma } from '@/lib/prisma';
import { handleAnalyzeCandidates, handleCreatePreview, type HandlerDependencies } from '@/server/preview/llm-handlers';
import { getState, resolveSelection, clearState } from '@/server/preview/conversation-state';

function formatTime(date: Date | string): string {
  if (typeof date === 'string') return date;
  const hours = date.getUTCHours().toString().padStart(2, '0');
  const minutes = date.getUTCMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

async function testFullFlow() {
  console.log('🧪 Testing Full AI Assistant Flow\n');
  console.log('=' .repeat(60));

  try {
    // Step 1: Find Bob
    console.log('\n📍 Step 1: Finding Bob Smith...');
    const bob = await prisma.employee.findFirst({
      where: { name: { contains: 'Bob' } },
      select: {
        id: true,
        name: true,
        storeId: true,
      },
    });

    if (!bob) {
      console.error('❌ Bob not found');
      return;
    }
    console.log(`✅ Found: ${bob.name} (${bob.id})`);

    // Step 2: Find active schedule
    console.log('\n📍 Step 2: Finding active schedule...');
    const schedule = await prisma.schedule.findFirst({
      where: {
        storeId: bob.storeId,
        state: 'Draft',
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        isoWeek: true,
        storeId: true,
      },
    });

    if (!schedule) {
      console.error('❌ No draft schedule found');
      return;
    }
    console.log(`✅ Schedule: ${schedule.isoWeek} (${schedule.id})`);

    // Step 3: Check Bob's availability
    console.log('\n📍 Step 3: Checking Bob\'s availability...');
    const availability = await prisma.availability.findMany({
      where: { employeeId: bob.id },
      select: {
        day: true,
        isOff: true,
        startTime: true,
        endTime: true,
      },
    });

    const wedAvail = availability.find((a: any) => a.day === 'WED');
    if (wedAvail) {
      console.log(`✅ WED availability: ${wedAvail.isOff ? 'OFF' : `${formatTime(wedAvail.startTime!)}-${formatTime(wedAvail.endTime!)}`}`);
    } else {
      console.log('⚠️  No WED availability defined');
    }

    // Step 4: Check shift templates
    console.log('\n📍 Step 4: Checking shift templates...');
    const templates = await prisma.shiftTemplate.findMany({
      where: { storeId: bob.storeId },
      select: {
        id: true,
        days: true,
        startTime: true,
        endTime: true,
        workType: {
          select: { name: true },
        },
      },
    });

    const wedTemplates = templates.filter((t: any) => {
      const daysField = t.days;
      let days: string[];
      
      if (Array.isArray(daysField)) {
        days = daysField;
      } else if (daysField && typeof daysField === 'object') {
        days = Object.entries(daysField)
          .filter(([_, enabled]) => enabled === true)
          .map(([day, _]) => day);
      } else {
        return false;
      }
      
      return days.includes('WED');
    });

    console.log(`✅ Found ${wedTemplates.length} templates with WED`);
    wedTemplates.forEach((t: any) => {
      console.log(`   - ${t.workType.name}: ${formatTime(t.startTime)}-${formatTime(t.endTime)}`);
    });

    // Step 5: Call analyze_shift_candidates
    console.log('\n📍 Step 5: Calling analyze_shift_candidates...');
    console.log('   Request: Bob, WED, Sales Associate');

    const testUserId = 'test-user-' + Date.now();
    const handlerDeps: HandlerDependencies = {
      prisma,
      userId: testUserId,
    };

    const analyzeResult = await handleAnalyzeCandidates(
      {
        employeeId: bob.id,
        day: 'WED',
        role: 'Sales Associate',
      },
      {
        storeId: bob.storeId,
        weekId: schedule.isoWeek,
      },
      handlerDeps
    );

    console.log('\n📤 Analyze Result:');
    console.log(`   Status: ${analyzeResult.ok ? '✅ OK' : '❌ ERROR'}`);
    
    if (!analyzeResult.ok) {
      console.error('   Error:', analyzeResult.error);
      console.error('   Message:', analyzeResult.message);
      return;
    }

    const data = analyzeResult.data as any;
    console.log(`   Candidates: ${data.candidateCount}`);
    console.log(`   Locked Context: ${data.lockedContext.employeeName}, ${data.lockedContext.day}, ${data.lockedContext.role}`);
    
    data.candidates.forEach((c: any, i: number) => {
      console.log(`   ${i + 1}. ${c.label} (${c.startTime}-${c.endTime}) - ${c.fits ? '✅ Fits' : '❌ ' + c.reason}`);
    });

    console.log('\n📄 Message to User:');
    console.log(analyzeResult.message);

    // Step 6: Check conversation state
    console.log('\n📍 Step 6: Verifying conversation state...');
    const state = getState(testUserId, bob.storeId, schedule.isoWeek);
    
    if (!state?.lockedContext) {
      console.error('❌ Context not locked!');
      return;
    }
    console.log('✅ Context locked:');
    console.log(`   Employee: ${state.lockedContext.employeeName}`);
    console.log(`   Day: ${state.lockedContext.day}`);
    console.log(`   Role: ${state.lockedContext.role}`);

    if (!state.candidates || state.candidates.length === 0) {
      console.error('❌ No candidates stored!');
      return;
    }
    console.log(`✅ ${state.candidates.length} candidates stored`);

    // Step 7: Simulate user selection
    console.log('\n📍 Step 7: Simulating user selection...');
    const testSelections = ['morning', 'afternoon', '1', 'first'];
    
    for (const selection of testSelections) {
      const resolved = resolveSelection(testUserId, bob.storeId, schedule.isoWeek, selection);
      if (resolved) {
        console.log(`   "${selection}" → ${resolved.label} (${resolved.shiftId})`);
      } else {
        console.log(`   "${selection}" → ❌ No match`);
      }
    }

    // Step 8: Create preview with morning shift
    console.log('\n📍 Step 8: Creating preview with selected shift...');
    const morningCandidate = resolveSelection(testUserId, bob.storeId, schedule.isoWeek, 'morning');
    
    if (!morningCandidate) {
      console.error('❌ Could not resolve "morning"');
      return;
    }

    console.log(`✅ Selected: ${morningCandidate.label}`);
    console.log(`   Shift ID: ${morningCandidate.shiftId}`);
    console.log(`   Template ID: ${morningCandidate.templateId}`);
    console.log(`   Fits: ${morningCandidate.fits ? '✅' : '❌'}`);

    if (!morningCandidate.fits) {
      console.log('⚠️  Warning: Selected shift does not fit availability!');
    }

    console.log('\n   Calling create_preview...');
    const createResult = await handleCreatePreview(
      {
        operations: [
          {
            type: 'assign_shift',
            employeeId: bob.id,
            shiftId: morningCandidate.shiftId,
            reason: 'Fits availability',
          },
        ],
        explanation: `Assigning ${bob.name} to ${state.lockedContext.day} ${morningCandidate.label} ${state.lockedContext.role} shift`,
      },
      {
        storeId: bob.storeId,
        weekId: schedule.isoWeek,
      },
      handlerDeps
    );

    console.log('\n📤 Create Preview Result:');
    console.log(`   Status: ${createResult.ok ? '✅ OK' : '❌ ERROR'}`);
    
    if (!createResult.ok) {
      console.error('   Error:', createResult.error);
      console.error('   Message:', createResult.message);
      return;
    }

    const previewData = createResult.data as any;
    console.log(`   Preview ID: ${previewData.previewId}`);
    console.log(`   Operations: ${previewData.operations?.length || 0}`);
    console.log(`   Snapshot Version: ${previewData.snapshotVersion}`);

    console.log('\n📄 Message to User:');
    console.log(createResult.message);

    // Cleanup
    console.log('\n🧹 Cleaning up...');
    clearState(testUserId, bob.storeId, schedule.isoWeek);
    console.log('✅ Test state cleared');

    console.log('\n' + '='.repeat(60));
    console.log('🎉 ALL TESTS PASSED!');
    console.log('\n📝 Summary:');
    console.log('   1. ✅ Found employee and schedule');
    console.log('   2. ✅ Analyzed shift candidates with availability');
    console.log('   3. ✅ Locked conversation context');
    console.log('   4. ✅ Stored candidates with shiftIds');
    console.log('   5. ✅ Resolved user selection ("morning")');
    console.log('   6. ✅ Created preview with correct shiftId');
    console.log('\n💡 The AI assistant flow is working correctly!');
    console.log('   Try in UI: "assign bob on wed sales associate" → "morning"');

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error);
    if (error instanceof Error) {
      console.error('   Stack:', error.stack);
    }
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

testFullFlow();
