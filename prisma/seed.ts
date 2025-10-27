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
  
  // Store configurations - Two medium retail stores
  stores: [
    {
      name: 'Medium Retail Store - Grand Place',
      city: 'Brussels',
      country: 'BE',
      address: '123 Grand Place, 1000 Brussels, Belgium',
      openingTime: '08:00',
      closingTime: '20:00',
    },
    {
      name: 'Medium Retail Store - Louise',
      city: 'Brussels',
      country: 'BE',
      address: '45 Avenue Louise, 1050 Brussels, Belgium',
      openingTime: '09:00',
      closingTime: '21:00',
    },
  ],
  
  // Work type configurations for medium retail
  workTypes: [
    { name: 'Cashier', color: '#3b82f6' },
    { name: 'Sales Associate', color: '#10b981' },
    { name: 'Stock Clerk', color: '#f59e0b' },
    { name: 'Shift Supervisor', color: '#8b5cf6' },
    { name: 'Customer Service', color: '#ef4444' },
  ],
  
  // Employee configurations - Medium retail team
  employees: {
    store1: [
      {
        name: 'Alice Johnson',
        email: 'alice@mediumretail.com',
        phone: '+32 2 123 4567',
        label: 'Senior Cashier & Supervisor',
        color: '#3b82f6',
        contractType: 'FULL_TIME' as ContractType,
        weeklyMinutesTarget: 2400, // 40 hours
        canWorkAcrossStores: false,
        workTypes: ['Cashier', 'Shift Supervisor'],
        availability: {
          MON: { isOff: false, startTime: '08:00', endTime: '18:00' },
          TUE: { isOff: false, startTime: '08:00', endTime: '18:00' },
          WED: { isOff: false, startTime: '08:00', endTime: '18:00' },
          THU: { isOff: false, startTime: '08:00', endTime: '18:00' },
          FRI: { isOff: false, startTime: '08:00', endTime: '18:00' },
          SAT: { isOff: false, startTime: '10:00', endTime: '18:00' },
          SUN: { isOff: true, startTime: null, endTime: null },
        },
      },
      {
        name: 'Bob Smith',
        email: 'bob@mediumretail.com',
        phone: '+32 2 234 5678',
        label: 'Sales & Customer Service',
        color: '#10b981',
        contractType: 'FULL_TIME' as ContractType,
        weeklyMinutesTarget: 2400,
        canWorkAcrossStores: false,
        workTypes: ['Sales Associate', 'Customer Service'],
        availability: {
          MON: { isOff: false, startTime: '09:00', endTime: '19:00' },
          TUE: { isOff: false, startTime: '09:00', endTime: '19:00' },
          WED: { isOff: false, startTime: '09:00', endTime: '19:00' },
          THU: { isOff: false, startTime: '09:00', endTime: '19:00' },
          FRI: { isOff: false, startTime: '09:00', endTime: '19:00' },
          SAT: { isOff: false, startTime: '10:00', endTime: '18:00' },
          SUN: { isOff: false, startTime: '12:00', endTime: '18:00' },
        },
      },
      {
        name: 'Carol Davis',
        email: 'carol@mediumretail.com',
        phone: '+32 2 345 6789',
        label: 'Stock & Sales',
        color: '#f59e0b',
        contractType: 'PART_TIME' as ContractType,
        weeklyMinutesTarget: 1200, // 20 hours
        canWorkAcrossStores: false,
        workTypes: ['Stock Clerk', 'Sales Associate'],
        availability: {
          MON: { isOff: false, startTime: '07:00', endTime: '15:00' },
          TUE: { isOff: false, startTime: '07:00', endTime: '15:00' },
          WED: { isOff: false, startTime: '07:00', endTime: '15:00' },
          THU: { isOff: false, startTime: '07:00', endTime: '15:00' },
          FRI: { isOff: false, startTime: '07:00', endTime: '15:00' },
          SAT: { isOff: true, startTime: null, endTime: null },
          SUN: { isOff: true, startTime: null, endTime: null },
        },
      },
      {
        name: 'David Wilson',
        email: 'david@mediumretail.com',
        phone: '+32 2 456 7890',
        label: 'Cashier & Customer Service',
        color: '#8b5cf6',
        contractType: 'PART_TIME' as ContractType,
        weeklyMinutesTarget: 1440, // 24 hours
        canWorkAcrossStores: false,
        workTypes: ['Cashier', 'Customer Service'],
        availability: {
          MON: { isOff: false, startTime: '14:00', endTime: '20:00' },
          TUE: { isOff: false, startTime: '14:00', endTime: '20:00' },
          WED: { isOff: false, startTime: '14:00', endTime: '20:00' },
          THU: { isOff: false, startTime: '14:00', endTime: '20:00' },
          FRI: { isOff: false, startTime: '14:00', endTime: '20:00' },
          SAT: { isOff: false, startTime: '12:00', endTime: '20:00' },
          SUN: { isOff: false, startTime: '12:00', endTime: '18:00' },
        },
      },
      {
        name: 'Emma Brown',
        email: 'emma@mediumretail.com',
        phone: '+32 2 567 8901',
        label: 'Student Sales Associate',
        color: '#ef4444',
        contractType: 'STUDENT' as ContractType,
        weeklyMinutesTarget: 960, // 16 hours
        canWorkAcrossStores: false,
        workTypes: ['Sales Associate'],
        availability: {
          MON: { isOff: true, startTime: null, endTime: null },
          TUE: { isOff: true, startTime: null, endTime: null },
          WED: { isOff: false, startTime: '16:00', endTime: '20:00' },
          THU: { isOff: true, startTime: null, endTime: null },
          FRI: { isOff: false, startTime: '16:00', endTime: '20:00' },
          SAT: { isOff: false, startTime: '10:00', endTime: '18:00' },
          SUN: { isOff: false, startTime: '12:00', endTime: '18:00' },
        },
      },
      {
        name: 'Frank Miller',
        email: 'frank@mediumretail.com',
        phone: '+32 2 678 9012',
        label: 'Stock Manager & Supervisor',
        color: '#06b6d4',
        contractType: 'FULL_TIME' as ContractType,
        weeklyMinutesTarget: 2400,
        canWorkAcrossStores: false,
        workTypes: ['Stock Clerk', 'Shift Supervisor'],
        availability: {
          MON: { isOff: false, startTime: '06:00', endTime: '16:00' },
          TUE: { isOff: false, startTime: '06:00', endTime: '16:00' },
          WED: { isOff: false, startTime: '06:00', endTime: '16:00' },
          THU: { isOff: false, startTime: '06:00', endTime: '16:00' },
          FRI: { isOff: false, startTime: '06:00', endTime: '16:00' },
          SAT: { isOff: true, startTime: null, endTime: null },
          SUN: { isOff: true, startTime: null, endTime: null },
        },
      },
    ],
    store2: [
      {
        name: 'Grace Lee',
        email: 'grace@mediumretail.com',
        phone: '+32 2 789 0123',
        label: 'Store Lead & Supervisor',
        color: '#3b82f6',
        contractType: 'FULL_TIME' as ContractType,
        weeklyMinutesTarget: 2400,
        canWorkAcrossStores: true,
        workTypes: ['Shift Supervisor', 'Customer Service'],
        availability: {
          MON: { isOff: false, startTime: '08:30', endTime: '18:30' },
          TUE: { isOff: false, startTime: '08:30', endTime: '18:30' },
          WED: { isOff: false, startTime: '08:30', endTime: '18:30' },
          THU: { isOff: false, startTime: '08:30', endTime: '18:30' },
          FRI: { isOff: false, startTime: '08:30', endTime: '18:30' },
          SAT: { isOff: false, startTime: '10:00', endTime: '18:00' },
          SUN: { isOff: true, startTime: null, endTime: null },
        },
      },
      {
        name: 'Hugo Martin',
        email: 'hugo@mediumretail.com',
        phone: '+32 2 890 1234',
        label: 'Cashier Specialist',
        color: '#10b981',
        contractType: 'FULL_TIME' as ContractType,
        weeklyMinutesTarget: 2160,
        canWorkAcrossStores: false,
        workTypes: ['Cashier'],
        availability: {
          MON: { isOff: false, startTime: '09:00', endTime: '17:00' },
          TUE: { isOff: false, startTime: '11:00', endTime: '19:00' },
          WED: { isOff: false, startTime: '09:00', endTime: '17:00' },
          THU: { isOff: false, startTime: '11:00', endTime: '19:00' },
          FRI: { isOff: false, startTime: '09:00', endTime: '17:00' },
          SAT: { isOff: false, startTime: '12:00', endTime: '20:00' },
          SUN: { isOff: false, startTime: '12:00', endTime: '18:00' },
        },
      },
      {
        name: 'Isabella Rossi',
        email: 'isabella@mediumretail.com',
        phone: '+32 2 901 2345',
        label: 'Luxury Sales Associate',
        color: '#f59e0b',
        contractType: 'FULL_TIME' as ContractType,
        weeklyMinutesTarget: 2400,
        canWorkAcrossStores: false,
        workTypes: ['Sales Associate', 'Customer Service'],
        availability: {
          MON: { isOff: false, startTime: '10:00', endTime: '20:00' },
          TUE: { isOff: false, startTime: '10:00', endTime: '20:00' },
          WED: { isOff: false, startTime: '12:00', endTime: '21:00' },
          THU: { isOff: false, startTime: '12:00', endTime: '21:00' },
          FRI: { isOff: false, startTime: '10:00', endTime: '20:00' },
          SAT: { isOff: false, startTime: '09:00', endTime: '17:00' },
          SUN: { isOff: false, startTime: '11:00', endTime: '17:00' },
        },
      },
      {
        name: 'Jasper Novak',
        email: 'jasper@mediumretail.com',
        phone: '+32 2 012 3456',
        label: 'Visual Merchandiser',
        color: '#8b5cf6',
        contractType: 'FLEXI_JOB' as ContractType,
        weeklyMinutesTarget: 1800, // 30 hours for flexi job
        canWorkAcrossStores: true,
        workTypes: ['Sales Associate', 'Customer Service'],
        availability: {
          MON: { isOff: false, startTime: '09:00', endTime: '17:00' },
          TUE: { isOff: false, startTime: '09:00', endTime: '17:00' },
          WED: { isOff: false, startTime: '09:00', endTime: '17:00' },
          THU: { isOff: false, startTime: '09:00', endTime: '17:00' },
          FRI: { isOff: false, startTime: '09:00', endTime: '17:00' },
          SAT: { isOff: true, startTime: '09:00', endTime: '17:00' },
          SUN: { isOff: true, startTime: '09:00', endTime: '17:00' },
        },
      },
      {
        name: 'Marie Dubois',
        email: 'marie@mediumretail.com',
        phone: '+32 2 012 3457',
        label: 'Flexi Sales Support',
        color: '#f97316',
        contractType: 'FLEXI_JOB' as ContractType,
        weeklyMinutesTarget: 1500, // 25 hours for flexi job
        canWorkAcrossStores: true,
        workTypes: ['Sales Associate'],
        availability: {
          MON: { isOff: false, startTime: '13:00', endTime: '21:00' },
          TUE: { isOff: false, startTime: '13:00', endTime: '21:00' },
          WED: { isOff: true, startTime: null, endTime: null },
          THU: { isOff: false, startTime: '13:00', endTime: '21:00' },
          FRI: { isOff: false, startTime: '13:00', endTime: '21:00' },
          SAT: { isOff: false, startTime: '11:00', endTime: '19:00' },
          SUN: { isOff: true, startTime: null, endTime: null },
        },
      },
      {
        name: 'Klara Schmidt',
        email: 'klara@mediumretail.com',
        phone: '+32 2 123 4098',
        label: 'Stock & Logistics',
        color: '#06b6d4',
        contractType: 'PART_TIME' as ContractType,
        weeklyMinutesTarget: 1020,
        canWorkAcrossStores: false,
        workTypes: ['Stock Clerk'],
        availability: {
          MON: { isOff: false, startTime: '07:00', endTime: '13:00' },
          TUE: { isOff: false, startTime: '07:00', endTime: '13:00' },
          WED: { isOff: false, startTime: '07:00', endTime: '13:00' },
          THU: { isOff: true, startTime: null, endTime: null },
          FRI: { isOff: false, startTime: '07:00', endTime: '13:00' },
          SAT: { isOff: false, startTime: '08:00', endTime: '14:00' },
          SUN: { isOff: true, startTime: null, endTime: null },
        },
      },
      {
        name: 'Liam O’Connor',
        email: 'liam@mediumretail.com',
        phone: '+32 2 234 5098',
        label: 'Weekend Support',
        color: '#ef4444',
        contractType: 'STUDENT' as ContractType,
        weeklyMinutesTarget: 720,
        canWorkAcrossStores: false,
        workTypes: ['Customer Service'],
        availability: {
          MON: { isOff: true, startTime: null, endTime: null },
          TUE: { isOff: true, startTime: null, endTime: null },
          WED: { isOff: false, startTime: '16:00', endTime: '20:00' },
          THU: { isOff: true, startTime: null, endTime: null },
          FRI: { isOff: false, startTime: '17:00', endTime: '21:00' },
          SAT: { isOff: false, startTime: '10:00', endTime: '18:00' },
          SUN: { isOff: false, startTime: '12:00', endTime: '18:00' },
        },
      },
    ],
  },
};

