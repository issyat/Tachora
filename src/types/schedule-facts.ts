import type { Weekday } from "@/generated/prisma";

export interface ClientAssignmentInput {
  id: string;
  day: Weekday;
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  workType: {
    id: string;
    name: string;
    color?: string | null;
  };
  employee?: {
    id: string;
    name: string;
    storeName?: string | null;
  } | null;
  locked?: boolean;
  sourceTemplate?: {
    id: string;
    workTypeId: string;
  } | null;
}

export interface ScheduleFactsMeta {
  storeId: string;
  storeName: string;
  weekId: string;
  generatedAt: string;
  timezone?: string | null;
}

export interface ScheduleFactsTotals {
  assignments: number;
  assigned: number;
  unassigned: number;
  employees: number;
}

export interface ScheduleFactsAvailabilitySnapshot {
  day: Weekday;
  isOff: boolean;
  start: string;
  end: string;
  startMin: number;
  endMin: number;
}

export interface ScheduleFactsEmployeeAssignment {
  id: string;
  day: Weekday;
  start: string;
  end: string;
  workType: string;
}

export interface ScheduleFactsEmployee {
  id: string;
  name: string;
  storeId: string;
  storeName?: string;
  weeklyMinutes: number;
  targetMinutes: number;
  targetDelta: number;
  contractType?: string | null;
  availability: ScheduleFactsAvailabilitySnapshot[];
  dailyMinutes: Partial<Record<Weekday, number>>;
  assignments: ScheduleFactsEmployeeAssignment[];
  conflicts: string[];
}

export interface ScheduleFactsOpenShiftCandidate {
  id: string;
  name: string;
  remainingWeeklyMinutes: number;
  warnings: string[];
}

export interface ScheduleFactsOpenShift {
  id: string;
  day: Weekday;
  start: string;
  end: string;
  workTypeId: string;
  workTypeName: string;
  workTypeColor: string;
  sourceTemplateId?: string;
  reasons: string[];
  candidates: ScheduleFactsOpenShiftCandidate[];
}

export type ScheduleFactsConflictType =
  | "overlap"
  | "rest"
  | "availability"
  | "store"
  | "weekly-limit"
  | "daily-limit";

export interface ScheduleFactsConflict {
  type: ScheduleFactsConflictType;
  employeeId: string;
  assignmentId?: string;
  message: string;
}

export interface ScheduleFactsSnapshotAssignment {
  id: string;
  day: Weekday;
  start: string;
  end: string;
  workTypeId: string;
  workTypeName: string;
  employeeId?: string;
  employeeName?: string;
  sourceTemplateId?: string;
  locked?: boolean;
}

export interface ScheduleFactsSnapshotEmployeeAvailability {
  day: Weekday;
  isOff: boolean;
  start: string | null;
  end: string | null;
}

export interface ScheduleFactsSnapshotEmployee {
  id: string;
  name: string;
  storeId: string;
  contractType: string | null;
  weeklyMinutesTarget: number;
  canWorkAcrossStores: boolean;
  workTypeIds: string[];
  availability: ScheduleFactsSnapshotEmployeeAvailability[];
}

export interface ScheduleFactsSnapshotTemplate {
  id: string;
  workTypeId: string;
  workTypeName: string;
  days: Partial<Record<Weekday, boolean>>;
  start: string;
  end: string;
}

export interface ScheduleFactsSnapshot {
  version: string;
  store: {
    id: string;
    name: string;
    city: string;
    country: string;
  };
  isoWeek: string;
  generatedAt: string;
  assignments: ScheduleFactsSnapshotAssignment[];
  employees: ScheduleFactsSnapshotEmployee[];
  templates: ScheduleFactsSnapshotTemplate[];
  truncated?: boolean;
  sizeBytes?: number;
}

// Minimal snapshot for LLM (≤50KB)
export interface MinimalSnapshot {
  version: string;
  storeId: string;
  storeName: string;
  isoWeek: string;
  tz: string;
  generatedAt: string;
  employees: MinimalEmployee[];
  assignments: MinimalAssignment[];
  openShifts: MinimalOpenShift[];
  truncated?: boolean;
  sizeBytes?: number;
}

export interface MinimalEmployee {
  id: string;
  name: string;
  alias?: string;
  weeklyMinutes: number;
  weeklyMinutesTarget: number;
}

export interface MinimalAssignment {
  id: string;
  day: Weekday;
  durationMins: number;
  employeeId?: string;
  workTypeName: string;
}

export interface MinimalOpenShift {
  id: string;
  day: Weekday;
  start: string;
  end: string;
  workTypeName: string;
}

export interface ScheduleFacts {
  meta: ScheduleFactsMeta;
  totals: ScheduleFactsTotals;
  employees: ScheduleFactsEmployee[];
  openShifts: ScheduleFactsOpenShift[];
  conflicts: ScheduleFactsConflict[];
  snapshot: ScheduleFactsSnapshot;
  minimalSnapshot?: MinimalSnapshot;
}

// Tool-related types
export interface ExpandContextRequest {
  historyWeeks?: number;
  availability?: boolean;
}

export interface ExpandContextResult {
  snapshot: MinimalSnapshot;
  expanded: {
    history?: unknown[];
    availability?: unknown[];
  };
}

export interface FindEmployeeRequest {
  query: string;
}

export interface FindEmployeeResult {
  ok: boolean;
  employees?: Array<{
    id: string;
    name: string;
    alias?: string;
    storeId: string;
  }>;
  error?: string;
}

export interface ProposePreviewRequest {
  operations: PreviewOperation[];
}

export interface PreviewOperation {
  type: 'assign' | 'unassign' | 'swap' | 'update';
  assignmentId?: string;
  employeeId?: string;
  day?: Weekday;
  startTime?: string;
  endTime?: string;
  workTypeName?: string;
  locked?: boolean;
}

export interface PreviewDiff {
  type: 'add' | 'remove' | 'modify';
  assignmentId: string;
  before?: Partial<MinimalAssignment>;
  after?: Partial<MinimalAssignment>;
}

export interface ProposePreviewResult {
  ok: boolean;
  diffs: PreviewDiff[];
  validation?: ValidationResult;
  idempotencyKey: string;
  error?: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  code: string;
  assignmentId?: string;
  employeeId?: string;
  message: string;
}

export interface ValidationWarning {
  code: string;
  assignmentId?: string;
  employeeId?: string;
  message: string;
}

export interface CheckRulesetRequest {
  operations: PreviewOperation[];
}

export interface CheckRulesetResult extends ValidationResult {}

export interface SolverSuggestionRequest {
  mode: 'fill_unassigned' | 'rebalance' | 'full';
  constraints?: Record<string, unknown>;
}

export interface SolverSuggestionResult {
  ok: boolean;
  operations?: PreviewOperation[];
  validation?: ValidationResult;
  error?: string;
  solverTime?: number;
}
