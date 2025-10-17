/**
 * Conversation State Manager
 * 
 * Manages locked context and shift candidates for deterministic preview creation.
 * Prevents context drift by caching user intent and available options.
 */

import type { Weekday } from '@/types';

export interface LockedContext {
  employeeId: string;
  employeeName: string;
  day: Weekday;
  role: string; // Work type name
  storeId: string;
  weekId: string;
  timestamp: number; // When context was locked
}

export interface ShiftCandidate {
  shiftId: string; // Template ID + day (e.g., "cmgo4mpzq003u7kdw-WED")
  templateId: string;
  label: string; // "Morning (09:00-15:00)" or "Afternoon (15:00-20:00)"
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  durationHours: number;
  fits: boolean; // Does it fit employee availability?
  reason?: string; // Why it doesn't fit (if fits=false)
}

export interface ConversationState {
  lockedContext?: LockedContext;
  candidates?: ShiftCandidate[];
  pendingPreviewId?: string; // If preview exists, must apply/discard first
  expiresAt: number; // TTL: 10 minutes
}

// In-memory cache with TTL (could move to Redis later)
const stateCache = new Map<string, ConversationState>();

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function getStateKey(userId: string, storeId: string, weekId: string): string {
  return `${userId}:${storeId}:${weekId}`;
}

/**
 * Lock context for the current turn
 */
export function lockContext(
  userId: string,
  context: Omit<LockedContext, 'timestamp'>
): void {
  const key = getStateKey(userId, context.storeId, context.weekId);
  const existing = stateCache.get(key);
  
  const state: ConversationState = {
    ...existing,
    lockedContext: {
      ...context,
      timestamp: Date.now(),
    },
    expiresAt: Date.now() + STATE_TTL_MS,
  };
  
  stateCache.set(key, state);
  console.log('[ConversationState] Locked context:', state.lockedContext);
}

/**
 * Store shift candidates for user selection
 */
export function storeCandidates(
  userId: string,
  storeId: string,
  weekId: string,
  candidates: ShiftCandidate[]
): void {
  const key = getStateKey(userId, storeId, weekId);
  const existing = stateCache.get(key);
  
  const state: ConversationState = {
    ...existing,
    candidates,
    expiresAt: Date.now() + STATE_TTL_MS,
  };
  
  stateCache.set(key, state);
  console.log('[ConversationState] Stored candidates:', candidates.length);
}

/**
 * Get current conversation state
 */
export function getState(
  userId: string,
  storeId: string,
  weekId: string
): ConversationState | null {
  const key = getStateKey(userId, storeId, weekId);
  const state = stateCache.get(key);
  
  if (!state) return null;
  
  // Check expiration
  if (Date.now() > state.expiresAt) {
    stateCache.delete(key);
    console.log('[ConversationState] State expired');
    return null;
  }
  
  return state;
}

/**
 * Resolve user's free-text selection to a specific shiftId
 * Maps "morning", "afternoon", "first", "1", etc. to actual shift IDs
 */
export function resolveSelection(
  userId: string,
  storeId: string,
  weekId: string,
  userInput: string
): ShiftCandidate | null {
  const state = getState(userId, storeId, weekId);
  if (!state?.candidates || state.candidates.length === 0) {
    return null;
  }
  
  const input = userInput.toLowerCase().trim();
  
  // Handle confirmations: "yes", "ok", "sure", "yeah", "yep"
  // If only one shift fits, return it
  const confirmations = ['yes', 'ok', 'okay', 'sure', 'yeah', 'yep', 'yup', 'correct'];
  if (confirmations.includes(input)) {
    const fittingCandidates = state.candidates.filter(c => c.fits);
    if (fittingCandidates.length === 1) {
      console.log('[ConversationState] Confirmation matched single fitting shift:', fittingCandidates[0].label);
      return fittingCandidates[0];
    }
  }
  
  // Try numeric index (1-based)
  const numMatch = input.match(/^(\d+)$/);
  if (numMatch) {
    const index = parseInt(numMatch[1], 10) - 1;
    if (index >= 0 && index < state.candidates.length) {
      return state.candidates[index];
    }
  }
  
  // Try "first", "second", etc.
  const ordinalMap: Record<string, number> = {
    'first': 0,
    'second': 1,
    'third': 2,
  };
  if (input in ordinalMap) {
    const index = ordinalMap[input];
    if (index < state.candidates.length) {
      return state.candidates[index];
    }
  }
  
  // Try "morning" / "afternoon" / "evening"
  const timeOfDayMap: Record<string, (time: string) => boolean> = {
    'morning': (t) => parseInt(t.split(':')[0]) < 12,
    'afternoon': (t) => {
      const hour = parseInt(t.split(':')[0]);
      return hour >= 12 && hour < 18;
    },
    'evening': (t) => parseInt(t.split(':')[0]) >= 18,
  };
  
  if (input in timeOfDayMap) {
    const matches = state.candidates.filter(c => 
      timeOfDayMap[input](c.startTime) && c.fits
    );
    if (matches.length === 1) {
      return matches[0];
    }
    if (matches.length > 1) {
      console.log('[ConversationState] Ambiguous time-of-day selection:', input);
      return null; // Ambiguous
    }
  }
  
  // Try matching against label
  const labelMatch = state.candidates.find(c =>
    c.label.toLowerCase().includes(input) && c.fits
  );
  if (labelMatch) {
    return labelMatch;
  }
  
  return null;
}

/**
 * Store pending preview ID
 */
export function setPendingPreview(
  userId: string,
  storeId: string,
  weekId: string,
  previewId: string
): void {
  const key = getStateKey(userId, storeId, weekId);
  const existing = stateCache.get(key);
  
  const state: ConversationState = {
    ...existing,
    pendingPreviewId: previewId,
    expiresAt: Date.now() + STATE_TTL_MS,
  };
  
  stateCache.set(key, state);
  console.log('[ConversationState] Set pending preview:', previewId);
}

/**
 * Clear pending preview (after apply/discard)
 */
export function clearPendingPreview(
  userId: string,
  storeId: string,
  weekId: string
): void {
  const key = getStateKey(userId, storeId, weekId);
  const existing = stateCache.get(key);
  
  if (existing) {
    const state: ConversationState = {
      ...existing,
      pendingPreviewId: undefined,
    };
    stateCache.set(key, state);
    console.log('[ConversationState] Cleared pending preview');
  }
}

/**
 * Clear all state (after apply/discard)
 */
export function clearState(
  userId: string,
  storeId: string,
  weekId: string
): void {
  const key = getStateKey(userId, storeId, weekId);
  stateCache.delete(key);
  console.log('[ConversationState] Cleared state');
}

/**
 * Cleanup expired states (run periodically)
 */
export function cleanupExpiredStates(): void {
  const now = Date.now();
  let cleaned = 0;
  
  for (const [key, state] of stateCache.entries()) {
    if (now > state.expiresAt) {
      stateCache.delete(key);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    console.log(`[ConversationState] Cleaned up ${cleaned} expired states`);
  }
}

// Run cleanup every 5 minutes
setInterval(cleanupExpiredStates, 5 * 60 * 1000);
