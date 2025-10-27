import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { ensureManager } from "@/server/manager";
import { sendAvailabilityEmail } from "@/lib/email-service";
import crypto from "crypto";

function extractNameFromEmail(email: string): string {
  if (!email) return 'Manager';
  
  // Extract the part before @ and clean it up
  const localPart = email.split('@')[0];
  
  // Replace dots, underscores, numbers with spaces and capitalize
  const name = localPart
    .replace(/[._\d]/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
    .trim();
    
  return name || 'Manager';
}

export async function POST(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { storeId } = body;

    if (!storeId) {
      return NextResponse.json({ error: "Store ID is required" }, { status: 400 });
    }

    const clerkUser = await currentUser();
    const primaryEmail = clerkUser?.primaryEmailAddress?.emailAddress ??
      clerkUser?.emailAddresses?.[0]?.emailAddress ?? undefined;

    const manager = await ensureManager({ clerkId: userId, email: primaryEmail });

    // Verify the manager owns this store
    const store = await prisma.store.findUnique({
      where: { id: storeId },
      include: {
        manager: true, // Include manager information
        employees: {
          where: {
            contractType: {
              in: ['STUDENT', 'FLEXI_JOB']
            },
            email: {
              not: null
            }
          }
        }
      }
    });

    if (!store || store.managerId !== manager.id) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 });
    }

    const eligibleEmployees = store.employees;

    if (eligibleEmployees.length === 0) {
      return NextResponse.json({ 
        error: "No eligible employees found",
        details: "No Student or Flexi employees with email addresses found in this store."
      }, { status: 400 });
    }

    // Generate tokens and send emails to all eligible employees
    const tokens = [];
    const emailResults = [];
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days from now

    for (const employee of eligibleEmployees) {
      // Generate a secure random token
      const token = crypto.randomBytes(32).toString('hex');
      
      // Delete any existing tokens for this employee
      await prisma.availabilityToken.deleteMany({
        where: { employeeId: employee.id }
      });

      // Create new token
      const availabilityToken = await prisma.availabilityToken.create({
        data: {
          token,
          employeeId: employee.id,
          expiresAt
        }
      });

      const magicLink = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/availability?token=${token}`;

      // Send email to employee
      try {
        await sendAvailabilityEmail({
          employeeName: employee.name,
          employeeEmail: employee.email,
          magicLink,
          storeName: store.name,
          managerEmail: store.manager.email || manager.email || 'noreply@resend.dev',
          managerName: extractNameFromEmail(store.manager.email || manager.email || ''),
          expiresAt
        });

        emailResults.push({
          employeeId: employee.id,
          employeeName: employee.name,
          employeeEmail: employee.email,
          status: 'sent'
        });
      } catch (emailError) {
        console.error(`Failed to send email to ${employee.email}:`, emailError);
        emailResults.push({
          employeeId: employee.id,
          employeeName: employee.name,
          employeeEmail: employee.email,
          status: 'failed',
          error: emailError instanceof Error ? emailError.message : 'Unknown error'
        });
      }

      tokens.push({
        employeeId: employee.id,
        employeeName: employee.name,
        employeeEmail: employee.email,
        token: availabilityToken.token,
        magicLink,
        expiresAt
      });
    }

    const successCount = emailResults.filter(r => r.status === 'sent').length;
    const failedCount = emailResults.filter(r => r.status === 'failed').length;

    return NextResponse.json({
      success: true,
      message: `Sent availability requests to ${successCount} employees${failedCount > 0 ? ` (${failedCount} failed)` : ''}`,
      emailResults,
      tokens, // Keep for debugging/fallback
      store: {
        id: store.id,
        name: store.name
      }
    });

  } catch (error) {
    console.error("Failed to generate availability tokens:", error);
    return NextResponse.json(
      { error: "Failed to generate availability request links" },
      { status: 500 }
    );
  }
}