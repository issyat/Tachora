import { NextRequest, NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';

export async function DELETE(req: NextRequest) {
  console.log('🗑️ Manual user deletion requested');
  
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const clerkUser = await currentUser();
    const email = clerkUser?.primaryEmailAddress?.emailAddress;

    console.log(`Deleting user data for Clerk ID: ${userId}, Email: ${email}`);

    // Find the user in our database
    const user = await prisma.user.findUnique({
      where: { clerkId: userId },
      include: {
        stores: {
          include: {
            employees: true,
            schedules: true,
            shiftTemplates: true,
            workTypes: true
          }
        }
      }
    });

    if (!user) {
      console.log(`User with Clerk ID ${userId} not found in database`);
      return NextResponse.json({ message: 'User not found in database' });
    }

    console.log(`Found user: ${user.email} with ${user.stores.length} stores`);

    // Delete all user data in the correct order (respecting foreign key constraints)
    for (const store of user.stores) {
      console.log(`Deleting store: ${store.name}`);
      
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

    console.log(`✅ Successfully deleted all data for user: ${user.email}`);
    
    return NextResponse.json({ 
      message: 'User data deleted successfully',
      deletedStores: user.stores.length 
    });

  } catch (error) {
    console.error('❌ Failed to delete user data:', error);
    return NextResponse.json(
      { error: 'Failed to delete user data' },
      { status: 500 }
    );
  }
}