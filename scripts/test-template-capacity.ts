import { buildLayouts } from '../src/app/(protected)/schedule/utils/layout';
import type { Template, Assignment } from '../src/app/(protected)/schedule/types';

function testTemplateCapacity() {
  console.log('🧪 Testing template capacity logic...');

  // Mock work type
  const cashierWorkType = {
    id: 'cashier-1',
    name: 'Cashier',
    color: '#3b82f6'
  };

  // Create 2 identical templates
  const templates: Template[] = [
    {
      id: 'template-1',
      workTypeId: 'cashier-1',
      workType: cashierWorkType,
      days: { MON: true, TUE: false, WED: false, THU: false, FRI: false, SAT: false, SUN: false },
      startTime: '09:00',
      endTime: '17:00'
    },
    {
      id: 'template-2',
      workTypeId: 'cashier-1',
      workType: cashierWorkType,
      days: { MON: true, TUE: false, WED: false, THU: false, FRI: false, SAT: false, SUN: false },
      startTime: '09:00',
      endTime: '17:00'
    }
  ];

  // Test Case 1: No assignments - should show 2 empty template blocks
  console.log('\n📋 Test Case 1: No assignments');
  let layouts = buildLayouts(templates, [], 8 * 60, 18 * 60);
  let mondayBlocks = layouts.MON.lanes;
  console.log(`  Expected: 2 empty blocks, Got: ${mondayBlocks.length} blocks`);
  console.log(`  Blocks: ${mondayBlocks.map(b => b.assignment ? 'FILLED' : 'EMPTY').join(', ')}`);

  // Test Case 2: 1 assignment - should show 1 filled + 1 empty block
  console.log('\n📋 Test Case 2: 1 assignment');
  const assignments: Assignment[] = [
    {
      id: 'assignment-1',
      day: 'MON',
      workType: cashierWorkType,
      startTime: '09:00',
      endTime: '17:00',
      locked: false,
      employee: {
        id: 'emp-1',
        name: 'Alice',
        color: '#f59e0b'
      },
      sourceTemplate: {
        id: 'template-1',
        workTypeId: 'cashier-1'
      }
    }
  ];

  layouts = buildLayouts(templates, assignments, 8 * 60, 18 * 60);
  mondayBlocks = layouts.MON.lanes;
  const filledBlocks = mondayBlocks.filter(b => b.assignment).length;
  const emptyBlocks = mondayBlocks.filter(b => !b.assignment).length;
  
  console.log(`  Expected: 1 filled + 1 empty, Got: ${filledBlocks} filled + ${emptyBlocks} empty`);
  console.log(`  Total blocks: ${mondayBlocks.length}`);

  // Test Case 3: 2 assignments - should show 2 filled blocks
  console.log('\n📋 Test Case 3: 2 assignments');
  const assignments2: Assignment[] = [
    ...assignments,
    {
      id: 'assignment-2',
      day: 'MON',
      workType: cashierWorkType,
      startTime: '09:00',
      endTime: '17:00',
      locked: false,
      employee: {
        id: 'emp-2',
        name: 'Bob',
        color: '#8b5cf6'
      },
      sourceTemplate: {
        id: 'template-2',
        workTypeId: 'cashier-1'
      }
    }
  ];

  layouts = buildLayouts(templates, assignments2, 8 * 60, 18 * 60);
  mondayBlocks = layouts.MON.lanes;
  const filledBlocks2 = mondayBlocks.filter(b => b.assignment).length;
  const emptyBlocks2 = mondayBlocks.filter(b => !b.assignment).length;
  
  console.log(`  Expected: 2 filled + 0 empty, Got: ${filledBlocks2} filled + ${emptyBlocks2} empty`);
  console.log(`  Total blocks: ${mondayBlocks.length}`);

  // Test Case 4: 3 assignments (exceeds template capacity) - should show 2 filled + 1 excess
  console.log('\n📋 Test Case 4: 3 assignments (exceeds capacity)');
  const assignments3: Assignment[] = [
    ...assignments2,
    {
      id: 'assignment-3',
      day: 'MON',
      workType: cashierWorkType,
      startTime: '09:00',
      endTime: '17:00',
      locked: false,
      employee: {
        id: 'emp-3',
        name: 'Charlie',
        color: '#10b981'
      }
    }
  ];

  layouts = buildLayouts(templates, assignments3, 8 * 60, 18 * 60);
  mondayBlocks = layouts.MON.lanes;
  const filledBlocks3 = mondayBlocks.filter(b => b.assignment).length;
  
  console.log(`  Expected: 3 filled blocks, Got: ${filledBlocks3} filled`);
  console.log(`  Total blocks: ${mondayBlocks.length}`);

  console.log('\n✅ Template capacity test completed!');
}

testTemplateCapacity();