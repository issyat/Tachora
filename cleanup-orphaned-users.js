// Cleanup utility for orphaned users (users in Supabase but not in Clerk)
const { PrismaClient } = require('./src/generated/prisma');
const { clerkClient } = require('@clerk/nextjs/server');

const prisma = new PrismaClient();

async function cleanupOrphanedUsers() {
  console.log('🧹 Cleaning up orphaned users...\n');

  try {
    // Get all users from Supabase
    const supabaseUsers = await prisma.user.findMany({
      include: {
        stores: {
          include: {
            employees: true,
            schedules: true
          }
        }
      }
    });

    console.log(`Found ${supabaseUsers.length} users in Supabase database`);

    let orphanedCount = 0;
    let cleanedUpCount = 0;

    for (const user of supabaseUsers) {
      try {
        // Check if user still exists in Clerk
        const clerkUser = await clerkClient.users.getUser(user.clerkId);
        
        if (clerkUser) {
          console.log(`✅ ${user.email} - exists in both systems`);
        }
      } catch (error) {
        // User doesn't exist in Clerk anymore
        if (error.status === 404) {
          orphanedCount++;
          console.log(`🗑️  ${user.email} - orphaned (deleted from Clerk but not Supabase)`);
          
          // Ask for confirmation before deleting
          const shouldDelete = process.argv.includes('--confirm');
          
          if (shouldDelete) {
            await deleteUserData(user);
            cleanedUpCount++;
            console.log(`   ✅ Cleaned up data for ${user.email}`);
          } else {
            console.log(`   ⚠️  Use --confirm flag to actually delete this user's data`);
          }
        } else {
          console.error(`❌ Error checking user ${user.email}:`, error.message);
        }
      }
    }

    console.log('\n📊 Summary:');
    console.log(`   Total users in Supabase: ${supabaseUsers.length}`);
    console.log(`   Orphaned users found: ${orphanedCount}`);
    console.log(`   Users cleaned up: ${cleanedUpCount}`);
    
    if (orphanedCount > 0 && cleanedUpCount === 0) {
      console.log('\n💡 To actually delete orphaned users, run:');
      console.log('   node cleanup-orphaned-users.js --confirm');
    }

  } catch (error) {
    console.error('❌ Cleanup failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

async function deleteUserData(user) {
  // Delete all user data in the correct order (same as webhook)
  for (const store of user.stores) {
    // Delete availability tokens
    await prisma.availabilityToken.deleteMany({
      where: {
        employee: {
          storeId: store.id
        }
      }
    });

    // Delete assignments
    await prisma.assignment.deleteMany({
      where: {
        schedule: {
          storeId: store.id
        }
      }
    });

    // Delete schedules
    await prisma.schedule.deleteMany({
      where: { storeId: store.id }
    });

    // Delete availability records
    await prisma.availability.deleteMany({
      where: {
        employee: {
          storeId: store.id
        }
      }
    });

    // Delete employee work type relations
    await prisma.employeeWorkType.deleteMany({
      where: {
        employee: {
          storeId: store.id
        }
      }
    });

    // Delete shift templates
    await prisma.shiftTemplate.deleteMany({
      where: { storeId: store.id }
    });

    // Delete employees
    await prisma.employee.deleteMany({
      where: { storeId: store.id }
    });

    // Delete work types
    await prisma.workType.deleteMany({
      where: { storeId: store.id }
    });

    // Delete the store
    await prisma.store.delete({
      where: { id: store.id }
    });
  }

  // Delete chat/advisor data
  await prisma.chatMessage.deleteMany({
    where: { userId: user.id }
  });

  await prisma.chatThread.deleteMany({
    where: { userId: user.id }
  });

  await prisma.advisorMessage.deleteMany({
    where: {
      thread: {
        userId: user.id
      }
    }
  });

  await prisma.advisorThread.deleteMany({
    where: { userId: user.id }
  });

  // Finally, delete the user
  await prisma.user.delete({
    where: { id: user.id }
  });
}

// Run the cleanup
cleanupOrphanedUsers();