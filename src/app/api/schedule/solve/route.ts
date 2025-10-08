import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";

import { prisma } from "@/lib/prisma";
import { timeDateToString, timeStringToDate } from "@/lib/time";
import { ensureManager } from "@/server/manager";

type SolvePayload = {
  storeId?: string;
  isoWeek?: string;
  slotSizeMinutes?: number;
  allowUncovered?: boolean;
};

type SolverAssignment = {
  shift_id: string;
  day: string;
  employee_id: string;
  start_minute: number;
  end_minute: number;
  locked: boolean;
};

type SolverResponse = {
  store_id: string;
  iso_week: string;
  assignments: SolverAssignment[];
  uncovered_segments: SolverAssignment[];
  metrics: {
    status: string;
    objective_value?: number;
    total_assigned_minutes: number;
    solver_wall_time_ms?: number;
    coverage_ratio: number;
  };
  infeasible_reason?: string | null;
};

const WEEKDAY_KEYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;
type DayKey = (typeof WEEKDAY_KEYS)[number];

function minutesToHHMM(minutes: number): string {
  const hours = Math.floor(minutes / 60)
    .toString()
    .padStart(2, "0");
  const mins = (minutes % 60)
    .toString()
    .padStart(2, "0");
  return `${hours}:${mins}`;
}

function dateToMinutes(date: Date | null): number {
  if (!date) return 0;
  const [hours, minutes] = timeDateToString(date).split(":");
  return parseInt(hours, 10) * 60 + parseInt(minutes, 10);
}

