/**
 * Comprehensive Database Seed Script
 * 
 * This script creates a complete, reproducible dataset for development and testing.
 * It includes multiple stores, employees, work types, shift templates, and schedules.
 */

import { PrismaClient } from '../src/generated/prisma';
import { timeStringToDate } from '../src/lib/time';
import type {
  Weekday,
  ContractType,
  UserRole,
  OnboardingStep,
  ScheduleState,
} from '../src/generated/prisma';

import type {
  DaysConfig,
} from '../src/types';

const prisma = new PrismaClient();

// Seed configuration
const SEED_CONFIG = {
  // Manager configuration - using your actual Clerk user
  manager: {
    clerkId: 'user_3329TDaGk7PRFLRGGcebxRgCqey', // Your actual Clerk ID from database
    fallbackEmail: 'seed-manager@tachora.dev', // Fallback email if user doesn't exist
    role: 'BIG_MANAGER' as UserRole,
    onboardingStep: 'DONE' as OnboardingStep,
  },
  
  // Store configurations
  stores: [
    {
      name: 'Downtown Brussels',
      city: 'Brussels',
      country: 'BE',
      address: 'Rue de la Loi 123, 1000 Brussels',
      openingTime: '08:00',
      closingTime: '22:00',
    },
    {
      name: 'Antwerp Central',
      city: 'Brussels', // Same city as per business rule
      country: 'BE', 
      address: 'Meir 45, 2000 Antwerp',
      openingTime: '09:00',
      closingTime: '21:00',
    },
  ],
  
  // Work type configurations
  workTypes: [
    { name: 'Cashier', color: '#10b981' },
    { name: 'Sales Associate', color: '#0284c7' },
    { name: 'Security Guard', color: '#f97316' },
    { name: 'Store Manager', color: '#8b5cf6' },
    { name: 'Stock Clerk', color: '#ef4444' },
    { name: 'Customer Service', color: '#06b6d4' },
  ],
  
  // Employee configurations per store
  employees: {
    store1: [
      {
        name: 'Alice Johnson',
        email: 'alice.johnson@tachora.dev',
        phone: '+32 2 123 4567',
        label: 'Senior Cashier',
        color: '#10b981',
        contractType: 'FULL_TIME' as ContractType,
        weeklyMinutesTarget: 2400, // 40 hours
        canWorkAcrossStores: true,
        workTypes: ['Cashier', 'Customer Service'],
        availability: {
          MON: { isOff: false, startTime: '08:00', endTime: '16:00' },
          TUE: { isOff: false, startTime: '08:00', endTime: '16:00' },
          WED: { isOff: false, startTime: '10:00', endTime: '18:00' },
          THU: { isOff: false, startTime: '08:00', endTime: '16:00' },
          FRI: { isOff: false, startTime: '08:00', endTime: '16:00' },
          SAT: { isOff: true, startTime: null, endTime: null },
          SUN: { isOff: true, startTime: null, endTime: null },
        },
      },
      {
        name: 'Bob Smith',
        email: 'bob.smith@tachora.dev',
        phone: '+32 2 234 5678',
        label: 'Sales Lead',
        color: '#0284c7',
        contractType: 'FULL_TIME' as ContractType,
        weeklyMinutesTarget: 2400,
        canWorkAcrossStores: false,
        workTypes: ['Sales Associate', 'Store Manager'],
        availability: {
          MON: { isOff: false, startTime: '09:00', endTime: '17:00' },
          TUE: { isOff: false, startTime: '09:00', endTime: '17:00' },
          WED: { isOff: false, startTime: '09:00', endTime: '17:00' },
          THU: { isOff: false, startTime: '09:00', endTime: '17:00' },
          FRI: { isOff: false, startTime: '09:00', endTime: '17:00' },
          SAT: { isOff: false, startTime: '10:00', endTime: '14:00' },
          SUN: { isOff: true, startTime: null, endTime: null },
        },
      },
      {
        name: 'Claire Davis',
        email: 'claire.davis@tachora.dev',
        phone: '+32 2 345 6789',
        label: 'Security Officer',
        color: '#f97316',
        contractType: 'PART_TIME' as ContractType,
        weeklyMinutesTarget: 1200, // 20 hours
        canWorkAcrossStores: true,
        workTypes: ['Security Guard'],
        availability: {
          MON: { isOff: false, startTime: '18:00', endTime: '22:00' },
          TUE: { isOff: true, startTime: null, endTime: null },
          WED: { isOff: false, startTime: '18:00', endTime: '22:00' },
          THU: { isOff: true, startTime: null, endTime: null },
          FRI: { isOff: false, startTime: '18:00', endTime: '22:00' },
          SAT: { isOff: false, startTime: '14:00', endTime: '22:00' },
          SUN: { isOff: false, startTime: '12:00', endTime: '20:00' },
        },
      },
      {
        name: 'David Wilson',
        email: 'david.wilson@tachora.dev',
        phone: '+32 2 456 7890',
        label: 'Stock Assistant',
        color: '#ef4444',
        contractType: 'STUDENT' as ContractType,
        weeklyMinutesTarget: 960, // 16 hours
        canWorkAcrossStores: false,
        workTypes: ['Stock Clerk'],
        availability: {
          MON: { isOff: true, startTime: null, endTime: null },
          TUE: { isOff: true, startTime: null, endTime: null },
          WED: { isOff: false, startTime: '16:00', endTime: '20:00' },
          THU: { isOff: true, startTime: null, endTime: null },
          FRI: { isOff: true, startTime: null, endTime: null },
          SAT: { isOff: false, startTime: '08:00', endTime: '16:00' },
          SUN: { isOff: false, startTime: '10:00', endTime: '18:00' },
        },
      },
    ],
    store2: [
      {
        name: 'Emma Brown',
        email: 'emma.brown@tachora.dev',
        phone: '+32 3 123 4567',
        label: 'Store Supervisor',
        color: '#8b5cf6',
        contractType: 'FULL_TIME' as ContractType,
        weeklyMinutesTarget: 2400,
        canWorkAcrossStores: false,
        workTypes: ['Store Manager', 'Sales Associate'],
        availability: {
          MON: { isOff: false, startTime: '09:00', endTime: '17:00' },
          TUE: { isOff: false, startTime: '09:00', endTime: '17:00' },
          WED: { isOff: false, startTime: '09:00', endTime: '17:00' },
          THU: { isOff: false, startTime: '09:00', endTime: '17:00' },
          FRI: { isOff: false, startTime: '09:00', endTime: '17:00' },
          SAT: { isOff: true, startTime: null, endTime: null },
          SUN: { isOff: true, startTime: null, endTime: null },
        },
      },
      {
        name: 'Frank Miller',
        email: 'frank.miller@tachora.dev',
        phone: '+32 3 234 5678',
        label: 'Customer Support',
        color: '#06b6d4',
        contractType: 'PART_TIME' as ContractType,
        weeklyMinutesTarget: 1800, // 30 hours
        canWorkAcrossStores: true,
        workTypes: ['Customer Service', 'Cashier'],
        availability: {
          MON: { isOff: false, startTime: '12:00', endTime: '18:00' },
          TUE: { isOff: false, startTime: '12:00', endTime: '18:00' },
          WED: { isOff: false, startTime: '12:00', endTime: '18:00' },
          THU: { isOff: false, startTime: '12:00', endTime: '18:00' },
          FRI: { isOff: false, startTime: '12:00', endTime: '18:00' },
          SAT: { isOff: true, startTime: null, endTime: null },
          SUN: { isOff: true, startTime: null, endTime: null },
        },
      },
    ],
  },
};

