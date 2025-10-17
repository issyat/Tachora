/**
 * Test Turn-Based Reply Interpreter
 * 
 * Validates multilingual interpretation and deterministic matching
 */

import { interpretReply } from '../src/server/preview/reply-interpreter';
import type { TurnMemory, ShiftOption } from '../src/server/preview/turn-memory';

// ============================================================================
// Mock Turn Memory
// ============================================================================

const mockTurnMemory: TurnMemory = {
  mode: 'shift_assignment',
  scope: {
    empId: 'emp-123',
    day: 'WED',
    role: 'Sales Associate',
  },
  threadId: 'test-thread',
  entities: {
    employeeId: 'emp-123',
    employeeName: 'Bob Smith',
    day: 'WED',
    role: 'Sales Associate',
    storeId: 'store-1',
    weekId: '2025-W42',
  },
  lastQuestion: {
    id: 'select_shift',
    text: 'Which shift would you like to assign?',
    timestamp: Date.now(),
  },
  options: [
    {
      optionId: 'opt_1',
      shiftId: 'template-1-WED',
      templateId: 'template-1',
      label: 'Morning (09:00-15:00)',
      startTime: '09:00',
      endTime: '15:00',
      durationHours: 6,
      fits: true,
      timeOfDay: 'morning',
      index: 0,
      hoursLabel: '30h / 40h',
    },
    {
      optionId: 'opt_2',
      shiftId: 'template-2-WED',
      templateId: 'template-2',
      label: 'Afternoon (15:00-20:00)',
      startTime: '15:00',
      endTime: '20:00',
      durationHours: 5,
      fits: false,
      reason: 'Overlaps with existing assignment',
      timeOfDay: 'afternoon',
      index: 1,
      hoursLabel: '30h / 40h',
    },
    {
      optionId: 'opt_3',
      shiftId: 'template-3-WED',
      templateId: 'template-3',
      label: 'Evening (18:00-22:00)',
      startTime: '18:00',
      endTime: '22:00',
      durationHours: 4,
      fits: false,
      reason: 'Employee not available',
      timeOfDay: 'evening',
      index: 2,
      hoursLabel: '30h / 40h',
    },
  ],
  createdAt: Date.now(),
  expiresAt: Date.now() + 10 * 60 * 1000,
};

// ============================================================================
// Test Cases
// ============================================================================

interface TestCase {
  input: string;
  expectedIntent: 'confirm' | 'select' | 'reject' | 'unknown';
  expectedOptionId?: string;
  minConfidence: number;
  description: string;
  expectAutoApply?: boolean;
}

const testCases: TestCase[] = [
  // Numeric selection
  { input: '1', expectedIntent: 'select', expectedOptionId: 'opt_1', minConfidence: 1.0, description: 'Numeric: 1' },
  { input: '2', expectedIntent: 'select', expectedOptionId: 'opt_2', minConfidence: 1.0, description: 'Numeric: 2' },
  { input: '3', expectedIntent: 'select', expectedOptionId: 'opt_3', minConfidence: 1.0, description: 'Numeric: 3' },
  { input: 'opt_1', expectedIntent: 'select', expectedOptionId: 'opt_1', minConfidence: 1.0, description: 'Direct option id: opt_1' },

  // Ordinals - English
  { input: 'first', expectedIntent: 'select', expectedOptionId: 'opt_1', minConfidence: 0.9, description: 'Ordinal EN: first' },
  { input: 'second', expectedIntent: 'select', expectedOptionId: 'opt_2', minConfidence: 0.9, description: 'Ordinal EN: second' },
  { input: 'third', expectedIntent: 'select', expectedOptionId: 'opt_3', minConfidence: 0.9, description: 'Ordinal EN: third' },
  
  // Ordinals - French
  { input: 'premier', expectedIntent: 'select', expectedOptionId: 'opt_1', minConfidence: 0.9, description: 'Ordinal FR: premier' },
  { input: 'deuxieme', expectedIntent: 'select', expectedOptionId: 'opt_2', minConfidence: 0.9, description: 'Ordinal FR: deuxième' },
  { input: 'deuxième', expectedIntent: 'select', expectedOptionId: 'opt_2', minConfidence: 0.9, description: 'Ordinal FR: deuxième (with diacritic)' },
  
  // Ordinals - Spanish
  { input: 'primero', expectedIntent: 'select', expectedOptionId: 'opt_1', minConfidence: 0.9, description: 'Ordinal ES: primero' },
  { input: 'segundo', expectedIntent: 'select', expectedOptionId: 'opt_2', minConfidence: 0.9, description: 'Ordinal ES: segundo' },
  
  // Time of day - English
  { input: 'morning', expectedIntent: 'select', expectedOptionId: 'opt_1', minConfidence: 0.9, description: 'TimeOfDay EN: morning' },
  { input: 'afternoon', expectedIntent: 'unknown', minConfidence: 0, description: 'TimeOfDay EN: afternoon (doesn\'t fit, returns unknown)' },
  { input: 'evening', expectedIntent: 'unknown', minConfidence: 0, description: 'TimeOfDay EN: evening (doesn\'t fit, returns unknown)' },
  
  // Time of day - French
  { input: 'matin', expectedIntent: 'select', expectedOptionId: 'opt_1', minConfidence: 0.9, description: 'TimeOfDay FR: matin' },
  { input: 'apres-midi', expectedIntent: 'unknown', minConfidence: 0, description: 'TimeOfDay FR: après-midi (doesn\'t fit, returns unknown)' },
  { input: 'soir', expectedIntent: 'unknown', minConfidence: 0, description: 'TimeOfDay FR: soir (doesn\'t fit, returns unknown)' },
  
  // Time of day - Spanish
  { input: 'manana', expectedIntent: 'select', expectedOptionId: 'opt_1', minConfidence: 0.9, description: 'TimeOfDay ES: mañana' },
  { input: 'tarde', expectedIntent: 'unknown', minConfidence: 0, description: 'TimeOfDay ES: tarde (doesn\'t fit, returns unknown)' },
  { input: 'noche', expectedIntent: 'unknown', minConfidence: 0, description: 'TimeOfDay ES: noche (doesn\'t fit, returns unknown)' },
  
  // Time of day - German
  { input: 'morgen', expectedIntent: 'select', expectedOptionId: 'opt_1', minConfidence: 0.9, description: 'TimeOfDay DE: morgen' },
  { input: 'nachmittag', expectedIntent: 'unknown', minConfidence: 0, description: 'TimeOfDay DE: nachmittag (doesn\'t fit, returns unknown)' },
  { input: 'abend', expectedIntent: 'unknown', minConfidence: 0, description: 'TimeOfDay DE: abend (doesn\'t fit, returns unknown)' },
  
  // Exact time
  { input: '09:00', expectedIntent: 'select', expectedOptionId: 'opt_1', minConfidence: 1.0, description: 'Exact time: 09:00' },
  { input: '15:00', expectedIntent: 'select', expectedOptionId: 'opt_2', minConfidence: 1.0, description: 'Exact time: 15:00' },
  { input: '9am', expectedIntent: 'select', expectedOptionId: 'opt_1', minConfidence: 1.0, description: 'Exact time: 9am' },
  { input: '3pm', expectedIntent: 'select', expectedOptionId: 'opt_2', minConfidence: 1.0, description: 'Exact time: 3pm' },
  
  // Affirmatives - English
  { input: 'yes', expectedIntent: 'select', expectedOptionId: 'opt_1', minConfidence: 0.9, description: 'Affirmative EN: yes (selects single fit)' },
  { input: 'yes please', expectedIntent: 'select', expectedOptionId: 'opt_1', minConfidence: 0.9, description: 'Affirmative EN: yes please' },
  { input: 'ok', expectedIntent: 'select', expectedOptionId: 'opt_1', minConfidence: 0.9, description: 'Affirmative EN: ok' },
  { input: 'sure', expectedIntent: 'select', expectedOptionId: 'opt_1', minConfidence: 0.9, description: 'Affirmative EN: sure' },
  { input: 'can you assign him', expectedIntent: 'select', expectedOptionId: 'opt_1', minConfidence: 0.9, description: 'Assignment pronoun: can you assign him', expectAutoApply: true },
  { input: 'assign bob', expectedIntent: 'select', expectedOptionId: 'opt_1', minConfidence: 0.9, description: 'Assignment name: assign bob', expectAutoApply: true },
  
  // Affirmatives - French
  { input: 'oui', expectedIntent: 'select', expectedOptionId: 'opt_1', minConfidence: 0.9, description: 'Affirmative FR: oui' },
  { input: 'ouais', expectedIntent: 'select', expectedOptionId: 'opt_1', minConfidence: 0.9, description: 'Affirmative FR: ouais' },
  
  // Affirmatives - Spanish
  { input: 'si', expectedIntent: 'select', expectedOptionId: 'opt_1', minConfidence: 0.9, description: 'Affirmative ES: sí' },
  { input: 'vale', expectedIntent: 'select', expectedOptionId: 'opt_1', minConfidence: 0.9, description: 'Affirmative ES: vale' },
  
  // Affirmatives - German
  { input: 'ja', expectedIntent: 'select', expectedOptionId: 'opt_1', minConfidence: 0.9, description: 'Affirmative DE: ja' },
  
  // Affirmatives - Japanese
  { input: 'hai', expectedIntent: 'select', expectedOptionId: 'opt_1', minConfidence: 0.9, description: 'Affirmative JA: はい (hai)' },
  
  // Affirmatives - Chinese
  { input: 'shi', expectedIntent: 'select', expectedOptionId: 'opt_1', minConfidence: 0.9, description: 'Affirmative ZH: 是 (shi)' },
  { input: 'hao', expectedIntent: 'select', expectedOptionId: 'opt_1', minConfidence: 0.9, description: 'Affirmative ZH: 好 (hao)' },
  
  // Negatives - English
  { input: 'no', expectedIntent: 'reject', minConfidence: 0.9, description: 'Negative EN: no' },
  { input: 'cancel', expectedIntent: 'reject', minConfidence: 0.9, description: 'Negative EN: cancel' },
  { input: 'nevermind', expectedIntent: 'reject', minConfidence: 0.9, description: 'Negative EN: nevermind' },
  
  // Negatives - French
  { input: 'non', expectedIntent: 'reject', minConfidence: 0.9, description: 'Negative FR: non' },
  { input: 'annuler', expectedIntent: 'reject', minConfidence: 0.9, description: 'Negative FR: annuler' },
  
  // Negatives - Spanish
  { input: 'no', expectedIntent: 'reject', minConfidence: 0.9, description: 'Negative ES: no' },
  { input: 'cancelar', expectedIntent: 'reject', minConfidence: 0.9, description: 'Negative ES: cancelar' },
  
  // Negatives - German
  { input: 'nein', expectedIntent: 'reject', minConfidence: 0.9, description: 'Negative DE: nein' },
  { input: 'abbrechen', expectedIntent: 'reject', minConfidence: 0.9, description: 'Negative DE: abbrechen' },
  
  // Negatives - Japanese
  { input: 'iie', expectedIntent: 'reject', minConfidence: 0.9, description: 'Negative JA: いいえ (iie)' },
  
  // Negatives - Chinese
  { input: 'bu', expectedIntent: 'reject', minConfidence: 0.9, description: 'Negative ZH: 不 (bu)' },
  
  // Unknown inputs
  { input: 'maybe', expectedIntent: 'unknown', minConfidence: 0, description: 'Unknown: maybe' },
  { input: 'help', expectedIntent: 'unknown', minConfidence: 0, description: 'Unknown: help' },
  { input: 'what about tomorrow', expectedIntent: 'unknown', minConfidence: 0, description: 'Unknown: complex query' },
];

