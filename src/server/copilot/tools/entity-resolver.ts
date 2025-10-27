/**
 * Enhanced Entity Resolver
 * 
 * Maps extracted entity text to database IDs and validates scope.
 * Handles 0 or >1 matches with clarification prompts.
 * Persists selections in thread context.
 */

import { prisma } from "@/lib/prisma";
import type { ExtractedIntent } from "./intent-extractor";
import type { ThreadContext, ResolvedScope } from "../types";
import { resolveScope } from "../scope";

export interface ResolvedEntities {
  employeeId?: string;
  employeeName?: string;
  workTypeId?: string;
  workTypeName?: string;
  day?: "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";
  startTime?: string; // HH:MM
  endTime?: string; // HH:MM
  isoWeek?: string; // 2025-W43
  scope: ResolvedScope;
  needsClarification?: {
    type: "employee" | "work_type";
    options: Array<{ id: string; label: string }>;
  };
}

/**
 * Resolve extracted entities to database IDs
 */
export async function resolveEntities(
  extracted: ExtractedIntent,
  managerId: string,
  context: ThreadContext
): Promise<ResolvedEntities> {
  console.log("🔍 [RESOLVER] Resolving entities:", extracted.entities);

  // Resolve scope first
  const scope = await resolveScope(managerId, context);
  console.log("📍 [RESOLVER] Scope:", scope.scope, "with", scope.allStoreIds.length, "stores");

  const resolved: ResolvedEntities = { scope };

  // Resolve employee if mentioned
  if (extracted.entities.employee_name) {
    const employeeResult = await resolveEmployee(
      extracted.entities.employee_name,
      scope,
      context
    );
    
    if (employeeResult.needsClarification) {
      resolved.needsClarification = employeeResult.needsClarification;
      return resolved; // Stop here, need clarification
    }
    
    resolved.employeeId = employeeResult.employeeId;
    resolved.employeeName = employeeResult.employeeName;
  }

  // Resolve work type if mentioned
  if (extracted.entities.work_type_text) {
    const workTypeResult = await resolveWorkType(
      extracted.entities.work_type_text,
      scope
    );
    
    if (workTypeResult.needsClarification) {
      resolved.needsClarification = workTypeResult.needsClarification;
      return resolved; // Stop here, need clarification
    }
    
    resolved.workTypeId = workTypeResult.workTypeId;
    resolved.workTypeName = workTypeResult.workTypeName;
  }

  // Resolve day
  if (extracted.entities.day) {
    const validDays = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
    if (validDays.includes(extracted.entities.day)) {
      resolved.day = extracted.entities.day as "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";
    }
  }

  // Resolve time window
  if (extracted.entities.time_window) {
    resolved.startTime = extracted.entities.time_window.start;
    resolved.endTime = extracted.entities.time_window.end;
  }

  // Resolve week reference
  resolved.isoWeek = resolveWeekRef(extracted.entities.week_ref, context);

  console.log("✅ [RESOLVER] Resolved entities:", JSON.stringify(resolved, null, 2));
  
  return resolved;
}

/**
 * Resolve employee name to ID
 */
async function resolveEmployee(
  name: string,
  scope: ResolvedScope,
  context: ThreadContext
): Promise<{
  employeeId?: string;
  employeeName?: string;
  needsClarification?: {
    type: "employee";
    options: Array<{ id: string; label: string }>;
  };
}> {
  // Check thread context for previous selection
  if (context.resolvedEntities?.employeeId && context.resolvedEntities?.employeeName?.toLowerCase().includes(name.toLowerCase())) {
    console.log("🧵 [RESOLVER] Using employee from thread context:", context.resolvedEntities.employeeName);
    return {
      employeeId: context.resolvedEntities.employeeId,
      employeeName: context.resolvedEntities.employeeName,
    };
  }

  // Normalize name for matching
  const normalized = name.toLowerCase().trim();
  
  // Query employees in scope
  const employees = await prisma.employee.findMany({
    where: {
      storeId: { in: scope.allStoreIds },
      name: { contains: name, mode: "insensitive" },
    },
    select: {
      id: true,
      name: true,
      store: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    take: 10, // Limit to prevent huge lists
  });

  console.log(`🔎 [RESOLVER] Found ${employees.length} employees matching "${name}"`);

  // No matches
  if (employees.length === 0) {
    return {
      needsClarification: {
        type: "employee",
        options: [],
      },
    };
  }

  // Exact match (single result)
  if (employees.length === 1) {
    return {
      employeeId: employees[0].id,
      employeeName: employees[0].name,
    };
  }

  // Multiple matches - need clarification
  return {
    needsClarification: {
      type: "employee",
      options: employees.map((emp) => ({
        id: emp.id,
        label: `${emp.name} (${emp.store.name})`,
      })),
    },
  };
}

/**
 * Resolve work type text to ID
 */
async function resolveWorkType(
  text: string,
  scope: ResolvedScope
): Promise<{
  workTypeId?: string;
  workTypeName?: string;
  needsClarification?: {
    type: "work_type";
    options: Array<{ id: string; label: string }>;
  };
}> {
  // Query work types in scope
  const workTypes = await prisma.workType.findMany({
    where: {
      storeId: { in: scope.allStoreIds },
      name: { contains: text, mode: "insensitive" },
    },
    select: {
      id: true,
      name: true,
      store: {
        select: {
          name: true,
        },
      },
    },
    take: 10,
  });

  console.log(`🔎 [RESOLVER] Found ${workTypes.length} work types matching "${text}"`);

  // No matches - use text as-is for filtering
  if (workTypes.length === 0) {
    return {
      workTypeName: text, // Use raw text for SQL ILIKE filtering
    };
  }

  // Exact match
  if (workTypes.length === 1) {
    return {
      workTypeId: workTypes[0].id,
      workTypeName: workTypes[0].name,
    };
  }

  // Multiple matches - use first one (most common scenario)
  return {
    workTypeId: workTypes[0].id,
    workTypeName: workTypes[0].name,
  };
}

/**
 * Resolve week reference to ISO week string
 */
function resolveWeekRef(weekRef: string | undefined, context: ThreadContext): string {
  if (!weekRef) {
    return context.isoWeek; // Default to current week
  }

  const normalized = weekRef.toLowerCase();

  // Explicit week format: 2025-W43
  if (/^\d{4}-w\d{2}$/i.test(weekRef)) {
    return weekRef.toUpperCase();
  }

  // Parse current week from context
  const [year, week] = context.isoWeek.split("-W").map(Number);

  if (normalized.includes("this week")) {
    return context.isoWeek;
  }

  if (normalized.includes("last week") || normalized.includes("previous week")) {
    const lastWeek = week - 1;
    if (lastWeek < 1) {
      // Handle year rollover
      return `${year - 1}-W52`;
    }
    return `${year}-W${lastWeek.toString().padStart(2, "0")}`;
  }

  if (normalized.includes("next week")) {
    const nextWeek = week + 1;
    if (nextWeek > 52) {
      // Handle year rollover
      return `${year + 1}-W01`;
    }
    return `${year}-W${nextWeek.toString().padStart(2, "0")}`;
  }

  // Default to current week
  return context.isoWeek;
}

/**
 * Update thread context with resolved entities
 */
export function persistResolvedEntity(
  context: ThreadContext,
  entityType: "employee" | "work_type",
  id: string,
  label: string
): void {
  if (!context.resolvedEntities) {
    context.resolvedEntities = {};
  }

  if (entityType === "employee") {
    context.resolvedEntities.employeeId = id;
    context.resolvedEntities.employeeName = label;
  } else if (entityType === "work_type") {
    context.resolvedEntities.workTypeId = id;
    context.resolvedEntities.workTypeName = label;
  }

  console.log("💾 [RESOLVER] Persisted entity to thread context:", entityType, label);
}
