import { timeDateToString } from "@/lib/time";
import {
  DAY_TO_INDEX,
  MAX_DAILY_MINUTES,
  MIN_REST_MINUTES,
  MINUTES_PER_DAY,
  STUDENT_WEEKLY_LIMIT_MINUTES,
  WEEKDAY_ORDER,
} from "@/lib/schedule/constants";
import { ensureIsoWeekId } from "@/lib/week";
import { prisma } from "@/lib/prisma";
import type { Store } from "@/generated/prisma";
import type {
  Availability,
  Employee as PrismaEmployee,
  EmployeeWorkType,
  ShiftTemplate,
  Weekday,
  WorkType,
} from "@/types";
import type {
  ClientAssignmentInput,
  ScheduleFacts,
  ScheduleFactsAvailabilitySnapshot,
  ScheduleFactsConflict,
  ScheduleFactsEmployee,
  ScheduleFactsOpenShift,
  ScheduleFactsSnapshot,
} from "@/types";
import { computeSnapshotVersion } from "./eval-query";
import { buildMinimalSnapshot } from "./minimal-snapshot";

type Minute = number;
type DaysConfig = Record<Weekday, boolean>;

interface NormalizedAssignment {
  id: string;
  day: Weekday;
  startMin: Minute;
  endMin: Minute;
  workTypeId: string;
  workTypeName: string;
  workTypeColor: string;
  employeeId?: string;
  employeeName?: string;
  employeeStoreName?: string;
  locked: boolean;
  sourceTemplateId?: string;
}

interface EmployeeSnapshot {
  id: string;
  name: string;
  storeId: string;
  storeName?: string;
  canWorkAcrossStores: boolean;
  contractType?: string | null;
  weeklyTargetMinutes: Minute;
  availability: Record<Weekday, ScheduleFactsAvailabilitySnapshot>;
  workTypeIds: string[];
  workTypeNames: string[];
}

interface EmployeeLoad extends PrismaEmployee {
  availability: Availability[];
  roles: Array<EmployeeWorkType & { workType: WorkType | null }>;
  store: Store;
}

interface ShiftTemplateLoad extends ShiftTemplate {
  workType: WorkType | null;
}

interface ScheduleFactsContext {
  store: Store;
  employees: EmployeeLoad[];
  crossStoreEmployees: EmployeeLoad[];
  shiftTemplates: ShiftTemplateLoad[];
  assignments: NormalizedAssignment[];
  isoWeek: string;
}

export interface BuildScheduleFactsParams {
  managerId: string;
  storeId: string;
  weekId?: string | null;
  assignmentsOverride?: ClientAssignmentInput[];
}

const DEFAULT_COLOR = "#0f172a";

function timeToMinutes(value: string): Minute {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) {
    return 0;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours * 60 + minutes;
}

function minutesToTime(value: Minute): string {
  const normalized = Math.max(0, value);
  const hours = Math.floor(normalized / 60)
    .toString()
    .padStart(2, "0");
  const minutes = (normalized % 60)
    .toString()
    .padStart(2, "0");
  return `${hours}:${minutes}`;
}

function normalizeAvailability(
  availability: Availability[],
  fallbackStart: string,
  fallbackEnd: string,
): Record<Weekday, ScheduleFactsAvailabilitySnapshot> {
  const map = new Map<Weekday, Availability>();
  availability.forEach((slot) => {
    map.set(slot.day, slot);
  });

  return WEEKDAY_ORDER.reduce<Record<Weekday, ScheduleFactsAvailabilitySnapshot>>((acc, day) => {
    const record = map.get(day);
    if (!record) {
      acc[day] = {
        day,
        isOff: true,
        start: fallbackStart,
        end: fallbackEnd,
        startMin: timeToMinutes(fallbackStart),
        endMin: timeToMinutes(fallbackEnd),
      };
      return acc;
    }

    const start = timeDateToString(record.startTime, fallbackStart);
    const end = timeDateToString(record.endTime, fallbackEnd);
    acc[day] = {
      day,
      isOff: record.isOff,
      start,
      end,
      startMin: timeToMinutes(start),
      endMin: timeToMinutes(end),
    };
    return acc;
  }, {} as Record<Weekday, ScheduleFactsAvailabilitySnapshot>);
}

