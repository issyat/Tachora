import { PrismaClient } from '@/generated/prisma';

const prisma = new PrismaClient();

async function testAssignment() {
  console.log('🧪 Testing assignment with new schema...');

  // Get Alice and a Cashier work type
  const alice = await prisma.employee.findFirst({
    where: { name: 'Alice Johnson' },
    include: {
      roles: {
        include: {
          workType: true,
        },
      },
    },
  });

  if (!alice) {
    console.error('❌ Alice not found');
    return;
  }

  console.log('👤 Alice found:', alice.name);
  console.log('💼 Alice work types:', alice.roles.map(r => r.workType.name));

  // Get a cashier work type
  const cashierWorkType = alice.roles.find(r => r.workType.name === 'Cashier')?.workType;
  
  if (!cashierWorkType) {
    console.error('❌ Alice does not have Cashier work type');
    return;
  }

  console.log('✅ Found Cashier work type:', cashierWorkType.name);

  // Create a test schedule
  const store = await prisma.store.findFirst();
  if (!store) {
    console.error('❌ No store found');
    return;
  }

  const schedule = await prisma.schedule.upsert({
    where: {
      storeId_isoWeek: {
        storeId: store.id,
        isoWeek: '2024-W01',
      },
    },
    update: {},
    create: {
      storeId: store.id,
      isoWeek: '2024-W01',
      state: 'Draft',
    },
  });

  console.log('📅 Schedule created/found:', schedule.id);

  // Create an assignment using workTypeId instead of role
  const assignment = await prisma.assignment.create({
    data: {
      scheduleId: schedule.id,
      day: 'MON',
      startTime: new Date('1970-01-01T08:00:00Z'),
      endTime: new Date('1970-01-01T16:00:00Z'),
      workTypeId: cashierWorkType.id,
      employeeId: alice.id,
    },
    include: {
      workType: true,
      employee: true,
    },
  });

  console.log('✅ Assignment created successfully!');
  console.log('📋 Assignment details:');
  console.log('  - Employee:', assignment.employee?.name);
  console.log('  - Work Type:', assignment.workType.name);
  console.log('  - Day:', assignment.day);
  console.log('  - Time:', `${assignment.startTime.toISOString().slice(11, 16)} - ${assignment.endTime.toISOString().slice(11, 16)}`);

  console.log('🎉 Test completed successfully! Alice can now be assigned to Cashier shifts.');
}

testAssignment()
  .catch((e) => {
    console.error('❌ Test failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });