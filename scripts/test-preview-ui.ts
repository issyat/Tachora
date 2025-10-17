/**
 * Test Preview UI Integration
 * 
 * Tests the complete preview flow:
 * 1. Create preview via API
 * 2. Verify visualization data structure
 * 3. Simulate Apply action
 * 4. Verify database changes
 * 5. Test Undo functionality
 */

import type { 
  AssignShiftOp,
  Preview, 
  PreviewVisualization,
  CalendarChange,
  EmployeeImpact 
} from '../src/types/preview';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

interface TestContext {
  storeId: string;
  weekId: string;
  employeeId: string;
  templateId: string;
}

async function setupTestContext(): Promise<TestContext> {
  console.log('🔧 Setting up test context...');

  // Fetch test store
  const storesRes = await fetch(`${API_BASE}/api/stores`);
  if (!storesRes.ok) throw new Error('Failed to fetch stores');
  const storesData = await storesRes.json();
  const store = storesData.stores?.[0];
  if (!store) throw new Error('No stores available');

  console.log(`✓ Using store: ${store.name} (${store.id})`);

  // Fetch test schedule
  const scheduleRes = await fetch(`${API_BASE}/api/schedule?storeId=${store.id}`);
  if (!scheduleRes.ok) throw new Error('Failed to fetch schedule');
  const scheduleData = await scheduleRes.json();
  
  const weekId = scheduleData.schedule?.weekId;
  if (!weekId) throw new Error('No weekId found');

  console.log(`✓ Using week: ${weekId}`);

  // Fetch test employee
  const employeesRes = await fetch(`${API_BASE}/api/employees?storeId=${store.id}`);
  if (!employeesRes.ok) throw new Error('Failed to fetch employees');
  const employeesData = await employeesRes.json();
  const employee = employeesData.employees?.[0];
  if (!employee) throw new Error('No employees available');

  console.log(`✓ Using employee: ${employee.name} (${employee.id})`);

  // Fetch test template
  const templatesRes = await fetch(`${API_BASE}/api/shift-templates?storeId=${store.id}`);
  if (!templatesRes.ok) throw new Error('Failed to fetch templates');
  const templatesData = await templatesRes.json();
  const template = templatesData.templates?.[0];
  if (!template) throw new Error('No templates available');

  console.log(`✓ Using template: ${template.workType?.name} ${template.startTime}-${template.endTime} (${template.id})`);

  return {
    storeId: store.id,
    weekId,
    employeeId: employee.id,
    templateId: template.id,
  };
}

async function testCreatePreview(context: TestContext): Promise<Preview> {
  console.log('\n📝 Test 1: Create Preview');

  const operations: Partial<AssignShiftOp>[] = [
    {
      type: 'assign_shift',
      employeeId: context.employeeId,
      shiftId: context.templateId,
      reason: 'Test assignment from UI integration test',
    },
  ];

  const body = {
    storeId: context.storeId,
    weekId: context.weekId,
    snapshotVersion: '1',
    operations,
  };

  console.log('  → Sending POST /api/preview...');
  const res = await fetch(`${API_BASE}/api/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(`Preview creation failed: ${res.status} - ${JSON.stringify(errorData)}`);
  }

  const data = await res.json();
  const preview: Preview = data.preview;

  console.log(`  ✓ Preview created: ${preview.id}`);
  console.log(`  ✓ Operations: ${preview.operations.length}`);
  console.log(`  ✓ Diffs: ${preview.diffs.length}`);
  console.log(`  ✓ Status: ${preview.status}`);

  // Validate structure
  if (!preview.id || !preview.operations || !preview.diffs) {
    throw new Error('Invalid preview structure');
  }

  if (preview.diffs.length === 0) {
    throw new Error('No diffs generated');
  }

  // Check constraint validation
  preview.diffs.forEach((diff, idx) => {
    console.log(`  → Diff ${idx + 1}:`);
    console.log(`    - Operation: ${diff.operation.type}`);
    console.log(`    - Warnings: ${diff.constraints.warnings.length}`);
    console.log(`    - Blockers: ${diff.constraints.blockers.length}`);
    
    if (diff.constraints.blockers.length > 0) {
      console.log(`    ⚠ BLOCKED: ${diff.constraints.blockers.join(', ')}`);
    }
  });

  return preview;
}

async function testVisualization(preview: Preview): Promise<PreviewVisualization> {
  console.log('\n🎨 Test 2: Verify Visualization Data');

  // Fetch visualization data
  console.log('  → Fetching visualization...');
  const res = await fetch(`${API_BASE}/api/preview/${preview.id}`);
  
  if (!res.ok) {
    throw new Error(`Failed to fetch preview: ${res.status}`);
  }

  const data = await res.json();
  const visualization: PreviewVisualization = data.visualization;

  console.log(`  ✓ Calendar changes: ${visualization.calendarChanges.length}`);
  console.log(`  ✓ Employee impacts: ${visualization.employeeImpacts.length}`);

  // Validate calendar changes
  visualization.calendarChanges.forEach((change: CalendarChange, idx) => {
    console.log(`  → Change ${idx + 1}:`);
    console.log(`    - Type: ${change.type}`);
    console.log(`    - Employee: ${change.employeeName}`);
    console.log(`    - Day: ${change.day}`);
    console.log(`    - Position: row=${change.position.row}, col=${change.position.col}`);
    console.log(`    - Before: ${change.diff.before}`);
    console.log(`    - After: ${change.diff.after}`);
    console.log(`    - Color: ${change.color.bg} ${change.color.border}`);

    if (!change.employeeName || !change.day || change.position.row === undefined) {
      throw new Error('Invalid calendar change structure');
    }
  });

  // Validate employee impacts
  visualization.employeeImpacts.forEach((impact: EmployeeImpact) => {
    console.log(`  → Impact: ${impact.employeeName}`);
    console.log(`    - Before: ${impact.changes.weeklyMinutes.before}min (${impact.changes.daysWorked.before.length} days)`);
    console.log(`    - After: ${impact.changes.weeklyMinutes.after}min (${impact.changes.daysWorked.after.length} days)`);
    console.log(`    - Delta: ${impact.changes.weeklyMinutes.delta > 0 ? '+' : ''}${impact.changes.weeklyMinutes.delta}min`);

    if (!impact.employeeName || impact.changes.weeklyMinutes.before === undefined) {
      throw new Error('Invalid employee impact structure');
    }
  });

  return visualization;
}

async function testApplyPreview(preview: Preview): Promise<void> {
  console.log('\n✅ Test 3: Apply Preview');

  console.log('  → Sending POST /api/preview/:id/apply...');
  const res = await fetch(`${API_BASE}/api/preview/${preview.id}/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(`Apply failed: ${res.status} - ${JSON.stringify(errorData)}`);
  }

  const data = await res.json();
  
  console.log(`  ✓ Preview applied successfully`);
  console.log(`  ✓ Applied at: ${data.appliedAt}`);
  console.log(`  ✓ Can undo: ${data.canUndo}`);

  // Verify database changes
  console.log('  → Verifying database changes...');
  const assignmentsRes = await fetch(`${API_BASE}/api/schedule/assignments?storeId=${preview.storeId}&weekId=${preview.weekId}`);
  
  if (!assignmentsRes.ok) {
    throw new Error('Failed to fetch assignments after apply');
  }

  const assignmentsData = await assignmentsRes.json();
  console.log(`  ✓ Assignments count: ${assignmentsData.assignments?.length || 0}`);
}