function normalizeEmployees(store: Store, employees: EmployeeLoad[], crossStore: EmployeeLoad[]): EmployeeSnapshot[] {
  const combined = new Map<string, EmployeeLoad>();

  const register = (employee: EmployeeLoad) => {
    combined.set(employee.id, employee);
  };

  employees.forEach(register);
  crossStore.forEach(register);

  const fallbackStart = timeDateToString(store.openingTime, "09:00");
  const fallbackEnd = timeDateToString(store.closingTime, "22:00");

  return Array.from(combined.values()).map((employee) => {
    const availability = normalizeAvailability(employee.availability ?? [], fallbackStart, fallbackEnd);
    const workTypeIds = employee.roles
      .map((pivot) => pivot.workTypeId)
      .filter((id): id is string => Boolean(id));
    const workTypeNames = employee.roles
      .map((pivot) => pivot.workType?.name)
      .filter((name): name is string => Boolean(name))
      .map((name) => name.toLowerCase());

    return {
      id: employee.id,
      name: employee.name,
      storeId: employee.storeId,
      storeName: employee.store.name,
      canWorkAcrossStores: employee.canWorkAcrossStores,
      contractType: employee.contractType,
      weeklyTargetMinutes: employee.weeklyMinutesTarget ?? 40 * 60,
      availability,
      workTypeIds,
      workTypeNames,
    } satisfies EmployeeSnapshot;
  });
}

function normalizeAssignments(assignments: ClientAssignmentInput[] | NormalizedAssignment[], fallbackColor = DEFAULT_COLOR): NormalizedAssignment[] {
  if (!assignments.length) {
    return [];
  }

  if ("startMin" in assignments[0]) {
    return assignments as NormalizedAssignment[];
  }

  return (assignments as ClientAssignmentInput[]).map((assignment) => {
    const startMin = timeToMinutes(assignment.startTime);
    const endMin = timeToMinutes(assignment.endTime);
    return {
      id: assignment.id,
      day: assignment.day,
      startMin,
      endMin,
      workTypeId: assignment.workType.id,
      workTypeName: assignment.workType.name,
      workTypeColor: assignment.workType.color ?? fallbackColor,
      employeeId: assignment.employee?.id ?? undefined,
      employeeName: assignment.employee?.name ?? undefined,
      employeeStoreName: assignment.employee?.storeName ?? undefined,
      locked: Boolean(assignment.locked),
      sourceTemplateId: assignment.sourceTemplate?.id ?? undefined,
    };
  });
}

