/**
 * Constraint Checker for Preview Operations
 * 
 * Validates operations against scheduling rules before applying.
 * Returns structured validation results with blockers and warnings.
 */

import type { Weekday } from '@/types';
import { MIN_REST_MINUTES } from '@/lib/schedule/constants';
import type { AssignShiftOp, SwapShiftsOp } from '@/types/preview';
import {
  computeFit,
  determineTargetMinutes,
  buildEmptyState,
  type FitAvailability,
  type FitEmployeeProfile,
  type FitShift,
  type FitState,
  type FitAssignmentSegment,
} from '../schedule/fits-engine';

interface MinimalSnapshot {
  scheduleId: string;
  version: string;
  shifts: Array<{
    id: string;
    templateId: string;
    day: Weekday;
    start: string;
    end: string;
    startTime: Date;
    endTime: Date;
    workTypeName: string;
    workTypeId: string;
    capacity: number;
  }>;
  assignments: Array<{
    id: string;
    shiftId: string;
    employeeId: string | null;
    day: Weekday;
    start: string;
    end: string;
    durationMins: number;
    workTypeId: string;
    workTypeName: string;
  }>;
  employees: Array<{
    id: string;
    name: string;
    alias?: string;
    storeId: string;
    canWorkAcrossStores: boolean;
    contractType: string | null;
    weeklyMinutes: number;
    weeklyMinutesTarget: number;
    workTypeIds: string[];
    workTypeNames: string[];
    availability?: Array<{
      day: Weekday;
      isOff: boolean;
      startTime?: string; // HH:mm format
      endTime?: string;   // HH:mm format
    }>;
  }>;
}

export interface ConstraintCheckResult {
  checked: string[];
  warnings: string[];
  blockers: string[];
}

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Check constraints for assign_shift operation
 */
export function checkAssignConstraints(
  op: AssignShiftOp,
  snapshot: MinimalSnapshot
): ConstraintCheckResult {
  const checked: string[] = [];
  const warningSet = new Set<string>();
  const blockerSet = new Set<string>();

  const resolved = resolveShift(op, snapshot);
  if (!resolved) {
    blockerSet.add(`Shift ${op.shiftId} not found`);
    return {
      checked,
      warnings: Array.from(warningSet),
      blockers: Array.from(blockerSet),
    };
  }

  checked.push('shift_lookup');

  const employeeRecord = snapshot.employees.find((e) => e.id === op.employeeId);
  if (!employeeRecord) {
    blockerSet.add(`Employee ${op.employeeId} not found`);
    return {
      checked,
      warnings: Array.from(warningSet),
      blockers: Array.from(blockerSet),
    };
  }

  const profile = toFitProfile(employeeRecord);
  const states = buildEmployeeStates(snapshot);
  const state = states.get(profile.id) ?? buildEmptyState();

  if (
    resolved.assignment &&
    resolved.assignment.employeeId &&
    resolved.assignment.employeeId !== op.employeeId
  ) {
    blockerSet.add(`Shift ${op.shiftId} is already assigned to another employee`);
  }

  checked.push('shift_open');

  const targetMinutes = determineTargetMinutes(profile);
  const duration = resolved.shift.endMin - resolved.shift.startMin;

  const fitResult = computeFit({
    storeId: op.storeId,
    employee: profile,
    shift: resolved.shift,
    state,
  });

  checked.push('availability');
  checked.push('role');
  checked.push('overlap');
  checked.push('weekly_limit');
  checked.push('daily_limit');
  checked.push('rest_time');

  if (!fitResult.fits) {
    const availability = profile.availability[resolved.shift.day];
    fitResult.reasons.forEach((reason) => {
      const message = formatBlockerMessage(reason, {
        profile,
        shift: resolved.shift,
        availability,
        state,
        targetMinutes,
        duration,
      });
      if (message) {
        blockerSet.add(message);
      }
    });
  }

  fitResult.warnings.forEach((warning) => {
    const message = formatWarningMessage(warning, {
      profile,
      shift: resolved.shift,
      state,
      targetMinutes,
      duration,
    });
    if (message) {
      warningSet.add(message);
    }
  });

  return {
    checked: Array.from(new Set(checked)),
    warnings: Array.from(warningSet),
    blockers: Array.from(blockerSet),
  };
}

/**
 * Check constraints for swap_shifts operation
 */
export function checkSwapConstraints(
  op: SwapShiftsOp,
  snapshot: MinimalSnapshot
): ConstraintCheckResult {
  const checked: string[] = [];
  const warnings: string[] = [];
  const blockers: string[] = [];

  // Find assignments and employees
  const assignment1 = snapshot.assignments.find(a => a.id === op.assignment1Id);
  const assignment2 = snapshot.assignments.find(a => a.id === op.assignment2Id);

  if (!assignment1 || !assignment2) {
    blockers.push('One or both assignments not found');
    return { checked, warnings, blockers };
  }

  // Check constraints for each swap direction
  // Employee 1 → Assignment 2
  const mockOp1: AssignShiftOp = {
    type: 'assign_shift',
    storeId: op.storeId,
    weekId: op.weekId,
    shiftId: assignment2.shiftId,
    employeeId: op.employee1Id,
    timestamp: op.timestamp,
    source: op.source,
  };

  const check1 = checkAssignConstraints(mockOp1, snapshot);
  
  // Employee 2 → Assignment 1
  const mockOp2: AssignShiftOp = {
    type: 'assign_shift',
    storeId: op.storeId,
    weekId: op.weekId,
    shiftId: assignment1.shiftId,
    employeeId: op.employee2Id,
    timestamp: op.timestamp,
    source: op.source,
  };

  const check2 = checkAssignConstraints(mockOp2, snapshot);

  // Combine results
  checked.push('swap_validation');
  blockers.push(...check1.blockers, ...check2.blockers);
  warnings.push(...check1.warnings, ...check2.warnings);

  return { checked, warnings, blockers };
}

interface FormatBlockerContext {
  profile: FitEmployeeProfile;
  shift: FitShift;
  availability: FitAvailability;
  state: FitState;
  targetMinutes: number;
  duration: number;
}

interface FormatWarningContext {
  profile: FitEmployeeProfile;
  shift: FitShift;
  state: FitState;
  targetMinutes: number;
  duration: number;
}

interface ResolvedShift {
  shift: FitShift;
  assignment?: MinimalSnapshot['assignments'][number];
}

function formatBlockerMessage(code: string, context: FormatBlockerContext): string | null {
  const { profile, shift, availability, state, targetMinutes, duration } = context;
  const name = profile.name ?? 'This employee';
  const newWeekly = state.weeklyMinutes + duration;
  const newDaily = (state.dailyMinutes[shift.day] ?? 0) + duration;

  switch (code) {
    case 'availability:off':
      return `${name} is marked off on ${shift.day}.`;
    case 'availability:before':
      return `${name} is only available from ${minutesToTimeStr(availability.startMin)} on ${shift.day}.`;
    case 'availability:after':
      return `${name}'s availability ends at ${minutesToTimeStr(availability.endMin)} on ${shift.day}.`;
    case 'store:mismatch':
      return `${name} cannot work outside their home store.`;
    case 'role:mismatch':
      return `${name} is not qualified for ${shift.workTypeName}.`;
    case 'weekly:limit':
      return `${name} would exceed weekly target (${formatHours(newWeekly)} > ${formatHours(targetMinutes)}).`;
    case 'daily:limit':
      return `${name} would exceed daily limit on ${shift.day} (${formatHours(newDaily)}).`;
    case 'overlap': {
      const segment = findOverlappingSegment(state, shift);
      if (segment) {
        return `${name} already has a shift ${formatSegmentRange(segment)} on ${segment.day}.`;
      }
      return `${name} already has another overlapping shift.`;
    }
    case 'rest':
      return `${name} needs ${MIN_REST_MINUTES / 60}h rest between shifts.`;
    default:
      return `Constraint violated: ${code}`;
  }
}

function formatWarningMessage(code: string, context: FormatWarningContext): string | null {
  const { profile, shift, state, targetMinutes, duration } = context;
  const name = profile.name ?? 'This employee';
  const newWeekly = state.weeklyMinutes + duration;
  const newDaily = (state.dailyMinutes[shift.day] ?? 0) + duration;

  switch (code) {
    case 'weekly:close':
      return `${name} will be close to their weekly target (${formatHours(newWeekly)} of ${formatHours(targetMinutes)}).`;
    case 'daily:close':
      return `${name} will have a dense day on ${shift.day} (${formatHours(newDaily)} scheduled).`;
    default:
      return `Constraint warning: ${code}`;
  }
}

function minutesToTimeStr(totalMinutes: number): string {
  const normalized = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(normalized / 60)
    .toString()
    .padStart(2, '0');
  const minutes = (normalized % 60)
    .toString()
    .padStart(2, '0');
  return `${hours}:${minutes}`;
}