// Utility functions
const WEEKDAY_ORDER: Weekday[] = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

function createDaysConfig(days: Weekday[]): DaysConfig {
  return WEEKDAY_ORDER.reduce((config, day) => {
    config[day] = days.includes(day);
    return config;
  }, {} as DaysConfig);
}

function getISOWeek(date: Date): string {
  const year = date.getFullYear();
  const week = getWeekNumber(date);
  return `${year}-W${week.toString().padStart(2, '0')}`;
}

function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

async function seedManager() {
  console.log('🔄 Seeding manager...');
  console.log(`   Target Clerk ID: ${SEED_CONFIG.manager.clerkId}`);
  
  // Check if user already exists with this Clerk ID
  const existingUser = await prisma.user.findUnique({
    where: { clerkId: SEED_CONFIG.manager.clerkId }
  });
  
  let manager;
  
  if (existingUser) {
    // User exists, just update their onboarding and role
    manager = await prisma.user.update({
      where: { clerkId: SEED_CONFIG.manager.clerkId },
      data: {
        onboardingStep: SEED_CONFIG.manager.onboardingStep,
        role: SEED_CONFIG.manager.role,
      },
    });
    console.log(`✅ Manager updated: ${manager.email} (${manager.id})`);
  } else {
    // User doesn't exist, create new one
    // Check if the fallback email is already taken
    const emailTaken = await prisma.user.findUnique({
      where: { email: SEED_CONFIG.manager.fallbackEmail }
    });
    
    const emailToUse = emailTaken 
      ? `seed-${Date.now()}@tachora.dev` // Generate unique email if fallback is taken
      : SEED_CONFIG.manager.fallbackEmail;
    
    manager = await prisma.user.create({
      data: {
        clerkId: SEED_CONFIG.manager.clerkId,
        email: emailToUse,
        role: SEED_CONFIG.manager.role,
        onboardingStep: SEED_CONFIG.manager.onboardingStep,
      },
    });
    console.log(`✅ Manager created: ${manager.email} (${manager.id})`);
  }
  
  console.log(`   Clerk ID: ${manager.clerkId}`);
  console.log(`   Manager ID: ${manager.id}`);
  return manager;
}

