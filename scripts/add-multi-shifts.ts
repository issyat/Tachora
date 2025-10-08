/**
 * Add Multiple Identical Shifts for Testing Multi-Shift Approach
 * This script adds multiple cashier shifts with the same time to test visual stacking
 */

import { PrismaClient } from '../src/generated/prisma';
import { timeStringToDate } from '../src/lib/time';
import type { DaysConfig } from '../src/types';

const prisma = new PrismaClient();

const WEEKDAY_ORDER = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const;

function createDaysConfig(days: string[]): DaysConfig {
  return WEEKDAY_ORDER.reduce((config, day) => {
    config[day] = days.includes(day);
    return config;
  }, {} as DaysConfig);
}

async function main() {
  console.log('🔄 Adding multiple identical shifts for testing...');
  
  // Get the first store
  const store = await prisma.store.findFirst({
    include: {
      workTypes: true,
    },
  });
  
  if (!store) {
    throw new Error('No store found');
  }
  
  // Find cashier work type
  const cashierWorkType = store.workTypes.find(wt => wt.name === 'Cashier');
  if (!cashierWorkType) {
    throw new Error('Cashier work type not found');
  }
  
  console.log(`Store: ${store.name}`);
  console.log(`Cashier Work Type: ${cashierWorkType.name}`);
  
  // Create 3 identical cashier shifts (8:00-16:00, Monday-Friday)
  const multiShifts = [
    {
      role: 'Cashier #1',
      workTypeId: cashierWorkType.id,
      days: createDaysConfig(['MON', 'TUE', 'WED', 'THU', 'FRI']),
      startTime: '08:00',
      endTime: '16:00',
    },
    {
      role: 'Cashier #2', 
      workTypeId: cashierWorkType.id,
      days: createDaysConfig(['MON', 'TUE', 'WED', 'THU', 'FRI']),
      startTime: '08:00',
      endTime: '16:00',
    },
    {
      role: 'Cashier #3',
      workTypeId: cashierWorkType.id,
      days: createDaysConfig(['MON', 'TUE', 'WED', 'THU', 'FRI']),
      startTime: '08:00',
      endTime: '16:00',
    },
  ];
  
  // Create the shifts
  for (const shift of multiShifts) {
    const created = await prisma.shiftTemplate.create({
      data: {
        storeId: store.id,
        role: shift.role,
        workTypeId: shift.workTypeId,
        days: shift.days,
        startTime: timeStringToDate(shift.startTime),
        endTime: timeStringToDate(shift.endTime),
      },
    });
    
    console.log(`✅ Created shift: ${created.role} (${shift.startTime}-${shift.endTime})`);
  }
  
  console.log('\n🎉 Multi-shift test data added successfully!');
  console.log('\nNow you should see 3 cashier blocks stacked at 8:00-16:00 on weekdays!');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error('❌ Failed to add multi-shifts:', error);
    await prisma.$disconnect();
    process.exit(1);
  });