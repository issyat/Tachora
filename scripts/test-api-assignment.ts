import { PrismaClient } from '@/generated/prisma';

const prisma = new PrismaClient();

async function testApiAssignment() {
  console.log('🧪 Testing API assignment flow...');

  // Get the data we need
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

  const store = await prisma.store.findFirst();
  
  if (!alice || !store) {
    console.error('❌ Missing test data');
    return;
  }

  const cashierWorkType = alice.roles.find(r => r.workType.name === 'Cashier')?.workType;
  
  if (!cashierWorkType) {
    console.error('❌ Alice does not have Cashier work type');
    return;
  }

  console.log('✅ Test data ready');
  console.log('👤 Employee:', alice.name);
  console.log('💼 Work Type:', cashierWorkType.name);
  console.log('🏪 Store:', store.name);

  // Simulate the API call that the frontend would make
  const assignmentData = {
    storeId: store.id,
    day: 'MON',
    workTypeId: cashierWorkType.id,  // This is the key change!
    startTime: '08:00',
    endTime: '16:00',
    employeeId: alice.id,
    weekId: '2024-W01',
  };

  console.log('📤 Assignment request:', assignmentData);

  // Test the validation logic directly
  const { validateAssignment } = await import('@/server/schedule/assignment-validator');
  
  const validation = await validateAssignment({
    managerId: store.managerId,
    store: {
      id: store.id,
      openingTime: store.openingTime,
      closingTime: store.closingTime,
    },
    isoWeek: '2024-W01',
    day: 'MON',
    workTypeId: cashierWorkType.id,
    startTime: '08:00',
    endTime: '16:00',
    employeeId: alice.id,
  });

  if (!validation.ok) {
    console.error('❌ Validation failed:', validation.errors);
    return;
  }

  console.log('✅ Validation passed!');
  console.log('🎉 Alice can now be assigned to Cashier shifts without role mismatch errors!');
  
  // Clean up test assignment if it exists
  await prisma.assignment.deleteMany({
    where: {
      employeeId: alice.id,
      day: 'MON',
      schedule: {
        isoWeek: '2024-W01',
      },
    },
  });

  console.log('🧹 Cleaned up test data');
}

testApiAssignment()
  .catch((e) => {
    console.error('❌ Test failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });