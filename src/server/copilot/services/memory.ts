/**
 * Simple Thread Memory Management
 * 
 * Stores minimal conversation state per thread for context continuity
 */

export type SupportedLanguage = 'en' | 'fr' | 'nl';

export interface ThreadMemory {
  threadId: string;
  language: SupportedLanguage;
  weekStart: string; // YYYY-MM-DD (Monday)
  crossStore: boolean;
  selectedEmployeeId?: string;
  selectedEmployeeName?: string;
  workTypes: string[];
  lastUpdated: string; // ISO timestamp
  questionCount: number;
}

export interface MemoryUpdate {
  language?: SupportedLanguage;
  selectedEmployeeId?: string;
  selectedEmployeeName?: string;
  weekStart?: string;
  crossStore?: boolean;
  workTypes?: string[];
}

/**
 * Simple in-memory storage for thread contexts
 * In production, this would be backed by Redis or database
 */
class ThreadMemoryStore {
  private memories = new Map<string, ThreadMemory>();

  /**
   * Get or create thread memory
   */
  getMemory(threadId: string): ThreadMemory {
    if (!this.memories.has(threadId)) {
      this.memories.set(threadId, {
        threadId,
        language: 'en',
        crossStore: false,
        weekStart: this.getCurrentWeekStart(),
        workTypes: [],
        lastUpdated: new Date().toISOString(),
        questionCount: 0,
      });
    }

    return this.memories.get(threadId)!;
  }

  /**
   * Update thread memory
   */
  updateMemory(threadId: string, updates: MemoryUpdate): ThreadMemory {
    const memory = this.getMemory(threadId);

    Object.assign(memory, {
      ...updates,
      lastUpdated: new Date().toISOString(),
      questionCount: memory.questionCount + 1,
    });

    this.memories.set(threadId, memory);
    return memory;
  }

  /**
   * Clear thread memory (for testing or reset)
   */
  clearMemory(threadId: string): void {
    this.memories.delete(threadId);
  }

  /**
   * Get current week start (Monday)
   */
  private getCurrentWeekStart(): string {
    const now = new Date();
    const monday = new Date(now);
    const dayOfWeek = now.getDay();
    const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    monday.setDate(now.getDate() + daysToMonday);
    return monday.toISOString().split('T')[0];
  }

  /**
   * Cleanup old memories (TTL management)
   */
  cleanup(maxAgeHours: number = 24): void {
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - maxAgeHours);
    const cutoffTime = cutoff.toISOString();

    for (const [threadId, memory] of this.memories.entries()) {
      if (memory.lastUpdated < cutoffTime) {
        this.memories.delete(threadId);
      }
    }
  }
}

// Singleton instance
const memoryStore = new ThreadMemoryStore();

export class MemoryService {
  /**
   * Get thread memory
   */
  static getThreadMemory(threadId: string): ThreadMemory {
    return memoryStore.getMemory(threadId);
  }

  /**
   * Update thread memory
   */
  static updateThreadMemory(threadId: string, updates: MemoryUpdate): ThreadMemory {
    return memoryStore.updateMemory(threadId, updates);
  }

  /**
   * Clear thread memory
   */
  static clearMemory(threadId: string): void {
    memoryStore.clearMemory(threadId);
  }

  /**
   * Generate thread ID from request context
   */
  static generateThreadId(userId: string, storeId: string, sessionId?: string): string {
    return `${userId}:${storeId}:${sessionId || 'default'}`;
  }

  /**
   * Periodic cleanup of old memories
   */
  static cleanup(): void {
    memoryStore.cleanup();
  }
}