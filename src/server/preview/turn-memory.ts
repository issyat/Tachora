/**
 * Turn Memory System
 * 
 * Server-side turn state management for deterministic, multilingual interactions.
 * Replaces reliance on LLM memory with explicit state tracking.
 */

import type { Weekday } from '@/types';
import { kvGet, kvSet, kvDel } from '../chat/kv-store';

// ============================================================================
// Types
// ============================================================================

export type TurnMode = 'shift_assignment' | 'shift_creation' | 'shift_swap' | 'shift_unassign' | 'availability_change';
export type QuestionId = 'select_shift' | 'confirm_creation' | 'confirm_swap' | 'confirm_preview' | 'confirm_selection' | 'apply_changes' | 'select_reason' | 'pick_shift';
export type TimeOfDay = 'morning' | 'afternoon' | 'evening';

export interface TurnMemory {
  // Context
  mode: TurnMode;
  scope: {
    empId?: string;
    day?: Weekday;
    role?: string;
  };
  threadId: string;
  
  // Locked entities (resolved once, reused for turn)
  entities: {
    employeeId?: string;
    employeeName?: string;
    employee2Id?: string; // For swaps
    employee2Name?: string;
    day?: Weekday;
    role?: string;
    storeId: string;
    weekId: string;
  };
  
  // Current question state
  lastQuestion: {
    id: QuestionId;
    text: string; // For debugging/display
    timestamp: number;
  };
  lastQuestionId?: QuestionId | 'pick_shift';
  
  // Cached options for current question
  options?: ShiftOption[];
  
  // Pending action
  pendingPreviewId?: string;
  proposed?: {
    optionId?: string;
    previewId?: string;
  };
  snapshotVersion?: string;
  focus?: FocusMemory;
  
  // Metadata
  createdAt: number;
  expiresAt: number; // 10 min TTL
}

export interface ShiftOption {
  optionId: string; // "opt_1", "opt_2", etc.
  shiftId: string; // Composite: "templateId-DAY"
  templateId: string;
  label: string; // "Morning (09:00-15:00)"
  startTime: string; // "09:00"
  endTime: string; // "15:00"
  durationHours: number;
  fits: boolean;
  reason?: string; // If doesn't fit
  assignmentId?: string; // Optional: for unassign operations
  employeeId?: string;
  employeeName?: string;
  hoursLabel?: string;
  
  // For deterministic matching
  timeOfDay: TimeOfDay;
  index: number; // 0-based for "first", "second", etc.
}

// ============================================================================
// Storage (In-Memory with Redis Interface)
// ============================================================================

const turnMemoryCache = new Map<string, TurnMemory>();
const TURN_TTL_MS = 45 * 60 * 1000; // 45 minutes

export interface FocusMemory {
  employeeId?: string;
  employeeName?: string;
  day?: Weekday;
  role?: string;
  updatedAt: number;
}

type FocusInput = Pick<FocusMemory, 'employeeId' | 'employeeName' | 'day' | 'role'>;

const focusCache = new Map<string, FocusMemory>();
const FOCUS_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

/**
 * Generate cache key
 */
function getTurnKey(userId: string, storeId: string, weekId: string, threadId: string): string {
  return `turn:${userId}:${storeId}:${weekId}:${threadId}`;
}

function getFocusKey(userId: string, storeId: string, weekId: string, threadId: string): string {
  return `focus:${userId}:${storeId}:${weekId}:${threadId}`;
}

function buildFocusPayload(input?: FocusInput | null): FocusInput | null {
  if (!input) {
    return null;
  }

  if (!input.employeeId && !input.employeeName) {
    return null;
  }

  return {
    employeeId: input.employeeId,
    employeeName: input.employeeName,
    day: input.day,
    role: input.role,
  };
}

async function saveFocusMemory(
  userId: string,
  storeId: string,
  weekId: string,
  threadId: string,
  focus: FocusInput | null,
): Promise<void> {
  const payload = buildFocusPayload(focus);
  if (!payload) {
    return;
  }

  const key = getFocusKey(userId, storeId, weekId, threadId);
  const entry: FocusMemory = {
    ...payload,
    updatedAt: Date.now(),
  };

  focusCache.set(key, entry);
  await kvSet(key, JSON.stringify(entry), FOCUS_TTL_MS);
}