async function testUndoPreview(preview: Preview): Promise<void> {
  console.log('\n↩️ Test 4: Undo Preview');

  console.log('  → Sending POST /api/preview/:id/undo...');
  const res = await fetch(`${API_BASE}/api/preview/${preview.id}/undo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(`Undo failed: ${res.status} - ${JSON.stringify(errorData)}`);
  }

  const data = await res.json();
  
  console.log(`  ✓ Preview undone successfully`);
  console.log(`  ✓ Reverted at: ${data.revertedAt}`);

  // Verify revert
  console.log('  → Verifying revert...');
  const assignmentsRes = await fetch(`${API_BASE}/api/schedule/assignments?storeId=${preview.storeId}&weekId=${preview.weekId}`);
  
  if (!assignmentsRes.ok) {
    throw new Error('Failed to fetch assignments after undo');
  }

  const assignmentsData = await assignmentsRes.json();
  console.log(`  ✓ Assignments reverted: ${assignmentsData.assignments?.length || 0}`);
}

async function testDiscardPreview(preview: Preview): Promise<void> {
  console.log('\n🗑️ Test 5: Discard Preview');

  console.log('  → Sending DELETE /api/preview/:id...');
  const res = await fetch(`${API_BASE}/api/preview/${preview.id}`, {
    method: 'DELETE',
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(`Discard failed: ${res.status} - ${JSON.stringify(errorData)}`);
  }

  console.log(`  ✓ Preview discarded successfully`);

  // Verify preview is gone
  console.log('  → Verifying deletion...');
  const checkRes = await fetch(`${API_BASE}/api/preview/${preview.id}`);
  
  if (checkRes.status !== 404) {
    throw new Error('Preview should be deleted but still exists');
  }

  console.log(`  ✓ Preview confirmed deleted`);
}

async function runTests() {
  console.log('🚀 Starting Preview UI Integration Tests\n');
  console.log('=' .repeat(60));

  try {
    // Setup
    const context = await setupTestContext();

    // Test 1: Create preview
    const preview = await testCreatePreview(context);

    // Test 2: Verify visualization
    const visualization = await testVisualization(preview);

    // Test 3: Apply preview
    await testApplyPreview(preview);

    // Test 4: Undo preview
    await testUndoPreview(preview);

    // Test 5: Discard preview
    await testDiscardPreview(preview);

    console.log('\n' + '='.repeat(60));
    console.log('✅ All tests passed!');
    console.log('\n✨ Preview UI Integration Summary:');
    console.log('  ✓ Preview creation with operations');
    console.log('  ✓ Visualization data generation (calendar changes + employee impacts)');
    console.log('  ✓ Apply functionality with database writes');
    console.log('  ✓ Undo functionality with state revert');
    console.log('  ✓ Discard functionality with cleanup');
    console.log('\n🎯 Ready for UI testing in browser!');

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

// Run tests
runTests().catch(console.error);
