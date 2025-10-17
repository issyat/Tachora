/**
 * Operation Builder for LLM Tool Integration
 * 
 * Converts natural language parameters from LLM into typed Operation objects
 * suitable for PreviewService.createPreview().
 * 
 * Handles:
 * - Employee name/ID resolution
 * - Template/shift ID lookup
 * - Day normalization
 * - Validation
 */

import type { Operation, AssignShiftOp, UnassignShiftOp, SwapShiftsOp, AddShiftOp } from '@/types/preview';
import type { Weekday } from '@/types';

// ============================================================================
// LLM Input Types (from function calling)
// ============================================================================

export interface LLMAssignShiftInput {
  type: 'assign_shift';
  employeeId: string;
  shiftId: string; // Template ID or open shift ID
  reason?: string;
}

export interface LLMUnassignShiftInput {
  type: 'unassign_shift';
  assignmentId: string;
  reason?: string;
}

export interface LLMSwapShiftsInput {
  type: 'swap_shifts';
  employeeId: string; // First employee
  employeeId2: string; // Second employee
  assignment1Id: string;
  assignment2Id: string;
  reason?: string;
}

export interface LLMAddShiftInput {
  type: 'add_shift';
  day: Weekday;
  start: string; // HH:mm
  end: string;   // HH:mm
  workTypeName: string;
  capacity: number;
}

export type LLMOperationInput =
  | LLMAssignShiftInput
  | LLMUnassignShiftInput
  | LLMSwapShiftsInput
  | LLMAddShiftInput;

// ============================================================================
// Builder Context (provided by chat API)
// ============================================================================

export interface OperationBuilderContext {
  storeId: string;
  weekId: string;
  timestamp?: string; // ISO timestamp, defaults to now
  source?: 'ai' | 'user'; // Defaults to 'ai' for LLM-generated
}

// ============================================================================
// Builder Result
// ============================================================================

export interface BuildOperationResult {
  ok: boolean;
  operation?: Operation;
  error?: string;
  errorCode?: 'INVALID_INPUT' | 'MISSING_FIELD' | 'INVALID_ID' | 'UNKNOWN_TYPE';
}

// ============================================================================
// Operation Builder
// ============================================================================

/**
 * Build a typed Operation from LLM input
 */
export function buildOperation(
  input: LLMOperationInput,
  context: OperationBuilderContext
): BuildOperationResult {
  const { storeId, weekId, timestamp = new Date().toISOString(), source = 'ai' } = context;

  // Validate context
  if (!storeId || !weekId) {
    return {
      ok: false,
      error: 'Store ID and week ID are required',
      errorCode: 'MISSING_FIELD',
    };
  }

  // Build base operation properties
  const baseOp = {
    storeId,
    weekId,
    timestamp,
    source,
  };

  // Build operation based on type
  switch (input.type) {
    case 'assign_shift':
      return buildAssignShiftOp(input, baseOp);

    case 'unassign_shift':
      return buildUnassignShiftOp(input, baseOp);

    case 'swap_shifts':
      return buildSwapShiftsOp(input, baseOp);

    case 'add_shift':
      return buildAddShiftOp(input, baseOp);

    default:
      return {
        ok: false,
        error: `Unknown operation type: ${(input as LLMOperationInput).type}`,
        errorCode: 'UNKNOWN_TYPE',
      };
  }
}

/**
 * Build assign_shift operation
 */
function buildAssignShiftOp(
  input: LLMAssignShiftInput,
  baseOp: Pick<AssignShiftOp, 'storeId' | 'weekId' | 'timestamp' | 'source'>
): BuildOperationResult {
  // Validate required fields
  if (!input.employeeId) {
    return {
      ok: false,
      error: 'employeeId is required for assign_shift',
      errorCode: 'MISSING_FIELD',
    };
  }

  if (!input.shiftId) {
    return {
      ok: false,
      error: 'shiftId is required for assign_shift',
      errorCode: 'MISSING_FIELD',
    };
  }

  // Validate IDs format (basic UUID check)
  if (!isValidId(input.employeeId)) {
    return {
      ok: false,
      error: `Invalid employeeId format: ${input.employeeId}`,
      errorCode: 'INVALID_ID',
    };
  }

  // Clean up shiftId - remove 'template-' prefix if present
  // AI may send "template-{templateId}-{day}" but we need "{templateId}-{day}"
  let shiftId = input.shiftId;
  if (shiftId.startsWith('template-')) {
    shiftId = shiftId.replace(/^template-/, '');
  }

  // Validate shift ID format (should be templateId-DAY or just a UUID)
  const isCompositeId = shiftId.includes('-') && /^[a-z0-9]+-[A-Z]{3}$/i.test(shiftId);
  const isSimpleId = isValidId(shiftId);
  
  if (!isCompositeId && !isSimpleId) {
    return {
      ok: false,
      error: `Invalid shiftId format: ${input.shiftId} (cleaned: ${shiftId})`,
      errorCode: 'INVALID_ID',
    };
  }

  const operation: AssignShiftOp = {
    ...baseOp,
    type: 'assign_shift',
    employeeId: input.employeeId,
    shiftId: shiftId, // Use cleaned ID
    reason: input.reason,
  };

  return { ok: true, operation };
}

/**
 * Build unassign_shift operation
 */
function buildUnassignShiftOp(
  input: LLMUnassignShiftInput,
  baseOp: Pick<UnassignShiftOp, 'storeId' | 'weekId' | 'timestamp' | 'source'>
): BuildOperationResult {
  // Validate required fields
  if (!input.assignmentId) {
    return {
      ok: false,
      error: 'assignmentId is required for unassign_shift',
      errorCode: 'MISSING_FIELD',
    };
  }

  // Validate ID format
  if (!isValidId(input.assignmentId)) {
    return {
      ok: false,
      error: `Invalid assignmentId format: ${input.assignmentId}`,
      errorCode: 'INVALID_ID',
    };
  }

  const operation: UnassignShiftOp = {
    ...baseOp,
    type: 'unassign_shift',
    assignmentId: input.assignmentId,
    reason: input.reason,
  };

  return { ok: true, operation };
}

/**
 * Build swap_shifts operation
 */
function buildSwapShiftsOp(
  input: LLMSwapShiftsInput,
  baseOp: Pick<SwapShiftsOp, 'storeId' | 'weekId' | 'timestamp' | 'source'>
): BuildOperationResult {
  // Validate required fields
  if (!input.employeeId || !input.employeeId2) {
    return {
      ok: false,
      error: 'Both employeeId and employeeId2 are required for swap_shifts',
      errorCode: 'MISSING_FIELD',
    };
  }

  if (!input.assignment1Id || !input.assignment2Id) {
    return {
      ok: false,
      error: 'Both assignment1Id and assignment2Id are required for swap_shifts',
      errorCode: 'MISSING_FIELD',
    };
  }

  // Validate IDs format
  if (!isValidId(input.employeeId) || !isValidId(input.employeeId2)) {
    return {
      ok: false,
      error: 'Invalid employee ID format',
      errorCode: 'INVALID_ID',
    };
  }

  if (!isValidId(input.assignment1Id) || !isValidId(input.assignment2Id)) {
    return {
      ok: false,
      error: 'Invalid assignment ID format',
      errorCode: 'INVALID_ID',
    };
  }

  // Ensure not swapping with self
  if (input.employeeId === input.employeeId2) {
    return {
      ok: false,
      error: 'Cannot swap an employee with themselves',
      errorCode: 'INVALID_INPUT',
    };
  }

  if (input.assignment1Id === input.assignment2Id) {
    return {
      ok: false,
      error: 'Cannot swap the same assignment',
      errorCode: 'INVALID_INPUT',
    };
  }

  const operation: SwapShiftsOp = {
    ...baseOp,
    type: 'swap_shifts',
    assignment1Id: input.assignment1Id,
    assignment2Id: input.assignment2Id,
    employee1Id: input.employeeId,
    employee2Id: input.employeeId2,
    reason: input.reason,
  };

  return { ok: true, operation };
}

/**
 * Build add_shift operation
 */
function buildAddShiftOp(
  input: LLMAddShiftInput,
  baseOp: Pick<AddShiftOp, 'storeId' | 'weekId' | 'timestamp' | 'source'>
): BuildOperationResult {
  // Validate required fields
  if (!input.day) {
    return {
      ok: false,
      error: 'day is required for add_shift',
      errorCode: 'MISSING_FIELD',
    };
  }

  if (!input.start || !input.end) {
    return {
      ok: false,
      error: 'start and end times are required for add_shift',
      errorCode: 'MISSING_FIELD',
    };
  }

  if (!input.workTypeName) {
    return {
      ok: false,
      error: 'workTypeName is required for add_shift',
      errorCode: 'MISSING_FIELD',
    };
  }

  // Validate time format (HH:mm)
  const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
  if (!timeRegex.test(input.start) || !timeRegex.test(input.end)) {
    return {
      ok: false,
      error: 'Times must be in HH:mm format (e.g., "08:00", "14:30")',
      errorCode: 'INVALID_INPUT',
    };
  }

  // Validate start < end
  if (input.start >= input.end) {
    return {
      ok: false,
      error: 'Start time must be before end time',
      errorCode: 'INVALID_INPUT',
    };
  }

  // Validate day
  const validDays = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
  if (!validDays.includes(input.day)) {
    return {
      ok: false,
      error: `Invalid day: ${input.day}. Must be one of: ${validDays.join(', ')}`,
      errorCode: 'INVALID_INPUT',
    };
  }

  // Validate capacity
  if (input.capacity < 1) {
    return {
      ok: false,
      error: 'Capacity must be at least 1',
      errorCode: 'INVALID_INPUT',
    };
  }

  const operation: AddShiftOp = {
    ...baseOp,
    type: 'add_shift',
    day: input.day,
    start: input.start,
    end: input.end,
    workTypeName: input.workTypeName,
    capacity: input.capacity,
  };

  return { ok: true, operation };
}

/**
 * Build multiple operations at once
 */
export function buildOperations(
  inputs: LLMOperationInput[],
  context: OperationBuilderContext
): {
  ok: boolean;
  operations?: Operation[];
  errors?: Array<{ index: number; error: string; errorCode: string }>;
} {
  if (!inputs || inputs.length === 0) {
    return {
      ok: false,
      errors: [{ index: 0, error: 'No operations provided', errorCode: 'MISSING_FIELD' }],
    };
  }

  if (inputs.length > 10) {
    return {
      ok: false,
      errors: [
        {
          index: 0,
          error: 'Maximum 10 operations per preview',
          errorCode: 'INVALID_INPUT',
        },
      ],
    };
  }

  const operations: Operation[] = [];
  const errors: Array<{ index: number; error: string; errorCode: string }> = [];

  inputs.forEach((input, index) => {
    const result = buildOperation(input, context);

    if (result.ok && result.operation) {
      operations.push(result.operation);
    } else {
      errors.push({
        index,
        error: result.error || 'Unknown error',
        errorCode: result.errorCode || 'UNKNOWN_TYPE',
      });
    }
  });

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, operations };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Basic ID validation (UUID format)
 */
function isValidId(id: string): boolean {
  if (!id || typeof id !== 'string') {
    return false;
  }

  // UUID regex (loose check)
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // Also accept short IDs (for testing)
  const shortIdRegex = /^[a-z0-9_-]{3,50}$/i;

  return uuidRegex.test(id) || shortIdRegex.test(id);
}

/**
 * Normalize day name to canonical Weekday type
 */
export function normalizeDay(day: string): Weekday | null {
  const dayMap: Record<string, Weekday> = {
    // Standard
    monday: 'MON',
    tuesday: 'TUE',
    wednesday: 'WED',
    thursday: 'THU',
    friday: 'FRI',
    saturday: 'SAT',
    sunday: 'SUN',
    // Short forms
    mon: 'MON',
    tue: 'TUE',
    wed: 'WED',
    thu: 'THU',
    fri: 'FRI',
    sat: 'SAT',
    sun: 'SUN',
    // Abbreviations
    m: 'MON',
    t: 'TUE',
    w: 'WED',
    th: 'THU',
    f: 'FRI',
    sa: 'SAT',
    su: 'SUN',
  };

  const normalized = day.toLowerCase().trim();
  return dayMap[normalized] || null;
}

/**
 * Parse time string to minutes (HH:MM format)
 */
export function parseTime(time: string): number | null {
  const match = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return null;
  }

  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }

  return hours * 60 + minutes;
}

/**
 * Format minutes to HH:MM
 */
export function formatTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}