async function seedStores(managerId: string) {
  console.log('🔄 Seeding stores...');
  console.log(`   Manager ID: ${managerId}`);
  
  const stores = [];
  
  for (const storeConfig of SEED_CONFIG.stores) {
    console.log(`   Creating store: ${storeConfig.name}`);
    
    const store = await prisma.store.create({
      data: {
        managerId,
        name: storeConfig.name,
        city: storeConfig.city,
        country: storeConfig.country,
        address: storeConfig.address,
        openingTime: timeStringToDate(storeConfig.openingTime),
        closingTime: timeStringToDate(storeConfig.closingTime),
      },
    });
    
    stores.push(store);
    console.log(`✅ Store created: ${store.name} (${store.id})`);
  }
  
  return stores;
}

async function seedWorkTypes(stores: any[]) {
  console.log('🔄 Seeding work types...');
  
  const workTypesByStore: Record<string, any[]> = {};
  
  for (const store of stores) {
    const workTypes = [];
    
    for (const workTypeConfig of SEED_CONFIG.workTypes) {
      const workType = await prisma.workType.upsert({
        where: {
          storeId_name: {
            storeId: store.id,
            name: workTypeConfig.name,
          },
        },
        update: {
          color: workTypeConfig.color,
        },
        create: {
          storeId: store.id,
          name: workTypeConfig.name,
          color: workTypeConfig.color,
        },
      });
      
      workTypes.push(workType);
    }
    
    workTypesByStore[store.id] = workTypes;
    console.log(`✅ Work types created for ${store.name}: ${workTypes.length} types`);
  }
  
  return workTypesByStore;
}

