import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { Webhook } from 'svix';
import { prisma } from '@/lib/prisma';

// Clerk webhook event types
type ClerkWebhookEvent = {
  type: string;
  data: {
    id: string;
    email_addresses?: Array<{
      email_address: string;
      id: string;
    }>;
    [key: string]: any;
  };
};

export async function GET() {
  return NextResponse.json({
    message: 'Clerk webhook endpoint is ready',
    status: 'active',
    hasSecret: !!process.env.CLERK_WEBHOOK_SECRET,
    timestamp: new Date().toISOString()
  });
}

export async function POST(req: NextRequest) {
  console.log('🔔 CLERK WEBHOOK CALLED!');
  
  // Get the headers
  const headerPayload = headers();
  const svix_id = headerPayload.get("svix-id");
  const svix_timestamp = headerPayload.get("svix-timestamp");
  const svix_signature = headerPayload.get("svix-signature");

  console.log('Webhook headers:', { svix_id, svix_timestamp, svix_signature });
  console.log('CLERK_WEBHOOK_SECRET exists:', !!process.env.CLERK_WEBHOOK_SECRET);

  // If there are no headers, error out
  if (!svix_id || !svix_timestamp || !svix_signature) {
    console.log('❌ Missing svix headers');
    return new Response('Error occurred -- no svix headers', {
      status: 400
    });
  }

  // Get the body
  const payload = await req.json();
  const body = JSON.stringify(payload);

  // Create a new Svix instance with your secret.
  const wh = new Webhook(process.env.CLERK_WEBHOOK_SECRET || '');

  let evt: ClerkWebhookEvent;

  // Verify the payload with the headers
  try {
    evt = wh.verify(body, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    }) as ClerkWebhookEvent;
  } catch (err) {
    console.error('❌ Error verifying webhook:', err);
    console.log('Raw payload:', body);
    return new Response('Error occurred', {
      status: 400
    });
  }

  // Handle the webhook
  const eventType = evt.type;
  console.log(`Clerk webhook received: ${eventType} for user ${evt.data.id}`);

  try {
    switch (eventType) {
      case 'user.deleted':
        await handleUserDeleted(evt.data.id);
        break;
      
      case 'user.created':
        await handleUserCreated(evt.data);
        break;
        
      default:
        console.log(`Unhandled webhook event: ${eventType}`);
    }

    return NextResponse.json({ message: 'Webhook processed successfully' });
  } catch (error) {
    console.error(`Error processing webhook ${eventType}:`, error);
    return NextResponse.json(
      { error: 'Failed to process webhook' },
      { status: 500 }
    );
  }
}

/**
 * Handle user deletion from Clerk
 * This will cascade delete all user data from Supabase
 */
async function handleUserDeleted(clerkUserId: string) {
  console.log(`🗑️  Processing user deletion for Clerk ID: ${clerkUserId}`);

  try {
    // Find the user in our database
    const user = await prisma.user.findUnique({
      where: { clerkId: clerkUserId },
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
      console.log(`User with Clerk ID ${clerkUserId} not found in database`);
      return;
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
  } catch (error) {
    console.error(`❌ Failed to delete user data for ${clerkUserId}:`, error);
    throw error;
  }
}

/**
 * Handle user creation from Clerk
 * This ensures the user exists in our database
 */
async function handleUserCreated(userData: any) {
  console.log(`👤 Processing user creation for Clerk ID: ${userData.id}`);

  try {
    const email = userData.email_addresses?.[0]?.email_address;
    
    // Create or update user in our database
    await prisma.user.upsert({
      where: { clerkId: userData.id },
      update: {
        email: email,
      },
      create: {
        clerkId: userData.id,
        email: email,
        role: 'BIG_MANAGER',
        onboardingStep: 'STORE',
      },
    });

    console.log(`✅ User created/updated in database: ${email}`);
  } catch (error) {
    console.error(`❌ Failed to create user in database:`, error);
    throw error;
  }
}