async function loadContext(params: BuildScheduleFactsParams, isoWeek: string): Promise<ScheduleFactsContext> {
  const store = await prisma.store.findFirst({
    where: {
      id: params.storeId,
      managerId: params.managerId,
    },
    include: {
      employees: {
        include: {
          availability: true,
          roles: {
            include: { workType: true },
          },
          store: true,
        },
      },
      shiftTemplates: {
        include: {
          workType: true,
        },
      },
    },
  });

  if (!store) {
    throw new Error("Store not found or access denied");
  }

  const crossStoreEmployees = await prisma.employee.findMany({
    where: {
      canWorkAcrossStores: true,
      storeId: { not: store.id },
      store: { managerId: params.managerId },
    },
    include: {
      availability: true,
      roles: {
        include: { workType: true },
      },
      store: true,
    },
  });

  let assignments: NormalizedAssignment[] = [];

  if (params.assignmentsOverride?.length) {
    assignments = normalizeAssignments(params.assignmentsOverride);
  } else {
    // Load assignments from this store's schedule
    const schedule = await prisma.schedule.findUnique({
      where: {
        storeId_isoWeek: {
          storeId: params.storeId,
          isoWeek,
        },
      },
      include: {
        assignments: {
          include: {
            employee: {
              select: {
                id: true,
                name: true,
                store: {
                  select: {
                    name: true,
                  },
                },
              },
            },
            workType: true,
          },
        },
      },
    });

    if (schedule) {
      assignments = schedule.assignments.map((assignment) => {
        const startMin = assignment.startTime.getUTCHours() * 60 + assignment.startTime.getUTCMinutes();
        const endMin = assignment.endTime.getUTCHours() * 60 + assignment.endTime.getUTCMinutes();
        return {
          id: assignment.id,
          day: assignment.day,
          startMin,
          endMin,
          workTypeId: assignment.workTypeId,
          workTypeName: assignment.workType.name,
          workTypeColor: assignment.workType.color ?? DEFAULT_COLOR,
          employeeId: assignment.employeeId ?? undefined,
          employeeName: assignment.employee?.name ?? undefined,
          employeeStoreName: assignment.employee?.store?.name ?? undefined,
          locked: assignment.locked,
          sourceTemplateId: assignment.sourceTemplateId ?? undefined,
        } satisfies NormalizedAssignment;
      });
    }

    // Load cross-store assignments for employees who can work across stores
    // This includes assignments from OTHER stores for cross-store employees who are in THIS store
    const allEmployeeIds = [
      ...store.employees.map(e => e.id),
      ...crossStoreEmployees.map(e => e.id),
    ];

    const crossStoreEmployeeIds = [
      ...store.employees.filter(e => e.canWorkAcrossStores).map(e => e.id),
      ...crossStoreEmployees.map(e => e.id), // already filtered for canWorkAcrossStores
    ];

    if (crossStoreEmployeeIds.length > 0) {
      // Fetch assignments from other stores for cross-store employees
      const otherStoreAssignments = await prisma.assignment.findMany({
        where: {
          schedule: {
            isoWeek,
            storeId: { not: params.storeId },
            store: { managerId: params.managerId },
          },
          employeeId: { in: crossStoreEmployeeIds },
        },
        include: {
          employee: {
            select: {
              id: true,
              name: true,
              store: {
                select: {
                  name: true,
                },
              },
            },
          },
          workType: true,
        },
      });

      // Add these cross-store assignments to our list
      const crossStoreNormalized = otherStoreAssignments.map((assignment) => {
        const startMin = assignment.startTime.getUTCHours() * 60 + assignment.startTime.getUTCMinutes();
        const endMin = assignment.endTime.getUTCHours() * 60 + assignment.endTime.getUTCMinutes();
        return {
          id: assignment.id,
          day: assignment.day,
          startMin,
          endMin,
          workTypeId: assignment.workTypeId,
          workTypeName: assignment.workType.name,
          workTypeColor: assignment.workType.color ?? DEFAULT_COLOR,
          employeeId: assignment.employeeId ?? undefined,
          employeeName: assignment.employee?.name ?? undefined,
          employeeStoreName: assignment.employee?.store?.name ?? undefined,
          locked: assignment.locked,
          sourceTemplateId: assignment.sourceTemplateId ?? undefined,
        } satisfies NormalizedAssignment;
      });

      assignments = [...assignments, ...crossStoreNormalized];
    }
  }

  return {
    store,
    employees: store.employees as EmployeeLoad[],
    crossStoreEmployees: crossStoreEmployees as EmployeeLoad[],
    shiftTemplates: store.shiftTemplates as ShiftTemplateLoad[],
    assignments,
    isoWeek,
  };
}

interface EmployeeWorkingState {
  weeklyMinutes: Minute;
  dailyMinutes: Record<Weekday, Minute>;
  segments: Array<{
    assignmentId: string;
    day: Weekday;
    startMin: Minute;
    endMin: Minute;
  }>;
  conflicts: string[];
}

function ensureWorkingState(): EmployeeWorkingState {
  return {
    weeklyMinutes: 0,
    dailyMinutes: WEEKDAY_ORDER.reduce<Record<Weekday, Minute>>((acc, day) => {
      acc[day] = 0;
      return acc;
    }, {} as Record<Weekday, Minute>),
    segments: [],
    conflicts: [],
  };
}

function addConflict(conflicts: ScheduleFactsConflict[], entry: ScheduleFactsConflict) {
  conflicts.push(entry);
}

