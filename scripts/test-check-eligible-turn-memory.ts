/**
 * Test: handleCheckEligibleCandidates turn-memory integration
 *
 * Ensures that the eligibility check persists context using the shared
 * `chat` thread so short confirmations like "yes" can be auto-handled.
 */

import { handleCheckEligibleCandidates, type HandlerDependencies } from '../src/server/preview/llm-handlers';
import { loadTurnMemory, clearTurnMemory } from '../src/server/preview/turn-memory';

type AvailabilityRecord = {
  day: 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN';
  isOff: boolean;
  startTime?: Date;
  endTime?: Date;
};

const userId = 'test-user';
const storeId = 'store-1';
const weekId = '2024-W42';
const threadId = 'chat';

async function run() {
  // Ensure clean slate before starting
  await clearTurnMemory(userId, storeId, weekId, threadId);

  const employees = [
    {
      id: 'emp-bob',
      name: 'Bob Smith',
      weeklyMinutesTarget: 2400, // 40h
      roles: [
        {
          workType: { name: 'Security' },
        },
      ],
      availability: [
        availability('MON', false, 8, 0, 20, 0),
      ],
    },
    {
      id: 'emp-alice',
      name: 'Alice Doe',
      weeklyMinutesTarget: 2400,
      roles: [
        {
          workType: { name: 'Cashier' },
        },
      ],
      availability: [
        availability('MON', false, 8, 0, 18, 0),
      ],
    },
  ];

  const assignments = [
    // Bob already has 26h scheduled
    assignment({
      id: 'assign-bob-mon-morning',
      employeeId: 'emp-bob',
      day: 'MON',
      startHour: 8,
      startMinute: 0,
      endHour: 12,
      endMinute: 0,
      workTypeName: 'Security',
      sourceTemplateId: 'template-security-morning',
    }),
    assignment({
      id: 'assign-bob-tue-day',
      employeeId: 'emp-bob',
      day: 'TUE',
      startHour: 9,
      startMinute: 0,
      endHour: 17,
      endMinute: 0,
      workTypeName: 'Security',
      sourceTemplateId: 'template-security-day',
    }),
    assignment({
      id: 'assign-bob-wed-day',
      employeeId: 'emp-bob',
      day: 'WED',
      startHour: 9,
      startMinute: 0,
      endHour: 17,
      endMinute: 0,
      workTypeName: 'Security',
      sourceTemplateId: 'template-security-day',
    }),
    assignment({
      id: 'assign-bob-thu-day',
      employeeId: 'emp-bob',
      day: 'THU',
      startHour: 9,
      startMinute: 0,
      endHour: 15,
      endMinute: 0,
      workTypeName: 'Security',
      sourceTemplateId: 'template-security-day',
    }),
    // Open Security shift on Monday 14:00-19:00
    assignment({
      id: 'assign-open-security-mon',
      employeeId: null,
      day: 'MON',
      startHour: 14,
      startMinute: 0,
      endHour: 19,
      endMinute: 0,
      workTypeName: 'Security',
      sourceTemplateId: 'template-security',
    }),
  ];

  let shiftTemplateFetchCount = 0;

  const prismaMock = {
    employee: {
      findMany: async () => employees,
    },
    schedule: {
      findUnique: async () => ({ id: 'schedule-1' }),
    },
    assignment: {
      findMany: async () => assignments,
    },
    shiftTemplate: {
      findMany: async () => {
        shiftTemplateFetchCount += 1;
        return [
          {
            id: 'template-security',
            days: ['MON'],
            startTime: utcTime(14, 0),
            endTime: utcTime(19, 0),
            workType: { name: 'Security' },
          },
        ];
      },
    },
  };

  const deps: HandlerDependencies = {
    prisma: prismaMock as any,
    userId,
  };

  const result = await handleCheckEligibleCandidates(
    { day: 'MON', workTypeName: 'Security', startTime: '14:00', endTime: '19:00' },
    { storeId, weekId },
    deps,
  );

  if (!result.ok) {
    console.error('❌ Expected handler to succeed, got error:', result.error);
    process.exit(1);
  }

  const memory = await loadTurnMemory(userId, storeId, weekId, threadId);

  if (!memory) {
    console.error('❌ Expected turn memory to be saved for thread "chat"');
    process.exit(1);
  }

  const [option] = memory.options;
  if (!option) {
    console.error('❌ Expected exactly one shift option in turn memory');
    process.exit(1);
  }

  if (option.shiftId !== 'template-security-MON') {
    console.error('❌ Expected shiftId "template-security-MON", got:', option.shiftId);
    process.exit(1);
  }

  if (memory.entities.employeeName !== 'Bob Smith') {
    console.error('❌ Expected primary candidate to be Bob Smith, got:', memory.entities.employeeName);
    process.exit(1);
  }

  if (shiftTemplateFetchCount > 1) {
    console.error('❌ Expected shift templates to be fetched at most once, got:', shiftTemplateFetchCount);
    process.exit(1);
  }

  console.log('✅ handleCheckEligibleCandidates stored turn memory with resolved shift template');

  // Clean up to avoid leaking state into other tests
  await clearTurnMemory(userId, storeId, weekId, threadId);
  process.exit(0);
}

function availability(
  day: AvailabilityRecord['day'],
  isOff: boolean,
  startHour: number,
  startMinute: number,
  endHour: number,
  endMinute: number,
): AvailabilityRecord {
  return {
    day,
    isOff,
    startTime: utcTime(startHour, startMinute),
    endTime: utcTime(endHour, endMinute),
  };
}

function assignment({
  id,
  employeeId,
  day,
  startHour,
  startMinute,
  endHour,
  endMinute,
  workTypeName,
  sourceTemplateId,
}: {
  id: string;
  employeeId: string | null;
  day: AvailabilityRecord['day'];
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  workTypeName: string;
  sourceTemplateId: string;
}) {
  return {
    id,
    scheduleId: 'schedule-1',
    day,
    startTime: utcTime(startHour, startMinute),
    endTime: utcTime(endHour, endMinute),
    employeeId,
    sourceTemplateId,
    workType: { name: workTypeName },
  };
}

function utcTime(hour: number, minute: number): Date {
  return new Date(Date.UTC(1970, 0, 1, hour, minute, 0));
}

run().catch((error) => {
  console.error('❌ Test failed with unexpected error:', error);
  process.exit(1);
});