async function seedEmployees(stores: any[], workTypesByStore: Record<string, any[]>) {
  console.log('🔄 Seeding employees...');
  
  const employeesByStore: Record<string, any[]> = {};
  
  // Seed employees for store 1
  const store1 = stores[0];
  const store1WorkTypes = workTypesByStore[store1.id];
  const employees1 = [];
  
  for (const empConfig of SEED_CONFIG.employees.store1) {
    // Find work type IDs
    const roleIds = empConfig.workTypes.map(typeName => {
      const workType = store1WorkTypes.find(wt => wt.name === typeName);
      if (!workType) throw new Error(`Work type not found: ${typeName}`);
      return workType.id;
    });
    
    const employee = await prisma.employee.create({
      data: {
        storeId: store1.id,
        name: empConfig.name,
        email: empConfig.email,
        phone: empConfig.phone,
        color: empConfig.color,
        contractType: empConfig.contractType,
        weeklyMinutesTarget: empConfig.weeklyMinutesTarget,
        canWorkAcrossStores: empConfig.canWorkAcrossStores,
        availability: {
          create: WEEKDAY_ORDER.map(day => {
            const avail = empConfig.availability[day];
            return {
              day,
              isOff: avail.isOff,
              startTime: avail.startTime ? timeStringToDate(avail.startTime) : null,
              endTime: avail.endTime ? timeStringToDate(avail.endTime) : null,
            };
          }),
        },
        roles: {
          create: roleIds.map(workTypeId => ({ workTypeId })),
        },
      },
    });
    
    employees1.push(employee);
  }
  
  employeesByStore[store1.id] = employees1;
  console.log(`✅ Employees created for ${store1.name}: ${employees1.length} employees`);
  
  // Seed employees for store 2 (if exists)
  if (stores.length > 1) {
    const store2 = stores[1];
    const store2WorkTypes = workTypesByStore[store2.id];
    const employees2 = [];
    
    for (const empConfig of SEED_CONFIG.employees.store2) {
      const roleIds = empConfig.workTypes.map(typeName => {
        const workType = store2WorkTypes.find(wt => wt.name === typeName);
        if (!workType) throw new Error(`Work type not found: ${typeName}`);
        return workType.id;
      });
      
      const employee = await prisma.employee.create({
        data: {
          storeId: store2.id,
          name: empConfig.name,
          email: empConfig.email,
          phone: empConfig.phone,
          color: empConfig.color,
          contractType: empConfig.contractType,
          weeklyMinutesTarget: empConfig.weeklyMinutesTarget,
          canWorkAcrossStores: empConfig.canWorkAcrossStores,
          availability: {
            create: WEEKDAY_ORDER.map(day => {
              const avail = empConfig.availability[day];
              return {
                day,
                isOff: avail.isOff,
                startTime: avail.startTime ? timeStringToDate(avail.startTime) : null,
                endTime: avail.endTime ? timeStringToDate(avail.endTime) : null,
              };
            }),
          },
          roles: {
            create: roleIds.map(workTypeId => ({ workTypeId })),
          },
        },
      });
      
      employees2.push(employee);
    }
    
    employeesByStore[store2.id] = employees2;
    console.log(`✅ Employees created for ${store2.name}: ${employees2.length} employees`);
  }
  
  return employeesByStore;
}

