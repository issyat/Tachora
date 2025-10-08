import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";

import { prisma } from "@/lib/prisma";
import { ensureManager } from "@/server/manager";
import { timeDateToString } from "@/lib/time";
import { ensureIsoWeekId } from "@/lib/week";
import { validateAssignment } from "@/server/schedule/assignment-validator";
import type { Weekday } from "@/types";

interface AssignmentResponse {
  id: string;
  day: Weekday;
  startTime: string;
  endTime: string;
  role: string;
  locked: boolean;
  employee?: {
    id: string;
    name: string;
    color: string;
    storeName?: string;
  };
  sourceTemplate?: {
    id: string;
    role: string;
  };
}

export async function GET(request: Request) {
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
      include: {
        assignments: {
          include: {
            employee: {
              include: {
                store: true,
              },
            },
            sourceTemplate: true,
          },
          orderBy: [
            { day: 'asc' },
            { startTime: 'asc' },
          ],
        },
      },
    });

    if (!schedule) {
      return NextResponse.json({
        assignments: [],
        schedule: null,
      });
    }

    const assignments: AssignmentResponse[] = schedule.assignments.map((assignment) => ({
      id: assignment.id,
      day: assignment.day,
      startTime: timeDateToString(assignment.startTime, "09:00"),
      endTime: timeDateToString(assignment.endTime, "17:00"),
      role: assignment.role,
      locked: assignment.locked,
      employee: assignment.employee
        ? {
            id: assignment.employee.id,
            name: assignment.employee.name,
            color: assignment.employee.color,
            storeName:
              assignment.employee.storeId !== storeId
                ? assignment.employee.store.name
                : undefined,
          }
        : undefined,
      sourceTemplate: assignment.sourceTemplate
        ? {
            id: assignment.sourceTemplate.id,
            role: assignment.sourceTemplate.role,
          }
        : undefined,
    }));

    return NextResponse.json({
      assignments,
      schedule: {
        id: schedule.id,
        weekId: schedule.isoWeek,
        state: schedule.state,
        generatedAt: schedule.generatedAt,
      },
    });
  } catch (error) {
    console.error("Failed to fetch assignments:", error);
    return NextResponse.json(
      { error: "Failed to fetch assignments" },
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
    const { storeId, day, role, startTime, endTime, employeeId, sourceTemplateId, weekId } = body ?? {};

    if (!storeId || !day || !role || !startTime || !endTime || !employeeId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const clerkUser = await currentUser();
    const primaryEmail = clerkUser?.primaryEmailAddress?.emailAddress ??
      clerkUser?.emailAddresses?.[0]?.emailAddress ?? undefined;

    const manager = await ensureManager({ clerkId: userId, email: primaryEmail });

    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: {
        id: true,
        managerId: true,
        openingTime: true,
        closingTime: true,
      },
    });

    if (!store || store.managerId !== manager.id) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 });
    }

    const isoWeek = ensureIsoWeekId(weekId, new Date());

    const validation = await validateAssignment({
      managerId: manager.id,
      store,
      isoWeek,
      day,
      role,
      startTime,
      endTime,
      employeeId,
      sourceTemplateId,
    });

    if (!validation.ok) {
      console.error("Assignment validation failed:", {
        storeId,
        day,
        role,
        startTime,
        endTime,
        employeeId,
        sourceTemplateId,
        errors: validation.errors
      });
      return NextResponse.json({
        error: "Assignment validation failed",
        errors: validation.errors ?? [],
      }, { status: 422 });
    }

    const schedule = await prisma.schedule.upsert({
      where: {
        storeId_isoWeek: {
          storeId,
          isoWeek,
        },
      },
      update: {},
      create: {
        storeId,
        isoWeek,
        state: 'Draft',
      },
    });

    const assignment = await prisma.assignment.create({
      data: {
        scheduleId: schedule.id,
        day: day as Weekday,
        startTime: new Date(`1970-01-01T${startTime}:00Z`),
        endTime: new Date(`1970-01-01T${endTime}:00Z`),
        role,
        employeeId,
        sourceTemplateId: sourceTemplateId ?? validation.template?.id ?? null,
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

    const response: AssignmentResponse = {
      id: assignment.id,
      day: assignment.day,
      startTime: timeDateToString(assignment.startTime, startTime),
      endTime: timeDateToString(assignment.endTime, endTime),
      role: assignment.role,
      locked: assignment.locked,
      employee: assignment.employee
        ? {
            id: assignment.employee.id,
            name: assignment.employee.name,
            color: assignment.employee.color,
            storeName:
              assignment.employee.storeId !== storeId
                ? assignment.employee.store.name
                : undefined,
          }
        : undefined,
      sourceTemplate: assignment.sourceTemplate
        ? {
            id: assignment.sourceTemplate.id,
            role: assignment.sourceTemplate.role,
          }
        : undefined,
    };

    return NextResponse.json({
      success: true,
      assignment: response,
      schedule: {
        id: schedule.id,
        weekId: schedule.isoWeek,
      },
    });
  } catch (error) {
    console.error("Failed to create assignment:", error);
    return NextResponse.json(
      { error: "Failed to create assignment" },
      { status: 500 },
    );
  }
}