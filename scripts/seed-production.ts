import { PrismaClient } from '@/generated/prisma';

const prisma = new PrismaClient();

// Your actual Clerk ID
const CLERK_ID = 'user_3329TDaGk7PRFLRGGcebxRgCqey';

async function main() {
  console.log('🚀 Starting production seed for Belgian retail scheduling...');

  // Create manager user
  const manager = await prisma.user.upsert({
    where: { clerkId: CLERK_ID },
    update: {},
    create: {
      clerkId: CLERK_ID,
      email: 'ismailaouladtouhami18@gmail.com',
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

  // Create Antwerp store
  const antwerpStore = await prisma.store.upsert({
    where: {
      managerId_name: {
        managerId: manager.id,
        name: 'Antwerp Central',
      },
    },
    update: {},
    create: {
      name: 'Antwerp Central',
      country: 'BE',
      city: 'Antwerp',
      address: 'Meir 45, 2000 Antwerp',
      managerId: manager.id,
      openingTime: new Date('1970-01-01T09:00:00Z'),
      closingTime: new Date('1970-01-01T21:00:00Z'),
    },
  });

  console.log('🏪 Stores created:', downtownStore.name, '&', antwerpStore.name);

  // Create work types for Downtown Brussels
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

  const customerServiceType = await prisma.workType.upsert({
    where: {
      storeId_name: {
        storeId: downtownStore.id,
        name: 'Customer Service',
      },
    },
    update: {},
    create: {
      storeId: downtownStore.id,
      name: 'Customer Service',
      color: '#f59e0b', // Amber
    },
  });

  // Create work types for Antwerp
  const antwerpCashierType = await prisma.workType.upsert({
    where: {
      storeId_name: {
        storeId: antwerpStore.id,
        name: 'Cashier',
      },
    },
    update: {},
    create: {
      storeId: antwerpStore.id,
      name: 'Cashier',
      color: '#3b82f6', // Blue
    },
  });

  const antwerpManagerType = await prisma.workType.upsert({
    where: {
      storeId_name: {
        storeId: antwerpStore.id,
        name: 'Manager',
      },
    },
    update: {},
    create: {
      storeId: antwerpStore.id,
      name: 'Manager',
      color: '#dc2626', // Red
    },
  });

  console.log('💼 Work types created for both stores');

  // Create employees for Downtown Brussels
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

  const claire = await prisma.employee.upsert({
    where: {
      storeId_email: {
        storeId: downtownStore.id,
        email: 'claire@belgianretail.be',
      },
    },
    update: {},
    create: {
      storeId: downtownStore.id,
      name: 'Claire Dubois',
      email: 'claire@belgianretail.be',
      phone: '+32 2 345 6789',
      color: '#10b981', // Emerald
      canWorkAcrossStores: true,
      contractType: 'STUDENT',
      weeklyMinutesTarget: 1200, // 20 hours (student limit)
    },
  });

  // Create employees for Antwerp
  const david = await prisma.employee.upsert({
    where: {
      storeId_email: {
        storeId: antwerpStore.id,
        email: 'david@belgianretail.be',
      },
    },
    update: {},
    create: {
      storeId: antwerpStore.id,
      name: 'David Van Der Berg',
      email: 'david@belgianretail.be',
      phone: '+32 3 456 7890',
      color: '#ef4444', // Red
      canWorkAcrossStores: true,
      contractType: 'FULL_TIME',
      weeklyMinutesTarget: 2400, // 40 hours
    },
  });

  console.log('👥 Employees created for both stores');

  // Assign work types to employees
  const workTypeAssignments = [
    // Alice: Cashier + Manager
    { employeeId: alice.id, workTypeId: cashierType.id },
    { employeeId: alice.id, workTypeId: managerType.id },
    
    // Bob: Stock Clerk + Customer Service
    { employeeId: bob.id, workTypeId: stockType.id },
    { employeeId: bob.id, workTypeId: customerServiceType.id },
    
    // Claire: Cashier only (student)
    { employeeId: claire.id, workTypeId: cashierType.id },
    
    // David: Manager + Cashier (can work across stores)
    { employeeId: david.id, workTypeId: antwerpManagerType.id },
    { employeeId: david.id, workTypeId: antwerpCashierType.id },
  ];

  for (const assignment of workTypeAssignments) {
    await prisma.employeeWorkType.upsert({
      where: {
        employeeId_workTypeId: assignment,
      },
      update: {},
      create: assignment,
    });
  }

  console.log('🔗 Work type assignments created');

  // Create availability for all employees
  const days = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const;
  
  // Alice availability (MON 8-18, other days 9-17)
  await prisma.availability.upsert({
    where: {
      employeeId_day: { employeeId: alice.id, day: 'MON' },
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

  for (const day of days.slice(1)) {
    await prisma.availability.upsert({
      where: {
        employeeId_day: { employeeId: alice.id, day },
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

  // Bob availability (weekdays only)
  for (const day of days.slice(0, 5)) {
    await prisma.availability.upsert({
      where: {
        employeeId_day: { employeeId: bob.id, day },
      },
      update: {},
      create: {
        employeeId: bob.id,
        day,
        isOff: false,
        startTime: new Date('1970-01-01T10:00:00Z'),
        endTime: new Date('1970-01-01T18:00:00Z'),
      },
    });
  }

  // Weekend off for Bob
  for (const day of ['SAT', 'SUN'] as const) {
    await prisma.availability.upsert({
      where: {
        employeeId_day: { employeeId: bob.id, day },
      },
      update: {},
      create: {
        employeeId: bob.id,
        day,
        isOff: true,
      },
    });
  }

  // Claire availability (student - limited hours)
  for (const day of days) {
    await prisma.availability.upsert({
      where: {
        employeeId_day: { employeeId: claire.id, day },
      },
      update: {},
      create: {
        employeeId: claire.id,
        day,
        isOff: false,
        startTime: new Date('1970-01-01T14:00:00Z'),
        endTime: new Date('1970-01-01T20:00:00Z'),
      },
    });
  }

  // David availability (full-time)
  for (const day of days) {
    await prisma.availability.upsert({
      where: {
        employeeId_day: { employeeId: david.id, day },
      },
      update: {},
      create: {
        employeeId: david.id,
        day,
        isOff: false,
        startTime: new Date('1970-01-01T08:00:00Z'),
        endTime: new Date('1970-01-01T18:00:00Z'),
      },
    });
  }

  console.log('📅 Availability created for all employees');

  // Create shift templates for Downtown Brussels
  await prisma.shiftTemplate.createMany({
    data: [
      // Morning Cashier
      {
        storeId: downtownStore.id,
        workTypeId: cashierType.id,
        days: { MON: true, TUE: true, WED: true, THU: true, FRI: true, SAT: true, SUN: false },
        startTime: new Date('1970-01-01T08:00:00Z'),
        endTime: new Date('1970-01-01T16:00:00Z'),
      },
      // Afternoon Cashier
      {
        storeId: downtownStore.id,
        workTypeId: cashierType.id,
        days: { MON: true, TUE: true, WED: true, THU: true, FRI: true, SAT: true, SUN: true },
        startTime: new Date('1970-01-01T14:00:00Z'),
        endTime: new Date('1970-01-01T22:00:00Z'),
      },
      // Manager Shift
      {
        storeId: downtownStore.id,
        workTypeId: managerType.id,
        days: { MON: true, TUE: true, WED: true, THU: true, FRI: true, SAT: false, SUN: false },
        startTime: new Date('1970-01-01T09:00:00Z'),
        endTime: new Date('1970-01-01T17:00:00Z'),
      },
      // Stock Clerk
      {
        storeId: downtownStore.id,
        workTypeId: stockType.id,
        days: { MON: true, TUE: true, WED: true, THU: true, FRI: true, SAT: true, SUN: false },
        startTime: new Date('1970-01-01T08:00:00Z'),
        endTime: new Date('1970-01-01T16:00:00Z'),
      },
      // Customer Service
      {
        storeId: downtownStore.id,
        workTypeId: customerServiceType.id,
        days: { MON: true, TUE: true, WED: true, THU: true, FRI: true, SAT: false, SUN: false },
        startTime: new Date('1970-01-01T10:00:00Z'),
        endTime: new Date('1970-01-01T18:00:00Z'),
      },
    ],
  });

  // Create shift templates for Antwerp
  await prisma.shiftTemplate.createMany({
    data: [
      // Antwerp Morning Cashier
      {
        storeId: antwerpStore.id,
        workTypeId: antwerpCashierType.id,
        days: { MON: true, TUE: true, WED: true, THU: true, FRI: true, SAT: false, SUN: false },
        startTime: new Date('1970-01-01T09:00:00Z'),
        endTime: new Date('1970-01-01T17:00:00Z'),
      },
      // Antwerp Manager
      {
        storeId: antwerpStore.id,
        workTypeId: antwerpManagerType.id,
        days: { MON: true, TUE: true, WED: true, THU: true, FRI: true, SAT: true, SUN: false },
        startTime: new Date('1970-01-01T10:00:00Z'),
        endTime: new Date('1970-01-01T18:00:00Z'),
      },
    ],
  });

  console.log('⏰ Shift templates created for both stores');

  console.log('✅ Production seed completed successfully!');
  console.log('');
  console.log('📊 Summary:');
  console.log('- 1 Manager user (your account)');
  console.log('- 2 Stores (Downtown Brussels & Antwerp Central)');
  console.log('- 6 Work types total');
  console.log('- 4 Employees with realistic Belgian names');
  console.log('- 7 Shift templates across both stores');
  console.log('- Complete availability schedules');
  console.log('');
  console.log('🎯 Ready for testing:');
  console.log('- Alice: Can work Cashier OR Manager shifts');
  console.log('- Bob: Can work Stock Clerk OR Customer Service shifts');
  console.log('- Claire: Student - Can only work Cashier shifts (20h limit)');
  console.log('- David: Can work Manager OR Cashier shifts (cross-store)');
  console.log('');
  console.log('🚀 Your scheduling system is ready!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });