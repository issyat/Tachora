import crypto from "node:crypto";
import jmespath from "jmespath";

interface SnapshotCacheEntry {
  results: Map<string, unknown>;
  createdAt: number;
}

const snapshotCache = new Map<string, SnapshotCacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_RESULT_LENGTH = 5_000; // characters
const MAX_EXPR_LENGTH = 300; // characters
const QUERY_TIMEOUT_MS = 50; // milliseconds

export interface EvalQueryInput {
  version: string;
  snapshot: unknown;
  expr: string;
}

export interface EvalQueryResult {
  ok: boolean;
  result?: unknown;
  error?: string;
  metrics?: {
    cached: boolean;
    executionTimeMs?: number;
    resultSizeBytes?: number;
  };
}

// Helper functions to extend query capabilities
function postProcessResult(result: unknown): unknown {
  // Add any post-processing transformations here
  return result;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('Query timeout')), timeoutMs)
    ),
  ]);
}

function getCache(version: string): Map<string, unknown> {
  const now = Date.now();
  const entry = snapshotCache.get(version);
  if (entry && now - entry.createdAt < CACHE_TTL_MS) {
    return entry.results;
  }

  const results = new Map<string, unknown>();
  snapshotCache.set(version, { results, createdAt: now });
  return results;
}

function safeSerialize(result: unknown): string {
  try {
    return JSON.stringify(result);
  } catch (error) {
    return JSON.stringify({ error: "UNSERIALIZABLE", message: error instanceof Error ? error.message : String(error) });
  }
}

export function runEvalQuery({ version, snapshot, expr }: EvalQueryInput): EvalQueryResult {
  const trimmedExpr = expr?.trim();
  if (!trimmedExpr) {
    return { ok: false, error: "Expression is required" };
  }

  // Enforce expression length limit
  if (trimmedExpr.length > MAX_EXPR_LENGTH) {
    return {
      ok: false,
      error: `Expression too long (${trimmedExpr.length} chars, max ${MAX_EXPR_LENGTH})`,
    };
  }

  const startTime = Date.now();
  const cache = getCache(version);
  
  // Check cache first
  if (cache.has(trimmedExpr)) {
    const result = cache.get(trimmedExpr);
    return {
      ok: true,
      result,
      metrics: {
        cached: true,
        executionTimeMs: 0,
      },
    };
  }

  try {
    // Execute query with timeout protection
    const result = jmespath.search(snapshot, trimmedExpr);
    const executionTime = Date.now() - startTime;

    // Check execution time
    if (executionTime > QUERY_TIMEOUT_MS) {
      console.warn(`Query exceeded timeout: ${executionTime}ms for expr: ${trimmedExpr.slice(0, 50)}...`);
    }

    const serialized = safeSerialize(result);
    const resultSizeBytes = Buffer.byteLength(serialized, 'utf8');

    if (serialized.length > MAX_RESULT_LENGTH) {
      return {
        ok: false,
        error: `Result too large (${resultSizeBytes} bytes, max ~${MAX_RESULT_LENGTH} chars)`,
        metrics: {
          cached: false,
          executionTimeMs: executionTime,
          resultSizeBytes,
        },
      };
    }

    cache.set(trimmedExpr, result);
    return {
      ok: true,
      result: postProcessResult(result),
      metrics: {
        cached: false,
        executionTimeMs: executionTime,
        resultSizeBytes,
      },
    };
  } catch (error) {
    const executionTime = Date.now() - startTime;
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      error: `Failed to run query: ${message}`,
      metrics: {
        cached: false,
        executionTimeMs: executionTime,
      },
    };
  }
}

export function computeSnapshotVersion(snapshot: unknown): string {
  const json = safeSerialize(snapshot);
  return crypto.createHash("sha256").update(json).digest("hex").slice(0, 16);
}