// Utility functions
const WEEKDAY_ORDER: Weekday[] = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
type DaysConfig = Record<Weekday, boolean>;

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

  for (const [index, store] of stores.entries()) {
    const storeWorkTypes = workTypesByStore[store.id];
    const employees = [];
    const storeKey = `store${index + 1}` as keyof typeof SEED_CONFIG.employees;
    const employeeConfigs = SEED_CONFIG.employees[storeKey] ?? [];

    if (!employeeConfigs.length) {
      console.warn(`⚠️  No employee config found for ${store.name} (${storeKey})`);
    }

    for (const empConfig of employeeConfigs) {
      // Find work type IDs
      const roleIds = empConfig.workTypes.map(typeName => {
        const workType = storeWorkTypes.find(wt => wt.name === typeName);
        if (!workType) throw new Error(`Work type not found: ${typeName}`);
        return workType.id;
      });

      const employee = await prisma.employee.create({
        data: {
          storeId: store.id,
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

      employees.push(employee);
    }

    employeesByStore[store.id] = employees;
    console.log(`✅ Employees created for ${store.name}: ${employees.length} employees`);
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
      // Morning Cashier Shifts
      {
        role: 'Morning Cashier',
        workTypeId: workTypes.find(wt => wt.name === 'Cashier')?.id,
        days: createDaysConfig(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']),
        startTime: '08:00',
        endTime: '16:00',
      },
      // Afternoon Cashier Shifts  
      {
        role: 'Afternoon Cashier',
        workTypeId: workTypes.find(wt => wt.name === 'Cashier')?.id,
        days: createDaysConfig(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']),
        startTime: '14:00',
        endTime: '20:00',
      },
      // Sales Associate Shifts
      {
        role: 'Morning Sales',
        workTypeId: workTypes.find(wt => wt.name === 'Sales Associate')?.id,
        days: createDaysConfig(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']),
        startTime: '09:00',
        endTime: '15:00',
      },
      {
        role: 'Afternoon Sales',
        workTypeId: workTypes.find(wt => wt.name === 'Sales Associate')?.id,
        days: createDaysConfig(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']),
        startTime: '15:00',
        endTime: '20:00',
      },
      // Stock Clerk Shifts (early morning)
      {
        role: 'Stock Replenishment',
        workTypeId: workTypes.find(wt => wt.name === 'Stock Clerk')?.id,
        days: createDaysConfig(['MON', 'TUE', 'WED', 'THU', 'FRI']),
        startTime: '07:00',
        endTime: '13:00',
      },
      // Supervisor Shifts (overlap for coverage)
      {
        role: 'Morning Supervisor',
        workTypeId: workTypes.find(wt => wt.name === 'Shift Supervisor')?.id,
        days: createDaysConfig(['MON', 'TUE', 'WED', 'THU', 'FRI']),
        startTime: '08:00',
        endTime: '16:00',
      },
      {
        role: 'Evening Supervisor',
        workTypeId: workTypes.find(wt => wt.name === 'Shift Supervisor')?.id,
        days: createDaysConfig(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']),
        startTime: '12:00',
        endTime: '20:00',
      },
      // Customer Service
      {
        role: 'Customer Service',
        workTypeId: workTypes.find(wt => wt.name === 'Customer Service')?.id,
        days: createDaysConfig(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']),
        startTime: '10:00',
        endTime: '18:00',
      },
    ];
    
    for (const template of templates) {
      await prisma.shiftTemplate.create({
        data: {
          storeId: store.id,
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