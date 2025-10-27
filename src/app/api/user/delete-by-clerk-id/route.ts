import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function DELETE(req: NextRequest) {
  console.log('🗑️ Deleting user by Clerk ID (post-deletion cleanup)...');
  
  try {
    const { clerkId } = await req.json();
    
    if (!clerkId) {
      return NextResponse.json({ error: 'Clerk ID is required' }, { status: 400 });
    }

    console.log(`Cleaning up database for Clerk ID: ${clerkId}`);

    // Find the user in our database
    const user = await prisma.user.findUnique({
      where: { clerkId },
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
      console.log(`User with Clerk ID ${clerkId} not found in database`);
      return NextResponse.json({ message: 'User not found in database' });
    }

    console.log(`Found user: ${user.email} with ${user.stores.length} stores`);

    // Delete all user data
    for (const store of user.stores) {
      console.log(`Deleting store: ${store.name}`);
      
      // Delete in correct order to respect foreign keys
      await prisma.availabilityToken.deleteMany({
        where: { employee: { storeId: store.id } }
      });

      await prisma.assignment.deleteMany({
        where: { schedule: { storeId: store.id } }
      });

      await prisma.schedule.deleteMany({
        where: { storeId: store.id }
      });

      await prisma.availability.deleteMany({
        where: { employee: { storeId: store.id } }
      });

      await prisma.employeeWorkType.deleteMany({
        where: { employee: { storeId: store.id } }
      });

      await prisma.shiftTemplate.deleteMany({
        where: { storeId: store.id }
      });

      await prisma.employee.deleteMany({
        where: { storeId: store.id }
      });

      await prisma.workType.deleteMany({
        where: { storeId: store.id }
      });

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
      where: { thread: { userId: user.id } }
    });

    await prisma.advisorThread.deleteMany({
      where: { userId: user.id }
    });

    // Delete the user
    await prisma.user.delete({
      where: { id: user.id }
    });

    console.log(`✅ Successfully deleted all data for user: ${user.email}`);
    
    return NextResponse.json({ 
      message: 'User data deleted successfully',
      email: user.email,
      storesDeleted: user.stores.length 
    });

  } catch (error) {
    console.error('❌ Failed to delete user data:', error);
    return NextResponse.json(
      { error: 'Failed to delete user data' },
      { status: 500 }
    );
  }
}