function formatHours(minutes: number): string {
  const hours = minutes / 60;
  const rounded = Math.round(hours * 10) / 10;
  return `${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1)}h`;
}

function findOverlappingSegment(state: FitState, shift: FitShift): FitAssignmentSegment | undefined {
  return state.segments.find((segment) => !(shift.endMin <= segment.startMin || shift.startMin >= segment.endMin));
}

function formatSegmentRange(segment: FitAssignmentSegment): string {
  return `${minutesToTimeStr(segment.startMin)}-${minutesToTimeStr(segment.endMin)}`;
}

function ensureAvailabilityRecord(
  employee: MinimalSnapshot['employees'][number],
): Record<Weekday, FitAvailability> {
  const defaultSlot = (day: Weekday): FitAvailability => ({
    day,
    isOff: false,
    startMin: 0,
    endMin: 24 * 60,
  });

  const record: Record<Weekday, FitAvailability> = {
    MON: defaultSlot('MON'),
    TUE: defaultSlot('TUE'),
    WED: defaultSlot('WED'),
    THU: defaultSlot('THU'),
    FRI: defaultSlot('FRI'),
    SAT: defaultSlot('SAT'),
    SUN: defaultSlot('SUN'),
  };

  employee.availability?.forEach((slot) => {
    const startMin = slot.startTime ? timeToMinutes(slot.startTime) : 0;
    const endMin = slot.endTime ? timeToMinutes(slot.endTime) : 24 * 60;
    record[slot.day] = {
      day: slot.day,
      isOff: slot.isOff,
      startMin: slot.isOff ? 0 : startMin,
      endMin: slot.isOff ? 0 : endMin,
    };
  });

  return record;
}

function toFitProfile(employee: MinimalSnapshot['employees'][number]): FitEmployeeProfile {
  return {
    id: employee.id,
    name: employee.name,
    storeId: employee.storeId,
    canWorkAcrossStores: employee.canWorkAcrossStores,
    contractType: employee.contractType ?? null,
    weeklyTargetMinutes: employee.weeklyMinutesTarget,
    availability: ensureAvailabilityRecord(employee),
    workTypeIds: employee.workTypeIds ?? [],
    workTypeNames: (employee.workTypeNames ?? []).map((name) => name?.toLowerCase()).filter(Boolean) as string[],
  };
}

function buildEmployeeStates(snapshot: MinimalSnapshot): Map<string, FitState> {
  const states = new Map<string, FitState>();
  snapshot.employees.forEach((employee) => {
    states.set(employee.id, buildEmptyState());
  });

  snapshot.assignments.forEach((assignment) => {
    if (!assignment.employeeId) {
      return;
    }
    const state = states.get(assignment.employeeId);
    if (!state) {
      return;
    }

    if (!assignment.start || !assignment.end) {
      return;
    }

    const startMin = timeToMinutes(assignment.start);
    const endMin = timeToMinutes(assignment.end);
    const duration = endMin - startMin;

    state.weeklyMinutes += duration;
    state.dailyMinutes[assignment.day] = (state.dailyMinutes[assignment.day] ?? 0) + duration;
    state.segments.push({
      assignmentId: assignment.id,
      employeeId: assignment.employeeId,
      day: assignment.day,
      startMin,
      endMin,
    });
  });

  return states;
}

function resolveShift(op: AssignShiftOp, snapshot: MinimalSnapshot): ResolvedShift | null {
  const shift = snapshot.shifts.find((entry) => entry.id === op.shiftId);
  const assignment = snapshot.assignments.find(
    (entry) => entry.shiftId === op.shiftId || entry.id === op.shiftId,
  );

  if (shift) {
    return {
      shift: {
        id: shift.id,
        day: shift.day,
        startMin: timeToMinutes(shift.start),
        endMin: timeToMinutes(shift.end),
        workTypeId: shift.workTypeId,
        workTypeName: shift.workTypeName,
      },
      assignment,
    };
  }

  if (assignment && assignment.start && assignment.end) {
    return {
      shift: {
        id: op.shiftId,
        day: assignment.day,
        startMin: timeToMinutes(assignment.start),
        endMin: timeToMinutes(assignment.end),
        workTypeId: assignment.workTypeId,
        workTypeName: assignment.workTypeName,
      },
      assignment,
    };
  }

  return null;
}
