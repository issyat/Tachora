/**
 * Intent Router
 * 
 * Routes extracted intents to appropriate tools.
 * Enforces safety: read-only, views-only, auto-inject scope/week, LIMIT appended.
 */

import type { ExtractedIntent } from "./intent-extractor";
import type { ResolvedEntities } from "./entity-resolver";
import type { ThreadContext } from "../types";
import { getMetric, type MetricRequest, type MetricResult } from "./metrics";
import { executeSqlQuery, type SqlQueryResult, type SqlQueryRequest } from "./sql-query";
import { generateSuggestions, type SuggestionResult, type SuggestionRequest } from "./suggest";

export interface RoutedResult {
  type: "metric" | "sql" | "suggestion" | "clarification" | "error";
  data?: MetricResult | SqlQueryResult | SuggestionResult;
  clarification?: {
    type: "employee" | "work_type" | "day";
    message: string;
    options?: Array<{ id: string; label: string }>;
  };
  error?: string;
  telemetry: {
    intent: string;
    tool: string;
    view?: string;
    rowCount?: number;
    hadDataRead: boolean;
  };
}

/**
 * Route intent to appropriate tool
 */
export async function routeIntent(
  extracted: ExtractedIntent,
  resolved: ResolvedEntities,
  managerId: string,
  context: ThreadContext
): Promise<RoutedResult> {
  console.log("🚦 [ROUTER] Routing intent:", extracted.intent);

  // Handle clarifications first
  if (resolved.needsClarification) {
    return handleClarification(resolved.needsClarification, extracted.intent);
  }

  // Handle scope changes
  if (extracted.intent === "scope:change") {
    return handleScopeChange(extracted, context);
  }

  // Route to appropriate tool
  switch (extracted.intent) {
    // Metric-based intents
    case "hours:employee":
    case "hours:top-workers":
    case "hours:under-target":
    case "hours:over-target":
    case "hours:all":
    case "availability:day":
    case "coverage:gaps":
    case "coverage:day-assignments":
    case "coverage:week-assignments":
      return await routeToMetric(extracted, resolved, managerId, context);

    // Complex queries requiring SQL
    case "coverage:biggest-gap":
    case "compare:weeks":
      return await routeToSql(extracted, resolved, managerId, context);

    // Suggestions
    case "suggest:coverage":
      return await routeToSuggestion(extracted, resolved, managerId, context);

    // Unknown
    case "clarify":
    case "unknown":
    default:
      return {
        type: "clarification",
        clarification: {
          type: "day",
          message: "I can help with availability, hours, coverage, or staffing questions. Could you rephrase your question?",
        },
        telemetry: {
          intent: extracted.intent,
          tool: "none",
          hadDataRead: false,
        },
      };
  }
}

/**
 * Route to metrics.get tool
 */
async function routeToMetric(
  extracted: ExtractedIntent,
  resolved: ResolvedEntities,
  managerId: string,
  context: ThreadContext
): Promise<RoutedResult> {
  const metricRequest: MetricRequest = {
    metricName: extracted.intent,
    params: {}, // Always initialize params
  };

  // Build params from resolved entities
  // Non-null assertion since we initialized params above
  if (resolved.employeeId) metricRequest.params!.employeeId = resolved.employeeId;
  if (resolved.workTypeName) metricRequest.params!.workType = resolved.workTypeName;
  if (resolved.day) metricRequest.params!.day = resolved.day;
  if (resolved.startTime) metricRequest.params!.startTime = resolved.startTime;
  if (resolved.endTime) metricRequest.params!.endTime = resolved.endTime;
  if (extracted.entities.top_n) metricRequest.params!.topN = extracted.entities.top_n.toString();

  console.log("📊 [ROUTER] Executing metric:", metricRequest.metricName, "with params:", metricRequest.params);

  try {
    // Signature: getMetric(request, context, managerId)
    const result = await getMetric(metricRequest, context, managerId);

    return {
      type: "metric",
      data: result,
      telemetry: {
        intent: extracted.intent,
        tool: "metrics.get",
        view: result.view,
        rowCount: result.rowCount,
        hadDataRead: true,
      },
    };
  } catch (error) {
    console.error("❌ [ROUTER] Metric execution failed:", error);
    return {
      type: "error",
      error: error instanceof Error ? error.message : "Failed to execute metric",
      telemetry: {
        intent: extracted.intent,
        tool: "metrics.get",
        hadDataRead: false,
      },
    };
  }
}

/**
 * Route to sql.query tool (for complex queries)
 */
