import { DAY_TO_INDEX, MAX_DAILY_MINUTES, MIN_REST_MINUTES, STUDENT_WEEKLY_LIMIT_MINUTES } from "../utils/constants";
import type { DayKey, Employee } from "../types";

export interface EmployeeAssignmentSegment {
  assignmentId: string;
  day: DayKey;
  startMin: number;
  endMin: number;
}

export interface LocalValidationParams {
  employee: Employee;
  day: DayKey;
  role: string;
  startMin: number;
  endMin: number;
  templateWorkTypeId?: string | null;
  existingAssignmentId?: string | null;
  weeklyMinutes: number;
  dailyMinutes: number;
  segments: EmployeeAssignmentSegment[];
  currentStoreId?: string;
}

export function collectLocalValidationErrors(params: LocalValidationParams): string[] {
  const {
    employee,
    day,
    role,
    startMin,
    endMin,
    templateWorkTypeId,
    existingAssignmentId,
    weeklyMinutes,
    dailyMinutes,
    segments,
    currentStoreId,
  } = params;

  const messages: string[] = [];

  const availability = employee.availability?.[DAY_TO_INDEX[day]];
  if (!availability || availability.isOff) {
    messages.push(`${employee.name} is not available on ${day}.`);
    return messages;
  }

  const availabilityStart = toMinutes(availability.startTime);
  const availabilityEnd = toMinutes(availability.endTime);
  if (startMin < availabilityStart) {
    messages.push(`${employee.name} is only available after ${availability.startTime} on ${day}.`);
  }
  if (endMin > availabilityEnd) {
    messages.push(`${employee.name} must finish by ${availability.endTime} on ${day}.`);
  }

  if (!employee.canWorkAcrossStores && currentStoreId && employee.storeId !== currentStoreId) {
    messages.push(`${employee.name} cannot work at this store.`);
  }

  if (templateWorkTypeId && !(employee.roleIds ?? []).includes(templateWorkTypeId)) {
    messages.push(`${employee.name} is not assigned to the required work type.`);
  } else if ((employee.roles?.length ?? 0) > 0) {
    const roleNames = (employee.roles ?? []).map((roleInfo) => roleInfo.name.toLowerCase());
    if (roleNames.length > 0 && !roleNames.includes(role.toLowerCase())) {
      messages.push(`${employee.name} is not assigned to the ${role} role.`);
    }
  }

  const duration = endMin - startMin;
  const baseTarget = employee.weeklyMinutesTarget ?? 40 * 60;
  const cappedTarget = employee.contractType === 'STUDENT'
    ? Math.min(baseTarget, STUDENT_WEEKLY_LIMIT_MINUTES)
    : baseTarget;

  let adjustedWeekly = weeklyMinutes;
  let adjustedDaily = dailyMinutes;

  const existingSegment = existingAssignmentId
    ? segments.find((segment) => segment.assignmentId === existingAssignmentId)
    : undefined;

  if (existingSegment) {
    const existingDuration = existingSegment.endMin - existingSegment.startMin;
    adjustedWeekly = Math.max(0, adjustedWeekly - existingDuration);
    if (existingSegment.day === day) {
      adjustedDaily = Math.max(0, adjustedDaily - existingDuration);
    }
  }

  if (adjustedWeekly + duration > cappedTarget) {
    messages.push(`${employee.name} would exceed the weekly limit (${Math.round(cappedTarget / 60)}h).`);
  }

  if (adjustedDaily + duration > MAX_DAILY_MINUTES) {
    messages.push(`${employee.name} would exceed the daily limit (${Math.round(MAX_DAILY_MINUTES / 60)}h).`);
  }

  const newAbsStart = absoluteMinutes(day, startMin);
  const newAbsEnd = absoluteMinutes(day, endMin);

  segments.forEach((segment) => {
    if (segment.assignmentId === existingAssignmentId) {
      return;
    }

    const segmentAbsStart = absoluteMinutes(segment.day, segment.startMin);
    const segmentAbsEnd = absoluteMinutes(segment.day, segment.endMin);

    const overlaps = !(newAbsEnd <= segmentAbsStart || newAbsStart >= segmentAbsEnd);
    if (overlaps && segment.day === day) {
      messages.push(`${employee.name} already has a shift from ${formatRange(segment.startMin, segment.endMin)} on ${segment.day}.`);
    }

    const gapBefore = newAbsStart - segmentAbsEnd;
    if (gapBefore > 0 && gapBefore < MIN_REST_MINUTES) {
      messages.push(`${employee.name} needs at least ${Math.round(MIN_REST_MINUTES / 60)}h rest before this shift.`);
    }

    const gapAfter = segmentAbsStart - newAbsEnd;
    if (gapAfter > 0 && gapAfter < MIN_REST_MINUTES) {
      messages.push(`${employee.name} needs at least ${Math.round(MIN_REST_MINUTES / 60)}h rest after this shift.`);
    }
  });

  return Array.from(new Set(messages));
}

function toMinutes(value: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) {
    return 0;
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

function absoluteMinutes(day: DayKey, minutes: number): number {
  return DAY_TO_INDEX[day] * 24 * 60 + minutes;
}

function formatRange(start: number, end: number): string {
  return `${formatMinutes(start)} - ${formatMinutes(end)}`;
}

function formatMinutes(value: number): string {
  const hours = Math.floor(value / 60)
    .toString()
    .padStart(2, '0');
  const minutes = (value % 60)
    .toString()
    .padStart(2, '0');
  return `${hours}:${minutes}`;
}
