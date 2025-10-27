/**
 * LLM-Based Intent Extractor
 * 
 * Extracts structured intent and entities from natural language queries.
 * Uses strict JSON mode with low temperature for deterministic output.
 * 
 * Contract:
 * - Input: Natural language query
 * - Output: Strict JSON with intent + entities
 * - Temperature: ≤ 0.2 for consistency
 * - Fallback: If extraction fails, return "clarify" intent
 */

import OpenAI from "openai";

// Lazy-load OpenAI client only when needed (avoids error when USE_LLM_ADVISOR=false)
let openai: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openai) {
    const apiKey = process.env.OPENAI_API_KEY || process.env.AZURE_OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "Missing OpenAI credentials. Set OPENAI_API_KEY or AZURE_OPENAI_API_KEY environment variable."
      );
    }
    openai = new OpenAI({
      apiKey,
      baseURL: process.env.AZURE_OPENAI_ENDPOINT 
        ? `${process.env.AZURE_OPENAI_ENDPOINT}/openai/deployments/${process.env.AZURE_OPENAI_DEPLOYMENT_NAME}`
        : undefined,
      defaultQuery: process.env.AZURE_OPENAI_ENDPOINT 
        ? { "api-version": "2024-08-01-preview" }
        : undefined,
      defaultHeaders: process.env.AZURE_OPENAI_ENDPOINT
        ? { "api-key": apiKey }
        : undefined,
    });
  }
  return openai;
}

/**
 * Extracted intent and entities from user query
 */
export interface ExtractedIntent {
  intent:
    | "hours:employee"
    | "hours:top-workers"
    | "hours:under-target"
    | "hours:over-target"
    | "hours:all"
    | "availability:day"
    | "coverage:gaps"
    | "coverage:biggest-gap"
    | "coverage:day-assignments"
    | "coverage:week-assignments"
    | "compare:weeks"
    | "suggest:coverage"
    | "scope:change"
    | "clarify"
    | "unknown";
  
  entities: {
    employee_name?: string;
    work_type_text?: string;
    day?: string; // MON, TUE, WED, etc. or parsed from query
    time_window?: {
      start?: string; // HH:MM
      end?: string; // HH:MM
      label?: string; // "morning", "afternoon", etc.
    };
    week_ref?: string; // "this week", "last week", "next week", "2025-W43"
    scope?: "all-managed" | "home-only" | "specific-store";
    top_n?: number;
    comparison?: {
      week1?: string;
      week2?: string;
    };
  };
  
  confidence: "high" | "medium" | "low";
  needs_clarification?: {
    type: "employee" | "day" | "work_type" | "week" | "scope";
    reason: string;
  };
}

/**
 * System prompt for intent extraction
 */
const SYSTEM_PROMPT = `You are an intent extractor for a workforce scheduling assistant.

Your job is to analyze user queries and extract structured information as JSON.

IMPORTANT RULES:
1. Output ONLY valid JSON matching the schema below
2. Be conservative - if unsure, use "unknown" intent
3. Extract entities exactly as mentioned (preserve capitalization for names)
4. Parse day names to codes: Monday→MON, Tuesday→TUE, etc.
5. Recognize international day names: lundi→MON, mardi→TUE, lunes→MON, martes→TUE
6. Parse time expressions: "morning"→08:00-12:00, "afternoon"→12:00-17:00, "evening"→17:00-21:00, "night"→21:00-24:00
7. Parse scope keywords: "other stores/branches/locations"→all-managed, "home only/local team"→home-only, "borrow/across stores"→all-managed

INTENT TYPES:
- hours:employee - Individual employee hours
- hours:top-workers - Top N workers by hours
- hours:under-target - Employees below target
- hours:over-target - Employees over/near target
- hours:all - All employee hours
- availability:day - Who is available on a specific day/time
- coverage:gaps - Unassigned shifts
- coverage:biggest-gap - Day with most unassigned time
- coverage:day-assignments - Schedule for specific day
- coverage:week-assignments - Full week schedule
- compare:weeks - Compare hours across weeks
- suggest:coverage - Recommend people to cover a shift
- scope:change - Change which stores to include
- clarify - Need more information
- unknown - Cannot determine intent

OUTPUT SCHEMA:
{
  "intent": "intent-type",
  "entities": {
    "employee_name": "string (if mentioned)",
    "work_type_text": "string (if mentioned)",
    "day": "MON|TUE|WED|THU|FRI|SAT|SUN (if mentioned)",
    "time_window": {"start": "HH:MM", "end": "HH:MM", "label": "morning|afternoon|evening|night"},
    "week_ref": "this week|last week|next week|2025-WXX",
    "scope": "all-managed|home-only|specific-store",
    "top_n": number,
    "comparison": {"week1": "string", "week2": "string"}
  },
  "confidence": "high|medium|low",
  "needs_clarification": {"type": "employee|day|work_type|week|scope", "reason": "string"}
}

EXAMPLES:

Query: "How many hours did Bob work this week?"
{
  "intent": "hours:employee",
  "entities": {"employee_name": "Bob", "week_ref": "this week"},
  "confidence": "high"
}

Query: "Who worked the most this week (top 5)?"
{
  "intent": "hours:top-workers",
  "entities": {"top_n": 5, "week_ref": "this week"},
  "confidence": "high"
}

Query: "Who is available Monday morning?"
{
  "intent": "availability:day",
  "entities": {"day": "MON", "time_window": {"start": "08:00", "end": "12:00", "label": "morning"}},
  "confidence": "high"
}

Query: "Who can work Cashier on Friday evening?"
{
  "intent": "availability:day",
  "entities": {"day": "FRI", "work_type_text": "Cashier", "time_window": {"start": "17:00", "end": "21:00", "label": "evening"}},
  "confidence": "high"
}

Query: "Which day has the biggest gap this week?"
{
  "intent": "coverage:biggest-gap",
  "entities": {"week_ref": "this week"},
  "confidence": "high"
}

Query: "Show unassigned Security shifts this week"
{
  "intent": "coverage:gaps",
  "entities": {"work_type_text": "Security", "week_ref": "this week"},
  "confidence": "high"
}

Query: "Include other stores"
{
  "intent": "scope:change",
  "entities": {"scope": "all-managed"},
  "confidence": "high"
}

Query: "Compare this week to last week for Ismail"
{
  "intent": "compare:weeks",
  "entities": {"employee_name": "Ismail", "comparison": {"week1": "this week", "week2": "last week"}},
  "confidence": "high"
}

Query: "disponibilités mardi matin"
{
  "intent": "availability:day",
  "entities": {"day": "TUE", "time_window": {"start": "08:00", "end": "12:00", "label": "morning"}},
  "confidence": "high"
}

Now extract from the user's query.`;

/**
 * Extract intent and entities from natural language query
 */
export async function extractIntent(query: string): Promise<ExtractedIntent> {
  console.log("🎯 [INTENT-EXTRACTOR] Processing query:", query);
  
  try {
    const client = getOpenAIClient(); // Lazy load client
    const completion = await client.chat.completions.create({
      model: process.env.AZURE_OPENAI_DEPLOYMENT_NAME || "gpt-4o-mini", // Use Azure deployment name if available
      temperature: 0.2, // Low temperature for consistency
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: query },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      console.error("❌ [INTENT-EXTRACTOR] No content returned from OpenAI");
      return fallbackIntent(query);
    }

    const extracted = JSON.parse(content) as ExtractedIntent;
    
    console.log("✅ [INTENT-EXTRACTOR] Extracted:", JSON.stringify(extracted, null, 2));
    
    // Log telemetry (no PII)
    logTelemetry({
      query_length: query.length,
      intent: extracted.intent,
      confidence: extracted.confidence,
      has_employee: !!extracted.entities.employee_name,
      has_day: !!extracted.entities.day,
      has_time_window: !!extracted.entities.time_window,
      has_work_type: !!extracted.entities.work_type_text,
      needs_clarification: !!extracted.needs_clarification,
    });

    return extracted;
  } catch (error) {
    console.error("❌ [INTENT-EXTRACTOR] Error:", error);
    return fallbackIntent(query);
  }
}

/**
 * Fallback intent when extraction fails
 */
function fallbackIntent(query: string): ExtractedIntent {
  console.warn("⚠️ [INTENT-EXTRACTOR] Using fallback intent");
  return {
    intent: "unknown",
    entities: {},
    confidence: "low",
    needs_clarification: {
      type: "day",
      reason: "Could not parse query. Please rephrase or provide more details.",
    },
  };
}

/**
 * Log telemetry for monitoring (no PII)
 */
function logTelemetry(data: {
  query_length: number;
  intent: string;
  confidence: string;
  has_employee: boolean;
  has_day: boolean;
  has_time_window: boolean;
  has_work_type: boolean;
  needs_clarification: boolean;
}) {
  // In production, send to monitoring service
  console.log("📊 [TELEMETRY]", JSON.stringify(data));
}
