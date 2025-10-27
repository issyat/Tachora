/**
 * Tool-Based Intent System
 * 
 * Simplified intent detection that maps natural language to one of 4 tools:
 * 1. metrics.get - Fetch predefined metrics
 * 2. sql.query - Ad-hoc queries (fallback)
 * 3. entities.resolve - Clarify ambiguous references
 * 4. suggest.generate - Coverage suggestions
 */

import { resolveDay, resolveTimeRange, type TimeRange } from "./tools/entities";
import type { AvailabilityQuery } from "./types";

// =====================
// SIMPLIFIED INTENT TYPES
// =====================

export type ToolIntent =
  | {
      tool: "metric";
      metricName: string;
      params: Record<string, string>;
      needsClarification?: {
        param: string;
        type: "employee" | "workType" | "day" | "timeRange";
      };
    }
  | {
      tool: "suggest";
      day?: AvailabilityQuery["day"];
      startTime?: string;
      endTime?: string;
      workType?: string;
    }
  | {
      tool: "sql";
      query: string;
      description: string;
    }
  | {
      tool: "noop";
      message?: string;
    };

// =====================
// PATTERN MATCHING
// =====================

interface Pattern {
  regex: RegExp;
  metricName: string;
  extractParams?: (match: RegExpMatchArray, text: string) => Record<string, string>;
}

const METRIC_PATTERNS: Pattern[] = [
  // IMPORTANT: Order matters! More specific patterns MUST come before generic ones
  
  // Special hours queries (check these BEFORE generic employee hours)
  {
    regex: /\bunder[\s-]?target\b/i,
    metricName: "hours:under-target",
  },
  {
    regex: /\b(over|close\s+to|approaching)\s+(target|overtime)\b/i,
    metricName: "hours:over-target",
  },
  {
    regex: /\b(top\s+\d+|most\s+hours|worked\s+the\s+most|who\s+worked\s+the\s+most)\b/i,
    metricName: "hours:top-workers",
  },
  {
    regex: /\b(who\s+is\s+working|hours\s+for\s+all|all\s+employees)\b/i,
    metricName: "hours:all",
  },

  // Generic employee hours queries (check AFTER special queries above)
  {
    regex: /\b(?:how\s+many\s+)?hours?\s+(?:did|does|has)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:work|worked)/i,
    metricName: "hours:employee",
    extractParams: (match) => ({ employeeName: match[1].trim() }),
  },
  {
    regex: /\bhours?\s+(?:for|of)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
    metricName: "hours:employee",
    extractParams: (match) => ({ employeeName: match[1].trim() }),
  },
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:hours|worked)/i,
    metricName: "hours:employee",
    extractParams: (match) => ({ employeeName: match[1].trim() }),
  },

  // Availability queries
  {
    regex: /\b(who\s+is|who.*available|who\s+can\s+work|availability)\b/i,
    metricName: "availability:day",
    extractParams: (match, text) => {
      const params: Record<string, string> = {};
      const day = resolveDay(text);
      if (day) params.day = day;
      
      const timeRange = resolveTimeRange(text);
      if (timeRange.start) params.startTime = timeRange.start;
      if (timeRange.end) params.endTime = timeRange.end;
      
      // Extract work type - use same patterns as intent.ts
      const workTypePatterns = [
        // Pattern 1: "as [a] <WorkType>"
        /\b(?:as|for)\s+(?:a\s+)?([A-Za-z]+(?:\s+[A-Za-z]+)?)(?:\s+on\b|\s+shift\b|$)/i,
        // Pattern 2: "<WorkType> shift/role"
        /\b([A-Za-z]+(?:\s+[A-Za-z]+)?)\s+(?:shift|role)\b/i,
        // Pattern 3: "work/cover/need <WorkType> on"
        /\b(?:work|cover|need)\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)\s+(?:on\b)/i,
        // Pattern 4: "<WorkType> on <day>"
        /\b([A-Za-z]+(?:\s+[A-Za-z]+)?)\s+on\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\b/i,
      ];
      
      for (const pattern of workTypePatterns) {
        const workTypeMatch = text.match(pattern);
        if (workTypeMatch) {
          const workType = workTypeMatch[1].trim();
          const normalized = workType.toLowerCase();
          
          // Filter false positives
          const falsePositives = [
            "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
            "mon", "tue", "wed", "thu", "fri", "sat", "sun",
            "morning", "evening", "afternoon", "night", "midday",
            "today", "tomorrow", "week", "day", "this", "that",
            "available", "availability", "free", "work", "working",
            "who", "what", "when", "where", "why", "how",
            "can work", "who can", "can", "work", "need", "cover"
          ];
          
          if (normalized.includes("who") || normalized.includes("can") || normalized.includes("need")) {
            continue;
          }
          
          if (!falsePositives.includes(normalized) && workType.length >= 3) {
            // Capitalize for consistency
            params.workType = workType
              .split(/\s+/)
              .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
              .join(" ");
            break;
          }
        }
      }
      
      return params;
    },
  },

  // Coverage gaps
  {
    regex: /\b(understaffed|gaps?|coverage\s+gaps?|unassigned|biggest\s+gap|which\s+day.*gap)\b/i,
    metricName: "coverage:gaps",
    extractParams: (match, text) => {
      const params: Record<string, string> = {};
      const day = resolveDay(text);
      if (day) params.day = day;
      
      // Extract work type - support multiple patterns
      const workTypePatterns = [
        // "unassigned <WorkType> shifts"
        /\bunassigned\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)\s+shifts?\b/i,
        // "<WorkType> ... unassigned"
        /\b([A-Za-z]+(?:\s+[A-Za-z]+)?)\s+(?:shifts?\s+)?(?:are|is)?\s*unassigned\b/i,
        // "unassigned ... <WorkType>"
        /\bunassigned\s+(?:shifts?\s+)?(?:for\s+)?([A-Za-z]+(?:\s+[A-Za-z]+)?)\b/i,
      ];
      
      for (const pattern of workTypePatterns) {
        const workTypeMatch = text.match(pattern);
        if (workTypeMatch) {
          const workType = workTypeMatch[1].trim();
          const normalized = workType.toLowerCase();
          
          // Filter false positives
          const falsePositives = [
            "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
            "shifts", "shift", "gaps", "gap", "coverage", "are", "is", "the", "what",
          ];
          
          if (!falsePositives.includes(normalized) && workType.length >= 3) {
            // Capitalize for consistency
            params.workType = workType
              .split(/\s+/)
              .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
              .join(" ");
            break;
          }
        }
      }
      
      return params;
    },
  },

  // Schedule/assignments
  {
    regex: /\b(what.*scheduled|schedule.*this\s+week|shifts.*this\s+week)\b/i,
    metricName: "coverage:week-assignments",
  },
  {
    regex: /\b(schedule|shifts|assignments).*\b(mon|tue|wed|thu|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
    metricName: "coverage:day-assignments",
    extractParams: (match, text) => {
      const params: Record<string, string> = {};
      const day = resolveDay(text);
      if (day) params.day = day;
      return params;
    },
  },
];

