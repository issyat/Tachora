/**
 * entities.resolve - Unified entity resolution
 * 
 * Turns natural language into structured IDs/values:
 * - Employee names (typo-tolerant, handles "Alice" or "Alice Johnson")
 * - Work types (aliases like "sales associate" → WorkType)
 * - Days ("Friday", "Fri", "vendredi")
 * - Times ("2pm", "14:00", "morning")
 * 
 * Returns clarification prompts if ambiguous (0 or >1 matches).
 */

import { prisma } from "@/lib/prisma";
import type { AvailabilityQuery } from "../types";

// =====================
// DAY RESOLUTION
// =====================

const DAY_KEYWORDS: Record<string, AvailabilityQuery["day"]> = {
  monday: "MON", mon: "MON", lundi: "MON", lunes: "MON",
  tuesday: "TUE", tue: "TUE", mardi: "TUE", martes: "TUE",
  wednesday: "WED", wed: "WED", mercredi: "WED", miercoles: "WED",
  thursday: "THU", thu: "THU", jeudi: "THU", jueves: "THU",
  friday: "FRI", fri: "FRI", vendredi: "FRI", viernes: "FRI",
  saturday: "SAT", sat: "SAT", samedi: "SAT", sabado: "SAT", sábado: "SAT",
  sunday: "SUN", sun: "SUN", dimanche: "SUN", domingo: "SUN",
};

export function resolveDay(text: string): AvailabilityQuery["day"] | undefined {
  const normalized = text.toLowerCase().trim();
  
  // Try exact match first
  if (DAY_KEYWORDS[normalized]) {
    return DAY_KEYWORDS[normalized];
  }
  
  // Search for day name within the text
  for (const [keyword, dayCode] of Object.entries(DAY_KEYWORDS)) {
    const pattern = new RegExp(`\\b${keyword}\\b`, 'i');
    if (pattern.test(text)) {
      return dayCode;
    }
  }
  
  return undefined;
}

// =====================
// TIME RESOLUTION
// =====================

const DAYPARTS: Array<{
  keywords: string[];
  start: string;
  end: string;
  label: string;
}> = [
  { keywords: ["morning", "matin", "mañana"], start: "08:00", end: "12:00", label: "morning" },
  { keywords: ["afternoon", "après-midi", "tarde"], start: "12:00", end: "17:00", label: "afternoon" },
  { keywords: ["evening", "soir", "noche"], start: "17:00", end: "21:00", label: "evening" },
  { keywords: ["night", "nuit", "madrugada"], start: "21:00", end: "24:00", label: "night" },
  { keywords: ["midday", "noon", "midi"], start: "11:00", end: "14:00", label: "midday" },
];

export interface TimeRange {
  start?: string;
  end?: string;
  label?: string; // For dayparts like "morning"
}

export function resolveTimeRange(text: string): TimeRange {
  const normalized = text.toLowerCase();

  // Try dayparts first
  for (const daypart of DAYPARTS) {
    if (daypart.keywords.some((kw) => normalized.includes(kw))) {
      return { start: daypart.start, end: daypart.end, label: daypart.label };
    }
  }

  // Parse explicit time ranges: "2pm-7pm", "14:00-19:00", "2-7", "14:00–19:00"
  const rangeMatch = text.match(
    /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:[-–—to]+)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i
  );

  if (rangeMatch) {
    const [, startHour, startMin, startMeridiem, endHour, endMin, endMeridiem] = rangeMatch;
    
    const buildTime = (hour: string, minute: string | undefined, meridiem: string | undefined): string => {
      let h = Number(hour);
      const m = Number(minute ?? "0");
      
      if (meridiem) {
        const mer = meridiem.toLowerCase();
        if (mer === "pm" && h < 12) h += 12;
        if (mer === "am" && h === 12) h = 0;
      }
      
      return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
    };

    return {
      start: buildTime(startHour, startMin, startMeridiem),
      end: buildTime(endHour, endMin, endMeridiem ?? startMeridiem),
    };
  }

  return {};
}

// =====================
// EMPLOYEE RESOLUTION
// =====================

export interface EmployeeMatch {
  id: string;
  name: string;
  storeId: string;
  score: number; // 0-100, higher is better
}

/**
 * Simple Levenshtein distance for typo tolerance
 */
function levenshtein(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

export async function resolveEmployee(
  input: string,
  scopedEmployeeIds: string[]
): Promise<EmployeeMatch[]> {
  // Normalize input (remove accents, lowercase, trim)
  const normalized = input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

  // Get all employees in scope
  const employees = await prisma.employee.findMany({
    where: { id: { in: scopedEmployeeIds } },
    select: { id: true, name: true, storeId: true },
  });

  // Score each employee
  const scored = employees.map((emp) => {
    const empNormalized = emp.name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    // Exact match
    if (empNormalized === normalized) {
      return { ...emp, score: 100 };
    }

    // Starts with (for "Alice" matching "Alice Johnson")
    if (empNormalized.startsWith(normalized)) {
      return { ...emp, score: 90 };
    }

    // Contains (for "John" matching "Alice Johnson")
    if (empNormalized.includes(normalized)) {
      return { ...emp, score: 80 };
    }

    // Fuzzy match (typo tolerance)
    const distance = levenshtein(normalized, empNormalized);
    const maxLen = Math.max(normalized.length, empNormalized.length);
    const similarity = 1 - distance / maxLen;
    
    if (similarity > 0.7) {
      return { ...emp, score: Math.round(similarity * 70) };
    }

    return { ...emp, score: 0 };
  });

  // Return matches with score > 0, sorted by score
  return scored
    .filter((emp) => emp.score > 0)
    .sort((a, b) => b.score - a.score);
}

// =====================
// WORK TYPE RESOLUTION
// =====================

export interface WorkTypeMatch {
  id: string;
  name: string;
  score: number;
}

const WORK_TYPE_ALIASES: Record<string, string[]> = {
  cashier: ["cashier", "caisse", "cajero", "checkout"],
  "sales associate": ["sales", "associate", "sales associate", "vendeur", "vendeuse"],
  "shift supervisor": ["supervisor", "shift supervisor", "manager", "lead"],
  security: ["security", "guard", "sécurité", "seguridad"],
  "stock clerk": ["stock", "clerk", "warehouse", "inventory"],
  "customer service": ["customer service", "cs", "support"],
};

export async function resolveWorkType(
  input: string,
  storeId: string
): Promise<WorkTypeMatch[]> {
  const normalized = input.toLowerCase().trim();

  // Get all work types for this store
  const workTypes = await prisma.workType.findMany({
    where: { storeId },
    select: { id: true, name: true },
  });

  // Score each work type
  const scored = workTypes.map((wt) => {
    const wtNormalized = wt.name.toLowerCase();

    // Exact match
    if (wtNormalized === normalized) {
      return { ...wt, score: 100 };
    }

    // Check aliases
    const aliases = WORK_TYPE_ALIASES[wtNormalized] || [];
    if (aliases.some((alias) => alias === normalized || normalized.includes(alias))) {
      return { ...wt, score: 90 };
    }

    // Contains
    if (wtNormalized.includes(normalized) || normalized.includes(wtNormalized)) {
      return { ...wt, score: 80 };
    }

    return { ...wt, score: 0 };
  });

  return scored
    .filter((wt) => wt.score > 0)
    .sort((a, b) => b.score - a.score);
}

// =====================
// UNIFIED INTERFACE
// =====================

export interface EntityResolution {
  type: "employee" | "workType" | "day" | "timeRange";
  matches: unknown[];
  needsClarification: boolean;
}

export async function resolveEntities(params: {
  text: string;
  type: "employee" | "workType" | "day" | "timeRange";
  storeId?: string;
  scopedEmployeeIds?: string[];
}): Promise<EntityResolution> {
  switch (params.type) {
    case "day": {
      const day = resolveDay(params.text);
      return {
        type: "day",
        matches: day ? [day] : [],
        needsClarification: !day,
      };
    }

    case "timeRange": {
      const range = resolveTimeRange(params.text);
      return {
        type: "timeRange",
        matches: range.start || range.end ? [range] : [],
        needsClarification: !range.start && !range.end,
      };
    }

    case "employee": {
      if (!params.scopedEmployeeIds) {
        throw new Error("scopedEmployeeIds required for employee resolution");
      }
      const matches = await resolveEmployee(params.text, params.scopedEmployeeIds);
      return {
        type: "employee",
        matches,
        needsClarification: matches.length === 0 || matches.length > 1,
      };
    }

    case "workType": {
      if (!params.storeId) {
        throw new Error("storeId required for work type resolution");
      }
      const matches = await resolveWorkType(params.text, params.storeId);
      return {
        type: "workType",
        matches,
        needsClarification: matches.length === 0 || matches.length > 1,
      };
    }
  }
}
