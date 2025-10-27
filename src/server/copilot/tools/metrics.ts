/**
 * metrics.get - Generic metric fetching tool
 * 
 * Fetches any metric from the catalog by name, with automatic context injection.
 */

import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { METRICS_CATALOG, type MetricDefinition } from "../metrics-catalog";
import { resolveScope } from "../scope";
import { fetchScopedEmployees } from "../data/employees";
import type { ThreadContext } from "../types";

export interface MetricRequest {
  metricName: string;
  params?: Record<string, string>;
}

export interface MetricResult {
  metricName: string;
  view: string;
  rows: unknown[];
  rowCount: number;
}

/**
 * Template parameter substitution with auto-injection
 */
function buildQuery(
  metric: MetricDefinition,
  params: Record<string, string>,
  context: {
    storeId: string;
    isoWeek: string;
    allStoreIds: string[];
    scopedEmployeeIds: string[];
  },
): { sql: string; values: unknown[] } {
  let sql = metric.query.trim();
  const values: unknown[] = [];
  let paramIndex = 1;

  // Auto-inject context parameters
  const allParams = {
    ...params,
    storeId: context.storeId,
    isoWeek: context.isoWeek,
    allStoreIds: `{${context.allStoreIds.join(",")}}`,
    scopedEmployeeIds: `{${context.scopedEmployeeIds.join(",")}}`,
  };

  // Replace {{param}} placeholders with $1, $2, etc.
  for (const [key, value] of Object.entries(allParams)) {
    const placeholder = `{{${key}}}`;
    if (sql.includes(placeholder)) {
      // Handle array parameters specially
      if (key === "allStoreIds" || key === "scopedEmployeeIds") {
        sql = sql.replace(new RegExp(placeholder, "g"), `$${paramIndex}::text[]`);
      } else if (key === "day") {
        sql = sql.replace(new RegExp(placeholder, "g"), `$${paramIndex}::"Weekday"`);
      } else {
        sql = sql.replace(new RegExp(placeholder, "g"), `$${paramIndex}`);
      }
      values.push(value);
      paramIndex++;
    }
  }

  // Handle conditional blocks like {{#if day}}...{{/if}}
  sql = sql.replace(/\{\{#if\s+(\w+)\}\}(.*?)\{\{\/if\}\}/g, (_match: string, paramName: string, content: string) => {
    return allParams[paramName as keyof typeof allParams] ? content : "";
  });

  return { sql, values };
}

/**
 * Fetch a metric from the catalog
 */
export async function getMetric(
  request: MetricRequest,
  context: ThreadContext,
  managerId: string,
): Promise<MetricResult> {
  const metric = METRICS_CATALOG[request.metricName];
  
  if (!metric) {
    throw new Error(`Unknown metric: ${request.metricName}. Available: ${Object.keys(METRICS_CATALOG).join(", ")}`);
  }

  // Validate required params
  for (const param of metric.params) {
    if (param.required && !request.params?.[param.name]) {
      throw new Error(`Missing required parameter: ${param.name} (${param.description})`);
    }
  }

  // Get scope and employees
  const scope = await resolveScope(managerId, context);
  const employees = await fetchScopedEmployees(managerId, scope);
  const scopedEmployeeIds = employees.map((e: { id: string }) => e.id);

  // Special handling for availability:day - use the old function for proper filtering
  if (request.metricName === "availability:day") {
    console.log("🔍 [METRICS] availability:day detected");
    console.log("📋 [METRICS] Params:", JSON.stringify(request.params, null, 2));
    console.log("🏪 [METRICS] Context:", { storeId: context.storeId, isoWeek: context.isoWeek });
    
    const { fetchAvailability } = await import("../data/availability");
    const results = await fetchAvailability({
      managerId,
      context,
      query: {
        day: request.params?.day as any,
        startTime: request.params?.startTime,
        endTime: request.params?.endTime,
        workType: request.params?.workType,
      },
    });
    
    console.log("✅ [METRICS] fetchAvailability returned", results.length, "results");
    if (results.length > 0) {
      console.log("📝 [METRICS] First result:", JSON.stringify(results[0], null, 2));
    }
    
    return {
      metricName: request.metricName,
      view: "v_availability",
      rows: results as unknown[],
      rowCount: results.length,
    };
  }

  // Build query with context injection
  const { sql, values } = buildQuery(metric, request.params ?? {}, {
    storeId: context.storeId,
    isoWeek: context.isoWeek,
    allStoreIds: scope.allStoreIds,
    scopedEmployeeIds,
  });

  // Execute query
  const rows = await prisma.$queryRawUnsafe<unknown[]>(sql, ...values);

  return {
    metricName: request.metricName,
    view: metric.view,
    rows,
    rowCount: rows.length,
  };
}

/**
 * Get metric definition by name
 */
export function getMetricDefinition(metricName: string): MetricDefinition | undefined {
  return METRICS_CATALOG[metricName];
}

/**
 * List all available metrics
 */
export function listMetrics(): Array<{ name: string; description: string }> {
  return Object.values(METRICS_CATALOG).map((m: MetricDefinition) => ({
    name: m.name,
    description: m.description,
  }));
}