function getIsoWeekLabel(date = new Date()): string {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNr = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const weekNumber =
    1 + Math.round(((target.getTime() - firstThursday.getTime()) / 86400000 - 3) / 7);
  const year = target.getUTCFullYear();
  return `${year}-W${String(weekNumber).padStart(2, "0")}`;
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => ({}))) as SolvePayload;

  const clerkUser = await currentUser();
  const email =
    clerkUser?.primaryEmailAddress?.emailAddress ??
    clerkUser?.emailAddresses?.[0]?.emailAddress ??
    undefined;

  const manager = await ensureManager({ clerkId: userId, email });

  const store = payload.storeId
    ? await prisma.store.findFirst({
        where: { id: payload.storeId, managerId: manager.id },
      })
    : await prisma.store.findFirst({ where: { managerId: manager.id } });

  if (!store) {
    return NextResponse.json({ error: "Store not found" }, { status: 404 });
  }

  const isoWeek = payload.isoWeek ?? getIsoWeekLabel();

  const employees = await prisma.employee.findMany({
    where: { storeId: store.id },
    include: {
      availability: true,
      roles: { include: { workType: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  if (employees.length === 0) {
    return NextResponse.json({ error: "No employees to schedule" }, { status: 400 });
  }

  const shiftTemplates = await prisma.shiftTemplate.findMany({
    where: { storeId: store.id },
    include: { workType: true },
  });

  if (shiftTemplates.length === 0) {
    return NextResponse.json({ error: "No shift templates found" }, { status: 400 });
  }

  const shiftMap = new Map<string, { role: string; workTypeId: string | null; templateId: string; day: DayKey; startMinute: number; endMinute: number }>();

  const shifts = shiftTemplates.flatMap((template) => {
    const days = (template.days ?? {}) as Record<string, boolean>;
    const startMinutes = dateToMinutes(template.startTime);
    const endMinutes = dateToMinutes(template.endTime);

    return WEEKDAY_KEYS.filter((day) => days?.[day]).map((day) => {
      const shiftId = `${template.id}:${day}`;
      shiftMap.set(shiftId, {
        role: template.role,
        workTypeId: template.workTypeId ?? null,
        templateId: template.id,
        day,
        startMinute: startMinutes,
        endMinute: endMinutes,
      });
      return {
        id: shiftId,
        role: template.role,
        work_type_id: template.workTypeId ?? null,
        day,
        start_minute: startMinutes,
        end_minute: endMinutes,
      };
    });
  });

  const employeesPayload = employees.map((employee) => {
    const availability = employee.availability.map((slot) => {
      const hasTimes = Boolean(slot.startTime && slot.endTime);
      const startMinute = hasTimes ? dateToMinutes(slot.startTime) : 0;
      const endMinute = hasTimes ? dateToMinutes(slot.endTime) : 0;
      const hasValidRange = endMinute > startMinute;
      const isOff = (slot.isOff ?? false) || !hasTimes || !hasValidRange;

      return {
        day: slot.day as DayKey,
        is_off: isOff,
        start_minute: isOff ? 0 : startMinute,
        end_minute: isOff ? 0 : endMinute,
      };
    });

    const roleIds = Array.from(new Set([
      ...employee.roles.map((pivot) => pivot.workTypeId),
    ].filter(Boolean))) as string[];

    return {
      id: employee.id,
      name: employee.name,
      contract_type: employee.contractType ?? 'FULL_TIME',
      role_ids: roleIds,
      weekly_minutes_target: employee.weeklyMinutesTarget ?? 40 * 60,
      availability,
    };
  });

  let schedule = await prisma.schedule.findUnique({
    where: { storeId_isoWeek: { storeId: store.id, isoWeek } },
    include: { assignments: true },
  });

  if (!schedule) {
    schedule = await prisma.schedule.create({
      data: { storeId: store.id, isoWeek, state: "Draft" },
      include: { assignments: true },
    });
  }

  const lockedAssignments = (schedule.assignments ?? [])
    .filter((assignment) => assignment.locked && assignment.employeeId)
    .map((assignment) => {
      const shiftId = assignment.sourceTemplateId
        ? `${assignment.sourceTemplateId}:${assignment.day}`
        : thisShiftIdFromTimes(assignment);
      return {
        shiftId,
        employee_id: assignment.employeeId!,
        day: assignment.day as DayKey,
        start_minute: dateToMinutes(assignment.startTime),
        end_minute: dateToMinutes(assignment.endTime),
      };
    })
    .filter((lock) => shiftMap.has(lock.shiftId));

  const requestPayload = {
    store_id: store.id,
    iso_week: isoWeek,
    shifts,
    employees: employeesPayload,
    locked_assignments: lockedAssignments.map((locked) => ({
      shift_id: locked.shiftId,
      employee_id: locked.employee_id,
      day: locked.day,
      start_minute: locked.start_minute,
      end_minute: locked.end_minute,
    })),
    options: {
      slot_size_minutes: payload.slotSizeMinutes ?? 15,
      solver_time_limit_seconds: 15,
      allow_uncovered: payload.allowUncovered ?? false,
    },
  };

  const baseUrl = (process.env.SCHEDULER_SOLVER_URL ?? "http://localhost:8000").replace(/\/$/, "");

  if (process.env.NODE_ENV !== "production") {
    console.log("[solver] request employees", JSON.stringify(employeesPayload, null, 2));
  }

  const solverResponse = await fetch(`${baseUrl}/v1/solve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestPayload),
  });

  if (!solverResponse.ok) {
    const text = await solverResponse.text();
    let detailMessage = text;
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed?.detail === "string") {
        detailMessage = parsed.detail;
      } else if (Array.isArray(parsed?.detail)) {
        detailMessage = parsed.detail.map((d) => (typeof d === "string" ? d : JSON.stringify(d))).join("; ");
      }
    } catch (_) {
      // fall back to raw text
    }

    return NextResponse.json(
      { error: translateSolverError(detailMessage) },
      { status: 502 },
    );
  }

  const result = (await solverResponse.json()) as SolverResponse;

  await prisma.assignment.deleteMany({ where: { scheduleId: schedule.id, locked: false } });

  const assignmentsToCreate = result.assignments.filter((assignment) => !assignment.locked);

  if (assignmentsToCreate.length > 0) {
    const data = assignmentsToCreate.map((assignment) => {
      const shiftInfo = shiftMap.get(assignment.shift_id);
      const employeeInfo = employees.find((emp) => emp.id === assignment.employee_id);
      if (!shiftInfo || !employeeInfo) {
        throw new Error(`Unknown shift or employee in solver response: ${assignment.shift_id}`);
      }
      return {
        scheduleId: schedule!.id,
        day: shiftInfo.day,
        role: shiftInfo.role,
        startTime: timeStringToDate(minutesToHHMM(assignment.start_minute)),
        endTime: timeStringToDate(minutesToHHMM(assignment.end_minute)),
        employeeId: assignment.employee_id,
        sourceTemplateId: shiftInfo.templateId,
        locked: false,
      };
    });

    await prisma.assignment.createMany({ data });
  }

  const persistedAssignments = await prisma.assignment.findMany({
    where: { scheduleId: schedule.id },
    include: { employee: true, sourceTemplate: true },
  });

  const responseAssignments = persistedAssignments.map((assignment) => {
    const shiftId = assignment.sourceTemplateId
      ? `${assignment.sourceTemplateId}:${assignment.day}`
      : thisShiftIdFromTimes(assignment);
    const shiftMeta = shiftMap.get(shiftId);
    return {
      shiftId,
      day: assignment.day,
      role: assignment.role,
      workTypeId: shiftMeta?.workTypeId ?? null,
      startMinute: dateToMinutes(assignment.startTime),
      endMinute: dateToMinutes(assignment.endTime),
      employeeId: assignment.employeeId,
      employeeName: assignment.employee?.name ?? "",

      employeeColor: assignment.employee?.color ?? "#334155",
      locked: assignment.locked,
    };
  });
  return NextResponse.json({
    storeId: store.id,
    isoWeek,
    assignments: responseAssignments,
    uncovered: result.uncovered_segments,
    metrics: result.metrics,
  });
}

function thisShiftIdFromTimes(assignment: {
  sourceTemplateId: string | null;
  day: string;
  startTime: Date | null;
  endTime: Date | null;
}) {
  const start = minutesToHHMM(dateToMinutes(assignment.startTime));
  const end = minutesToHHMM(dateToMinutes(assignment.endTime));
  return `${assignment.sourceTemplateId ?? "shift"}:${assignment.day}:${start}-${end}`;
}
function minutesToLabel(minutes: number): string {
  const hrs = Math.floor(minutes / 60)
    .toString()
    .padStart(2, "0");
  const mins = (minutes % 60)
    .toString()
    .padStart(2, "0");
  return `${hrs}:${mins}`;
}

function formatDayLabel(day: string | undefined): string {
  if (!day) return "that day";
  return day.slice(0, 1) + day.slice(1).toLowerCase();
}

function translateSolverError(rawDetail: string): string {
  if (!rawDetail) {
    return "We couldn't generate a schedule. Please try again.";
  }

  const noEmployeeMatch = rawDetail.match(
    /shift=Shift\(id='([^']+)', role='([^']+)', day=<Weekday\.([^:]+): '[^']+'>, start_minute=(\d+), end_minute=(\d+)/,
  );

  if (noEmployeeMatch) {
    const [, , role, day, startStr, endStr] = noEmployeeMatch;
    const start = Number(startStr);
    const end = Number(endStr);
    return `No one is available to cover the ${formatDayLabel(day)} ${role} shift (${minutesToLabel(start)}–${minutesToLabel(end)}). Update availability or allow partial coverage.`;
  }

  if (/allow_uncovered=false/.test(rawDetail)) {
    return rawDetail.replace(
      /allow_uncovered=false/g,
      'allowing uncovered segments is turned off. You can enable it to fill the rest later.',
    );
  }

  return `Solver failed: ${rawDetail}`;
}

