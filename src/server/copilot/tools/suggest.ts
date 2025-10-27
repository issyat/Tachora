/**
 * suggest.generate - Advisory coverage suggestions
 * 
 * Given a gap (day, time, role), rank candidates by:
 * 1. Home store (prefer home employees)
 * 2. Can borrow (cross-store availability)
 * 3. Role fit (has the required work type)
 * 4. Under target (prioritize those who need hours)
 * 5. No conflict (not already scheduled)
 * 6. Nearby availability (close to gap time)
 * 
 * Returns ranked list with explanations, NO WRITES.
 */

import { getMetric } from "./metrics";
import type { ThreadContext, AvailabilityQuery } from "../types";
import { fetchScopedEmployees } from "../data/employees";
import { resolveScope } from "../scope";

export interface SuggestionRequest {
  day: AvailabilityQuery["day"];
  startTime?: string;
  endTime?: string;
  workType?: string;
  limit?: number;
}

export interface Candidate {
  employeeId: string;
  employeeName: string;
  homeStoreId: string;
  score: number;
  reasons: string[];
  availability: {
    start: string;
    end: string;
  };
  scheduledToday: number; // minutes
  weekTotal: number; // minutes
  weekTarget: number; // minutes
}

export interface SuggestionResult {
  gap: {
    day: string;
    startTime?: string;
    endTime?: string;
    workType?: string;
  };
  candidates: Candidate[];
}

/**
 * Calculate candidate score and reasons
 */
function scoreCand(params: {
  employee: {
    id: string;
    name: string;
    storeId: string;
    canWorkAcrossStores: boolean;
    roles: string[];
    weeklyMinutesTarget: number;
  };
  availability: {
    start: string;
    end: string;
    isOff: boolean;
  };
  scheduledToday: number;
  weekTotal: number;
  homeStoreId: string;
  requiredWorkType?: string;
  gapStart?: string;
  gapEnd?: string;
}): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  // 1. Home store preference (30 points)
  const isHome = params.employee.storeId === params.homeStoreId;
  if (isHome) {
    score += 30;
    reasons.push("home store");
  } else if (params.employee.canWorkAcrossStores) {
    score += 15;
    reasons.push("can borrow");
  } else {
    return { score: 0, reasons: ["cannot work across stores"] }; // Disqualified
  }

  // 2. Role fit (25 points)
  if (params.requiredWorkType) {
    const hasRole = params.employee.roles.some(
      (role) =>
        role.toLowerCase().includes(params.requiredWorkType!.toLowerCase()) ||
        params.requiredWorkType!.toLowerCase().includes(role.toLowerCase())
    );
    if (hasRole) {
      score += 25;
      reasons.push(`can work ${params.requiredWorkType}`);
    } else {
      return { score: 0, reasons: [`missing role: ${params.requiredWorkType}`] }; // Disqualified
    }
  } else {
    score += 10; // No role requirement, small bonus
  }

  // 3. Not scheduled yet (20 points)
  if (params.scheduledToday === 0) {
    score += 20;
    reasons.push("free all day");
  } else if (params.scheduledToday < 4 * 60) {
    score += 10;
    reasons.push("lightly scheduled");
  }

  // 4. Under target (15 points)
  const shortfall = params.employee.weeklyMinutesTarget - params.weekTotal;
  if (shortfall > 4 * 60) {
    score += 15;
    reasons.push(`under target by ${Math.round(shortfall / 60)}h`);
  } else if (shortfall > 0) {
    score += 8;
    reasons.push("slightly under target");
  }

  // 5. Availability window overlap (10 points)
  if (params.gapStart && params.gapEnd) {
    const gapStartMin = timeToMinutes(params.gapStart);
    const gapEndMin = timeToMinutes(params.gapEnd);
    const availStartMin = timeToMinutes(params.availability.start);
    const availEndMin = timeToMinutes(params.availability.end);

    const overlap = Math.max(0, Math.min(gapEndMin, availEndMin) - Math.max(gapStartMin, availStartMin));
    const gapDuration = gapEndMin - gapStartMin;

    if (overlap >= gapDuration) {
      score += 10;
      reasons.push("perfect availability match");
    } else if (overlap > 0) {
      score += 5;
      reasons.push("partial availability");
    } else {
      return { score: 0, reasons: ["availability doesn't cover gap"] }; // Disqualified
    }
  }

  return { score, reasons };
}

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

/**
 * Generate coverage suggestions
 */
export async function generateSuggestions(
  request: SuggestionRequest,
  context: ThreadContext,
  managerId: string
): Promise<SuggestionResult> {
  if (!request.day) {
    throw new Error("Day is required for suggestions");
  }

  // Get availability for the day
  const availability = await getMetric(
    {
      metricName: "availability:day",
      params: {
        day: request.day,
        startTime: request.startTime,
        endTime: request.endTime,
        workType: request.workType,
      },
    },
    context,
    managerId
  );

  // Get hours data
  const hours = await getMetric(
    { metricName: "hours:all" },
    context,
    managerId
  );

  // Get scope and employees
  const scope = await resolveScope(managerId, context);
  const employees = await fetchScopedEmployees(managerId, scope);

  // Build lookup maps
  const hoursMap = new Map(
    hours.rows.map((row: any) => [row.employee_id, {
      total: Number(row.total_minutes) || 0,
      target: Number(row.target_minutes) || 0,
    }])
  );

  const availMap = new Map(
    availability.rows.map((row: any) => [row.employee_id, {
      start: row.start_time,
      end: row.end_time,
      isOff: row.is_off,
    }])
  );

  // Score each employee
  const candidates: Candidate[] = [];

  for (const emp of employees) {
    const avail = availMap.get(emp.id);
    if (!avail || avail.isOff) continue;

    const hoursData = hoursMap.get(emp.id) || { total: 0, target: emp.weeklyMinutesTarget };

    const { score, reasons } = scoreCand({
      employee: emp,
      availability: avail,
      scheduledToday: 0, // TODO: Get from day assignments
      weekTotal: hoursData.total,
      homeStoreId: context.storeId,
      requiredWorkType: request.workType,
      gapStart: request.startTime,
      gapEnd: request.endTime,
    });

    if (score > 0) {
      candidates.push({
        employeeId: emp.id,
        employeeName: emp.name,
        homeStoreId: emp.storeId,
        score,
        reasons,
        availability: {
          start: avail.start,
          end: avail.end,
        },
        scheduledToday: 0,
        weekTotal: hoursData.total,
        weekTarget: hoursData.target,
      });
    }
  }

  // Sort by score (highest first)
  candidates.sort((a, b) => b.score - a.score);

  // Limit results
  const limit = request.limit || 5;

  return {
    gap: {
      day: request.day,
      startTime: request.startTime || undefined,
      endTime: request.endTime || undefined,
      workType: request.workType || undefined,
    },
    candidates: candidates.slice(0, limit),
  };
}
