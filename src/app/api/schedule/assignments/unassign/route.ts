import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { ensureManager } from "@/server/manager";
import { timeDateToString } from "@/lib/time";
import { ensureIsoWeekId } from "@/lib/week";
import { validateAssignment } from "@/server/schedule/assignment-validator";

export async function DELETE(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const assignmentId = searchParams.get('assignmentId');

    if (!assignmentId) {
      return NextResponse.json({ error: "Assignment ID is required" }, { status: 400 });
    }

    const clerkUser = await currentUser();
    const primaryEmail = clerkUser?.primaryEmailAddress?.emailAddress ??
      clerkUser?.emailAddresses?.[0]?.emailAddress ?? undefined;

    const manager = await ensureManager({ clerkId: userId, email: primaryEmail });

    const assignment = await prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: {
        schedule: {
          include: {
            store: true,
          },
        },
      },
    });

    if (!assignment) {
      return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
    }

    if (assignment.schedule.store.managerId !== manager.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await prisma.assignment.delete({
      where: { id: assignmentId },
    });

    return NextResponse.json({
      success: true,
      message: "Shift deleted successfully",
    });
  } catch (error) {
    console.error("Failed to unassign employee:", error);
    return NextResponse.json(
      { error: "Failed to unassign employee" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { assignmentId, employeeId } = body ?? {};

    if (!assignmentId || !employeeId) {
      return NextResponse.json({ error: "Assignment ID and Employee ID are required" }, { status: 400 });
    }

    const clerkUser = await currentUser();
    const primaryEmail = clerkUser?.primaryEmailAddress?.emailAddress ??
      clerkUser?.emailAddresses?.[0]?.emailAddress ?? undefined;

    const manager = await ensureManager({ clerkId: userId, email: primaryEmail });

    const assignment = await prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: {
        schedule: {
          include: {
            store: {
              select: {
                id: true,
                managerId: true,
                openingTime: true,
                closingTime: true,
              },
            },
          },
        },
        sourceTemplate: true,
      },
    });

    if (!assignment) {
      return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
    }

    if (assignment.schedule.store.managerId !== manager.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const isoWeek = ensureIsoWeekId(assignment.schedule.isoWeek, new Date());
    const startTime = timeDateToString(assignment.startTime, "09:00");
    const endTime = timeDateToString(assignment.endTime, "17:00");

    const validation = await validateAssignment({
      managerId: manager.id,
      store: assignment.schedule.store,
      isoWeek,
      day: assignment.day,
      role: assignment.role,
      startTime,
      endTime,
      employeeId,
      sourceTemplateId: assignment.sourceTemplateId,
      assignmentId: assignment.id,
    });

    if (!validation.ok) {
      return NextResponse.json({
        error: "Assignment validation failed",
        errors: validation.errors ?? [],
      }, { status: 422 });
    }

    const updated = await prisma.assignment.update({
      where: { id: assignmentId },
      data: {
        employeeId,
      },
      include: {
        employee: {
          include: {
            store: true,
          },
        },
        sourceTemplate: true,
      },
    });

    return NextResponse.json({
      success: true,
      assignment: {
        id: updated.id,
        day: updated.day,
        startTime,
        endTime,
        role: updated.role,
        locked: updated.locked,
        employee: updated.employee
          ? {
              id: updated.employee.id,
              name: updated.employee.name,
              color: updated.employee.color,
              storeName:
                updated.employee.storeId !== assignment.schedule.store.id
                  ? updated.employee.store.name
                  : undefined,
            }
          : undefined,
        sourceTemplate: updated.sourceTemplate
          ? {
              id: updated.sourceTemplate.id,
              role: updated.sourceTemplate.role,
            }
          : undefined,
      },
    });
  } catch (error) {
    console.error("Failed to assign employee:", error);
    return NextResponse.json(
      { error: "Failed to assign employee" },
      { status: 500 },
    );
  }
}