export async function loadFocusMemory(
  userId: string,
  storeId: string,
  weekId: string,
  threadId: string,
): Promise<FocusMemory | null> {
  const key = getFocusKey(userId, storeId, weekId, threadId);
  const cached = focusCache.get(key);
  if (cached && Date.now() - cached.updatedAt < FOCUS_TTL_MS) {
    return cached;
  }

  const persisted = await kvGet(key);
  if (!persisted) {
    return null;
  }

  try {
    const parsed = JSON.parse(persisted) as FocusMemory;
    focusCache.set(key, parsed);
    return parsed;
  } catch (error) {
    console.error('[FocusMemory] Failed to parse persisted focus', error);
    return null;
  }
}

/**
 * Save turn memory
 */
export async function saveTurnMemory(
  userId: string,
  storeId: string,
  weekId: string,
  threadId: string,
  memory: Omit<TurnMemory, 'createdAt' | 'expiresAt'>
): Promise<void> {
  const key = getTurnKey(userId, storeId, weekId, threadId);
  const now = Date.now();
  
  const fullMemory: TurnMemory = {
    ...memory,
    lastQuestionId: memory.lastQuestionId ?? memory.lastQuestion?.id,
    createdAt: now,
    expiresAt: now + TURN_TTL_MS,
    focus: buildFocusPayload({
      employeeId: memory.scope?.empId ?? memory.entities.employeeId,
      employeeName: memory.entities.employeeName,
      day: memory.scope?.day ?? memory.entities.day,
      role: memory.scope?.role ?? memory.entities.role,
    }) ?? memory.focus,
  };
  
  turnMemoryCache.set(key, fullMemory);
  await kvSet(key, JSON.stringify(fullMemory), TURN_TTL_MS);
  await saveFocusMemory(userId, storeId, weekId, threadId, fullMemory.focus);
  
  console.log('[TurnMemory] Saved:', {
    key,
    scope: memory.mode,
    questionId: memory.lastQuestion?.id,
    optionCount: memory.options?.length ?? 0,
    focusEmployeeId: fullMemory.focus?.employeeId,
  });
}

/**
 * Load turn memory
 */
export async function loadTurnMemory(
  userId: string,
  storeId: string,
  weekId: string,
  threadId: string
): Promise<TurnMemory | null> {
  const key = getTurnKey(userId, storeId, weekId, threadId);
  const memory = turnMemoryCache.get(key);
  
  if (!memory) {
    const persisted = await kvGet(key);
    if (!persisted) {
      console.log('[TurnMemory] Not found:', key);
      return null;
    }

    try {
      const parsed = JSON.parse(persisted) as TurnMemory;
      turnMemoryCache.set(key, parsed);
      return parsed;
    } catch (error) {
      console.error('[TurnMemory] Failed to parse persisted memory', error);
      return null;
    }
  }
  
  // Check expiration
  if (Date.now() > memory.expiresAt) {
    turnMemoryCache.delete(key);
    await kvDel(key);
    console.log('[TurnMemory] Expired:', key);
    return null;
  }
  
  console.log('[TurnMemory] Loaded:', {
    key,
    scope: memory.mode,
    questionId: memory.lastQuestion?.id,
    age: Math.round((Date.now() - memory.createdAt) / 1000) + 's',
  });
  
  return memory;
}

/**
 * Update turn memory (partial update)
 */
export async function updateTurnMemory(
  userId: string,
  storeId: string,
  weekId: string,
  threadId: string,
  updates: Partial<Omit<TurnMemory, 'createdAt' | 'expiresAt'>>
): Promise<boolean> {
  const memory = await loadTurnMemory(userId, storeId, weekId, threadId);
  if (!memory) return false;
  
  const updated: TurnMemory = {
    ...memory,
    ...updates,
    entities: { ...memory.entities, ...updates.entities },
    lastQuestion: updates.lastQuestion ?? memory.lastQuestion,
    lastQuestionId: updates.lastQuestionId ?? updates.lastQuestion?.id ?? memory.lastQuestionId ?? memory.lastQuestion?.id,
    mode: updates.mode ?? memory.mode,
    scope: { ...memory.scope, ...updates.scope },
    options: updates.options ?? memory.options,
    expiresAt: Date.now() + TURN_TTL_MS, // Reset TTL
    focus: memory.focus,
  };

  const focusCandidate = buildFocusPayload({
    employeeId: updates.scope?.empId ?? updates.entities?.employeeId ?? updated.scope.empId ?? updated.entities.employeeId,
    employeeName: updates.entities?.employeeName ?? updated.entities.employeeName,
    day: updates.scope?.day ?? updated.scope.day ?? updated.entities.day,
    role: updates.scope?.role ?? updated.scope.role ?? updated.entities.role,
  });

  if (focusCandidate) {
    updated.focus = {
      ...focusCandidate,
      updatedAt: Date.now(),
    };
  }

  const key = getTurnKey(userId, storeId, weekId, threadId);
  turnMemoryCache.set(key, updated);
  await kvSet(key, JSON.stringify(updated), TURN_TTL_MS);
  await saveFocusMemory(userId, storeId, weekId, threadId, updated.focus);
  
  console.log('[TurnMemory] Updated:', {
    key,
    changes: Object.keys(updates),
    focusEmployeeId: updated.focus?.employeeId,
  });
  
  return true;
}

