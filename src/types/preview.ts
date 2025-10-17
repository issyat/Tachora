/**
 * Preview → Apply Flow Types
 * 
 * Defines canonical operations and diffs for AI-suggested schedule changes.
 * Changes are previewed before being committed to the database.
 */

import type { Weekday } from "./index";

// ============================================================================
// Operation Types
// ============================================================================

export type OperationType =
  | 'assign_shift'      // Assign employee to open shift
  | 'unassign_shift'    // Remove employee from shift
  | 'swap_shifts'       // Swap two employees' shifts
  | 'add_shift'         // Create new shift template
  | 'edit_shift'        // Modify shift times/role
  | 'edit_employee'     // Update employee details
  | 'delete_shift';     // Remove shift template

export interface BaseOperation {
  type: OperationType;
  storeId: string;
  weekId: string;
  timestamp: string;
  source: 'ai' | 'user';
}

export interface AssignShiftOp extends BaseOperation {
  type: 'assign_shift';
  shiftId: string;
  employeeId: string;
  reason?: string; // Why AI suggested this
}

export interface UnassignShiftOp extends BaseOperation {
  type: 'unassign_shift';
  assignmentId: string;
  reason?: string;
}

export interface SwapShiftsOp extends BaseOperation {
  type: 'swap_shifts';
  assignment1Id: string;
  assignment2Id: string;
  employee1Id: string;
  employee2Id: string;
  reason?: string;
}

export interface AddShiftOp extends BaseOperation {
  type: 'add_shift';
  day: Weekday;
  start: string; // HH:MM
  end: string;   // HH:MM
  workTypeName: string;
  capacity: number;
}

export interface EditShiftOp extends BaseOperation {
  type: 'edit_shift';
  shiftId: string;
  changes: {
    start?: string;
    end?: string;
    workTypeName?: string;
    capacity?: number;
  };
}

export interface EditEmployeeOp extends BaseOperation {
  type: 'edit_employee';
  employeeId: string;
  changes: {
    name?: string;
    weeklyMinutesTarget?: number;
    alias?: string;
  };
}

export interface DeleteShiftOp extends BaseOperation {
  type: 'delete_shift';
  shiftId: string;
  reason?: string;
}

export type Operation =
  | AssignShiftOp
  | UnassignShiftOp
  | SwapShiftsOp
  | AddShiftOp
  | EditShiftOp
  | EditEmployeeOp
  | DeleteShiftOp;

// ============================================================================
// Diff & Snapshot Types
// ============================================================================

export interface DiffSnapshot {
  assignments?: Array<{
    id: string;
    shiftId?: string;
    employeeId: string;
    day: Weekday;
    durationMins: number;
    workTypeName: string;
  }>;
  shifts?: Array<{
    id: string;
    day: Weekday;
    start: string;
    end: string;
    workTypeName: string;
    capacity: number;
  }>;
  employees?: Array<{
    id: string;
    name: string;
    alias?: string;
    weeklyMinutes: number;
    weeklyMinutesTarget: number;
  }>;
  weeklyMinutes?: Record<string, number>; // employeeId → minutes
}

export interface Diff {
  operation: Operation;
  before: DiffSnapshot; // State before change
  after: DiffSnapshot;  // State after change
  inverseDiff?: Diff;   // For undo functionality
  constraints: {
    checked: string[];  // List of constraints validated
    warnings: string[]; // Non-blocking warnings
    blockers: string[]; // Would prevent apply
  };
}

// ============================================================================
// Preview Types
// ============================================================================

export type PreviewStatus = 'pending' | 'applied' | 'discarded' | 'expired';

export interface Preview {
  id: string;
  storeId: string;
  weekId: string;
  snapshotVersion: string; // For optimistic locking
  operations: Operation[];
  diffs: Diff[];
  createdAt: string;
  expiresAt: string; // Auto-expire after 30 minutes
  status: PreviewStatus;
  appliedAt?: string;
  appliedBy?: string; // User ID
}

