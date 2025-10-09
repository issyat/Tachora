import { PrismaClient } from '@/generated/prisma';

const prisma = new PrismaClient();

// Your actual Clerk ID
const CLERK_ID = 'user_3329TDaGk7PRFLRGGcebxRgCqey';

async function main() {
  console.log('🧹 Starting clean seed with work types only...');

  // Create manager user
  const manager = await prisma.user.upsert({
    where: { clerkId: CLERK_ID },
    update: {},
    create: {
      clerkId: CLERK_ID,
      email: 'manager@belgianretail.be',
      role: 'BIG_MANAGER',
      onboardingStep: 'DONE',
    },
  });

  console.log('👤 Manager created:', manager.email);

  // Create Downtown Brussels store
  const downtownStore = await prisma.store.upsert({
    where: {
      managerId_name: {
        managerId: manager.id,
        name: 'Downtown Brussels',
      },
    },
    update: {},
    create: {
      name: 'Downtown Brussels',
      country: 'BE',
      city: 'Brussels',
      address: 'Rue Neuve 123, 1000 Brussels',
      managerId: manager.id,
      openingTime: new Date('1970-01-01T08:00:00Z'),
      closingTime: new Date('1970-01-01T22:00:00Z'),
    },
  });

  console.log('🏪 Store created:', downtownStore.name);

  // Create work types
  const cashierType = await prisma.workType.upsert({
    where: {
      storeId_name: {
        storeId: downtownStore.id,
        name: 'Cashier',
      },
    },
    update: {},
    create: {
      storeId: downtownStore.id,
      name: 'Cashier',
      color: '#3b82f6', // Blue
    },
  });

  const managerType = await prisma.workType.upsert({
    where: {
      storeId_name: {
        storeId: downtownStore.id,
        name: 'Manager',
      },
    },
    update: {},
    create: {
      storeId: downtownStore.id,
      name: 'Manager',
      color: '#dc2626', // Red
    },
  });

  const stockType = await prisma.workType.upsert({
    where: {
      storeId_name: {
        storeId: downtownStore.id,
        name: 'Stock Clerk',
      },
    },
    update: {},
    create: {
      storeId: downtownStore.id,
      name: 'Stock Clerk',
      color: '#16a34a', // Green
    },
  });

  console.log('💼 Work types created');

  // Create employees
  const alice = await prisma.employee.upsert({
    where: {
      storeId_email: {
        storeId: downtownStore.id,
        email: 'alice@belgianretail.be',
      },
    },
    update: {},
    create: {
      storeId: downtownStore.id,
      name: 'Alice Johnson',
      email: 'alice@belgianretail.be',
      phone: '+32 2 123 4567',
      color: '#f59e0b', // Amber
      canWorkAcrossStores: true,
      contractType: 'FULL_TIME',
      weeklyMinutesTarget: 2400, // 40 hours
    },
  });

  const bob = await prisma.employee.upsert({
    where: {
      storeId_email: {
        storeId: downtownStore.id,
        email: 'bob@belgianretail.be',
      },
    },
    update: {},
    create: {
      storeId: downtownStore.id,
      name: 'Bob Smith',
      email: 'bob@belgianretail.be',
      phone: '+32 2 234 5678',
      color: '#8b5cf6', // Purple
      canWorkAcrossStores: false,
      contractType: 'PART_TIME',
      weeklyMinutesTarget: 1200, // 20 hours
    },
  });

  console.log('👥 Employees created');

  // Assign work types to employees
  await prisma.employeeWorkType.upsert({
    where: {
      employeeId_workTypeId: {
        employeeId: alice.id,
        workTypeId: cashierType.id,
      },
    },
    update: {},
    create: {
      employeeId: alice.id,
      workTypeId: cashierType.id,
    },
  });

  await prisma.employeeWorkType.upsert({
    where: {
      employeeId_workTypeId: {
        employeeId: alice.id,
        workTypeId: managerType.id,
      },
    },
    update: {},
    create: {
      employeeId: alice.id,
      workTypeId: managerType.id,
    },
  });

  await prisma.employeeWorkType.upsert({
    where: {
      employeeId_workTypeId: {
        employeeId: bob.id,
        workTypeId: stockType.id,
      },
    },
    update: {},
    create: {
      employeeId: bob.id,
      workTypeId: stockType.id,
    },
  });

  console.log('🔗 Work type assignments created');

  // Create availability for Alice (MON 8-18)
  await prisma.availability.upsert({
    where: {
      employeeId_day: {
        employeeId: alice.id,
        day: 'MON',
      },
    },
    update: {},
    create: {
      employeeId: alice.id,
      day: 'MON',
      isOff: false,
      startTime: new Date('1970-01-01T08:00:00Z'),
      endTime: new Date('1970-01-01T18:00:00Z'),
    },
  });

  // Create availability for other days
  const days = ['TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const;
  for (const day of days) {
    await prisma.availability.upsert({
      where: {
        employeeId_day: {
          employeeId: alice.id,
          day,
        },
      },
      update: {},
      create: {
        employeeId: alice.id,
        day,
        isOff: false,
        startTime: new Date('1970-01-01T09:00:00Z'),
        endTime: new Date('1970-01-01T17:00:00Z'),
      },
    });
  }

  console.log('📅 Availability created');

  // Create shift templates (NO ROLE FIELD)
  await prisma.shiftTemplate.createMany({
    data: [
      {
        storeId: downtownStore.id,
        workTypeId: cashierType.id,
        days: { MON: true, TUE: true, WED: true, THU: true, FRI: true, SAT: true, SUN: false },
        startTime: new Date('1970-01-01T08:00:00Z'),
        endTime: new Date('1970-01-01T16:00:00Z'),
      },
      {
        storeId: downtownStore.id,
        workTypeId: managerType.id,
        days: { MON: true, TUE: true, WED: true, THU: true, FRI: true, SAT: false, SUN: false },
        startTime: new Date('1970-01-01T09:00:00Z'),
        endTime: new Date('1970-01-01T17:00:00Z'),
      },
      {
        storeId: downtownStore.id,
        workTypeId: stockType.id,
        days: { MON: true, TUE: true, WED: true, THU: true, FRI: true, SAT: true, SUN: false },
        startTime: new Date('1970-01-01T10:00:00Z'),
        endTime: new Date('1970-01-01T18:00:00Z'),
      },
    ],
  });

  console.log('⏰ Shift templates created');

  console.log('✅ Clean seed completed successfully!');
  console.log('');
  console.log('📊 Summary:');
  console.log('- 1 Manager user');
  console.log('- 1 Store (Downtown Brussels)');
  console.log('- 3 Work types (Cashier, Manager, Stock Clerk)');
  console.log('- 2 Employees (Alice: Cashier+Manager, Bob: Stock Clerk)');
  console.log('- 3 Shift templates (using work types only)');
  console.log('');
  console.log('🎯 Alice can now be assigned to Cashier or Manager shifts!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });