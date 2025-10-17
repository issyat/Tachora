/**
 * Automated AI Assistant Test Runner
 * 
 * Tests core functionality programmatically by calling the chat API
 * and validating responses against expected criteria.
 */

const CHAT_API_URL = 'http://localhost:3000/api/chat';

interface TestCase {
  id: string;
  requirement: string;
  prompt: string;
  expectedKeywords?: string[];
  expectedNoKeywords?: string[];
  maxResponseTime?: number;
  shouldCreatePreview?: boolean;
  shouldFail?: boolean;
  validator?: (response: any) => boolean;
}

const TEST_CASES: TestCase[] = [
  // ==================== REQUIREMENT 1: Natural Language ====================
  {
    id: '1.1',
    requirement: 'REQ1: Typos',
    prompt: 'asign bob to cashier shift on munday',
    expectedKeywords: ['bob', 'cashier', 'monday'],
  },
  {
    id: '1.2',
    requirement: 'REQ1: Multilingual French',
    prompt: 'qui travaille lundi?',
    expectedKeywords: ['monday', 'schedule', 'assigned'],
  },
  {
    id: '1.3',
    requirement: 'REQ1: Casual phrasing',
    prompt: 'show me all teh unasigned shfts',
    expectedKeywords: ['open', 'shift', 'unassigned'],
  },

  // ==================== REQUIREMENT 2: Truth from Snapshot ====================
  {
    id: '2.1',
    requirement: 'REQ2: Current state query',
    prompt: 'who is working on Monday?',
    expectedKeywords: ['monday', 'assigned'],
    validator: (resp) => resp.includes(':') || resp.includes('•'),
  },
  {
    id: '2.2',
    requirement: 'REQ2: Employee hours',
    prompt: 'how many hours is Bob working this week?',
    expectedKeywords: ['bob', 'hour'],
  },
  {
    id: '2.3',
    requirement: 'REQ2: Open shifts count',
    prompt: 'how many open shifts are there?',
    expectedKeywords: ['open', 'shift'],
  },

  // ==================== REQUIREMENT 3: Context Retention ====================
  // Note: Multi-turn tests need to be run in sequence
  {
    id: '3.1-part1',
    requirement: 'REQ3: Context setup',
    prompt: 'show me open security shifts',
    expectedKeywords: ['security', 'shift', 'open'],
  },

  // ==================== REQUIREMENT 4: Real Options Only ====================
  {
    id: '4.1',
    requirement: 'REQ4: No open shifts explanation',
    prompt: 'assign me to manager shift on Monday',
    expectedKeywords: ['manager', 'monday'],
    // Should explain if no open shifts or create preview if available
  },
  {
    id: '4.2',
    requirement: 'REQ4: Show available shifts',
    prompt: 'show me all open shifts',
    expectedKeywords: ['open', 'shift'],
  },

  // ==================== REQUIREMENT 5: Preview Flow ====================
  {
    id: '5.1',
    requirement: 'REQ5: Create preview',
    prompt: 'assign Bob to security Monday at 2pm',
    shouldCreatePreview: true,
    expectedKeywords: ['preview', 'bob', 'security', 'monday'],
  },

  // ==================== REQUIREMENT 7: Tiny Clear Answers ====================
  {
    id: '7.1',
    requirement: 'REQ7: Concise query response',
    prompt: 'who works Monday?',
    validator: (resp) => {
      const lines = resp.split('\n').filter((l: string) => l.trim().length > 0);
      return lines.length <= 10; // Allow some flexibility
    },
  },

  // ==================== REQUIREMENT 8: Human-Readable Errors ====================
  {
    id: '8.1',
    requirement: 'REQ8: Employee not found',
    prompt: 'assign ZZZ_NONEXISTENT_PERSON to cashier',
    expectedKeywords: ['find', 'employee', 'couldn\'t', 'not found'],
    expectedNoKeywords: ['error', 'exception', 'stack', 'undefined'],
  },
  {
    id: '8.2',
    requirement: 'REQ8: Invalid work type',
    prompt: 'assign Bob to ZZZZZ_FAKE_ROLE shift',
    expectedNoKeywords: ['error', 'exception', 'stack trace'],
  },
];

interface TestResult {
  id: string;
  requirement: string;
  prompt: string;
  passed: boolean;
  response?: string;
  responseTime?: number;
  failureReason?: string;
}

