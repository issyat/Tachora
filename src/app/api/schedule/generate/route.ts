import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";

import { prisma } from "@/lib/prisma";
import { ensureManager } from "@/server/manager";
import type { Weekday } from "@/types";
import { ensureIsoWeekId } from "@/lib/week";
import { timeDateToString } from "@/lib/time";

const PYTHON_SOLVER_URL = process.env.PYTHON_SOLVER_URL || 'http://localhost:8000';

interface PythonSolverRequest {
  store_id: string;
  iso_week: string;
  employees: Array<{
    id: string;
    name: string;
    home_store_id: string;
    can_work_across_stores: boolean;
    contract_type: string | null;
    weekly_minutes_target: number;
    role_ids: string[];
    role_names: string[];
    availability: Array<{
      day: string;
      is_off: boolean;
      start_minute: number;
      end_minute: number;
    }>;
  }>;
  shifts: Array<{
    id: string;
    role: string;
    day: string;
    start_minute: number;
    end_minute: number;
    store_id: string;
    work_type_id?: string | null;
  }>;
  locked_assignments: Array<{
    shift_id: string;
    day: string;
    employee_id: string;
    start_minute: number;
    end_minute: number;
    slot: number;
  }>;
  options?: {
    slot_size_minutes?: number;
    solver_time_limit_seconds?: number;
    allow_uncovered?: boolean;
    stint_start_penalty?: number;
  };
}

interface PythonSolverResponse {
  store_id: string;
  iso_week: string;
  assignments: Array<{
    shift_id: string;
    day: string;
    employee_id: string;
    start_minute: number;
    end_minute: number;
    slot: number;
    locked: boolean;
  }>;
  metrics: {
    status: string;
    objective_value?: number;
    total_assigned_minutes: number;
    solver_wall_time_ms?: number;
    coverage_ratio: number;
  };
  infeasible_reason?: string;
  uncovered_segments?: Array<any>;
}

function timeToMinutes(date: Date): number {
  // Use UTC time to avoid timezone issues since times are stored as UTC
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}

function minutesToTime(minutes: number): Date {
  const date = new Date();
  date.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return date;
}

function templateShiftId(templateId: string, day: string): string {
  return `${templateId}::${day}`;
}

function extractTemplateId(shiftId: string): string {
  if (shiftId.includes('::')) {
    return shiftId.split('::')[0];
  }
  return shiftId.split('-')[0];
}

