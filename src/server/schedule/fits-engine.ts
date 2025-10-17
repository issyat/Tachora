import {
  DAY_TO_INDEX,
  MAX_DAILY_MINUTES,
  MIN_REST_MINUTES,
  MINUTES_PER_DAY,
  STUDENT_WEEKLY_LIMIT_MINUTES,
} from "@/lib/schedule/constants";
import type { Weekday } from "@/types";

export interface FitAvailability {
  day: Weekday;
  isOff: boolean;
  startMin: number;
  endMin: number;
}

export interface FitEmployeeProfile {
  id: string;
  name?: string;
  storeId: string;
  canWorkAcrossStores: boolean;
  contractType?: string | null;
  weeklyTargetMinutes: number;
  availability: Record<Weekday, FitAvailability>;
  workTypeIds: string[];
  workTypeNames: string[];
}

export interface FitShift {
  id: string;
  day: Weekday;
  startMin: number;
  endMin: number;
  workTypeId: string;
  workTypeName: string;
}

export interface FitAssignmentSegment {
  assignmentId: string;
  employeeId: string;
  day: Weekday;
  startMin: number;
  endMin: number;
}

export interface FitState {
  weeklyMinutes: number;
  dailyMinutes: Record<Weekday, number>;
  segments: FitAssignmentSegment[];
}

export interface FitCheckInput {
  storeId: string;
  employee: FitEmployeeProfile;
  shift: FitShift;
  state: FitState;
}

export interface FitCheckResult {
  fits: boolean;
  reasons: string[];
  warnings: string[];
}

export function determineTargetMinutes(employee: FitEmployeeProfile): number {
  const base = employee.weeklyTargetMinutes;
  if ((employee.contractType ?? "").toUpperCase() === "STUDENT") {
    return Math.min(base, STUDENT_WEEKLY_LIMIT_MINUTES);
  }
  return base;
}

export function buildEmptyState(): FitState {
  return {
    weeklyMinutes: 0,
    dailyMinutes: {
      MON: 0,
      TUE: 0,
      WED: 0,
      THU: 0,
      FRI: 0,
      SAT: 0,
      SUN: 0,
    },
    segments: [],
  };
}

export function buildStateFromAssignments(
  assignments: FitAssignmentSegment[],
  employeeId: string,
): FitState {
  const state = buildEmptyState();

  assignments
    .filter((segment) => segment.employeeId === employeeId)
    .forEach((segment) => {
      state.segments.push(segment);
      const duration = segment.endMin - segment.startMin;
      state.weeklyMinutes += duration;
      state.dailyMinutes[segment.day] = (state.dailyMinutes[segment.day] ?? 0) + duration;
    });

  return state;
}

export function computeFit({ storeId, employee, shift, state }: FitCheckInput): FitCheckResult {
  const reasons: string[] = [];
  const warnings: string[] = [];

  const slot = employee.availability[shift.day];
  if (!slot || slot.isOff) {
    reasons.push("availability:off");
  } else {
    if (shift.startMin < slot.startMin) {
      reasons.push("availability:before");
    }
    if (shift.endMin > slot.endMin) {
      reasons.push("availability:after");
    }
  }

  if (!employee.canWorkAcrossStores && employee.storeId !== storeId) {
    reasons.push("store:mismatch");
  }

  if (employee.workTypeIds.length > 0 || employee.workTypeNames.length > 0) {
    const matchesId = employee.workTypeIds.includes(shift.workTypeId);
    const matchesName = employee.workTypeNames
      .map((name) => name.toLowerCase())
      .includes(shift.workTypeName.toLowerCase());
    if (!matchesId && !matchesName) {
      reasons.push("role:mismatch");
    }
  }

  const duration = shift.endMin - shift.startMin;
  const target = determineTargetMinutes(employee);
  const weekly = state.weeklyMinutes + duration;
  const daily = (state.dailyMinutes[shift.day] ?? 0) + duration;

  if (weekly > target) {
    reasons.push("weekly:limit");
  } else if (target - weekly < 60) {
    warnings.push("weekly:close");
  }

  if (daily > MAX_DAILY_MINUTES) {
    reasons.push("daily:limit");
  } else if (MAX_DAILY_MINUTES - daily < 30) {
    warnings.push("daily:close");
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

  const restViolation = state.segments.some((segment) => {
    const otherAbsStart = DAY_TO_INDEX[segment.day] * MINUTES_PER_DAY + segment.startMin;
    const otherAbsEnd = DAY_TO_INDEX[segment.day] * MINUTES_PER_DAY + segment.endMin;
    const gapBefore = newAbsStart - otherAbsEnd;
    const gapAfter = otherAbsStart - newAbsEnd;
    return (gapBefore > 0 && gapBefore < MIN_REST_MINUTES) || (gapAfter > 0 && gapAfter < MIN_REST_MINUTES);
  });
  if (restViolation) {
    reasons.push("rest");
  }

  return {
    fits: reasons.length === 0,
    reasons,
    warnings,
  };
}
