/**
 * Verify seed data is properly created and accessible
 */

import { PrismaClient } from '../src/generated/prisma';

const prisma = new PrismaClient();

async function verifyData() {
  console.log('🔍 Verifying seed data accessibility...\n');

  try {
    // Find your user
    const targetClerkId = 'user_3329TDaGk7PRFLRGGcebxRgCqey';
    const user = await prisma.user.findUnique({
      where: { clerkId: targetClerkId },
      include: {
        stores: {
          include: {
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
        }
      }
    });

    if (!user) {
      console.log(`❌ User with Clerk ID ${targetClerkId} not found`);
      return;
    }

    console.log(`✅ User found: ${user.email}`);
    console.log(`   Clerk ID: ${user.clerkId}`);
    console.log(`   Onboarding: ${user.onboardingStep}`);
    console.log(`   Stores: ${user.stores.length}\n`);

    // Verify each store
    for (const store of user.stores) {
      console.log(`🏪 Store: ${store.name}`);
      console.log(`   ID: ${store.id}`);
      console.log(`   City: ${store.city}`);
      console.log(`   Address: ${store.address}`);
      console.log(`   Opening: ${store.openingTime?.toISOString().slice(11, 16) || 'Not set'}`);
      console.log(`   Closing: ${store.closingTime?.toISOString().slice(11, 16) || 'Not set'}`);
      console.log(`   Employees: ${store.employees.length}`);
      console.log(`   Work Types: ${store.workTypes.length}`);
      console.log(`   Shift Templates: ${store.shiftTemplates.length}`);
      console.log(`   Schedules: ${store.schedules.length}`);

      // List employees
      if (store.employees.length > 0) {
        console.log(`   👥 Employees:`);
        for (const employee of store.employees) {
          const availableDays = employee.availability.filter(a => !a.isOff).length;
          const roles = employee.roles.map(r => r.workType?.name).filter(Boolean).join(', ');
          console.log(`      • ${employee.name}`);
          console.log(`        Email: ${employee.email}`);
          console.log(`        Contract: ${employee.contractType}`);
          console.log(`        Cross-store: ${employee.canWorkAcrossStores ? 'Yes' : 'No'}`);
          console.log(`        Available days: ${availableDays}/7`);
          console.log(`        Roles: ${roles || 'None'}`);
        }
      }

      // List work types
      if (store.workTypes.length > 0) {
        console.log(`   💼 Work Types:`);
        for (const workType of store.workTypes) {
          console.log(`      • ${workType.name} (${workType.color})`);
        }
      }

      // List shift templates
      if (store.shiftTemplates.length > 0) {
        console.log(`   📅 Shift Templates:`);
        for (const template of store.shiftTemplates) {
          const days = template.days as any;
          const activeDays = Object.entries(days || {})
            .filter(([_, active]) => active)
            .map(([day, _]) => day)
            .join(', ');
          console.log(`      • ${template.role}`);
          console.log(`        Time: ${template.startTime?.toISOString().slice(11, 16)} - ${template.endTime?.toISOString().slice(11, 16)}`);
          console.log(`        Days: ${activeDays || 'None'}`);
        }
      }

      console.log('');
    }

    // Check cross-store employees
    const crossStoreEmployees = await prisma.employee.findMany({
      where: {
        canWorkAcrossStores: true,
        store: { managerId: user.id }
      },
      include: {
        store: true,
        roles: { include: { workType: true } }
      }
    });

    if (crossStoreEmployees.length > 0) {
      console.log(`🔄 Cross-Store Employees (${crossStoreEmployees.length}):`);
      for (const employee of crossStoreEmployees) {
        console.log(`   • ${employee.name} from ${employee.store.name}`);
        console.log(`     Can work across stores: ${employee.canWorkAcrossStores}`);
      }
      console.log('');
    }

    console.log('🎉 Data verification completed successfully!');
    console.log('\n📋 Summary:');
    console.log(`   Total Stores: ${user.stores.length}`);
    console.log(`   Total Employees: ${user.stores.reduce((sum, store) => sum + store.employees.length, 0)}`);
    console.log(`   Cross-Store Employees: ${crossStoreEmployees.length}`);
    console.log(`   Total Work Types: ${user.stores.reduce((sum, store) => sum + store.workTypes.length, 0)}`);
    console.log(`   Total Shift Templates: ${user.stores.reduce((sum, store) => sum + store.shiftTemplates.length, 0)}`);

  } catch (error) {
    console.error('❌ Data verification failed:', error);
    throw error;
  }
}

async function main() {
  await verifyData();
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