function evaluateAssignmentAgainstAvailability(
  employee: EmployeeSnapshot,
  assignment: NormalizedAssignment,
  state: EmployeeWorkingState,
  conflicts: ScheduleFactsConflict[],
) {
  const slot = employee.availability[assignment.day];
  if (!slot) {
    state.conflicts.push(`${employee.name} has no availability recorded on ${assignment.day}.`);
    addConflict(conflicts, {
      type: "availability",
      employeeId: employee.id,
      assignmentId: assignment.id,
      message: `${employee.name} has no availability recorded on ${assignment.day}.`,
    });
    return;
  }

  if (slot.isOff) {
    const message = `${employee.name} is marked off on ${assignment.day}.`;
    state.conflicts.push(message);
    addConflict(conflicts, {
      type: "availability",
      employeeId: employee.id,
      assignmentId: assignment.id,
      message,
    });
    return;
  }

  if (assignment.startMin < slot.startMin) {
    const message = `${employee.name} starts before availability (${minutesToTime(assignment.startMin)} < ${slot.start}).`;
    state.conflicts.push(message);
    addConflict(conflicts, {
      type: "availability",
      employeeId: employee.id,
      assignmentId: assignment.id,
      message,
    });
  }

  if (assignment.endMin > slot.endMin) {
    const message = `${employee.name} ends after availability (${minutesToTime(assignment.endMin)} > ${slot.end}).`;
    state.conflicts.push(message);
    addConflict(conflicts, {
      type: "availability",
      employeeId: employee.id,
      assignmentId: assignment.id,
      message,
    });
  }
}

function evaluateAssignmentOverlap(
  employee: EmployeeSnapshot,
  assignment: NormalizedAssignment,
  state: EmployeeWorkingState,
  conflicts: ScheduleFactsConflict[],
) {
  const newAbsStart = DAY_TO_INDEX[assignment.day] * MINUTES_PER_DAY + assignment.startMin;
  const newAbsEnd = DAY_TO_INDEX[assignment.day] * MINUTES_PER_DAY + assignment.endMin;

  state.segments.forEach((segment) => {
    const otherAbsStart = DAY_TO_INDEX[segment.day] * MINUTES_PER_DAY + segment.startMin;
    const otherAbsEnd = DAY_TO_INDEX[segment.day] * MINUTES_PER_DAY + segment.endMin;

    const overlaps = !(newAbsEnd <= otherAbsStart || newAbsStart >= otherAbsEnd);
    if (overlaps && segment.day === assignment.day) {
      const message = `${employee.name} overlaps with another shift on ${assignment.day}.`;
      state.conflicts.push(message);
      addConflict(conflicts, {
        type: "overlap",
        employeeId: employee.id,
        assignmentId: assignment.id,
        message,
      });
    }

    const gapBefore = newAbsStart - otherAbsEnd;
    if (gapBefore > 0 && gapBefore < MIN_REST_MINUTES) {
      const message = `${employee.name} has less than ${MIN_REST_MINUTES / 60}h rest before this shift.`;
      state.conflicts.push(message);
      addConflict(conflicts, {
        type: "rest",
        employeeId: employee.id,
        assignmentId: assignment.id,
        message,
      });
    }

    const gapAfter = otherAbsStart - newAbsEnd;
    if (gapAfter > 0 && gapAfter < MIN_REST_MINUTES) {
      const message = `${employee.name} has less than ${MIN_REST_MINUTES / 60}h rest after this shift.`;
      state.conflicts.push(message);
      addConflict(conflicts, {
        type: "rest",
        employeeId: employee.id,
        assignmentId: assignment.id,
        message,
      });
    }
  });
}

function evaluateHoursLimits(
  employee: EmployeeSnapshot,
  assignment: NormalizedAssignment,
  state: EmployeeWorkingState,
  conflicts: ScheduleFactsConflict[],
) {
  const duration = assignment.endMin - assignment.startMin;
  const baseTarget = employee.weeklyTargetMinutes;
  const cappedTarget = employee.contractType === "STUDENT"
    ? Math.min(baseTarget, STUDENT_WEEKLY_LIMIT_MINUTES)
    : baseTarget;

  const newWeekly = state.weeklyMinutes + duration;
  const newDaily = state.dailyMinutes[assignment.day] + duration;

  if (newWeekly > cappedTarget) {
    const message = `${employee.name} exceeds weekly target by ${newWeekly - cappedTarget} minutes.`;
    state.conflicts.push(message);
    addConflict(conflicts, {
      type: "weekly-limit",
      employeeId: employee.id,
      assignmentId: assignment.id,
      message,
    });
  }

  if (newDaily > MAX_DAILY_MINUTES) {
    const message = `${employee.name} exceeds daily limit by ${newDaily - MAX_DAILY_MINUTES} minutes on ${assignment.day}.`;
    state.conflicts.push(message);
    addConflict(conflicts, {
      type: "daily-limit",
      employeeId: employee.id,
      assignmentId: assignment.id,
      message,
    });
  }

  state.weeklyMinutes = newWeekly;
  state.dailyMinutes[assignment.day] = newDaily;
  state.segments.push({
    assignmentId: assignment.id,
    day: assignment.day,
    startMin: assignment.startMin,
    endMin: assignment.endMin,
  });
}

function evaluateStoreRestriction(
  employee: EmployeeSnapshot,
  storeId: string,
  assignment: NormalizedAssignment,
  state: EmployeeWorkingState,
  conflicts: ScheduleFactsConflict[],
) {
  if (!employee.canWorkAcrossStores && employee.storeId !== storeId) {
    const message = `${employee.name} cannot work outside their home store.`;
    state.conflicts.push(message);
    addConflict(conflicts, {
      type: "store",
      employeeId: employee.id,
      assignmentId: assignment.id,
      message,
    });
  }
}

function buildEmployeeFacts(
  employees: EmployeeSnapshot[],
  assignments: NormalizedAssignment[],
  storeId: string,
  conflicts: ScheduleFactsConflict[],
): ScheduleFactsEmployee[] {
  const states = new Map<string, EmployeeWorkingState>();

  const ensureState = (employeeId: string) => {
    if (!states.has(employeeId)) {
      states.set(employeeId, ensureWorkingState());
    }
    return states.get(employeeId)!;
  };

  assignments.forEach((assignment) => {
    if (!assignment.employeeId) {
      return;
    }
    const employee = employees.find((item) => item.id === assignment.employeeId);
    if (!employee) {
      return;
    }
    const state = ensureState(employee.id);

    evaluateStoreRestriction(employee, storeId, assignment, state, conflicts);
    evaluateAssignmentAgainstAvailability(employee, assignment, state, conflicts);
    evaluateAssignmentOverlap(employee, assignment, state, conflicts);
    evaluateHoursLimits(employee, assignment, state, conflicts);
  });

  return employees.map<ScheduleFactsEmployee>((employee) => {
    const state = states.get(employee.id) ?? ensureWorkingState();
    const assignmentsForEmployee = assignments
      .filter((assignment) => assignment.employeeId === employee.id)
      .map((assignment) => ({
        id: assignment.id,
        day: assignment.day,
        start: minutesToTime(assignment.startMin),
        end: minutesToTime(assignment.endMin),
        workType: assignment.workTypeName,
      }));

    const target = employee.contractType === "STUDENT"
      ? Math.min(employee.weeklyTargetMinutes, STUDENT_WEEKLY_LIMIT_MINUTES)
      : employee.weeklyTargetMinutes;

    const targetDelta = state.weeklyMinutes - target;

    const availability = WEEKDAY_ORDER.map((day) => employee.availability[day]);

    return {
      id: employee.id,
      name: employee.name,
      storeId: employee.storeId,
      storeName: employee.storeName,
      weeklyMinutes: state.weeklyMinutes,
      targetMinutes: target,
      targetDelta,
      contractType: employee.contractType,
      availability,
      dailyMinutes: WEEKDAY_ORDER.reduce<Partial<Record<Weekday, Minute>>>((acc, day) => {
        const value = state.dailyMinutes[day];
        if (value > 0) {
          acc[day] = value;
        }
        return acc;
      }, {}),
      assignments: assignmentsForEmployee,
      conflicts: state.conflicts,
    };
  });
}

