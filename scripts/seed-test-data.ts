import { PrismaClient } from '@/generated/prisma';

const prisma = new PrismaClient();

const CLERK_ID = 'user_3329TDaGk7PRFLRGGcebxRgCqey';

async function main() {
  console.log('🗑️  Clearing existing data...');
  
  // Clear all data in correct order (respecting foreign key constraints)
  await prisma.assignment.deleteMany();
  await prisma.schedule.deleteMany();
  await prisma.employeeWorkType.deleteMany();
  await prisma.availability.deleteMany();
  await prisma.shiftTemplate.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.workType.deleteMany();
  await prisma.store.deleteMany();
  await prisma.user.deleteMany();

  console.log('👤 Creating user...');
  
  // Create user
  const user = await prisma.user.create({
    data: {
      clerkId: CLERK_ID,
      email: 'manager@belgianretail.be',
      role: 'BIG_MANAGER',
      onboardingStep: 'DONE',
    },
  });

  console.log('🏪 Creating stores...');
  
  // Create stores
  const downtownStore = await prisma.store.create({
    data: {
      name: 'Downtown Brussels',
      country: 'BE',
      city: 'Brussels',
      address: 'Rue Neuve 123, 1000 Brussels',
      managerId: user.id,
      openingTime: new Date('1970-01-01T08:00:00Z'),
      closingTime: new Date('1970-01-01T22:00:00Z'),
    },
  });

  const antwerpStore = await prisma.store.create({
    data: {
      name: 'Antwerp Central',
      country: 'BE',
      city: 'Antwerp',
      address: 'Meir 45, 2000 Antwerp',
      managerId: user.id,
      openingTime: new Date('1970-01-01T09:00:00Z'),
      closingTime: new Date('1970-01-01T21:00:00Z'),
    },
  });

  console.log('🏷️  Creating work types...');
  
  // Create work types for Downtown Brussels
  const cashierType = await prisma.workType.create({
    data: {
      storeId: downtownStore.id,
      name: 'Cashier',
      color: '#3b82f6', // Blue
    },
  });

  const managerType = await prisma.workType.create({
    data: {
      storeId: downtownStore.id,
      name: 'Manager',
      color: '#10b981', // Green
    },
  });

  const stockType = await prisma.workType.create({
    data: {
      storeId: downtownStore.id,
      name: 'Stock Clerk',
      color: '#f59e0b', // Orange
    },
  });

  const securityType = await prisma.workType.create({
    data: {
      storeId: downtownStore.id,
      name: 'Security',
      color: '#ef4444', // Red
    },
  });

  const customerServiceType = await prisma.workType.create({
    data: {
      storeId: downtownStore.id,
      name: 'Customer Service',
      color: '#8b5cf6', // Purple
    },
  });

  // Create work types for Antwerp
  const antwerpCashierType = await prisma.workType.create({
    data: {
      storeId: antwerpStore.id,
      name: 'Cashier',
      color: '#3b82f6',
    },
  });

  const antwerpManagerType = await prisma.workType.create({
    data: {
      storeId: antwerpStore.id,
      name: 'Manager',
      color: '#10b981',
    },
  });

  console.log('👥 Creating employees...');
  
  // Create employees for Downtown Brussels
  const alice = await prisma.employee.create({
    data: {
      storeId: downtownStore.id,
      name: 'Alice Johnson',
      email: 'alice@belgianretail.be',
      phone: '+32 2 123 4567',
      color: '#3b82f6',
      canWorkAcrossStores: true,
      contractType: 'FULL_TIME',
      weeklyMinutesTarget: 2400, // 40 hours
    },
  });

  const bob = await prisma.employee.create({
    data: {
      storeId: downtownStore.id,
      name: 'Bob Manager',
      email: 'bob@belgianretail.be',
      phone: '+32 2 234 5678',
      color: '#10b981',
      canWorkAcrossStores: false,
      contractType: 'FULL_TIME',
      weeklyMinutesTarget: 2400, // 40 hours
    },
  });

  const carol = await prisma.employee.create({
    data: {
      storeId: downtownStore.id,
      name: 'Carol Davis',
      email: 'carol@belgianretail.be',
      phone: '+32 2 345 6789',
      color: '#f59e0b',
      canWorkAcrossStores: true,
      contractType: 'PART_TIME',
      weeklyMinutesTarget: 1800, // 30 hours
    },
  });

  const david = await prisma.employee.create({
    data: {
      storeId: downtownStore.id,
      name: 'David Wilson',
      email: 'david@belgianretail.be',
      phone: '+32 2 456 7890',
      color: '#ef4444',
      canWorkAcrossStores: false,
      contractType: 'STUDENT',
      weeklyMinutesTarget: 960, // 16 hours (under 20h limit)
    },
  });

  const emma = await prisma.employee.create({
    data: {
      storeId: downtownStore.id,
      name: 'Emma Brown',
      email: 'emma@belgianretail.be',
      phone: '+32 2 567 8901',
      color: '#8b5cf6',
      canWorkAcrossStores: false,
      contractType: 'FULL_TIME',
      weeklyMinutesTarget: 2400, // 40 hours
    },
  });

  // Create employees for Antwerp (cross-store capable)
  const frank = await prisma.employee.create({
    data: {
      storeId: antwerpStore.id,
      name: 'Frank Miller',
      email: 'frank@belgianretail.be',
      phone: '+32 3 123 4567',
      color: '#06b6d4',
      canWorkAcrossStores: true,
      contractType: 'PART_TIME',
      weeklyMinutesTarget: 1800, // 30 hours
    },
  });

  const grace = await prisma.employee.create({
    data: {
      storeId: antwerpStore.id,
      name: 'Grace Lee',
      email: 'grace@belgianretail.be',
      phone: '+32 3 234 5678',
      color: '#84cc16',
      canWorkAcrossStores: true,
      contractType: 'FULL_TIME',
      weeklyMinutesTarget: 2400, // 40 hours
    },
  });

  console.log('🔗 Assigning work types to employees...');
  
  // Assign work types to employees
  await prisma.employeeWorkType.createMany({
    data: [
      // Alice - Cashier & Manager
      { employeeId: alice.id, workTypeId: cashierType.id },
      { employeeId: alice.id, workTypeId: managerType.id },
      
      // Bob - Manager & Stock
      { employeeId: bob.id, workTypeId: managerType.id },
      { employeeId: bob.id, workTypeId: stockType.id },
      
      // Carol - Cashier & Customer Service
      { employeeId: carol.id, workTypeId: cashierType.id },
      { employeeId: carol.id, workTypeId: customerServiceType.id },
      
      // David - Stock only (student)
      { employeeId: david.id, workTypeId: stockType.id },
      
      // Emma - Customer Service & Security
      { employeeId: emma.id, workTypeId: customerServiceType.id },
      { employeeId: emma.id, workTypeId: securityType.id },
      
      // Frank - Cashier & Customer Service (cross-store)
      { employeeId: frank.id, workTypeId: antwerpCashierType.id },
      { employeeId: frank.id, workTypeId: cashierType.id }, // Can work Downtown too
      { employeeId: frank.id, workTypeId: customerServiceType.id },
      
      // Grace - Manager (cross-store)
      { employeeId: grace.id, workTypeId: antwerpManagerType.id },
      { employeeId: grace.id, workTypeId: managerType.id }, // Can work Downtown too
    ],
  });

  console.log('📅 Creating employee availability...');
  
  // Create availability for Alice (full-time, flexible)
  await prisma.availability.createMany({
    data: [
      { employeeId: alice.id, day: 'MON', isOff: false, startTime: new Date('1970-01-01T08:00:00Z'), endTime: new Date('1970-01-01T18:00:00Z') },
      { employeeId: alice.id, day: 'TUE', isOff: false, startTime: new Date('1970-01-01T08:00:00Z'), endTime: new Date('1970-01-01T18:00:00Z') },
      { employeeId: alice.id, day: 'WED', isOff: false, startTime: new Date('1970-01-01T10:00:00Z'), endTime: new Date('1970-01-01T20:00:00Z') },
      { employeeId: alice.id, day: 'THU', isOff: false, startTime: new Date('1970-01-01T08:00:00Z'), endTime: new Date('1970-01-01T18:00:00Z') },
      { employeeId: alice.id, day: 'FRI', isOff: false, startTime: new Date('1970-01-01T08:00:00Z'), endTime: new Date('1970-01-01T18:00:00Z') },
      { employeeId: alice.id, day: 'SAT', isOff: true, startTime: null, endTime: null },
      { employeeId: alice.id, day: 'SUN', isOff: true, startTime: null, endTime: null },
    ],
  });

  // Create availability for Bob (manager, morning person - within store hours)
  await prisma.availability.createMany({
    data: [
      { employeeId: bob.id, day: 'MON', isOff: false, startTime: new Date('1970-01-01T08:00:00Z'), endTime: new Date('1970-01-01T16:00:00Z') },
      { employeeId: bob.id, day: 'TUE', isOff: false, startTime: new Date('1970-01-01T08:00:00Z'), endTime: new Date('1970-01-01T16:00:00Z') },
      { employeeId: bob.id, day: 'WED', isOff: false, startTime: new Date('1970-01-01T08:00:00Z'), endTime: new Date('1970-01-01T16:00:00Z') },
      { employeeId: bob.id, day: 'THU', isOff: false, startTime: new Date('1970-01-01T08:00:00Z'), endTime: new Date('1970-01-01T16:00:00Z') },
      { employeeId: bob.id, day: 'FRI', isOff: false, startTime: new Date('1970-01-01T08:00:00Z'), endTime: new Date('1970-01-01T16:00:00Z') },
      { employeeId: bob.id, day: 'SAT', isOff: false, startTime: new Date('1970-01-01T08:00:00Z'), endTime: new Date('1970-01-01T14:00:00Z') },
      { employeeId: bob.id, day: 'SUN', isOff: true, startTime: null, endTime: null },
    ],
  });

  // Create availability for Carol (part-time, afternoons)
  await prisma.availability.createMany({
    data: [
      { employeeId: carol.id, day: 'MON', isOff: false, startTime: new Date('1970-01-01T12:00:00Z'), endTime: new Date('1970-01-01T20:00:00Z') },
      { employeeId: carol.id, day: 'TUE', isOff: true, startTime: null, endTime: null },
      { employeeId: carol.id, day: 'WED', isOff: false, startTime: new Date('1970-01-01T12:00:00Z'), endTime: new Date('1970-01-01T20:00:00Z') },
      { employeeId: carol.id, day: 'THU', isOff: true, startTime: null, endTime: null },
      { employeeId: carol.id, day: 'FRI', isOff: false, startTime: new Date('1970-01-01T12:00:00Z'), endTime: new Date('1970-01-01T20:00:00Z') },
      { employeeId: carol.id, day: 'SAT', isOff: false, startTime: new Date('1970-01-01T10:00:00Z'), endTime: new Date('1970-01-01T18:00:00Z') },
      { employeeId: carol.id, day: 'SUN', isOff: false, startTime: new Date('1970-01-01T12:00:00Z'), endTime: new Date('1970-01-01T18:00:00Z') },
    ],
  });

  // Create availability for David (student, limited hours)
  await prisma.availability.createMany({
    data: [
      { employeeId: david.id, day: 'MON', isOff: true, startTime: null, endTime: null },
      { employeeId: david.id, day: 'TUE', isOff: true, startTime: null, endTime: null },
      { employeeId: david.id, day: 'WED', isOff: false, startTime: new Date('1970-01-01T16:00:00Z'), endTime: new Date('1970-01-01T20:00:00Z') },
      { employeeId: david.id, day: 'THU', isOff: true, startTime: null, endTime: null },
      { employeeId: david.id, day: 'FRI', isOff: true, startTime: null, endTime: null },
      { employeeId: david.id, day: 'SAT', isOff: false, startTime: new Date('1970-01-01T08:00:00Z'), endTime: new Date('1970-01-01T16:00:00Z') },
      { employeeId: david.id, day: 'SUN', isOff: false, startTime: new Date('1970-01-01T10:00:00Z'), endTime: new Date('1970-01-01T18:00:00Z') },
    ],
  });

  // Create availability for Emma (full-time, evening shifts)
  await prisma.availability.createMany({
    data: [
      { employeeId: emma.id, day: 'MON', isOff: false, startTime: new Date('1970-01-01T14:00:00Z'), endTime: new Date('1970-01-01T22:00:00Z') },
      { employeeId: emma.id, day: 'TUE', isOff: false, startTime: new Date('1970-01-01T14:00:00Z'), endTime: new Date('1970-01-01T22:00:00Z') },
      { employeeId: emma.id, day: 'WED', isOff: false, startTime: new Date('1970-01-01T14:00:00Z'), endTime: new Date('1970-01-01T22:00:00Z') },
      { employeeId: emma.id, day: 'THU', isOff: false, startTime: new Date('1970-01-01T14:00:00Z'), endTime: new Date('1970-01-01T22:00:00Z') },
      { employeeId: emma.id, day: 'FRI', isOff: false, startTime: new Date('1970-01-01T14:00:00Z'), endTime: new Date('1970-01-01T22:00:00Z') },
      { employeeId: emma.id, day: 'SAT', isOff: false, startTime: new Date('1970-01-01T16:00:00Z'), endTime: new Date('1970-01-01T22:00:00Z') },
      { employeeId: emma.id, day: 'SUN', isOff: true, startTime: null, endTime: null },
    ],
  });

  // Create availability for Frank (cross-store, flexible)
  await prisma.availability.createMany({
    data: [
      { employeeId: frank.id, day: 'MON', isOff: false, startTime: new Date('1970-01-01T12:00:00Z'), endTime: new Date('1970-01-01T18:00:00Z') },
      { employeeId: frank.id, day: 'TUE', isOff: false, startTime: new Date('1970-01-01T12:00:00Z'), endTime: new Date('1970-01-01T18:00:00Z') },
      { employeeId: frank.id, day: 'WED', isOff: false, startTime: new Date('1970-01-01T12:00:00Z'), endTime: new Date('1970-01-01T18:00:00Z') },
      { employeeId: frank.id, day: 'THU', isOff: false, startTime: new Date('1970-01-01T12:00:00Z'), endTime: new Date('1970-01-01T18:00:00Z') },
      { employeeId: frank.id, day: 'FRI', isOff: false, startTime: new Date('1970-01-01T12:00:00Z'), endTime: new Date('1970-01-01T18:00:00Z') },
      { employeeId: frank.id, day: 'SAT', isOff: true, startTime: null, endTime: null },
      { employeeId: frank.id, day: 'SUN', isOff: true, startTime: null, endTime: null },
    ],
  });

  // Create availability for Grace (cross-store manager)
  await prisma.availability.createMany({
    data: [
      { employeeId: grace.id, day: 'MON', isOff: false, startTime: new Date('1970-01-01T09:00:00Z'), endTime: new Date('1970-01-01T17:00:00Z') },
      { employeeId: grace.id, day: 'TUE', isOff: false, startTime: new Date('1970-01-01T09:00:00Z'), endTime: new Date('1970-01-01T17:00:00Z') },
      { employeeId: grace.id, day: 'WED', isOff: false, startTime: new Date('1970-01-01T09:00:00Z'), endTime: new Date('1970-01-01T17:00:00Z') },
      { employeeId: grace.id, day: 'THU', isOff: false, startTime: new Date('1970-01-01T09:00:00Z'), endTime: new Date('1970-01-01T17:00:00Z') },
      { employeeId: grace.id, day: 'FRI', isOff: false, startTime: new Date('1970-01-01T09:00:00Z'), endTime: new Date('1970-01-01T17:00:00Z') },
      { employeeId: grace.id, day: 'SAT', isOff: false, startTime: new Date('1970-01-01T10:00:00Z'), endTime: new Date('1970-01-01T16:00:00Z') },
      { employeeId: grace.id, day: 'SUN', isOff: true, startTime: null, endTime: null },
    ],
  });

  console.log('⏰ Creating shift templates...');
  
  // Create shift templates for Downtown Brussels (8:00-22:00 store hours)
  await prisma.shiftTemplate.createMany({
    data: [
      // Morning Cashier Shift (within store hours)
      {
        storeId: downtownStore.id,
        role: 'Morning Cashier',
        workTypeId: cashierType.id,
        days: { MON: true, TUE: true, WED: true, THU: true, FRI: true, SAT: true, SUN: false },
        startTime: new Date('1970-01-01T08:00:00Z'), // Store opens at 8:00
        endTime: new Date('1970-01-01T16:00:00Z'),
      },
      
      // Afternoon Cashier Shift (within store hours)
      {
        storeId: downtownStore.id,
        role: 'Afternoon Cashier',
        workTypeId: cashierType.id,
        days: { MON: true, TUE: true, WED: true, THU: true, FRI: true, SAT: true, SUN: true },
        startTime: new Date('1970-01-01T14:00:00Z'),
        endTime: new Date('1970-01-01T22:00:00Z'), // Store closes at 22:00
      },
      
      // Manager Shift (within store hours)
      {
        storeId: downtownStore.id,
        role: 'Store Manager',
        workTypeId: managerType.id,
        days: { MON: true, TUE: true, WED: true, THU: true, FRI: true, SAT: true, SUN: false },
        startTime: new Date('1970-01-01T09:00:00Z'),
        endTime: new Date('1970-01-01T17:00:00Z'),
      },
      
      // Stock Clerk Morning (within store hours - no more 6:00 AM start)
      {
        storeId: downtownStore.id,
        role: 'Stock Morning',
        workTypeId: stockType.id,
        days: { MON: true, TUE: false, WED: true, THU: false, FRI: true, SAT: true, SUN: true },
        startTime: new Date('1970-01-01T08:00:00Z'), // Changed from 6:00 to 8:00
        endTime: new Date('1970-01-01T14:00:00Z'),
      },
      
      // Customer Service (within store hours)
      {
        storeId: downtownStore.id,
        role: 'Customer Service',
        workTypeId: customerServiceType.id,
        days: { MON: true, TUE: true, WED: true, THU: true, FRI: true, SAT: false, SUN: false },
        startTime: new Date('1970-01-01T10:00:00Z'),
        endTime: new Date('1970-01-01T18:00:00Z'),
      },
      
      // Evening Security (within store hours)
      {
        storeId: downtownStore.id,
        role: 'Evening Security',
        workTypeId: securityType.id,
        days: { MON: true, TUE: true, WED: true, THU: true, FRI: true, SAT: true, SUN: false },
        startTime: new Date('1970-01-01T18:00:00Z'),
        endTime: new Date('1970-01-01T22:00:00Z'), // Exactly at closing time
      },
    ],
  });

  // Create shift templates for Antwerp
  await prisma.shiftTemplate.createMany({
    data: [
      // Antwerp Morning Cashier
      {
        storeId: antwerpStore.id,
        role: 'Morning Cashier',
        workTypeId: antwerpCashierType.id,
        days: { MON: true, TUE: true, WED: true, THU: true, FRI: true, SAT: false, SUN: false },
        startTime: new Date('1970-01-01T09:00:00Z'),
        endTime: new Date('1970-01-01T17:00:00Z'),
      },
      
      // Antwerp Manager
      {
        storeId: antwerpStore.id,
        role: 'Store Manager',
        workTypeId: antwerpManagerType.id,
        days: { MON: true, TUE: true, WED: true, THU: true, FRI: true, SAT: true, SUN: false },
        startTime: new Date('1970-01-01T10:00:00Z'),
        endTime: new Date('1970-01-01T18:00:00Z'),
      },
    ],
  });

  console.log('✅ Seed data created successfully!');
  console.log('');
  console.log('📊 Summary:');
  console.log(`👤 User: ${user.email} (${CLERK_ID})`);
  console.log(`🏪 Stores: Downtown Brussels, Antwerp Central`);
  console.log(`👥 Employees: 7 total (5 Downtown, 2 Antwerp with cross-store capability)`);
  console.log(`🏷️  Work Types: 5 Downtown, 2 Antwerp`);
  console.log(`⏰ Shift Templates: 6 Downtown, 2 Antwerp`);
  console.log('');
  console.log('🎯 Test Scenarios:');
  console.log('• Alice: Full-time, can work Cashier/Manager, cross-store');
  console.log('• Bob: Full-time Manager, morning person, single store');
  console.log('• Carol: Part-time Cashier, afternoon availability');
  console.log('• David: Student (16h limit), Stock only, weekends');
  console.log('• Emma: Full-time Customer Service/Security, evenings');
  console.log('• Frank: Part-time, cross-store Cashier/Customer Service');
  console.log('• Grace: Full-time Manager, cross-store capability');
  console.log('');
  console.log('🚀 Ready to test CP-SAT solver!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });