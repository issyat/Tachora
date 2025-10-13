/**
 * Chat Metrics & Observability
 * 
 * Tracks performance metrics, payload sizes, and model behavior
 * for monitoring and alerting.
 */

export interface ChatMetrics {
  requestId: string;
  userId: string;
  storeId?: string;
  weekId?: string;
  version?: string;
  timestamp: string;
  
  // Payload metrics
  payloadSizeBytes?: number;
  snapshotSizeBytes?: number;
  truncated?: boolean;
  
  // Performance metrics
  totalLatencyMs: number;
  snapshotBuildMs?: number;
  llmLatencyMs?: number;
  
  // LLM metrics
  toolCallCount: number;
  toolsUsed: string[];
  messageLength: number;
  replyLength: number;
  
  // Query metrics
  evalQueryCount: number;
  evalQueryTotalMs?: number;
  exprLengths: number[];
  
  // Behavior metrics
  intent?: string;
  refused?: boolean;
  error?: string;
}

const metrics: ChatMetrics[] = [];
const MAX_METRICS_BUFFER = 1000;

// Alert thresholds
const ALERT_THRESHOLDS = {
  payloadSizeBytes: 50 * 1024, // 50KB
  totalLatencyMs: 2000, // 2s (p95 target)
  toolCallCount: 3,
};

export function createMetrics(userId: string): ChatMetrics {
  return {
    requestId: generateRequestId(),
    userId,
    timestamp: new Date().toISOString(),
    totalLatencyMs: 0,
    toolCallCount: 0,
    toolsUsed: [],
    messageLength: 0,
    replyLength: 0,
    evalQueryCount: 0,
    exprLengths: [],
  };
}

export function recordMetrics(metric: ChatMetrics): void {
  metrics.push(metric);
  
  // Keep buffer size manageable
  if (metrics.length > MAX_METRICS_BUFFER) {
    metrics.shift();
  }
  
  // Check for alerts
  checkAlerts(metric);
  
  // Log to console (in production, send to monitoring service)
  logMetrics(metric);
}

function checkAlerts(metric: ChatMetrics): void {
  const alerts: string[] = [];
  
  if (metric.payloadSizeBytes && metric.payloadSizeBytes > ALERT_THRESHOLDS.payloadSizeBytes) {
    alerts.push(`ALERT: Payload size ${metric.payloadSizeBytes} exceeds ${ALERT_THRESHOLDS.payloadSizeBytes}`);
  }
  
  if (metric.totalLatencyMs > ALERT_THRESHOLDS.totalLatencyMs) {
    alerts.push(`ALERT: Latency ${metric.totalLatencyMs}ms exceeds ${ALERT_THRESHOLDS.totalLatencyMs}ms`);
  }
  
  if (metric.toolCallCount > ALERT_THRESHOLDS.toolCallCount) {
    alerts.push(`ALERT: Tool calls ${metric.toolCallCount} exceeds ${ALERT_THRESHOLDS.toolCallCount}`);
  }
  
  if (alerts.length > 0) {
    console.warn("Chat metrics alerts:", {
      requestId: metric.requestId,
      alerts,
      metric,
    });
  }
}

function logMetrics(metric: ChatMetrics): void {
  console.log("Chat metrics:", {
    requestId: metric.requestId,
    userId: metric.userId,
    storeId: metric.storeId,
    weekId: metric.weekId,
    latency: `${metric.totalLatencyMs}ms`,
    snapshotSize: metric.snapshotSizeBytes ? `${(metric.snapshotSizeBytes / 1024).toFixed(1)}KB` : undefined,
    truncated: metric.truncated,
    toolCalls: metric.toolCallCount,
    tools: metric.toolsUsed.join(","),
    evalQueries: metric.evalQueryCount,
    intent: metric.intent,
    refused: metric.refused,
    error: metric.error,
  });
}

export function getMetricsSummary(): {
  total: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  avgPayloadSize: number;
  refusalRate: number;
  errorRate: number;
} {
  if (metrics.length === 0) {
    return {
      total: 0,
      avgLatencyMs: 0,
      p95LatencyMs: 0,
      avgPayloadSize: 0,
      refusalRate: 0,
      errorRate: 0,
    };
  }
  
  const latencies = metrics.map((m) => m.totalLatencyMs).sort((a, b) => a - b);
  const payloadSizes = metrics.filter((m) => m.payloadSizeBytes).map((m) => m.payloadSizeBytes!);
  const refusals = metrics.filter((m) => m.refused).length;
  const errors = metrics.filter((m) => m.error).length;
  
  const p95Index = Math.floor(latencies.length * 0.95);
  
  return {
    total: metrics.length,
    avgLatencyMs: latencies.reduce((a, b) => a + b, 0) / latencies.length,
    p95LatencyMs: latencies[p95Index] || 0,
    avgPayloadSize: payloadSizes.length > 0
      ? payloadSizes.reduce((a, b) => a + b, 0) / payloadSizes.length
      : 0,
    refusalRate: refusals / metrics.length,
    errorRate: errors / metrics.length,
  };
}

function generateRequestId(): string {
  return `chat_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// Export for testing/monitoring endpoints
export function getRecentMetrics(limit = 100): ChatMetrics[] {
  return metrics.slice(-limit);
}