interface CandidateEvaluationResult {
  ok: boolean;
  reasons: string[];
  warnings: string[];
}

function evaluateCandidate(
  employee: EmployeeSnapshot,
  state: EmployeeWorkingState,
  shift: NormalizedAssignment,
  storeId: string,
): CandidateEvaluationResult {
  const reasons: string[] = [];
  const warnings: string[] = [];

  const slot = employee.availability[shift.day];
  if (!slot || slot.isOff) {
    reasons.push("off");
  } else {
    if (shift.startMin < slot.startMin) {
      reasons.push("before-availability");
    }
    if (shift.endMin > slot.endMin) {
      reasons.push("after-availability");
    }
  }

  if (!employee.canWorkAcrossStores && employee.storeId !== storeId) {
    reasons.push("store");
  }

  if (employee.workTypeIds.length > 0) {
    const matchesId = employee.workTypeIds.includes(shift.workTypeId);
    const matchesName = employee.workTypeNames.includes(shift.workTypeName.toLowerCase());
    if (!matchesId && !matchesName) {
      reasons.push("work-type");
    }
  }

  const duration = shift.endMin - shift.startMin;
  const baseTarget = employee.weeklyTargetMinutes;
  const target = employee.contractType === "STUDENT"
    ? Math.min(baseTarget, STUDENT_WEEKLY_LIMIT_MINUTES)
    : baseTarget;

  const weekly = state.weeklyMinutes + duration;
  const daily = state.dailyMinutes[shift.day] + duration;

  if (weekly > target) {
    reasons.push("weekly-limit");
  } else if (target - weekly < 60) {
    warnings.push("close-to-weekly-limit");
  }

  if (daily > MAX_DAILY_MINUTES) {
    reasons.push("daily-limit");
  } else if (MAX_DAILY_MINUTES - daily < 30) {
    warnings.push("dense-day");
  }

  const newAbsStart = DAY_TO_INDEX[shift.day] * MINUTES_PER_DAY + shift.startMin;
  const newAbsEnd = DAY_TO_INDEX[shift.day] * MINUTES_PER_DAY + shift.endMin;

  const overlap = state.segments.some((segment) => {
    const otherAbsStart = DAY_TO_INDEX[segment.day] * MINUTES_PER_DAY + segment.startMin;
    const otherAbsEnd = DAY_TO_INDEX[segment.day] * MINUTES_PER_DAY + segment.endMin;
    return !(newAbsEnd <= otherAbsStart || newAbsStart >= otherAbsEnd);
  });
  if (overlap) {
    reasons.push("overlap");
  }

  const violatesRest = state.segments.some((segment) => {
    const otherAbsStart = DAY_TO_INDEX[segment.day] * MINUTES_PER_DAY + segment.startMin;
    const otherAbsEnd = DAY_TO_INDEX[segment.day] * MINUTES_PER_DAY + segment.endMin;
    const gapBefore = newAbsStart - otherAbsEnd;
    const gapAfter = otherAbsStart - newAbsEnd;
    return (gapBefore > 0 && gapBefore < MIN_REST_MINUTES) || (gapAfter > 0 && gapAfter < MIN_REST_MINUTES);
  });
  if (violatesRest) {
    reasons.push("rest");
  }

  return {
    ok: reasons.length === 0,
    reasons,
    warnings,
  };
}

function buildCandidateStates(employees: EmployeeSnapshot[], assignments: NormalizedAssignment[]): Map<string, EmployeeWorkingState> {
  const states = new Map<string, EmployeeWorkingState>();

  employees.forEach((employee) => {
    states.set(employee.id, ensureWorkingState());
  });

  assignments.forEach((assignment) => {
    if (!assignment.employeeId) {
      return;
    }
    const state = states.get(assignment.employeeId);
    if (!state) {
      return;
    }
    const duration = assignment.endMin - assignment.startMin;
    state.weeklyMinutes += duration;
    state.dailyMinutes[assignment.day] += duration;
    state.segments.push({
      assignmentId: assignment.id,
      day: assignment.day,
      startMin: assignment.startMin,
      endMin: assignment.endMin,
    });
  });

  return states;
}

function parseDaysConfig(value: unknown): Partial<DaysConfig> {
  if (!value || typeof value !== "object") {
    return {};
  }

  const record = value as Record<string, unknown>;
  return WEEKDAY_ORDER.reduce<Partial<DaysConfig>>((acc, day) => {
    const entry = record[day];
    if (typeof entry === "boolean") {
      acc[day] = entry;
    }
    return acc;
  }, {});
}

function expandShiftTemplates(
  templates: ShiftTemplateLoad[],
  assignments: NormalizedAssignment[],
): NormalizedAssignment[] {
  if (!templates.length) {
    return [];
  }

  const seenKeys = new Set<string>();

  assignments.forEach((assignment) => {
    if (assignment.sourceTemplateId) {
      const key = `${assignment.sourceTemplateId}:${assignment.day}:${assignment.startMin}:${assignment.endMin}`;
      seenKeys.add(key);
    } else {
      const key = `direct:${assignment.day}:${assignment.startMin}:${assignment.endMin}:${assignment.workTypeId}`;
      seenKeys.add(key);
    }
  });

  const fallbackAssignments: NormalizedAssignment[] = [];

  templates.forEach((template) => {
    const daysConfig = parseDaysConfig(template.days);
    if (!daysConfig) {
      return;
    }

    const workTypeName = template.workType?.name ?? "Unassigned";
    const workTypeColor = template.workType?.color ?? DEFAULT_COLOR;
    const startMin = template.startTime.getUTCHours() * 60 + template.startTime.getUTCMinutes();
    const endMin = template.endTime.getUTCHours() * 60 + template.endTime.getUTCMinutes();

    WEEKDAY_ORDER.forEach((day) => {
      if (!daysConfig[day]) {
        return;
      }

      const templateKey = `${template.id}:${day}:${startMin}:${endMin}`;
      const directKey = `direct:${day}:${startMin}:${endMin}:${template.workTypeId}`;

      if (seenKeys.has(templateKey) || seenKeys.has(directKey)) {
        return;
      }

      seenKeys.add(templateKey);

      fallbackAssignments.push({
        id: `template-${template.id}-${day}`,
        day,
        startMin,
        endMin,
        workTypeId: template.workTypeId,
        workTypeName,
        workTypeColor,
        employeeId: undefined,
        employeeName: undefined,
        employeeStoreName: undefined,
        locked: false,
        sourceTemplateId: template.id,
      });
    });
  });

  return fallbackAssignments;
}

function buildSnapshot(
  context: ScheduleFactsContext,
  employees: EmployeeSnapshot[],
  assignments: NormalizedAssignment[],
  generatedAt: string,
): ScheduleFactsSnapshot {
  const base: Omit<ScheduleFactsSnapshot, "version"> = {
    store: {
      id: context.store.id,
      name: context.store.name,
      city: context.store.city,
      country: context.store.country,
    },
    isoWeek: context.isoWeek,
    generatedAt,
    assignments: assignments.map((assignment) => ({
      id: assignment.id,
      day: assignment.day,
      start: minutesToTime(assignment.startMin),
      end: minutesToTime(assignment.endMin),
      workTypeId: assignment.workTypeId,
      workTypeName: assignment.workTypeName,
      employeeId: assignment.employeeId,
      employeeName: assignment.employeeName,
      sourceTemplateId: assignment.sourceTemplateId,
      locked: assignment.locked,
    })),
    employees: employees.map((employee) => ({
      id: employee.id,
      name: employee.name,
      storeId: employee.storeId,
      contractType: employee.contractType ?? null,
      weeklyMinutesTarget: employee.weeklyTargetMinutes,
      canWorkAcrossStores: employee.canWorkAcrossStores,
      workTypeIds: employee.workTypeIds,
      availability: WEEKDAY_ORDER.map((day) => {
        const slot = employee.availability[day];
        return {
          day,
          isOff: slot?.isOff ?? true,
          start: slot && !slot.isOff ? slot.start : null,
          end: slot && !slot.isOff ? slot.end : null,
        };
      }),
    })),
    templates: context.shiftTemplates.map((template) => {
      const days = parseDaysConfig(template.days);
      return {
        id: template.id,
        workTypeId: template.workTypeId,
        workTypeName: template.workType?.name ?? "",
        days,
        start: timeDateToString(template.startTime, "00:00"),
        end: timeDateToString(template.endTime, "00:00"),
      };
    }),
  };

  const version = computeSnapshotVersion(base);
  return { version, ...base } satisfies ScheduleFactsSnapshot;
}

