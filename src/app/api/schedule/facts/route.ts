import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { ensureManager } from "@/server/manager";

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const clerkUser = await currentUser();
    const primaryEmail =
      clerkUser?.primaryEmailAddress?.emailAddress ?? clerkUser?.emailAddresses?.[0]?.emailAddress ?? undefined;

    await ensureManager({ clerkId: userId, email: primaryEmail });

    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get("storeId");
    const weekId = searchParams.get("weekId");

    if (!storeId || !weekId) {
      return NextResponse.json({ error: "Store ID and Week ID are required" }, { status: 400 });
    }

    // For now, return empty facts since this is a placeholder
    const facts = {
      totalShifts: 0,
      totalHours: 0,
      employeeCount: 0,
      unassignedShifts: 0,
      coverage: {
        monday: 100,
        tuesday: 100,
        wednesday: 100,
        thursday: 100,
        friday: 100,
        saturday: 100,
        sunday: 100,
      },
      insights: [],
    };

    return NextResponse.json({ facts });
  } catch (error) {
    console.error("Error fetching schedule facts:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const clerkUser = await currentUser();
    const primaryEmail =
      clerkUser?.primaryEmailAddress?.emailAddress ?? clerkUser?.emailAddresses?.[0]?.emailAddress ?? undefined;

    await ensureManager({ clerkId: userId, email: primaryEmail });

    const body = await request.json();
    const { storeId, weekId, assignments } = body;

    if (!storeId || !weekId) {
      return NextResponse.json({ error: "Store ID and Week ID are required" }, { status: 400 });
    }

    // Calculate facts based on assignments
    const totalShifts = assignments?.length || 0;
    const totalHours = assignments?.reduce((sum: number, assignment: any) => {
      // Calculate hours from start/end time
      const start = new Date(`2000-01-01T${assignment.startTime}`);
      const end = new Date(`2000-01-01T${assignment.endTime}`);
      const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
      return sum + hours;
    }, 0) || 0;

    const employeeIds = new Set(assignments?.map((a: any) => a.employeeId).filter(Boolean));
    const employeeCount = employeeIds.size;

    const facts = {
      totalShifts,
      totalHours: Math.round(totalHours * 100) / 100,
      employeeCount,
      unassignedShifts: 0,
      coverage: {
        monday: 100,
        tuesday: 100,
        wednesday: 100,
        thursday: 100,
        friday: 100,
        saturday: 100,
        sunday: 100,
      },
      insights: [],
    };

    return NextResponse.json({ facts });
  } catch (error) {
    console.error("Error calculating schedule facts:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const clerkUser = await currentUser();
    const primaryEmail =
      clerkUser?.primaryEmailAddress?.emailAddress ?? clerkUser?.emailAddresses?.[0]?.emailAddress ?? undefined;

    await ensureManager({ clerkId: userId, email: primaryEmail });

    const body = await request.json();
    const { storeId, weekId, assignments } = body;

    if (!storeId || !weekId) {
      return NextResponse.json({ error: "Store ID and Week ID are required" }, { status: 400 });
    }

    // Analyze the provided assignments to generate facts
    const assignmentCount = assignments ? assignments.length : 0;
    const totalHours = assignments ? assignments.reduce((sum: number, assignment: any) => {
      // Calculate hours from start/end time (simplified)
      return sum + 8; // Assume 8 hours per shift for now
    }, 0) : 0;

    const facts = {
      totalShifts: assignmentCount,
      totalHours: totalHours,
      employeeCount: assignments ? new Set(assignments.map((a: any) => a.employeeId)).size : 0,
      unassignedShifts: 0,
      coverage: {
        monday: 100,
        tuesday: 100,
        wednesday: 100,
        thursday: 100,
        friday: 100,
        saturday: 100,
        sunday: 100,
      },
      insights: [
        assignmentCount > 0 ? `${assignmentCount} shifts scheduled` : "No shifts scheduled yet",
        totalHours > 0 ? `${totalHours} total hours planned` : "No hours planned yet"
      ].filter(Boolean),
    };

    return NextResponse.json({ facts });
  } catch (error) {
    console.error("Error processing schedule facts:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}