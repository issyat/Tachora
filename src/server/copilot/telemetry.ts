/**
 * Telemetry System
 * 
 * Tracks LLM advisor performance and ensures fail-closed behavior.
 * Critical metric: answers_without_read_pct MUST be 0%
 */

export interface TelemetryEvent {
  timestamp: Date;
  context: {
    storeIdHash: string; // Hashed for privacy
    isoWeek: string;
    scope: string;
  };
  extraction?: {
    intent: string;
    confidence: string;
    entityTypes: string[];
  };
  resolution?: {
    resolvedEntityCount: number;
    clarificationNeeded: boolean;
  };
  routing?: {
    tool: string;
    view?: string;
    rowCount?: number;
  };
  outcome: "success" | "clarification" | "error";
  hadDataRead: boolean; // CRITICAL: Must be true for success outcomes
  errorMessage?: string;
  durationMs?: number;
}

const telemetryEvents: TelemetryEvent[] = [];

/**
 * Hash a string for privacy (simple hash, not cryptographic)
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Log a telemetry event (no PII)
 */
export function logTelemetry(event: Partial<TelemetryEvent>): void {
  const fullEvent: TelemetryEvent = {
    timestamp: new Date(),
    context: event.context || { storeIdHash: "", isoWeek: "", scope: "" },
    outcome: event.outcome || "error",
    hadDataRead: event.hadDataRead || false,
    ...event,
  };

  telemetryEvents.push(fullEvent);
  
  console.log("📊 [TELEMETRY]", JSON.stringify({
    timestamp: fullEvent.timestamp.toISOString(),
    intent: fullEvent.extraction?.intent,
    tool: fullEvent.routing?.tool,
    outcome: fullEvent.outcome,
    hadDataRead: fullEvent.hadDataRead,
    rowCount: fullEvent.routing?.rowCount,
  }, null, 2));
}

/**
 * Create telemetry context from ThreadContext
 */
export function createTelemetryContext(threadContext: {
  storeId: string;
  isoWeek: string;
  scope: string;
}): TelemetryEvent["context"] {
  return {
    storeIdHash: simpleHash(threadContext.storeId),
    isoWeek: threadContext.isoWeek,
    scope: threadContext.scope,
  };
}

/**
 * Calculate telemetry metrics
 */
export interface TelemetryMetrics {
  total: number;
  successes: number;
  clarifications: number;
  errors: number;
  answers_without_read_count: number;
  answers_without_read_pct: number;
  extraction_failures: number;
  avg_duration_ms: number;
  by_intent: Record<string, number>;
  by_tool: Record<string, number>;
}

export function calculateMetrics(): TelemetryMetrics {
  const total = telemetryEvents.length;
  
  if (total === 0) {
    return {
      total: 0,
      successes: 0,
      clarifications: 0,
      errors: 0,
      answers_without_read_count: 0,
      answers_without_read_pct: 0,
      extraction_failures: 0,
      avg_duration_ms: 0,
      by_intent: {},
      by_tool: {},
    };
  }

  // CRITICAL: Count answers that didn't read data (potential hallucinations)
  const answersWithoutRead = telemetryEvents.filter(
    e => e.outcome === "success" && !e.hadDataRead
  );
  const answers_without_read_count = answersWithoutRead.length;
  const answers_without_read_pct = (answers_without_read_count / total) * 100;

  // Other metrics
  const successes = telemetryEvents.filter(e => e.outcome === "success").length;
  const clarifications = telemetryEvents.filter(e => e.outcome === "clarification").length;
  const errors = telemetryEvents.filter(e => e.outcome === "error").length;
  const extraction_failures = telemetryEvents.filter(
    e => e.extraction?.confidence === "low"
  ).length;

  const durations = telemetryEvents
    .filter(e => e.durationMs !== undefined)
    .map(e => e.durationMs!);
  const avg_duration_ms = durations.length > 0 
    ? durations.reduce((a, b) => a + b, 0) / durations.length 
    : 0;

  // Group by intent
  const by_intent: Record<string, number> = {};
  for (const event of telemetryEvents) {
    if (event.extraction?.intent) {
      by_intent[event.extraction.intent] = (by_intent[event.extraction.intent] || 0) + 1;
    }
  }

  // Group by tool
  const by_tool: Record<string, number> = {};
  for (const event of telemetryEvents) {
    if (event.routing?.tool) {
      by_tool[event.routing.tool] = (by_tool[event.routing.tool] || 0) + 1;
    }
  }

  return {
    total,
    successes,
    clarifications,
    errors,
    answers_without_read_count,
    answers_without_read_pct,
    extraction_failures,
    avg_duration_ms,
    by_intent,
    by_tool,
  };
}

