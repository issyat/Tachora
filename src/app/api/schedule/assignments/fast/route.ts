import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";

import { prisma } from "@/lib/prisma";
import { ensureManager } from "@/server/manager";
import { timeDateToString } from "@/lib/time";
import { ensureIsoWeekId } from "@/lib/week";
import type { Weekday } from "@/types";

interface FastAssignmentResponse {
  id: string;
  day: Weekday;
  startTime: string;
  endTime: string;
  workType: {
    id: string;
    name: string;
    color: string;
  };
  locked: boolean;
  employee?: {
    id: string;
    name: string;
    color: string;
    storeName?: string;
  };
  sourceTemplate?: {
    id: string;
    workTypeId: string;
  };
}

export async function POST(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { storeId, day, workTypeId, startTime, endTime, employeeId, sourceTemplateId, weekId } = body ?? {};

    if (!storeId || !day || !workTypeId || !startTime || !endTime || !employeeId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const clerkUser = await currentUser();
    const primaryEmail = clerkUser?.primaryEmailAddress?.emailAddress ??
      clerkUser?.emailAddresses?.[0]?.emailAddress ?? undefined;

    const manager = await ensureManager({ clerkId: userId, email: primaryEmail });

    // Quick store ownership check
    const store = await prisma.store.findFirst({
      where: { id: storeId, managerId: manager.id },
      select: { id: true }
    });

    if (!store) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 });
    }

    const isoWeek = ensureIsoWeekId(weekId, new Date());

    // Get the work type for this assignment
    const workType = await prisma.workType.findUnique({
      where: { id: workTypeId },
    });

    if (!workType) {
      return NextResponse.json({ error: "Work type not found" }, { status: 404 });
    }

    // Validate employee and work types
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: {
        roles: {
          include: {
            workType: true
          }
        }
      }
    });

    if (!employee) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    }

    // Check if employee can perform this work type
    if (employee.roles.length > 0) {
      const employeeWorkTypeIds = employee.roles.map(role => role.workType.id);
      const employeeWorkTypeNames = employee.roles.map(role => role.workType.name.toLowerCase());
      
      // For cross-store employees, validate by work type name instead of ID
      const canWorkByName = employeeWorkTypeNames.includes(workType.name.toLowerCase());
      const canWorkById = employeeWorkTypeIds.includes(workTypeId);
      
      if (!canWorkById && !canWorkByName) {
        const employeeWorkTypeDisplayNames = employee.roles.map(r => r.workType.name);
        return NextResponse.json({ 
          error: "Work Type Mismatch",
          code: "WORK_TYPE_MISMATCH",
          details: `${employee.name} cannot work as ${workType.name}.`,
          suggestion: employeeWorkTypeDisplayNames.length > 0 
            ? `They can work as: ${employeeWorkTypeDisplayNames.join(', ')}`
            : `They have no work types assigned. Please assign work types in the Employees page.`
        }, { status: 422 });
      }
    }

    // Create or get schedule
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

    // Create assignment
    const assignment = await prisma.assignment.create({
      data: {
        scheduleId: schedule.id,
        day: day as Weekday,
        startTime: new Date(`1970-01-01T${startTime}:00Z`),
        endTime: new Date(`1970-01-01T${endTime}:00Z`),
        workTypeId,
        employeeId,
        sourceTemplateId: sourceTemplateId || null,
      },
      include: {
        employee: {
          include: {
            store: true,
          },
        },
        sourceTemplate: true,
        workType: true,
      },
    });

    const response: FastAssignmentResponse = {
      id: assignment.id,
      day: assignment.day,
      startTime: timeDateToString(assignment.startTime, startTime),
      endTime: timeDateToString(assignment.endTime, endTime),
      workType: {
        id: assignment.workType.id,
        name: assignment.workType.name,
        color: assignment.workType.color || '#0f172a',
      },
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
            workTypeId: assignment.sourceTemplate.workTypeId,
          }
        : undefined,
    };

    return NextResponse.json({
      success: true,
      assignment: response,
    });
  } catch (error) {
    console.error("Fast assignment failed:", error);
    return NextResponse.json(
      { error: "Failed to create assignment" },
      { status: 500 },
    );
  }
}