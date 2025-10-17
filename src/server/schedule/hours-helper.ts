import type { ScheduleFacts, MinimalSnapshot } from "@/types";

export interface EmployeeHoursSummary {
  minutes: number;
  hours: number;
  targetMinutes: number;
  targetHours: number;
  deltaMinutes: number;
  deltaHours: number;
}

export type EmployeeHoursIndex = Record<string, EmployeeHoursSummary>;

function minutesToHours(value: number): number {
  const hours = value / 60;
  return Math.round(hours * 10) / 10;
}

function formatHoursValue(value: number): string {
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1);
}

function isScheduleFacts(value: unknown): value is ScheduleFacts {
  return Boolean(value && typeof value === "object" && Array.isArray((value as ScheduleFacts).employees));
}

function isMinimalSnapshot(value: unknown): value is MinimalSnapshot {
  return Boolean(value && typeof value === "object" && Array.isArray((value as MinimalSnapshot).employees));
}

function extractMinutes(entry: any): { weeklyMinutes: number; targetMinutes: number } {
  const weekly = typeof entry?.weeklyMinutes === "number"
    ? entry.weeklyMinutes
    : 0;

  const target = typeof entry?.targetMinutes === "number"
    ? entry.targetMinutes
    : typeof entry?.weeklyMinutesTarget === "number"
      ? entry.weeklyMinutesTarget
      : 0;

  return {
    weeklyMinutes: weekly,
    targetMinutes: target,
  };
}

export function buildEmployeeHoursIndex(source?: ScheduleFacts | MinimalSnapshot | null): EmployeeHoursIndex {
  if (!source || (!isScheduleFacts(source) && !isMinimalSnapshot(source))) {
    return {};
  }

  const entries = (source as ScheduleFacts | MinimalSnapshot).employees ?? [];
  const index: EmployeeHoursIndex = {};

  entries.forEach((employee: any) => {
    const { weeklyMinutes, targetMinutes } = extractMinutes(employee);

    const summary: EmployeeHoursSummary = {
      minutes: weeklyMinutes,
      hours: minutesToHours(weeklyMinutes),
      targetMinutes,
      targetHours: minutesToHours(targetMinutes),
      deltaMinutes: weeklyMinutes - targetMinutes,
      deltaHours: minutesToHours(weeklyMinutes - targetMinutes),
    };

    index[employee.id] = summary;
  });

  return index;
}

export function formatHoursSummary(summary: EmployeeHoursSummary): string {
  const current = formatHoursValue(summary.hours);
  const target = formatHoursValue(summary.targetHours);
  return `${current}h / ${target}h`;
}

export function formatDeltaHours(summary: EmployeeHoursSummary): string {
  const delta = formatHoursValue(summary.deltaHours);
  const sign = summary.deltaHours > 0 ? "+" : "";
  return `${sign}${delta}h`;
}