async function seedShiftTemplates(stores: any[], workTypesByStore: Record<string, any[]>) {
  console.log('🔄 Seeding shift templates...');
  
  for (const store of stores) {
    const workTypes = workTypesByStore[store.id];
    
    // Clear existing templates
    await prisma.shiftTemplate.deleteMany({ where: { storeId: store.id } });
    
    const templates = [
      {
        role: 'Morning Cashier',
        workTypeId: workTypes.find(wt => wt.name === 'Cashier')?.id,
        days: createDaysConfig(['MON', 'TUE', 'WED', 'THU', 'FRI']),
        startTime: '08:00',
        endTime: '16:00',
      },
      {
        role: 'Evening Cashier',
        workTypeId: workTypes.find(wt => wt.name === 'Cashier')?.id,
        days: createDaysConfig(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']),
        startTime: '14:00',
        endTime: '22:00',
      },
      {
        role: 'Sales Floor',
        workTypeId: workTypes.find(wt => wt.name === 'Sales Associate')?.id,
        days: createDaysConfig(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']),
        startTime: '09:00',
        endTime: '17:00',
      },
      {
        role: 'Weekend Security',
        workTypeId: workTypes.find(wt => wt.name === 'Security Guard')?.id,
        days: createDaysConfig(['SAT', 'SUN']),
        startTime: '12:00',
        endTime: '20:00',
      },
      {
        role: 'Stock Management',
        workTypeId: workTypes.find(wt => wt.name === 'Stock Clerk')?.id,
        days: createDaysConfig(['MON', 'WED', 'FRI']),
        startTime: '06:00',
        endTime: '14:00',
      },
    ];
    
    for (const template of templates) {
      await prisma.shiftTemplate.create({
        data: {
          storeId: store.id,
          role: template.role,
          workTypeId: template.workTypeId,
          days: template.days,
          startTime: timeStringToDate(template.startTime),
          endTime: timeStringToDate(template.endTime),
        },
      });
    }
    
    console.log(`✅ Shift templates created for ${store.name}: ${templates.length} templates`);
  }
}

async function seedSchedules(stores: any[]) {
  console.log('🔄 Seeding schedules...');
  
  const currentDate = new Date();
  const currentWeek = getISOWeek(currentDate);
  
  // Create next week's date
  const nextWeekDate = new Date(currentDate);
  nextWeekDate.setDate(nextWeekDate.getDate() + 7);
  const nextWeek = getISOWeek(nextWeekDate);
  
  for (const store of stores) {
    // Current week schedule (draft)
    await prisma.schedule.upsert({
      where: {
        storeId_isoWeek: {
          storeId: store.id,
          isoWeek: currentWeek,
        },
      },
      update: {},
      create: {
        storeId: store.id,
        isoWeek: currentWeek,
        state: 'Draft',
      },
    });
    
    // Next week schedule (draft)
    await prisma.schedule.upsert({
      where: {
        storeId_isoWeek: {
          storeId: store.id,
          isoWeek: nextWeek,
        },
      },
      update: {},
      create: {
        storeId: store.id,
        isoWeek: nextWeek,
        state: 'Draft',
      },
    });
    
    console.log(`✅ Schedules created for ${store.name}: ${currentWeek}, ${nextWeek}`);
  }
}

async function main() {
  console.log('🚀 Starting database seed...\n');
  
  try {
    // Clean up ALL existing seed data to ensure fresh start
    console.log('🧹 Cleaning all existing data...');
    
    // Clean up in dependency order (respecting foreign key constraints)
    await prisma.assignment.deleteMany();
    await prisma.schedule.deleteMany();
    await prisma.shiftTemplate.deleteMany();
    await prisma.employeeWorkType.deleteMany();
    await prisma.availability.deleteMany();
    await prisma.employee.deleteMany();
    await prisma.workType.deleteMany();
    await prisma.store.deleteMany();
    
    // Clean up old seed users but preserve your actual user
    await prisma.user.deleteMany({
      where: {
        clerkId: {
          not: SEED_CONFIG.manager.clerkId // Keep your actual user
        }
      }
    });
    
    console.log('✅ Cleanup complete\n');
    
    // Seed data in correct order
    const manager = await seedManager();
    const stores = await seedStores(manager.id);
    const workTypesByStore = await seedWorkTypes(stores);
    const employeesByStore = await seedEmployees(stores, workTypesByStore);
    await seedShiftTemplates(stores, workTypesByStore);
    await seedSchedules(stores);
    
    console.log('\n🎉 Database seed completed successfully!');
    console.log('\nSeed Summary:');
    console.log(`- Manager: ${manager.email}`);
    console.log(`- Stores: ${stores.length}`);
    console.log(`- Work Types: ${Object.values(workTypesByStore).flat().length}`);
    console.log(`- Employees: ${Object.values(employeesByStore).flat().length}`);
    console.log(`- Schedules: ${stores.length * 2} (current + next week)`);
    
  } catch (error) {
    console.error('❌ Seed failed:', error);
    throw error;
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });