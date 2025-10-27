import { NextRequest, NextResponse } from 'next/server';
import { createClerkClient } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';

const clerkClient = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
});

export async function GET() {
  return NextResponse.json({
    message: 'Cleanup endpoint is ready',
    instructions: 'Send a POST request to this endpoint to clean up deleted users',
    example: 'fetch("/api/cleanup-deleted-users", { method: "POST" })'
  });
}

export async function POST(req: NextRequest) {
  console.log('🧹 Starting cleanup of deleted users...');
  
  try {
    // Get all users from our database
    const dbUsers = await prisma.user.findMany({
      select: {
        id: true,
        clerkId: true,
        email: true,
        stores: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    console.log(`Found ${dbUsers.length} users in database`);

    const deletedUsers = [];
    const errors = [];

    // Check each user to see if they still exist in Clerk
    for (const dbUser of dbUsers) {
      try {
        // Try to get the user from Clerk
        await clerkClient.users.getUser(dbUser.clerkId);
        console.log(`✅ User ${dbUser.email} still exists in Clerk`);
      } catch (error: any) {
        // If user doesn't exist in Clerk (404 error), they were deleted
        if (error.status === 404) {
          console.log(`❌ User ${dbUser.email} (${dbUser.clerkId}) was deleted from Clerk, cleaning up database...`);
          
          try {
            // Delete all user data (same logic as webhook)
            for (const store of dbUser.stores) {
              console.log(`Deleting store: ${store.name}`);
              
              // Delete availability tokens
              await prisma.availabilityToken.deleteMany({
                where: { employee: { storeId: store.id } }
              });

              // Delete assignments
              await prisma.assignment.deleteMany({
                where: { schedule: { storeId: store.id } }
              });

              // Delete schedules
              await prisma.schedule.deleteMany({
                where: { storeId: store.id }
              });

              // Delete availability records
              await prisma.availability.deleteMany({
                where: { employee: { storeId: store.id } }
              });

              // Delete employee work type relations
              await prisma.employeeWorkType.deleteMany({
                where: { employee: { storeId: store.id } }
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
              where: { userId: dbUser.id }
            });

            await prisma.chatThread.deleteMany({
              where: { userId: dbUser.id }
            });

            await prisma.advisorMessage.deleteMany({
              where: { thread: { userId: dbUser.id } }
            });

            await prisma.advisorThread.deleteMany({
              where: { userId: dbUser.id }
            });

            // Finally, delete the user
            await prisma.user.delete({
              where: { id: dbUser.id }
            });

            deletedUsers.push({
              email: dbUser.email,
              clerkId: dbUser.clerkId,
              storesDeleted: dbUser.stores.length
            });

            console.log(`✅ Successfully cleaned up data for ${dbUser.email}`);
          } catch (cleanupError) {
            console.error(`❌ Failed to cleanup ${dbUser.email}:`, cleanupError);
            errors.push({
              email: dbUser.email,
              error: cleanupError instanceof Error ? cleanupError.message : 'Unknown error'
            });
          }
        } else {
          console.error(`Error checking user ${dbUser.email}:`, error);
          errors.push({
            email: dbUser.email,
            error: `Clerk API error: ${error.message}`
          });
        }
      }
    }

    console.log(`🧹 Cleanup complete. Deleted ${deletedUsers.length} orphaned users`);

    return NextResponse.json({
      message: 'Cleanup completed',
      deletedUsers: deletedUsers.length,
      errors: errors.length,
      details: {
        deleted: deletedUsers,
        errors: errors
      }
    });

  } catch (error) {
    console.error('❌ Cleanup failed:', error);
    return NextResponse.json(
      { 
        error: 'Cleanup failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}