/**
 * Clear turn memory
 */
export async function clearTurnMemory(
  userId: string,
  storeId: string,
  weekId: string,
  threadId: string
): Promise<void> {
  const key = getTurnKey(userId, storeId, weekId, threadId);
  turnMemoryCache.delete(key);
  await kvDel(key);
  console.log('[TurnMemory] Cleared:', key);
}

/**
 * Cleanup expired entries (run periodically)
 */
export function cleanupExpiredTurns(): number {
  const now = Date.now();
  let cleaned = 0;
  
  for (const [key, memory] of turnMemoryCache.entries()) {
    if (now > memory.expiresAt) {
      turnMemoryCache.delete(key);
      void kvDel(key);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    console.log('[TurnMemory] Cleanup: removed', cleaned, 'expired turns');
  }
  
  return cleaned;
}

// Auto-cleanup every 5 minutes
setInterval(cleanupExpiredTurns, 5 * 60 * 1000);

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Determine time of day from start time
 */
export function getTimeOfDay(startTime: string): TimeOfDay {
  const hour = parseInt(startTime.split(':')[0]);
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

/**
 * Create shift options from candidates
 */
export function createShiftOptions(
  candidates: Array<{
    shiftId: string;
    templateId: string;
    label: string;
    startTime: string;
    endTime: string;
    durationHours: number;
    fits: boolean;
    reason?: string;
    assignmentId?: string;
    employeeId?: string;
    employeeName?: string;
    hoursLabel?: string;
  }>
): ShiftOption[] {
  const fitting = candidates.filter((candidate) => candidate.fits);

  return fitting.map((c, index) => {
    const hasValidTime = /^\d{2}:\d{2}$/.test(c.startTime);
    return {
      optionId: `opt_${index + 1}`,
      shiftId: c.shiftId,
      templateId: c.templateId,
      label: c.label,
      startTime: c.startTime,
      endTime: c.endTime,
      durationHours: c.durationHours,
      fits: c.fits,
      reason: c.reason,
      assignmentId: c.assignmentId,
      employeeId: c.employeeId,
      employeeName: c.employeeName,
      hoursLabel: c.hoursLabel,
      timeOfDay: hasValidTime ? getTimeOfDay(c.startTime) : 'morning',
      index,
    };
  });
}

/**
 * Get single fitting option (for auto-selection)
 */
export function getSingleFittingOption(memory: TurnMemory): ShiftOption | null {
  if (!memory.options || memory.options.length === 0) return null;
  const fitting = memory.options.filter(opt => opt.fits);
  return fitting.length === 1 ? fitting[0] : null;
}

/**
 * Find option by various criteria
 */
export function findOption(
  memory: TurnMemory,
  criteria: {
    optionId?: string;
    index?: number;
    timeOfDay?: TimeOfDay;
    startTime?: string;
  }
): ShiftOption | null {
  if (!memory.options || memory.options.length === 0) {
    return null;
  }

  const { optionId, index, timeOfDay, startTime } = criteria;
  
  if (optionId) {
    return memory.options.find(opt => opt.optionId === optionId) || null;
  }
  
  if (index !== undefined) {
    return memory.options[index] || null;
  }
  
  if (timeOfDay) {
    const matching = memory.options.filter(opt => opt.timeOfDay === timeOfDay && opt.fits);
    return matching.length === 1 ? matching[0] : null;
  }
  
  if (startTime) {
    return memory.options.find(opt => opt.startTime === startTime) || null;
  }
  
  return null;
}
