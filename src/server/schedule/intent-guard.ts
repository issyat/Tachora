/**
 * Intent Classification & Guardrails
 * 
 * Detects non-scheduling requests and enforces refusal policy.
 * Prevents off-topic queries, PII exposure, and cross-store data access.
 */

export type IntentType =
  | "scheduling_query"
  | "scheduling_mutation"
  | "employee_search"
  | "off_topic"
  | "pii_request"
  | "cross_store"
  | "malicious";

export interface IntentClassification {
  intent: IntentType;
  confidence: number;
  shouldRefuse: boolean;
  refusalMessage?: string;
  allowedActions?: string[];
}

const OFF_TOPIC_PATTERNS = [
  /weather|news|sports|politics|recipe|joke|story/i,
  /write.*essay|write.*code|write.*script/i,
  /hack|exploit|bypass|jailbreak/i,
  /email|password|credit card|ssn|social security/i,
];

const PII_PATTERNS = [
  /email|e-mail/i,
  /phone|telephone|mobile/i,
  /address|home|residence/i,
  /ssn|social security|tax id/i,
  /password|credential|login/i,
];

const CROSS_STORE_PATTERNS = [
  /other store|different store|all stores/i,
  /compare.*store/i,
  /store.*performance/i,
];

const SCHEDULING_KEYWORDS = [
  "shift",
  "schedule",
  "assign",
  "employee",
  "work",
  "hours",
  "coverage",
  "availability",
  "week",
  "day",
  "time",
  "open",
  "unassigned",
];

function hasSchedulingKeywords(message: string): boolean {
  const lowerMessage = message.toLowerCase();
  return SCHEDULING_KEYWORDS.some((keyword) => lowerMessage.includes(keyword));
}

export function classifyIntent(message: string, context?: {
  storeId?: string;
  weekId?: string;
}): IntentClassification {
  const lowerMessage = message.toLowerCase();

  // Check for malicious patterns
  if (OFF_TOPIC_PATTERNS.some((pattern) => pattern.test(message))) {
    if (/jailbreak|bypass|ignore.*instruction/i.test(message)) {
      return {
        intent: "malicious",
        confidence: 0.95,
        shouldRefuse: true,
        refusalMessage: "I can only help with scheduling questions for this store and week.",
        allowedActions: [
          "Ask about shift coverage",
          "Find unassigned shifts",
          "Check employee hours",
        ],
      };
    }

    return {
      intent: "off_topic",
      confidence: 0.9,
      shouldRefuse: true,
      refusalMessage: "I can only help with scheduling. Try asking about shifts, employees, or coverage.",
      allowedActions: [
        "List unassigned shifts",
        "Show employee hours",
        "Find coverage gaps",
      ],
    };
  }

  // Check for PII requests
  if (PII_PATTERNS.some((pattern) => pattern.test(message))) {
    return {
      intent: "pii_request",
      confidence: 0.85,
      shouldRefuse: true,
      refusalMessage: "I cannot access personal information like emails, phones, or addresses.",
      allowedActions: [
        "Ask about employee schedules",
        "Check shift assignments",
        "View work hours",
      ],
    };
  }

  // Check for cross-store requests
  if (CROSS_STORE_PATTERNS.some((pattern) => pattern.test(message))) {
    return {
      intent: "cross_store",
      confidence: 0.8,
      shouldRefuse: true,
      refusalMessage: `I can only help with ${context?.storeId ? "this store" : "one store at a time"} and ${context?.weekId || "one week"}.`,
      allowedActions: [
        "Ask about this store's schedule",
        "Check this week's coverage",
        "Find open shifts here",
      ],
    };
  }

  // Check for employee search intent
  if (/find|search|who is|lookup|employee.*name/i.test(message)) {
    return {
      intent: "employee_search",
      confidence: 0.7,
      shouldRefuse: false,
    };
  }

  // Check for mutation intent
  if (/assign|move|swap|change|update|delete|create|add/i.test(message)) {
    return {
      intent: "scheduling_mutation",
      confidence: 0.75,
      shouldRefuse: false,
    };
  }

  // Check for scheduling query
  if (hasSchedulingKeywords(message)) {
    return {
      intent: "scheduling_query",
      confidence: 0.8,
      shouldRefuse: false,
    };
  }

  // Default: unclear intent but not obviously harmful
  return {
    intent: "scheduling_query",
    confidence: 0.5,
    shouldRefuse: false,
  };
}

export function shouldRefuseRequest(classification: IntentClassification): boolean {
  return classification.shouldRefuse && classification.confidence > 0.7;
}

export function getRefusalResponse(classification: IntentClassification): string {
  if (!classification.refusalMessage) {
    return "I can only help with scheduling questions. Try asking about shifts, employees, or coverage for this store and week.";
  }

  let response = classification.refusalMessage;
  
  if (classification.allowedActions?.length) {
    response += "\n\nTry:\n";
    response += classification.allowedActions
      .map((action) => `• ${action}`)
      .join("\n");
  }

  return response;
}
