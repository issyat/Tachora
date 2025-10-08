import type { DayKey } from "../types";

export const DAY_ORDER: DayKey[] = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

export const DAY_TO_INDEX: Record<DayKey, number> = {
  MON: 0,
  TUE: 1,
  WED: 2,
  THU: 3,
  FRI: 4,
  SAT: 5,
  SUN: 6,
};

export const INDEX_TO_DAY = DAY_ORDER;

export const MINUTES_PER_DAY = 24 * 60;
export const DEFAULT_WEEKLY_TARGET_MINUTES = 40 * 60;
export const STUDENT_WEEKLY_LIMIT_MINUTES = 20 * 60;
export const MAX_DAILY_MINUTES = 10 * 60;
export const MIN_REST_MINUTES = 11 * 60;
export const MIN_WINDOW_MINUTES = 60;
