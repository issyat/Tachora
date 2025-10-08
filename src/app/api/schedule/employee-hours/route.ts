import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { ensureIsoWeekId } from "@/lib/week";
import { ensureManager } from "@/server/manager";

interface EmployeeHoursResponse {
  employeeHours: Record<string, number>; // employeeId -> total minutes across all stores
}

export async function GET(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const weekId = searchParams.get('weekId');

    const clerkUser = await currentUser();
    const primaryEmail = clerkUser?.primaryEmailAddress?.emailAddress ?? 
                        clerkUser?.emailAddresses?.[0]?.emailAddress ?? undefined;

    const manager = await ensureManager({ clerkId: userId, email: primaryEmail });

    // Get current week if not specified
    const currentWeekId = ensureIsoWeekId(weekId, new Date());

    // Get all stores owned by this manager
    const stores = await prisma.store.findMany({
      where: { managerId: manager.id },
      select: { id: true }
    });

    const storeIds = stores.map(s => s.id);

    // Get all assignments across all manager's stores for this week
    const assignments = await prisma.assignment.findMany({
      where: {
        schedule: {
          storeId: { in: storeIds },
          isoWeek: currentWeekId,
        },
        employeeId: { not: null }, // Only assigned shifts
      },
      include: {
        employee: true,
      },
    });

    // Calculate total hours per employee across all stores
    const employeeHours: Record<string, number> = {};

    assignments.forEach(assignment => {
      if (assignment.employee) {
        const employeeId = assignment.employee.id;
        
        // Calculate shift duration in minutes
        const startTime = assignment.startTime;
        const endTime = assignment.endTime;
        
        // Use UTC time to avoid timezone issues since times are stored as UTC
        const startMinutes = startTime.getUTCHours() * 60 + startTime.getUTCMinutes();
        const endMinutes = endTime.getUTCHours() * 60 + endTime.getUTCMinutes();
        
        const shiftMinutes = endMinutes - startMinutes;
        
        // Add to employee's total
        employeeHours[employeeId] = (employeeHours[employeeId] || 0) + shiftMinutes;
      }
    });

    return NextResponse.json({
      employeeHours,
    } as EmployeeHoursResponse);

  } catch (error) {
    console.error("Failed to fetch employee hours:", error);
    return NextResponse.json(
      { error: "Failed to fetch employee hours" },
      { status: 500 }
    );
  }
}

