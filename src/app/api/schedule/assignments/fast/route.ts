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

    // Quick store ownership check
    const store = await prisma.store.findFirst({
      where: { id: storeId, managerId: manager.id },
      select: { id: true }
    });

    if (!store) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 });
    }

    const isoWeek = ensureIsoWeekId(weekId, new Date());

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

    // Check if the shift has a work type requirement
    let requiredWorkType = null;
    if (sourceTemplateId) {
      const template = await prisma.shiftTemplate.findUnique({
        where: { id: sourceTemplateId },
        include: { workType: true }
      });
      requiredWorkType = template?.workType;
    }

    // If there's a required work type, validate employee can perform it
    if (requiredWorkType) {
      const employeeWorkTypes = employee.roles.map(role => role.workType.id);
      if (!employeeWorkTypes.includes(requiredWorkType.id)) {
        const employeeWorkTypeNames = employee.roles.map(r => r.workType.name);
        return NextResponse.json({ 
          error: "Work Type Mismatch",
          code: "WORK_TYPE_MISMATCH",
          details: `${employee.name} cannot work as ${requiredWorkType.name}.`,
          suggestion: employeeWorkTypeNames.length > 0 
            ? `They can work as: ${employeeWorkTypeNames.join(', ')}`
            : `They have no work types assigned. Please assign work types in the Employees page.`
        }, { status: 422 });
      }
    }

    // Additional validation: if employee has work types but shift role doesn't match any
    if (employee.roles.length > 0) {
      const employeeWorkTypeNames = employee.roles.map(r => r.workType.name.toLowerCase());
      if (!employeeWorkTypeNames.includes(role.toLowerCase())) {
        return NextResponse.json({ 
          error: "Role Mismatch",
          code: "ROLE_MISMATCH", 
          details: `${employee.name} cannot work as ${role}.`,
          suggestion: `They can work as: ${employee.roles.map(r => r.workType.name).join(', ')}`
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
        role,
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
      },
    });

    const response: FastAssignmentResponse = {
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
    });
  } catch (error) {
    console.error("Fast assignment failed:", error);
    return NextResponse.json(
      { error: "Failed to create assignment" },
      { status: 500 },
    );
  }
}