// ============================================================================
// Run Tests
// ============================================================================

function runTests() {
  console.log('🧪 Testing Turn-Based Reply Interpreter\n');
  console.log('='.repeat(80));
  
  let passed = 0;
  let failed = 0;
  const failures: string[] = [];
  
  for (const test of testCases) {
    const result = interpretReply(test.input, mockTurnMemory);
    
    const intentMatch = result.intent === test.expectedIntent;
    const optionMatch = !test.expectedOptionId || result.optionId === test.expectedOptionId;
    const confidenceMatch = result.confidence >= test.minConfidence;
    const autoApplyMatch = test.expectAutoApply === undefined
      ? true
      : (!!result.autoApply) === test.expectAutoApply;
    
    const success = intentMatch && optionMatch && confidenceMatch && autoApplyMatch;
    
    if (success) {
      passed++;
      console.log(`✅ ${test.description}`);
      console.log(`   Input: "${test.input}" → Intent: ${result.intent}, Confidence: ${result.confidence.toFixed(2)}`);
      if (result.optionId) {
        console.log(`   Selected: ${result.optionId}`);
      }
      if (result.autoApply) {
        console.log(`   Auto-apply enabled`);
      }
    } else {
      failed++;
      const reason = !intentMatch 
        ? `Expected intent ${test.expectedIntent}, got ${result.intent}`
        : !optionMatch
        ? `Expected option ${test.expectedOptionId}, got ${result.optionId}`
        : !autoApplyMatch
        ? `Expected autoApply=${test.expectAutoApply}, got ${!!result.autoApply}`
        : `Expected confidence >= ${test.minConfidence}, got ${result.confidence}`;
      
      console.log(`❌ ${test.description}`);
      console.log(`   Input: "${test.input}"`);
      console.log(`   ${reason}`);
      console.log(`   Reasoning: ${result.reasoning}`);
      
      failures.push(`${test.description}: ${reason}`);
    }
    console.log();
  }
  
  console.log('='.repeat(80));
  console.log(`\n📊 Results: ${passed}/${testCases.length} passed, ${failed} failed\n`);
  
  if (failures.length > 0) {
    console.log('❌ Failed tests:');
    failures.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
    process.exit(1);
  } else {
    console.log('✅ All tests passed!');
    process.exit(0);
  }
}

// ============================================================================
// Entry Point
// ============================================================================

runTests();
