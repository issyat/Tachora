/**
 * Tool-based advisor handler
 * 
 * Simplified request handler using the 4-tool architecture
 */

import { interpretToolIntent, type ToolIntent } from "./tool-intent";
import { getMetric } from "./tools/metrics";
import { executeSqlQuery } from "./tools/sql-query";
import { generateSuggestions } from "./tools/suggest";
import { resolveEntities, resolveEmployee } from "./tools/entities";
import { formatMetricResult, formatSuggestions, formatSqlResult } from "./formatters";
import { resolveScope } from "./scope";
import { fetchScopedEmployees } from "./data/employees";
import { handleQueryLLM, type LLMAdvisorResponse } from "./llm-advisor";
import type { ThreadContext } from "./types";

// Feature flag for LLM advisor
const USE_LLM_ADVISOR = process.env.USE_LLM_ADVISOR === "true";

export interface ToolResponse {
  text: string;
  sources: string[];
  needsClarification?: {
    type: "employee" | "workType" | "day";
    options: Array<{ id: string; name: string; extra?: string }>;
    originalQuestion: string;
  };
}

/**
 * Main entry point - chooses between pattern-based and LLM-based systems
 */
export async function handleCopilotQuery(
  message: string,
  context: ThreadContext,
  managerId: string
): Promise<ToolResponse> {
  console.log(`🤖 [COPILOT] Using ${USE_LLM_ADVISOR ? "LLM" : "pattern"} advisor`);
  
  if (USE_LLM_ADVISOR) {
    // Use LLM-based intent extraction
    try {
      const llmResponse = await handleQueryLLM(message, managerId, context);
      
      // Convert LLMAdvisorResponse to ToolResponse
      if (llmResponse.needsClarification) {
        // Convert work_type to workType for compatibility
        const clarType = llmResponse.needsClarification.type === "work_type" 
          ? "workType" 
          : llmResponse.needsClarification.type as "employee" | "workType" | "day";
        
        return {
          text: llmResponse.text,
          sources: llmResponse.sources,
          needsClarification: {
            type: clarType,
            options: llmResponse.needsClarification.options?.map(opt => ({
              id: opt.id,
              name: opt.label,
            })) || [],
            originalQuestion: message,
          },
        };
      }
      
      return {
        text: llmResponse.text,
        sources: llmResponse.sources,
      };
    } catch (error) {
      console.error("❌ [COPILOT] LLM advisor error:", error);
      // Fallback to pattern system on error
      console.log("🔄 [COPILOT] Falling back to pattern system");
    }
  }
  
  // Use pattern-based intent matching (original system)
  const intent = interpretToolIntent(message);
  return executeToolIntent(intent, message, context, managerId);
}

/**
 * Execute a tool-based intent (pattern system)
 */
export async function executeToolIntent(
  intent: ToolIntent,
  message: string,
  context: ThreadContext,
  managerId: string
): Promise<ToolResponse> {
  
  switch (intent.tool) {
    case "metric": {
      // Check if we need clarification first
      if (intent.needsClarification) {
        return await handleClarification(intent, message, context, managerId);
      }

      // Execute the metric query
      try {
        const result = await getMetric(
          {
            metricName: intent.metricName,
            params: intent.params,
          },
          context,
          managerId
        );

        const formatted = formatMetricResult(result, context.storeId, context);
        return {
          text: formatted.text,
          sources: formatted.sources,
        };
      } catch (error) {
        return {
          text: `Error executing query: ${error instanceof Error ? error.message : String(error)}`,
          sources: [],
        };
      }
    }

    case "suggest": {
      try {
        const result = await generateSuggestions(
          {
            day: intent.day,
            startTime: intent.startTime,
            endTime: intent.endTime,
            workType: intent.workType,
            limit: 5,
          },
          context,
          managerId
        );

        const formatted = formatSuggestions(result, context);
        return {
          text: formatted.text,
          sources: formatted.sources,
        };
      } catch (error) {
        return {
          text: `Error generating suggestions: ${error instanceof Error ? error.message : String(error)}`,
          sources: [],
        };
      }
    }

    case "sql": {
      try {
        const result = await executeSqlQuery(
          {
            query: intent.query,
            description: intent.description,
          },
          context
        );

        const formatted = formatSqlResult(result, context);
        return {
          text: formatted.text,
          sources: formatted.sources,
        };
      } catch (error) {
        return {
          text: `Error executing query: ${error instanceof Error ? error.message : String(error)}`,
          sources: [],
        };
      }
    }

    case "noop":
    default: {
      return {
        text: intent.message || "I can answer questions about availability, hours, coverage, or staffing for this schedule.",
        sources: [],
      };
    }
  }
}

/**
 * Handle clarification needs
 */
async function handleClarification(
  intent: ToolIntent & { tool: "metric" },
  message: string,
  context: ThreadContext,
  managerId: string
): Promise<ToolResponse> {
  
  if (!intent.needsClarification) {
    throw new Error("No clarification needed");
  }

  const { param, type } = intent.needsClarification;

  // Employee name clarification
  if (type === "employee" && param === "employeeName") {
    const inputName = intent.params[param];
    if (!inputName) {
      return {
        text: "Which employee did you mean?",
        sources: [],
      };
    }

    // Get scoped employees
    const scope = await resolveScope(managerId, context);
    const employees = await fetchScopedEmployees(managerId, scope);
    const scopedIds = employees.map((e: { id: string }) => e.id);

    // Resolve employee
    const matches = await resolveEmployee(inputName, scopedIds);

    if (matches.length === 0) {
      return {
        text: `No employee found matching "${inputName}". Please check the spelling and try again.`,
        sources: [],
      };
    }

    if (matches.length === 1) {
      // Exact match - execute the query with resolved ID
      const resolvedIntent = {
        ...intent,
        params: {
          ...intent.params,
          employeeId: matches[0].id,
        },
        needsClarification: undefined,
      };
      return await executeToolIntent(resolvedIntent, message, context, managerId);
    }

    // Multiple matches - ask for clarification
    return {
      text: `Which "${inputName}" did you mean?`,
      sources: [],
      needsClarification: {
        type: "employee",
        options: matches.slice(0, 5).map((m) => ({
          id: m.id,
          name: m.name,
          extra: m.storeId === context.storeId ? "home" : "borrow",
        })),
        originalQuestion: message,
      },
    };
  }

  // Day clarification
  if (type === "day" && param === "day") {
    return {
      text: "Which day would you like to check? (Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday)",
      sources: [],
      needsClarification: {
        type: "day",
        options: [
          { id: "MON", name: "Monday" },
          { id: "TUE", name: "Tuesday" },
          { id: "WED", name: "Wednesday" },
          { id: "THU", name: "Thursday" },
          { id: "FRI", name: "Friday" },
          { id: "SAT", name: "Saturday" },
          { id: "SUN", name: "Sunday" },
        ],
        originalQuestion: message,
      },
    };
  }

  // Default fallback
  return {
    text: "I need more information to answer that question.",
    sources: [],
  };
}
