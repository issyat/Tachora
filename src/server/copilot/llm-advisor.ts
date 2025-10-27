/**
 * LLM Advisor - Main Integration
 * 
 * Entry point for LLM-based intent extraction system.
 * Flow: Extract → Resolve → Route → Format → Validate
 */

import { extractIntent, type ExtractedIntent } from "./tools/intent-extractor";
import { resolveEntities, type ResolvedEntities } from "./tools/entity-resolver";
import { routeIntent, type RoutedResult } from "./tools/intent-router";
import { formatMetricResult, formatSuggestions, formatSqlResult } from "./formatters";
import { 
  logTelemetry, 
  createTelemetryContext, 
  validateDeploymentSafety,
  type TelemetryEvent 
} from "./telemetry";
import type { ThreadContext } from "./types";

export interface LLMAdvisorResponse {
  text: string;
  sources: string[];
  needsClarification?: {
    type: "employee" | "work_type" | "day";
    message: string;
    options?: Array<{ id: string; label: string }>;
  };
  error?: string;
}

/**
 * Handle user query with LLM-based intent extraction
 */
export async function handleQueryLLM(
  message: string,
  managerId: string,
  context: ThreadContext
): Promise<LLMAdvisorResponse> {
  const startTime = Date.now();
  const telemetryContext = createTelemetryContext(context);

  try {
    console.log("\n" + "=".repeat(60));
    console.log("🤖 [LLM ADVISOR] New query:", message);
    console.log("📍 [LLM ADVISOR] Context:", {
      storeId: context.storeId,
      isoWeek: context.isoWeek,
      scope: context.scope,
    });
    console.log("=".repeat(60) + "\n");

    // Step 1: Extract intent
    console.log("1️⃣ [LLM ADVISOR] Extracting intent...");
    const extracted = await extractIntent(message);
    console.log("✅ [LLM ADVISOR] Intent extracted:", extracted.intent, `(confidence: ${extracted.confidence})`);

    logTelemetry({
      context: telemetryContext,
      extraction: {
        intent: extracted.intent,
        confidence: extracted.confidence,
        entityTypes: Object.keys(extracted.entities),
      },
      outcome: "success",
      hadDataRead: false,
    });

    // Step 2: Resolve entities
    console.log("2️⃣ [LLM ADVISOR] Resolving entities...");
    const resolved = await resolveEntities(extracted, managerId, context);
    console.log("✅ [LLM ADVISOR] Entities resolved");

    logTelemetry({
      context: telemetryContext,
      resolution: {
        resolvedEntityCount: Object.keys(resolved).filter(k => k !== "needsClarification" && k !== "scope").length,
        clarificationNeeded: !!resolved.needsClarification,
      },
      outcome: resolved.needsClarification ? "clarification" : "success",
      hadDataRead: false,
    });

    // Step 3: Handle clarifications
    if (resolved.needsClarification) {
      console.log("❓ [LLM ADVISOR] Clarification needed:", resolved.needsClarification.type);
      
      const clarificationMessage = formatClarification(resolved.needsClarification);
      
      logTelemetry({
        context: telemetryContext,
        outcome: "clarification",
        hadDataRead: false,
        durationMs: Date.now() - startTime,
      });

      return {
        text: clarificationMessage,
        sources: [],
        needsClarification: {
          type: resolved.needsClarification.type,
          message: clarificationMessage,
          options: resolved.needsClarification.options,
        },
      };
    }

    // Step 4: Route to appropriate tool
    console.log("3️⃣ [LLM ADVISOR] Routing intent to tool...");
    const result = await routeIntent(extracted, resolved, managerId, context);
    console.log("✅ [LLM ADVISOR] Tool executed:", result.type);

    logTelemetry({
      context: telemetryContext,
      routing: {
        tool: result.telemetry.tool,
        view: result.telemetry.view,
        rowCount: result.telemetry.rowCount,
      },
      outcome: result.type === "error" ? "error" : "success",
      hadDataRead: result.telemetry.hadDataRead,
    });

    // Step 5: CRITICAL - Fail-closed check
    if (!result.telemetry.hadDataRead && result.type !== "clarification" && result.type !== "error") {
      console.error("❌ [LLM ADVISOR] CRITICAL: Attempted to answer without reading data");
      
      logTelemetry({
        context: telemetryContext,
        outcome: "error",
        hadDataRead: false,
        errorMessage: "Attempted to answer without reading data - hallucination risk",
        durationMs: Date.now() - startTime,
      });

      throw new Error("CRITICAL: Attempted to answer without reading data - hallucination risk");
    }

    // Step 6: Format output with contract
    console.log("4️⃣ [LLM ADVISOR] Formatting output...");
    let formatted: { text: string; sources: string[]; hadDataRead: boolean };

    switch (result.type) {
      case "metric":
        formatted = formatMetricResult(result.data as any, context.storeId, context);
        break;
      
      case "suggestion":
        formatted = formatSuggestions(result.data as any, context);
        break;
      
      case "sql":
        formatted = formatSqlResult(result.data as any, context, result.telemetry.view);
        break;
      
      case "error":
        console.error("❌ [LLM ADVISOR] Error:", result.error);
        logTelemetry({
          context: telemetryContext,
          outcome: "error",
          hadDataRead: false,
          errorMessage: result.error,
          durationMs: Date.now() - startTime,
        });
        return {
          text: `I encountered an error: ${result.error}`,
          sources: [],
          error: result.error,
        };
      
      default:
        throw new Error(`Unknown result type: ${result.type}`);
    }

    console.log("✅ [LLM ADVISOR] Output formatted");
    console.log("📊 [LLM ADVISOR] Final check - hadDataRead:", formatted.hadDataRead);

    // Final telemetry
    logTelemetry({
      context: telemetryContext,
      extraction: {
        intent: extracted.intent,
        confidence: extracted.confidence,
        entityTypes: Object.keys(extracted.entities),
      },
      routing: {
        tool: result.telemetry.tool,
        view: result.telemetry.view,
        rowCount: result.telemetry.rowCount,
      },
      outcome: "success",
      hadDataRead: formatted.hadDataRead,
      durationMs: Date.now() - startTime,
    });

    console.log("\n" + "=".repeat(60));
    console.log("✅ [LLM ADVISOR] Query complete");
    console.log("⏱️  Duration:", Date.now() - startTime, "ms");
    console.log("=".repeat(60) + "\n");

    return {
      text: formatted.text,
      sources: formatted.sources,
    };

  } catch (error) {
    console.error("❌ [LLM ADVISOR] Unhandled error:", error);
    
    logTelemetry({
      context: telemetryContext,
      outcome: "error",
      hadDataRead: false,
      errorMessage: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startTime,
    });

    return {
      text: "I encountered an error processing your request. Please try rephrasing your question.",
      sources: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Format clarification prompt
 */
function formatClarification(clarification: { type: "employee" | "work_type"; options: Array<{ id: string; label: string }> }): string {
  switch (clarification.type) {
    case "employee":
      if (!clarification.options || clarification.options.length === 0) {
        return "I couldn't find an employee matching that name. Could you provide more details?";
      }
      const empLines = clarification.options.map((opt, i) => 
        `${i + 1}. ${opt.label}`
      );
      return `I found multiple employees. Which one did you mean?\n${empLines.join("\n")}`;
    
    case "work_type":
      if (!clarification.options || clarification.options.length === 0) {
        return "I couldn't find a work type matching that name. What role are you looking for?";
      }
      const wtLines = clarification.options.map((opt, i) => 
        `${i + 1}. ${opt.label}`
      );
      return `I found multiple work types. Which one did you mean?\n${wtLines.join("\n")}`;
    
    default:
      return "I need some clarification. Could you provide more details?";
  }
}

/**
 * Export validation function for deployment checks
 */
export { validateDeploymentSafety };