async function runTest(testCase: TestCase, sessionId: string): Promise<TestResult> {
  const startTime = Date.now();
  
  try {
    const response = await fetch(CHAT_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: testCase.prompt,
        storeId: 'cmgo4mnx100027kdwdsqz7xyl', // Downtown Store
        weekId: '2025-W42',
        sessionId,
        userId: 'test-user',
      }),
    });

    const responseTime = Date.now() - startTime;
    const data = await response.json();
    const responseText = typeof data === 'string' ? data : data.response || JSON.stringify(data);
    const responseLower = responseText.toLowerCase();

    // Validate response
    let passed = true;
    let failureReason = '';

    // Check max response time
    if (testCase.maxResponseTime && responseTime > testCase.maxResponseTime) {
      passed = false;
      failureReason = `Response time ${responseTime}ms > ${testCase.maxResponseTime}ms`;
    }

    // Check expected keywords
    if (testCase.expectedKeywords) {
      for (const keyword of testCase.expectedKeywords) {
        if (!responseLower.includes(keyword.toLowerCase())) {
          passed = false;
          failureReason = `Missing expected keyword: "${keyword}"`;
          break;
        }
      }
    }

    // Check unexpected keywords
    if (testCase.expectedNoKeywords) {
      for (const keyword of testCase.expectedNoKeywords) {
        if (responseLower.includes(keyword.toLowerCase())) {
          passed = false;
          failureReason = `Found unexpected keyword: "${keyword}"`;
          break;
        }
      }
    }

    // Check preview creation
    if (testCase.shouldCreatePreview !== undefined) {
      const hasPreview = responseLower.includes('preview');
      if (testCase.shouldCreatePreview !== hasPreview) {
        passed = false;
        failureReason = testCase.shouldCreatePreview 
          ? 'Expected preview but none created'
          : 'Unexpected preview created';
      }
    }

    // Custom validator
    if (testCase.validator && passed) {
      if (!testCase.validator(responseText)) {
        passed = false;
        failureReason = 'Custom validator failed';
      }
    }

    return {
      id: testCase.id,
      requirement: testCase.requirement,
      prompt: testCase.prompt,
      passed,
      response: responseText.substring(0, 200), // Truncate for display
      responseTime,
      failureReason,
    };
  } catch (error) {
    return {
      id: testCase.id,
      requirement: testCase.requirement,
      prompt: testCase.prompt,
      passed: false,
      responseTime: Date.now() - startTime,
      failureReason: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

async function runAllTests() {
  console.log('🤖 AI Assistant Test Runner\n');
  console.log(`Running ${TEST_CASES.length} automated tests...\n`);
  console.log('=' .repeat(80));

  const sessionId = `test-${Date.now()}`;
  const results: TestResult[] = [];

  for (const testCase of TEST_CASES) {
    process.stdout.write(`\nTest ${testCase.id}: ${testCase.requirement}... `);
    
    const result = await runTest(testCase, sessionId);
    results.push(result);

    if (result.passed) {
      console.log(`✅ PASS (${result.responseTime}ms)`);
    } else {
      console.log(`❌ FAIL (${result.responseTime}ms)`);
      console.log(`   Reason: ${result.failureReason}`);
    }

    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('\n📊 TEST SUMMARY\n');

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const passRate = (passed / results.length * 100).toFixed(1);

  console.log(`Total Tests: ${results.length}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📈 Pass Rate: ${passRate}%`);

  // Requirement breakdown
  console.log('\n📋 BY REQUIREMENT:\n');
  const byRequirement = new Map<string, { passed: number; total: number }>();
  
  results.forEach(r => {
    const req = r.requirement.split(':')[0];
    if (!byRequirement.has(req)) {
      byRequirement.set(req, { passed: 0, total: 0 });
    }
    const stats = byRequirement.get(req)!;
    stats.total++;
    if (r.passed) stats.passed++;
  });

  byRequirement.forEach((stats, req) => {
    const rate = (stats.passed / stats.total * 100).toFixed(0);
    const status = stats.passed === stats.total ? '✅' : '⚠️';
    console.log(`${status} ${req}: ${stats.passed}/${stats.total} (${rate}%)`);
  });

  // Failed tests detail
  const failedTests = results.filter(r => !r.passed);
  if (failedTests.length > 0) {
    console.log('\n❌ FAILED TESTS:\n');
    failedTests.forEach(test => {
      console.log(`Test ${test.id}: ${test.requirement}`);
      console.log(`  Prompt: "${test.prompt}"`);
      console.log(`  Reason: ${test.failureReason}`);
      if (test.response) {
        console.log(`  Response: ${test.response.substring(0, 100)}...`);
      }
      console.log('');
    });
  }

  // Exit code
  process.exit(failed > 0 ? 1 : 0);
}

// Run if called directly
if (require.main === module) {
  runAllTests().catch(console.error);
}

export { runAllTests, TEST_CASES, type TestCase, type TestResult };
