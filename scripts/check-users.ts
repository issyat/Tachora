/**
 * Check existing users in database
 * This helps debug seed conflicts
 */

import { PrismaClient } from '../src/generated/prisma';

const prisma = new PrismaClient();

async function checkUsers() {
  console.log('🔍 Checking existing users in database...\n');

  try {
    const users = await prisma.user.findMany({
      include: {
        stores: {
          include: {
            employees: true,
            schedules: true,
          }
        }
      }
    });

    console.log(`Found ${users.length} users:\n`);

    for (const user of users) {
      console.log(`👤 User: ${user.email || 'No email'}`);
      console.log(`   ID: ${user.id}`);
      console.log(`   Clerk ID: ${user.clerkId}`);
      console.log(`   Role: ${user.role}`);
      console.log(`   Onboarding: ${user.onboardingStep}`);
      console.log(`   Stores: ${user.stores.length}`);
      console.log(`   Created: ${user.createdAt.toISOString()}`);
      
      if (user.stores.length > 0) {
        for (const store of user.stores) {
          console.log(`     📍 Store: ${store.name} (${store.employees.length} employees, ${store.schedules.length} schedules)`);
        }
      }
      console.log('');
    }

    // Check for potential conflicts
    const targetClerkId = 'user_3329TDaGk7PRFLRGGcebxRgCqeyid';
    const targetUser = users.find(u => u.clerkId === targetClerkId);
    
    if (targetUser) {
      console.log(`✅ Your Clerk user exists: ${targetUser.email}`);
      console.log(`   Has ${targetUser.stores.length} stores`);
    } else {
      console.log(`ℹ️  Your Clerk user (${targetClerkId}) not found in database`);
    }

    // Check for email conflicts
    const emailConflicts = users.filter(u => 
      u.email === 'manager@tachora.dev' || 
      u.email === 'seed-manager@tachora.dev'
    );
    
    if (emailConflicts.length > 0) {
      console.log(`⚠️  Email conflicts found:`);
      for (const conflict of emailConflicts) {
        console.log(`   ${conflict.email} -> Clerk ID: ${conflict.clerkId}`);
      }
    }

  } catch (error) {
    console.error('❌ Error checking users:', error);
    throw error;
  }
}

async function main() {
  await checkUsers();
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