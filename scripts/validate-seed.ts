/**
 * Seed Validation Script
 * 
 * This script validates that the seed data was created correctly
 * and demonstrates the type safety of our interfaces.
 */

import { PrismaClient } from '../src/generated/prisma';
import type { 
  UserWithStores, 
  StoreWithRelations, 
  EmployeeWithRelations,
  WorkTypeWithRelations 
} from '../src/types';

const prisma = new PrismaClient();

async function validateSeed() {
  console.log('🔍 Validating seed data...\n');

  try {
    // Validate manager
    const manager = await prisma.user.findFirst({
      where: { clerkId: 'user_3329TDaGk7PRFLRGGcebxRgCqey' },
      include: { stores: true }
    }) as UserWithStores | null;

    if (!manager) {
      throw new Error('Manager not found');
    }

    console.log(`✅ Manager: ${manager.email}`);
    console.log(`   - Stores: ${manager.stores.length}`);
    console.log(`   - Onboarding: ${manager.onboardingStep}`);

    // Validate stores
    const stores = await prisma.store.findMany({
      where: { managerId: manager.id },
      include: {
        manager: true,
        employees: {
          include: {
            availability: true,
            roles: { include: { workType: true } }
          }
        },
        workTypes: true,
        shiftTemplates: true,
        schedules: true
      }
    }) as StoreWithRelations[];

    console.log(`\n✅ Stores: ${stores.length}`);
    
    for (const store of stores) {
      console.log(`   📍 ${store.name} (${store.city})`);
      console.log(`      - Employees: ${store.employees.length}`);
      console.log(`      - Work Types: ${store.workTypes.length}`);
      console.log(`      - Shift Templates: ${store.shiftTemplates.length}`);
      console.log(`      - Schedules: ${store.schedules.length}`);

      // Validate employees have proper availability
      for (const employee of store.employees) {
        const availabilityCount = employee.availability.length;
        if (availabilityCount !== 7) {
          console.warn(`⚠️  Employee ${employee.name} has ${availabilityCount} availability slots (expected 7)`);
        }

        const roleCount = employee.roles.length;
        if (roleCount === 0) {
          console.warn(`⚠️  Employee ${employee.name} has no work type roles assigned`);
        }
      }
    }

    // Validate work types
    const totalWorkTypes = await prisma.workType.count();
    console.log(`\n✅ Work Types: ${totalWorkTypes}`);

    // Validate employees
    const totalEmployees = await prisma.employee.count();
    console.log(`✅ Employees: ${totalEmployees}`);

    // Validate availability slots
    const totalAvailability = await prisma.availability.count();
    const expectedAvailability = totalEmployees * 7; // 7 days per employee
    console.log(`✅ Availability Slots: ${totalAvailability} (expected: ${expectedAvailability})`);

    if (totalAvailability !== expectedAvailability) {
      console.warn(`⚠️  Availability count mismatch!`);
    }

    // Validate shift templates
    const totalShiftTemplates = await prisma.shiftTemplate.count();
    console.log(`✅ Shift Templates: ${totalShiftTemplates}`);

    // Validate schedules
    const totalSchedules = await prisma.schedule.count();
    const expectedSchedules = stores.length * 2; // 2 weeks per store
    console.log(`✅ Schedules: ${totalSchedules} (expected: ${expectedSchedules})`);

    // Test type safety with a sample query
    const sampleEmployee = await prisma.employee.findFirst({
      include: {
        store: true,
        availability: true,
        roles: { include: { workType: true } },
        assignments: true
      }
    }) as EmployeeWithRelations | null;

    if (sampleEmployee) {
      console.log(`\n🔬 Type Safety Test:`);
      console.log(`   Employee: ${sampleEmployee.name}`);
      console.log(`   Store: ${sampleEmployee.store.name}`);
      console.log(`   Contract: ${sampleEmployee.contractType}`);
      console.log(`   Weekly Target: ${sampleEmployee.weeklyMinutesTarget} minutes`);
      console.log(`   Roles: ${sampleEmployee.roles.map(r => r.workType.name).join(', ')}`);
      
      const workDays = sampleEmployee.availability.filter(a => !a.isOff);
      console.log(`   Available Days: ${workDays.length}/7`);
    }

    console.log(`\n🎉 Seed validation completed successfully!`);

  } catch (error) {
    console.error('❌ Validation failed:', error);
    throw error;
  }
}

async function main() {
  await validateSeed();
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