export async function POST(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { storeId, weekId } = body;

    if (!storeId) {
      return NextResponse.json({ error: "Store ID is required" }, { status: 400 });
    }

    const clerkUser = await currentUser();
    const primaryEmail = clerkUser?.primaryEmailAddress?.emailAddress ??
      clerkUser?.emailAddresses?.[0]?.emailAddress ?? undefined;

    const manager = await ensureManager({ clerkId: userId, email: primaryEmail });

    const store = await prisma.store.findUnique({
      where: { id: storeId },
      include: {
        employees: {
          include: {
            availability: true,
            roles: {
              include: { workType: true },
            },
          },
        },
        shiftTemplates: true,
      },
    });

    if (!store || store.managerId !== manager.id) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 });
    }

    const crossStoreEmployees = await prisma.employee.findMany({
      where: {
        canWorkAcrossStores: true,
        storeId: { not: storeId },
        store: { managerId: manager.id },
      },
      include: {
        availability: true,
        roles: {
          include: { workType: true },
        },
        store: true,
      },
    });

    const allEmployees = [...store.employees, ...crossStoreEmployees];

    const isoWeek = ensureIsoWeekId(weekId, new Date());

    const templateIndex = new Map(store.shiftTemplates.map((tpl) => [tpl.id, tpl] as const));

    const shifts: PythonSolverRequest['shifts'] = [];

    for (const template of store.shiftTemplates) {
      const days = (template.days as Record<string, boolean>) || {};
      const startMinute = timeToMinutes(template.startTime);
      const endMinute = timeToMinutes(template.endTime);

      for (const [day, isActive] of Object.entries(days)) {
        if (!isActive) continue;
        shifts.push({
          id: templateShiftId(template.id, day),
          role: template.role,
          day,
          start_minute: startMinute,
          end_minute: endMinute,
          store_id: storeId,
          work_type_id: template.workTypeId ?? null,
        });
      }
    }

    const employeesPayload: PythonSolverRequest['employees'] = allEmployees.map((emp) => {
      const roleIds = emp.roles.map((pivot) => pivot.workTypeId).filter(Boolean) as string[];
      const roleNames = emp.roles
        .map((pivot) => pivot.workType?.name?.toLowerCase())
        .filter((name): name is string => Boolean(name));

      return {
        id: emp.id,
        name: emp.name,
        home_store_id: emp.storeId,
        can_work_across_stores: emp.canWorkAcrossStores,
        contract_type: emp.contractType,
        weekly_minutes_target: emp.weeklyMinutesTarget,
        role_ids: roleIds,
        role_names: roleNames,
        availability: emp.availability.map((avail) => ({
          day: avail.day,
          is_off: avail.isOff,
          start_minute: avail.startTime ? timeToMinutes(avail.startTime) : 0,
          end_minute: avail.endTime ? timeToMinutes(avail.endTime) : 0,
        })),
      };
    });

    const existingSchedule = await prisma.schedule.findUnique({
      where: {
        storeId_isoWeek: {
          storeId,
          isoWeek,
        },
      },
      include: {
        assignments: true,
      },
    });

    const lockedAssignments: PythonSolverRequest['locked_assignments'] = existingSchedule
      ? existingSchedule.assignments
          .filter((assignment) => assignment.locked && assignment.employeeId)
          .map((assignment) => ({
            shift_id: templateShiftId(assignment.sourceTemplateId ?? assignment.id, assignment.day),
            day: assignment.day,
            employee_id: assignment.employeeId!,
            start_minute: timeToMinutes(assignment.startTime),
            end_minute: timeToMinutes(assignment.endTime),
            slot: 0,
          }))
      : [];

    const solverRequest: PythonSolverRequest = {
      store_id: storeId,
      iso_week: isoWeek,
      employees: employeesPayload,
      shifts,
      locked_assignments: lockedAssignments,
      options: {
        slot_size_minutes: 15,
        solver_time_limit_seconds: 15,  // Reduced for faster solving
        allow_uncovered: true,
        stint_start_penalty: 50,
      },
    };

    console.log(`Calling Python solver at ${PYTHON_SOLVER_URL}/v1/solve`);
    console.log(`Solving for ${shifts.length} shifts and ${employeesPayload.length} employees`);

    const pythonResponse = await fetch(`${PYTHON_SOLVER_URL}/v1/solve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(solverRequest),
      signal: AbortSignal.timeout(20000),  // 20 second timeout
    });

    if (!pythonResponse.ok) {
      const errorText = await pythonResponse.text();
      console.error('Python solver error:', errorText);

      let errorDetails = errorText;
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.detail) {
          errorDetails = errorJson.detail;
        }
      } catch {
        // keep original text
      }

      return NextResponse.json(
        {
          error: "Scheduling conflict detected",
          details: errorDetails,
          suggestion: "Try adjusting employee availability or shift times to resolve conflicts",
          solverUrl: PYTHON_SOLVER_URL,
        },
        { status: 422 },
      );
    }

    const solverResult: PythonSolverResponse = await pythonResponse.json();
    console.log(`Solver returned ${solverResult.assignments.length} assignments with ${(solverResult.metrics.coverage_ratio * 100).toFixed(1)}% coverage`);

    if (solverResult.infeasible_reason) {
      return NextResponse.json(
        {
          error: "No feasible schedule found",
          details: solverResult.infeasible_reason,
          metrics: solverResult.metrics,
        },
        { status: 400 },
      );
    }

    const schedule = await prisma.schedule.upsert({
      where: {
        storeId_isoWeek: {
          storeId,
          isoWeek,
        },
      },
      update: {
        generatedAt: new Date(),
      },
      create: {
        storeId,
        isoWeek,
        state: 'Draft',
        generatedAt: new Date(),
      },
    });

    await prisma.assignment.deleteMany({
      where: {
        scheduleId: schedule.id,
        locked: false,
      },
    });

    const createdAssignments: Array<{ id: string }> = [];

    for (const assignment of solverResult.assignments) {
      if (!assignment.employee_id) continue;
      if (assignment.locked) continue;

      const templateId = extractTemplateId(assignment.shift_id);
      const template = store.shiftTemplates.find((tpl) => tpl.id === templateId);
      
      if (!template) {
        console.error('Template not found for assignment:', assignment);
        continue;
      }

      try {
        const created = await prisma.assignment.create({
          data: {
            scheduleId: schedule.id,
            day: assignment.day as Weekday,
            // Use the original template times, not the solver's converted times
            startTime: template.startTime,
            endTime: template.endTime,
            role: template.role,
            employeeId: assignment.employee_id,
            sourceTemplateId: template.id,
          },
        });
        createdAssignments.push(created);
      } catch (assignmentError) {
        console.error('Failed to create assignment:', assignment, assignmentError);
      }
    }

    return NextResponse.json({
      success: true,
      schedule: {
        id: schedule.id,
        weekId: schedule.isoWeek,
        generatedAt: schedule.generatedAt,
      },
      assignments: createdAssignments.length,
      message: `Generated ${createdAssignments.length} assignments using Python CP-SAT solver`,
      solver: 'python-cpsat',
      metrics: solverResult.metrics,
    });
  } catch (error) {
    console.error("Schedule generation failed:", error);

    if (error instanceof TypeError && error.message.includes('fetch')) {
      return NextResponse.json(
        {
          error: "Python CP-SAT solver is not running. Please start the Python server.",
          details: `Failed to connect to ${PYTHON_SOLVER_URL}`,
          command: "cd services/scheduler && python -m uvicorn app.main:app --reload --port 8000",
        },
        { status: 503 },
      );
    }

    if (error instanceof Error && (error.name === 'TimeoutError' || error.message.includes('timeout'))) {
      return NextResponse.json(
        {
          error: "Schedule generation timed out",
          details: "The scheduling problem is too complex or the solver is overloaded. Try reducing the number of shifts or employees, or check if the Python solver is running properly.",
          suggestion: "Consider simplifying the schedule requirements or ensuring the Python solver has adequate resources.",
        },
        { status: 408 },
      );
    }

    return NextResponse.json(
      { error: "Failed to generate schedule" },
      { status: 500 },
    );
  }
}