function buildOpenShiftFacts(
  storeId: string,
  assignments: NormalizedAssignment[],
  employees: EmployeeSnapshot[],
): ScheduleFactsOpenShift[] {
  const openAssignments = assignments.filter((assignment) => !assignment.employeeId);
  if (openAssignments.length === 0) {
    return [];
  }

  const candidateStates = buildCandidateStates(employees, assignments);

  return openAssignments.map<ScheduleFactsOpenShift>((assignment) => {
    const candidates: ScheduleFactsOpenShift["candidates"] = [];

    employees.forEach((employee) => {
      const state = candidateStates.get(employee.id) ?? ensureWorkingState();
      const evaluation = evaluateCandidate(employee, state, assignment, storeId);
      if (evaluation.ok) {
        const duration = assignment.endMin - assignment.startMin;
        const baseTarget = employee.weeklyTargetMinutes;
        const target = employee.contractType === "STUDENT"
          ? Math.min(baseTarget, STUDENT_WEEKLY_LIMIT_MINUTES)
          : baseTarget;
        const remaining = Math.max(0, target - (state.weeklyMinutes + duration));
        candidates.push({
          id: employee.id,
          name: employee.name,
          remainingWeeklyMinutes: remaining,
          warnings: evaluation.warnings,
        });
      }
    });

    candidates.sort((a, b) => b.remainingWeeklyMinutes - a.remainingWeeklyMinutes);

    return {
      id: assignment.id,
      day: assignment.day,
      start: minutesToTime(assignment.startMin),
      end: minutesToTime(assignment.endMin),
      workTypeId: assignment.workTypeId,
      workTypeName: assignment.workTypeName,
      workTypeColor: assignment.workTypeColor,
      sourceTemplateId: assignment.sourceTemplateId,
      reasons: assignment.locked ? ["locked"] : [],
      candidates: candidates.slice(0, 8),
    };
  });
}

export async function buildScheduleFacts(params: BuildScheduleFactsParams): Promise<ScheduleFacts> {
  const isoWeek = ensureIsoWeekId(params.weekId, new Date());

  const context = await loadContext(params, isoWeek);
  const employees = normalizeEmployees(context.store, context.employees, context.crossStoreEmployees);

  const templateFallback = expandShiftTemplates(context.shiftTemplates, context.assignments);
  const allAssignments = templateFallback.length
    ? [...context.assignments, ...templateFallback]
    : context.assignments;

  const conflicts: ScheduleFacts["conflicts"] = [];
  const employeeFacts = buildEmployeeFacts(employees, allAssignments, context.store.id, conflicts);
  const openShifts = buildOpenShiftFacts(context.store.id, allAssignments, employees);

  const assignedCount = allAssignments.filter((assignment) => Boolean(assignment.employeeId)).length;
  const unassignedCount = allAssignments.length - assignedCount;
  const generatedAt = new Date().toISOString();
  const snapshot = buildSnapshot(context, employees, allAssignments, generatedAt);

  const scheduleFacts: ScheduleFacts = {
    meta: {
      storeId: context.store.id,
      storeName: context.store.name,
      weekId: context.isoWeek,
      generatedAt,
      timezone: "UTC",
    },
    totals: {
      assignments: allAssignments.length,
      assigned: assignedCount,
      unassigned: unassignedCount,
      employees: employees.length,
    },
    employees: employeeFacts,
    openShifts,
    conflicts,
    snapshot,
  };

  // Build minimal snapshot for LLM
  const minimalSnapshot = buildMinimalSnapshot(scheduleFacts);
  scheduleFacts.minimalSnapshot = minimalSnapshot;

  return scheduleFacts;
}