/**
 * Print telemetry report
 */
export function printTelemetryReport(): void {
  const metrics = calculateMetrics();
  
  console.log("\n" + "=".repeat(60));
  console.log("📊 TELEMETRY REPORT");
  console.log("=".repeat(60));
  console.log(`Total requests: ${metrics.total}`);
  console.log(`Successes: ${metrics.successes} (${((metrics.successes / metrics.total) * 100).toFixed(1)}%)`);
  console.log(`Clarifications: ${metrics.clarifications} (${((metrics.clarifications / metrics.total) * 100).toFixed(1)}%)`);
  console.log(`Errors: ${metrics.errors} (${((metrics.errors / metrics.total) * 100).toFixed(1)}%)`);
  console.log();
  console.log(`⚠️  CRITICAL: Answers without data read: ${metrics.answers_without_read_count} (${metrics.answers_without_read_pct.toFixed(1)}%)`);
  if (metrics.answers_without_read_pct > 0) {
    console.log(`   ❌ FAIL: answers_without_read_pct MUST be 0%`);
  } else {
    console.log(`   ✅ PASS: No hallucination risk detected`);
  }
  console.log();
  console.log(`Extraction failures (low confidence): ${metrics.extraction_failures}`);
  console.log(`Avg duration: ${metrics.avg_duration_ms.toFixed(0)}ms`);
  console.log();
  console.log("By Intent:");
  Object.entries(metrics.by_intent)
    .sort((a, b) => b[1] - a[1])
    .forEach(([intent, count]) => {
      console.log(`  ${intent}: ${count}`);
    });
  console.log();
  console.log("By Tool:");
  Object.entries(metrics.by_tool)
    .sort((a, b) => b[1] - a[1])
    .forEach(([tool, count]) => {
      console.log(`  ${tool}: ${count}`);
    });
  console.log("=".repeat(60) + "\n");
}

/**
 * Validate deployment safety
 * BLOCKS deployment if answers_without_read_pct > 0%
 */
export function validateDeploymentSafety(): boolean {
  const metrics = calculateMetrics();
  
  if (metrics.total === 0) {
    console.log("⚠️  [TELEMETRY] No data to validate (no requests logged)");
    return true; // Allow deployment if no data
  }

  if (metrics.answers_without_read_pct > 0) {
    console.error("❌ [TELEMETRY] DEPLOYMENT BLOCKED");
    console.error(`   Reason: answers_without_read_pct = ${metrics.answers_without_read_pct.toFixed(2)}% (must be 0%)`);
    console.error(`   Hallucination risk detected: ${metrics.answers_without_read_count} answer(s) without reading data`);
    console.error(`   Fix: Ensure all success outcomes have hadDataRead=true`);
    return false;
  }

  console.log("✅ [TELEMETRY] Deployment safety check PASSED");
  console.log(`   Total requests: ${metrics.total}`);
  console.log(`   Answers without read: 0 (0%)`);
  return true;
}

/**
 * Clear telemetry events (for testing)
 */
export function clearTelemetry(): void {
  telemetryEvents.length = 0;
  console.log("🧹 [TELEMETRY] Cleared all events");
}

/**
 * Get all telemetry events (for testing)
 */
export function getTelemetryEvents(): readonly TelemetryEvent[] {
  return [...telemetryEvents];
}