async function routeToSql(
  extracted: ExtractedIntent,
  resolved: ResolvedEntities,
  managerId: string,
  context: ThreadContext
): Promise<RoutedResult> {
  let query = "";
  let description = "";

  if (extracted.intent === "coverage:biggest-gap") {
    // Aggregate gaps by day, find day with most unassigned minutes
    query = `
      SELECT day, SUM(duration_minutes) as total_gap_minutes, COUNT(*) as gap_count
      FROM v_day_assignments
      WHERE iso_week = '${resolved.isoWeek}'
        AND schedule_store_id = '${resolved.scope.primaryStoreId}'
        AND employee_id IS NULL
      GROUP BY day
      ORDER BY total_gap_minutes DESC
      LIMIT 1
    `;
    description = "Day with biggest coverage gap";
  } else if (extracted.intent === "compare:weeks") {
    // Compare hours across two weeks
    const week1 = resolved.isoWeek || context.isoWeek;
    const week2Ref = extracted.entities.comparison?.week2 || "last week";
    const [year, week] = week1.split("-W").map(Number);
    const week2 = week2Ref.includes("last") 
      ? `${year}-W${(week - 1).toString().padStart(2, "0")}`
      : week1;

    query = `
      SELECT iso_week, employee_name, SUM(minutes) as total_minutes
      FROM v_employee_hours_week
      WHERE iso_week IN ('${week1}', '${week2}')
        AND schedule_store_id = '${resolved.scope.primaryStoreId}'
        ${resolved.employeeId ? `AND employee_id = '${resolved.employeeId}'` : ''}
      GROUP BY iso_week, employee_name, employee_id
      ORDER BY employee_name, iso_week
      LIMIT 50
    `;
    description = `Hours comparison: ${week1} vs ${week2}`;
  }

  console.log("🔍 [ROUTER] Executing SQL query:", description);

  try {
    // Signature: executeSqlQuery(request: SqlQueryRequest, context: ThreadContext)
    const sqlRequest: SqlQueryRequest = { query, description };
    const result = await executeSqlQuery(sqlRequest, context);

    return {
      type: "sql",
      data: result,
      telemetry: {
        intent: extracted.intent,
        tool: "sql.query",
        view: extractViewFromQuery(query),
        rowCount: result.rowCount,
        hadDataRead: true,
      },
    };
  } catch (error) {
    console.error("❌ [ROUTER] SQL execution failed:", error);
    return {
      type: "error",
      error: error instanceof Error ? error.message : "Failed to execute query",
      telemetry: {
        intent: extracted.intent,
        tool: "sql.query",
        hadDataRead: false,
      },
    };
  }
}

/**
 * Route to suggest.generate tool
 */
async function routeToSuggestion(
  extracted: ExtractedIntent,
  resolved: ResolvedEntities,
  managerId: string,
  context: ThreadContext
): Promise<RoutedResult> {
  console.log("💡 [ROUTER] Generating suggestions");

  try {
    // Signature: generateSuggestions(request: SuggestionRequest, context: ThreadContext, managerId: string)
    const suggestionRequest: SuggestionRequest = {
      day: resolved.day,
      startTime: resolved.startTime,
      endTime: resolved.endTime,
      workType: resolved.workTypeName,
    };
    const result = await generateSuggestions(suggestionRequest, context, managerId);

    return {
      type: "suggestion",
      data: result,
      telemetry: {
        intent: extracted.intent,
        tool: "suggest.generate",
        rowCount: result.candidates.length,
        hadDataRead: true,
      },
    };
  } catch (error) {
    console.error("❌ [ROUTER] Suggestion generation failed:", error);
    return {
      type: "error",
      error: error instanceof Error ? error.message : "Failed to generate suggestions",
      telemetry: {
        intent: extracted.intent,
        tool: "suggest.generate",
        hadDataRead: false,
      },
    };
  }
}

/**
 * Handle clarification needed
 */
function handleClarification(
  clarification: { type: "employee" | "work_type"; options: Array<{ id: string; label: string }> },
  intent: string
): RoutedResult {
  const messages = {
    employee: "I found multiple people with that name. Which one did you mean?",
    work_type: "I found multiple work types matching that. Which one did you mean?",
  };

  return {
    type: "clarification",
    clarification: {
      type: clarification.type,
      message: messages[clarification.type],
      options: clarification.options,
    },
    telemetry: {
      intent,
      tool: "entities.resolve",
      hadDataRead: true, // Did read to find matches
    },
  };
}

/**
 * Handle scope change
 */
function handleScopeChange(extracted: ExtractedIntent, context: ThreadContext): RoutedResult {
  const newScope = extracted.entities.scope;
  
  if (newScope === "all-managed") {
    context.scope = "AllManaged";
    return {
      type: "clarification",
      clarification: {
        type: "day",
        message: "✅ Now including all your stores. Cross-store employees will show with '(borrow)' tag.",
      },
      telemetry: {
        intent: "scope:change",
        tool: "scope.update",
        hadDataRead: false,
      },
    };
  } else if (newScope === "home-only") {
    context.scope = "HomeOnly";
    return {
      type: "clarification",
      clarification: {
        type: "day",
        message: "✅ Now showing only this store's employees.",
      },
      telemetry: {
        intent: "scope:change",
        tool: "scope.update",
        hadDataRead: false,
      },
    };
  }

  return {
    type: "error",
    error: "Unknown scope change requested",
    telemetry: {
      intent: "scope:change",
      tool: "scope.update",
      hadDataRead: false,
    },
  };
}

/**
 * Extract view name from SQL query
 */
function extractViewFromQuery(query: string): string {
  const match = query.match(/FROM\s+(v_\w+)/i);
  return match ? match[1] : "unknown";
}