// ============================================================================
// Visualization Types (for UI)
// ============================================================================

export type ChangeType = 'add' | 'modify' | 'remove';
export type EntityType = 'assignment' | 'shift';

export interface CalendarChange {
  type: ChangeType;
  entity: EntityType;
  day: Weekday;
  start: string;
  end: string;
  employeeId?: string;
  employeeName?: string;
  workTypeName: string;
  color: {
    bg: string;    // Background color
    border: string; // Border color
    text: string;   // Text color
  };
  position: {
    row: number; // Employee row index
    col: number; // Day column (0-6)
  };
  diff: {
    before?: string; // Previous state description
    after?: string;  // New state description
  };
}

export interface EmployeeImpact {
  employeeId: string;
  employeeName: string;
  changes: {
    weeklyMinutes: {
      before: number;
      after: number;
      delta: number; // Positive = more hours
    };
    assignmentCount: {
      before: number;
      after: number;
      delta: number;
    };
    daysWorked: {
      before: Weekday[];
      after: Weekday[];
      added: Weekday[];
      removed: Weekday[];
    };
  };
  warnings: string[]; // e.g., "Exceeds weekly target by 2h"
}

export interface PreviewVisualization {
  calendarChanges: CalendarChange[];
  employeeImpacts: EmployeeImpact[];
}

// ============================================================================
// API Request/Response Types
// ============================================================================

export interface CreatePreviewRequest {
  storeId: string;
  weekId: string;
  operations: Operation[];
  snapshotVersion: string; // Current version for conflict detection
}

export interface CreatePreviewResponse {
  preview: Preview;
  visualization: PreviewVisualization;
}

export interface ApplyPreviewRequest {
  previewId: string;
  snapshotVersion: string; // Must match current version
}

export interface ApplyPreviewResponse {
  success: boolean;
  appliedOps: number;
  newSnapshotVersion: string;
  conflicts?: ConflictInfo[];
}

export interface UndoPreviewResponse {
  success: boolean;
  revertedOps: number;
  newSnapshotVersion: string;
}

export interface DiscardPreviewResponse {
  success: boolean;
}

export interface ConflictInfo {
  field: string;
  expectedVersion: string;
  actualVersion: string;
  message: string;
}

// ============================================================================
// Error Types
// ============================================================================

export class PreviewError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'PreviewError';
  }
}

export class VersionMismatchError extends PreviewError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'VERSION_MISMATCH', details);
    this.name = 'VersionMismatchError';
  }
}

export class ConstraintViolationError extends PreviewError {
  constructor(
    message: string,
    public blockers: string[],
    details?: Record<string, unknown>
  ) {
    super(message, 'CONSTRAINT_VIOLATION', { ...details, blockers });
    this.name = 'ConstraintViolationError';
  }
}

export class PreviewExpiredError extends PreviewError {
  constructor(previewId: string) {
    super(
      `Preview ${previewId} has expired`,
      'PREVIEW_EXPIRED',
      { previewId }
    );
    this.name = 'PreviewExpiredError';
  }
}

export class PreviewNotFoundError extends PreviewError {
  constructor(previewId: string) {
    super(
      `Preview ${previewId} not found`,
      'PREVIEW_NOT_FOUND',
      { previewId }
    );
    this.name = 'PreviewNotFoundError';
  }
}

// ============================================================================
// Color Scheme Constants
// ============================================================================

export const PREVIEW_COLORS: Record<ChangeType, {
  bg: string;
  border: string;
  text: string;
}> = {
  add: {
    bg: 'bg-green-50',
    border: 'border-green-500 border-2 border-dashed',
    text: 'text-green-900'
  },
  modify: {
    bg: 'bg-yellow-50',
    border: 'border-yellow-500 border-2 border-dashed',
    text: 'text-yellow-900'
  },
  remove: {
    bg: 'bg-red-50',
    border: 'border-red-500 border-2 border-dashed',
    text: 'text-red-900'
  }
};