/**
 * Normalize text for matching
 */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/**
 * Interpret a natural language message into a tool intent
 */
export function interpretToolIntent(message: string): ToolIntent {
  console.log("🎯 [INTENT] Processing message:", message);
  const normalized = normalize(message);

  // Check for suggestions (special case - different tool)
  if (/\b(suggest|recommend|who\s+could\s+cover|cover.*gap)\b/i.test(normalized)) {
    const day = resolveDay(normalized);
    const timeRange = resolveTimeRange(message);
    const workTypeMatch = message.match(/\b(?:for|as)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i);
    
    console.log("💡 [INTENT] Detected suggestion request");
    return {
      tool: "suggest",
      day,
      startTime: timeRange.start,
      endTime: timeRange.end,
      workType: workTypeMatch?.[1].trim(),
    };
  }

  // Try to match against metric patterns
  for (const pattern of METRIC_PATTERNS) {
    const match = message.match(pattern.regex);
    if (match) {
      const params = pattern.extractParams ? pattern.extractParams(match, message) : {};
      
      console.log("✨ [INTENT] Matched pattern:", pattern.metricName);
      console.log("📦 [INTENT] Extracted params:", JSON.stringify(params, null, 2));
      
      // Check if we need clarification
      type ClarificationNeeded = {
        param: string;
        type: "employee" | "workType" | "day" | "timeRange";
      };
      let needsClarification: ClarificationNeeded | undefined;
      
      // For availability, require day
      if (pattern.metricName === "availability:day" && !params.day) {
        console.log("⚠️ [INTENT] Day missing, need clarification");
        needsClarification = { param: "day", type: "day" };
      }
      
      // For hours:employee, need employee name resolution
      if (pattern.metricName === "hours:employee" && params.employeeName) {
        needsClarification = { param: "employeeName", type: "employee" };
      }
      
      return {
        tool: "metric",
        metricName: pattern.metricName,
        params,
        needsClarification,
      } as ToolIntent;
    }
  }

  // No pattern matched - return noop
  console.log("❌ [INTENT] No pattern matched");
  return {
    tool: "noop",
    message: "I can answer questions about availability, hours, coverage, or staffing for this schedule.",
  };
}

/**
 * List available query types (for help messages)
 */
export function getAvailableQueries(): string[] {
  return [
    "Hours for [employee name]",
    "Who is under target?",
    "Who is available [day] [time]?",
    "Who can work as [role] on [day]?",
    "Where are we understaffed?",
    "What's scheduled this week?",
    "Suggest someone to cover [day] [time]",
  ];
}
