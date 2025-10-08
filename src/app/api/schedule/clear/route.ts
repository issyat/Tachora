import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { ensureManager } from "@/server/manager";
import { ensureIsoWeekId } from "@/lib/week";

export async function DELETE(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get('storeId');
    const weekId = searchParams.get('weekId');

    if (!storeId) {
      return NextResponse.json({ error: "Store ID is required" }, { status: 400 });
    }

    const clerkUser = await currentUser();
    const primaryEmail = clerkUser?.primaryEmailAddress?.emailAddress ??
      clerkUser?.emailAddresses?.[0]?.emailAddress ?? undefined;

    const manager = await ensureManager({ clerkId: userId, email: primaryEmail });

    const store = await prisma.store.findUnique({
      where: { id: storeId },
    });

    if (!store || store.managerId !== manager.id) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 });
    }

    const isoWeek = ensureIsoWeekId(weekId, new Date());

    const schedule = await prisma.schedule.findUnique({
      where: {
        storeId_isoWeek: {
          storeId,
          isoWeek,
        },
      },
    });

    if (!schedule) {
      return NextResponse.json({
        success: true,
        message: "No schedule found to clear",
        deletedCount: 0,
      });
    }

    // Delete all assignments for this schedule
    const deleteResult = await prisma.assignment.deleteMany({
      where: {
        scheduleId: schedule.id,
      },
    });

    // Optionally delete the schedule itself if it has no assignments
    await prisma.schedule.delete({
      where: { id: schedule.id },
    });

    return NextResponse.json({
      success: true,
      message: `Cleared ${deleteResult.count} assignments from schedule`,
      deletedCount: deleteResult.count,
    });
  } catch (error) {
    console.error("Failed to clear schedule:", error);
    return NextResponse.json(
      { error: "Failed to clear schedule" },
      { status: 500 },
    );
  }
}