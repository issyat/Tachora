#!/usr/bin/env tsx

/**
 * Seed script for a medium retail shop scenario
 * Creates a realistic retail environment with multiple employees, work types, and shifts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const CLERK_ID = 'user_3329TDaGk7PRFLRGGcebxRgCqey';
const MANAGER_EMAIL = 'manager@mediumretail.com';

async function seedMediumRetailShop() {
  console.log('🧹 Clearing existing data...');
  
  // Clear all data in correct order (respecting foreign key constraints)
  await prisma.assignment.deleteMany({});
  await prisma.shift.deleteMany({});
  await prisma.shiftTemplate.deleteMany({});
  await prisma.availability.deleteMany({});
  await prisma.employeeWorkType.deleteMany({});
  await prisma.employee.deleteMany({});
  await prisma.workType.deleteMany({});
  await prisma.store.deleteMany({});
  await prisma.manager.deleteMany({});
  
  console.log('✅ Database cleared');
  
  console.log('🏪 Creating medium retail shop scenario...');
  
  // Create manager
  const manager = await prisma.manager.create({
    data: {
      clerkId: CLERK_ID,
      email: MANAGER_EMAIL,
      onboardingStep: 'DONE',
    },
  });
  
  console.log(`✅ Created manager: ${manager.email}`);
  
  // Create main store
  const store = await prisma.store.create({
    data: {
      id: 'medium-retail-store',
      name: 'Medium Retail Store',
      address: '123 Main Street, Brussels, Belgium',
      managerId: manager.id,
      openingTime: new Date('2024-01-01T08:00:00Z'),
      closingTime: new Date('2024-01-01T20:00:00Z'),
    },
  });
  
  console.log(`✅ Created store: ${store.name}`);
  
  // Create work types for a medium retail shop
  const workTypes = await Promise.all([
    prisma.workType.create({
      data: {
        id: 'cashier-wt',
        name: 'Cashier',
        color: '#3b82f6', // Blue
        storeId: store.id,
      },
    }),
    prisma.workType.create({
      data: {
        id: 'sales-associate-wt',
        name: 'Sales Associate',
        color: '#10b981', // Green
        storeId: store.id,
      },
    }),
    prisma.workType.create({
      data: {
        id: 'stock-clerk-wt',
        name: 'Stock Clerk',
        color: '#f59e0b', // Yellow
        storeId: store.id,
      },
    }),
    prisma.workType.create({
      data: {
        id: 'shift-supervisor-wt',
        name: 'Shift Supervisor',
        color: '#8b5cf6', // Purple
        storeId: store.id,
      },
    }),
    prisma.workType.create({
      data: {
        id: 'customer-service-wt',
        name: 'Customer Service',
        color: '#ef4444', // Red
        storeId: store.id,
      },
    }),
  ]);
  
  console.log(`✅ Created ${workTypes.length} work types`);
  
  // Create employees with realistic profiles
  const employees = [
    {
      name: 'Alice Johnson',
      email: 'alice@mediumretail.com',
      phone: '+32 2 123 4567',
      contractType: 'FULL_TIME' as const,
      weeklyMinutesTarget: 2400, // 40 hours
      canWorkAcrossStores: false,
      color: '#3b82f6',
      roles: ['cashier-wt', 'shift-supervisor-wt'], // Can do both cashier and supervisor
    },
    {
      name: 'Bob Smith',
      email: 'bob@mediumretail.com',
      phone: '+32 2 234 5678',
      contractType: 'FULL_TIME' as const,
      weeklyMinutesTarget: 2400, // 40 hours
      canWorkAcrossStores: false,
      color: '#10b981',
      roles: ['sales-associate-wt', 'customer-service-wt'],
    },
    {
      name: 'Carol Davis',
      email: 'carol@mediumretail.com',
      phone: '+32 2 345 6789',
      contractType: 'PART_TIME' as const,
      weeklyMinutesTarget: 1200, // 20 hours
      canWorkAcrossStores: false,
      color: '#f59e0b',
      roles: ['stock-clerk-wt', 'sales-associate-wt'],
    },
    {
      name: 'David Wilson',
      email: 'david@mediumretail.com',
      phone: '+32 2 456 7890',
      contractType: 'PART_TIME' as const,
      weeklyMinutesTarget: 1440, // 24 hours
      canWorkAcrossStores: false,
      color: '#8b5cf6',
      roles: ['cashier-wt', 'customer-service-wt'],
    },
    {
      name: 'Emma Brown',
      email: 'emma@mediumretail.com',
      phone: '+32 2 567 8901',
      contractType: 'STUDENT' as const,
      weeklyMinutesTarget: 960, // 16 hours
      canWorkAcrossStores: false,
      color: '#ef4444',
      roles: ['sales-associate-wt'],
    },
    {
      name: 'Frank Miller',
      email: 'frank@mediumretail.com',
      phone: '+32 2 678 9012',
      contractType: 'FULL_TIME' as const,
      weeklyMinutesTarget: 2400, // 40 hours
      canWorkAcrossStores: false,
      color: '#06b6d4',
      roles: ['stock-clerk-wt', 'shift-supervisor-wt'],
    },
  ];
  
  for (const empData of employees) {
    const employee = await prisma.employee.create({
      data: {
        name: empData.name,
        email: empData.email,
        phone: empData.phone,
        contractType: empData.contractType,
        weeklyMinutesTarget: empData.weeklyMinutesTarget,
        canWorkAcrossStores: empData.canWorkAcrossStores,
        color: empData.color,
        storeId: store.id,
      },
    });
    
    // Assign roles to employee
    for (const roleId of empData.roles) {
      await prisma.employeeWorkType.create({
        data: {
          employeeId: employee.id,
          workTypeId: roleId,
        },
      });
    }
    
    // Create realistic availability (most employees available weekdays, some weekends)
    const availabilityData = [];
    
    // Weekdays availability
    for (const day of ['MON', 'TUE', 'WED', 'THU', 'FRI']) {
      if (empData.contractType === 'STUDENT') {
        // Students: evenings and weekends
        availabilityData.push({
          employeeId: employee.id,
          day: day as any,
          startTime: new Date('2024-01-01T16:00:00Z'), // 4 PM
          endTime: new Date('2024-01-01T20:00:00Z'),   // 8 PM
          isOff: false,
        });
      } else if (empData.contractType === 'PART_TIME') {
        // Part-time: flexible hours
        availabilityData.push({
          employeeId: employee.id,
          day: day as any,
          startTime: new Date('2024-01-01T09:00:00Z'), // 9 AM
          endTime: new Date('2024-01-01T17:00:00Z'),   // 5 PM
          isOff: false,
        });
      } else {
        // Full-time: full availability
        availabilityData.push({
          employeeId: employee.id,
          day: day as any,
          startTime: new Date('2024-01-01T08:00:00Z'), // 8 AM
          endTime: new Date('2024-01-01T20:00:00Z'),   // 8 PM
          isOff: false,
        });
      }
    }
    
    // Weekend availability (varies by employee)
    for (const day of ['SAT', 'SUN']) {
      if (empData.name === 'Alice Johnson' || empData.name === 'Bob Smith') {
        // Senior employees work some weekends
        availabilityData.push({
          employeeId: employee.id,
          day: day as any,
          startTime: new Date('2024-01-01T10:00:00Z'), // 10 AM
          endTime: new Date('2024-01-01T18:00:00Z'),   // 6 PM
          isOff: false,
        });
      } else if (empData.contractType === 'STUDENT') {
        // Students available weekends
        availabilityData.push({
          employeeId: employee.id,
          day: day as any,
          startTime: new Date('2024-01-01T10:00:00Z'), // 10 AM
          endTime: new Date('2024-01-01T20:00:00Z'),   // 8 PM
          isOff: false,
        });
      } else {
        // Others have weekends off
        availabilityData.push({
          employeeId: employee.id,
          day: day as any,
          startTime: new Date('2024-01-01T08:00:00Z'),
          endTime: new Date('2024-01-01T20:00:00Z'),
          isOff: true, // Off on weekends
        });
      }
    }
    
    await prisma.availability.createMany({
      data: availabilityData,
    });
    
    console.log(`✅ Created employee: ${employee.name} (${empData.contractType})`);
  }
  
  // Create realistic shift templates for a medium retail shop
  const shiftTemplates = [
    // Morning shifts
    {
      workTypeId: 'cashier-wt',
      days: { MON: true, TUE: true, WED: true, THU: true, FRI: true, SAT: true, SUN: false },
      startTime: new Date('2024-01-01T08:00:00Z'), // 8 AM
      endTime: new Date('2024-01-01T14:00:00Z'),   // 2 PM
    },
    {
      workTypeId: 'sales-associate-wt',
      days: { MON: true, TUE: true, WED: true, THU: true, FRI: true, SAT: true, SUN: true },
      startTime: new Date('2024-01-01T09:00:00Z'), // 9 AM
      endTime: new Date('2024-01-01T15:00:00Z'),   // 3 PM
    },
    {
      workTypeId: 'stock-clerk-wt',
      days: { MON: true, TUE: true, WED: true, THU: true, FRI: true, SAT: false, SUN: false },
      startTime: new Date('2024-01-01T07:00:00Z'), // 7 AM (early for stock)
      endTime: new Date('2024-01-01T13:00:00Z'),   // 1 PM
    },
    
    // Afternoon shifts
    {
      workTypeId: 'cashier-wt',
      days: { MON: true, TUE: true, WED: true, THU: true, FRI: true, SAT: true, SUN: true },
      startTime: new Date('2024-01-01T14:00:00Z'), // 2 PM
      endTime: new Date('2024-01-01T20:00:00Z'),   // 8 PM
    },
    {
      workTypeId: 'sales-associate-wt',
      days: { MON: true, TUE: true, WED: true, THU: true, FRI: true, SAT: true, SUN: true },
      startTime: new Date('2024-01-01T15:00:00Z'), // 3 PM
      endTime: new Date('2024-01-01T20:00:00Z'),   // 8 PM
    },
    {
      workTypeId: 'customer-service-wt',
      days: { MON: true, TUE: true, WED: true, THU: true, FRI: true, SAT: true, SUN: false },
      startTime: new Date('2024-01-01T10:00:00Z'), // 10 AM
      endTime: new Date('2024-01-01T18:00:00Z'),   // 6 PM
    },
    
    // Supervisor shifts (overlap for coverage)
    {
      workTypeId: 'shift-supervisor-wt',
      days: { MON: true, TUE: true, WED: true, THU: true, FRI: true, SAT: false, SUN: false },
      startTime: new Date('2024-01-01T08:00:00Z'), // 8 AM
      endTime: new Date('2024-01-01T16:00:00Z'),   // 4 PM
    },
    {
      workTypeId: 'shift-supervisor-wt',
      days: { MON: true, TUE: true, WED: true, THU: true, FRI: true, SAT: true, SUN: true },
      startTime: new Date('2024-01-01T12:00:00Z'), // 12 PM
      endTime: new Date('2024-01-01T20:00:00Z'),   // 8 PM
    },
  ];
  
  for (const template of shiftTemplates) {
    await prisma.shiftTemplate.create({
      data: {
        storeId: store.id,
        workTypeId: template.workTypeId,
        days: template.days,
        startTime: template.startTime,
        endTime: template.endTime,
      },
    });
  }
  
  console.log(`✅ Created ${shiftTemplates.length} shift templates`);
  
  console.log('\n🎉 Medium retail shop seeded successfully!');
  console.log('\n📊 Summary:');
  console.log(`👤 Manager: ${MANAGER_EMAIL} (Clerk ID: ${CLERK_ID})`);
  console.log(`🏪 Store: ${store.name}`);
  console.log(`👥 Employees: ${employees.length} (2 full-time, 2 part-time, 1 student, 1 full-time)`);
  console.log(`💼 Work Types: ${workTypes.length} (Cashier, Sales Associate, Stock Clerk, Supervisor, Customer Service)`);
  console.log(`📅 Shift Templates: ${shiftTemplates.length} (covering morning, afternoon, and supervisor shifts)`);
  console.log('\n🚀 Ready to generate schedules!');
  console.log('\nEmployee Overview:');
  employees.forEach(emp => {
    console.log(`  • ${emp.name} (${emp.contractType}): ${emp.roles.join(', ')}`);
  });
}

async function main() {
  try {
    await seedMediumRetailShop();
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();