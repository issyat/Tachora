/**
 * Explain Constraint Tool
 * 
 * Provides systematic, deterministic analysis of why an employee can or cannot
 * be assigned to a specific shift. Returns structured reason tree with evidence.
 */

import type {
  MinimalSnapshot,
  MinimalEmployee,
  MinimalAssignment,
  MinimalOpenShift,
  Weekday,
} from "@/types";
import { resolveEntities, resolveEmployee, normalizeString } from "./entity-resolver";

export interface ExplainConstraintRequest {
  employeeName: string;
  roleName?: string;
  day?: string;
  shiftStart?: string; // HH:MM
  shiftEnd?: string;   // HH:MM
}

export interface ConstraintCheck {
  name: string;
  passed: boolean;
  severity: 'blocking' | 'warning' | 'info';
  message: string;
  evidence?: Record<string, unknown>;
}

export interface ExplainConstraintResult {
  ok: boolean;
  canAssign: boolean;
  employee?: {
    id: string;
    name: string;
    weeklyMinutes: number;
    weeklyMinutesTarget: number;
  };
  shift?: {
    id: string;
    day: Weekday;
    start: string;
    end: string;
    workTypeName: string;
  };
  checks: ConstraintCheck[];
  summary: string;
  suggestions: string[];
  error?: string;
}

const DAY_TO_INDEX: Record<Weekday, number> = {
  MON: 0,
  TUE: 1,
  WED: 2,
  THU: 3,
  FRI: 4,
  SAT: 5,
  SUN: 6,
};

const MINUTES_PER_DAY = 24 * 60;
const MIN_REST_MINUTES = 11 * 60; // 11 hours between shifts
const MAX_DAILY_MINUTES = 10 * 60; // 10 hours per day
const STUDENT_WEEKLY_LIMIT = 20 * 60; // 20 hours per week for students

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Find employee by fuzzy name match
 */
function findEmployeeByName(snapshot: MinimalSnapshot, name: string): MinimalEmployee | null {
  const availableEmployees = snapshot.employees.map(e => ({
    id: e.id,
    name: e.name,
    alias: e.alias,
  }));
  
  const result = resolveEmployee(name, availableEmployees);
  
  if (!result.employee) return null;
  
  // Find full employee data
  return snapshot.employees.find(e => e.id === result.employee!.id) || null;
}

/**
 * Find open shifts matching criteria
 */
function findMatchingOpenShifts(
  snapshot: MinimalSnapshot,
  day?: string,
  roleName?: string,
  locale: string = 'en-US'
): MinimalOpenShift[] {
  let shifts = snapshot.openShifts;
  
  // Use entity resolver to resolve both day and role at once
  if (day || roleName) {
    const text = [day, roleName].filter(Boolean).join(' ');
    const resolution = resolveEntities({ text, locale }, snapshot);
    
    // Filter by resolved day
    if (resolution.weekday) {
      shifts = shifts.filter(shift => shift.day === resolution.weekday!.value);
    }
    
    // Filter by resolved role
    if (resolution.role) {
      shifts = shifts.filter(shift => shift.workTypeName === resolution.role!.value);
    }
  }
  
  return shifts;
}

/**
 * Get employee's current assignments
 */
function getEmployeeAssignments(
  snapshot: MinimalSnapshot,
  employeeId: string
): MinimalAssignment[] {
  return snapshot.assignments.filter(a => a.employeeId === employeeId);
}

/**
 * Check if employee is available on given day (based on existing assignments)
 * Note: We don't have availability data in minimal snapshot, so we infer from assignments
 */
function checkAvailability(
  employee: MinimalEmployee,
  shift: MinimalOpenShift,
  assignments: MinimalAssignment[]
): ConstraintCheck {
  // For now, we can't check actual availability without expanded context
  // We'll mark this as info
  return {
    name: 'availability',
    passed: true,
    severity: 'info',
    message: `Availability check requires expanded context (use expand_context tool)`,
    evidence: {
      note: "Minimal snapshot doesn't include availability slots",
    },
  };
}

/**
 * Check for schedule overlaps
 */
function checkOverlaps(
  shift: MinimalOpenShift,
  assignments: MinimalAssignment[]
): ConstraintCheck {
  const shiftStartMin = timeToMinutes(shift.start);
  const shiftEndMin = timeToMinutes(shift.end);
  const shiftAbsStart = DAY_TO_INDEX[shift.day] * MINUTES_PER_DAY + shiftStartMin;
  const shiftAbsEnd = DAY_TO_INDEX[shift.day] * MINUTES_PER_DAY + shiftEndMin;
  
  const overlapping = assignments.filter(a => {
    // Calculate assignment absolute time
    const aStartMin = a.durationMins; // This is duration, we need actual times
    // Note: MinimalAssignment doesn't have start/end times, only duration
    // We'll need to check if it's the same day at least
    return a.day === shift.day;
  });
  
  if (overlapping.length > 0) {
    return {
      name: 'overlap',
      passed: false,
      severity: 'blocking',
      message: `Employee already has ${overlapping.length} assignment(s) on ${shift.day}`,
      evidence: {
        existingAssignments: overlapping.map(a => ({
          day: a.day,
          duration: `${a.durationMins} minutes`,
          workType: a.workTypeName,
        })),
      },
    };
  }
  
  return {
    name: 'overlap',
    passed: true,
    severity: 'info',
    message: `No overlapping assignments on ${shift.day}`,
  };
}

/**
 * Check rest period between shifts
 */
function checkRestPeriod(
  shift: MinimalOpenShift,
  assignments: MinimalAssignment[]
): ConstraintCheck {
  // Since we don't have exact times in MinimalAssignment, we can only check
  // if there are assignments on adjacent days
  const dayIndex = DAY_TO_INDEX[shift.day];
  const prevDay = Object.keys(DAY_TO_INDEX).find(d => DAY_TO_INDEX[d as Weekday] === dayIndex - 1) as Weekday | undefined;
  const nextDay = Object.keys(DAY_TO_INDEX).find(d => DAY_TO_INDEX[d as Weekday] === dayIndex + 1) as Weekday | undefined;
  
  const adjacentAssignments = assignments.filter(a => 
    (prevDay && a.day === prevDay) || (nextDay && a.day === nextDay)
  );
  
  if (adjacentAssignments.length > 0) {
    return {
      name: 'rest_period',
      passed: true,
      severity: 'warning',
      message: `Employee has assignments on adjacent days - verify 11h rest period`,
      evidence: {
        adjacentDays: adjacentAssignments.map(a => a.day),
      },
    };
  }
  
  return {
    name: 'rest_period',
    passed: true,
    severity: 'info',
    message: `No adjacent day assignments found`,
  };
}

/**
 * Check weekly hours limit
 */
function checkWeeklyLimit(
  employee: MinimalEmployee,
  shift: MinimalOpenShift
): ConstraintCheck {
  const shiftDuration = timeToMinutes(shift.end) - timeToMinutes(shift.start);
  const newTotal = employee.weeklyMinutes + shiftDuration;
  const target = employee.weeklyMinutesTarget;
  
  if (newTotal > target) {
    const overage = newTotal - target;
    return {
      name: 'weekly_limit',
      passed: false,
      severity: 'warning',
      message: `Assignment would exceed weekly target by ${Math.round(overage / 60 * 10) / 10} hours`,
      evidence: {
        currentMinutes: employee.weeklyMinutes,
        currentHours: Math.round(employee.weeklyMinutes / 60 * 10) / 10,
        targetMinutes: target,
        targetHours: Math.round(target / 60 * 10) / 10,
        shiftDuration: shiftDuration,
        shiftHours: Math.round(shiftDuration / 60 * 10) / 10,
        newTotal: newTotal,
        newTotalHours: Math.round(newTotal / 60 * 10) / 10,
        overage: overage,
        overageHours: Math.round(overage / 60 * 10) / 10,
      },
    };
  }
  
  return {
    name: 'weekly_limit',
    passed: true,
    severity: 'info',
    message: `Assignment within weekly target (${Math.round(newTotal / 60 * 10) / 10}h / ${Math.round(target / 60 * 10) / 10}h)`,
    evidence: {
      currentHours: Math.round(employee.weeklyMinutes / 60 * 10) / 10,
      targetHours: Math.round(target / 60 * 10) / 10,
      newTotalHours: Math.round(newTotal / 60 * 10) / 10,
    },
  };
}

/**
 * Check daily hours limit
 */
function checkDailyLimit(
  shift: MinimalOpenShift,
  assignments: MinimalAssignment[]
): ConstraintCheck {
  const shiftDuration = timeToMinutes(shift.end) - timeToMinutes(shift.start);
  const dayAssignments = assignments.filter(a => a.day === shift.day);
  const currentDailyMinutes = dayAssignments.reduce((sum, a) => sum + a.durationMins, 0);
  const newDailyTotal = currentDailyMinutes + shiftDuration;
  
  if (newDailyTotal > MAX_DAILY_MINUTES) {
    return {
      name: 'daily_limit',
      passed: false,
      severity: 'blocking',
      message: `Would exceed daily limit of ${MAX_DAILY_MINUTES / 60} hours`,
      evidence: {
        currentDailyHours: Math.round(currentDailyMinutes / 60 * 10) / 10,
        shiftHours: Math.round(shiftDuration / 60 * 10) / 10,
        newTotalHours: Math.round(newDailyTotal / 60 * 10) / 10,
        maxHours: MAX_DAILY_MINUTES / 60,
      },
    };
  }
  
  return {
    name: 'daily_limit',
    passed: true,
    severity: 'info',
    message: `Within daily limit (${Math.round(newDailyTotal / 60 * 10) / 10}h / ${MAX_DAILY_MINUTES / 60}h)`,
    evidence: {
      newTotalHours: Math.round(newDailyTotal / 60 * 10) / 10,
    },
  };
}

/**
 * Main explain constraint function
 */
export function explainConstraint(
  request: ExplainConstraintRequest,
  snapshot: MinimalSnapshot
): ExplainConstraintResult {
  const checks: ConstraintCheck[] = [];
  const suggestions: string[] = [];
  
  // Step 1: Find employee
  const employee = findEmployeeByName(snapshot, request.employeeName);
  if (!employee) {
    return {
      ok: false,
      canAssign: false,
      checks: [{
        name: 'employee_not_found',
        passed: false,
        severity: 'blocking',
        message: `Employee "${request.employeeName}" not found`,
        evidence: {
          searchedName: request.employeeName,
          availableEmployees: snapshot.employees.map(e => e.name),
        },
      }],
      summary: `Employee "${request.employeeName}" not found in this store`,
      suggestions: [
        `Check spelling: ${request.employeeName}`,
        `Available employees: ${snapshot.employees.map(e => e.name).join(', ')}`,
      ],
    };
  }
  
  // Step 2: Find matching open shifts
  const openShifts = findMatchingOpenShifts(snapshot, request.day, request.roleName);
  
  if (openShifts.length === 0) {
    const roleFilter = request.roleName ? ` for role "${request.roleName}"` : '';
    const dayFilter = request.day ? ` on ${request.day}` : '';
    
    return {
      ok: true,
      canAssign: false,
      employee: {
        id: employee.id,
        name: employee.name,
        weeklyMinutes: employee.weeklyMinutes,
        weeklyMinutesTarget: employee.weeklyMinutesTarget,
      },
      checks: [{
        name: 'no_open_shifts',
        passed: false,
        severity: 'blocking',
        message: `No open shifts found${roleFilter}${dayFilter}`,
        evidence: {
          totalOpenShifts: snapshot.openShifts.length,
          dayFilter: request.day,
          roleFilter: request.roleName,
          availableRoles: [...new Set(snapshot.openShifts.map(s => s.workTypeName))],
          availableDays: [...new Set(snapshot.openShifts.map(s => s.day))],
        },
      }],
      summary: `No open shifts available${roleFilter}${dayFilter}`,
      suggestions: [
        request.roleName ? `Try different role names: ${[...new Set(snapshot.openShifts.map(s => s.workTypeName))].join(', ')}` : 'List all open shifts',
        request.day ? `Try different days: ${[...new Set(snapshot.openShifts.map(s => s.day))].join(', ')}` : 'Check other days',
      ],
    };
  }
  
  // Step 3: For each matching shift, run constraint checks
  const shift = openShifts[0]; // Analyze first matching shift
  const assignments = getEmployeeAssignments(snapshot, employee.id);
  
  // Run all checks
  checks.push(checkAvailability(employee, shift, assignments));
  checks.push(checkOverlaps(shift, assignments));
  checks.push(checkRestPeriod(shift, assignments));
  checks.push(checkWeeklyLimit(employee, shift));
  checks.push(checkDailyLimit(shift, assignments));
  
  // Determine if assignment is possible
  const blockingIssues = checks.filter(c => !c.passed && c.severity === 'blocking');
  const warnings = checks.filter(c => !c.passed && c.severity === 'warning');
  const canAssign = blockingIssues.length === 0;
  
  // Generate summary
  let summary: string;
  if (canAssign) {
    if (warnings.length > 0) {
      summary = `${employee.name} CAN be assigned to ${shift.workTypeName} on ${shift.day} (with ${warnings.length} warning(s))`;
    } else {
      summary = `✅ ${employee.name} CAN be assigned to ${shift.workTypeName} on ${shift.day}`;
    }
  } else {
    summary = `❌ ${employee.name} CANNOT be assigned to ${shift.workTypeName} on ${shift.day}`;
  }
  
  // Generate suggestions
  if (!canAssign) {
    blockingIssues.forEach(issue => {
      if (issue.name === 'overlap') {
        suggestions.push(`Remove conflicting assignment on ${shift.day} first`);
      } else if (issue.name === 'daily_limit') {
        suggestions.push(`Reduce other assignments on ${shift.day} to free up hours`);
      } else if (issue.name === 'weekly_limit') {
        suggestions.push(`Consider employees with fewer hours this week`);
      }
    });
  } else {
    suggestions.push(`Proceed with assigning ${employee.name} to this shift`);
    if (warnings.length > 0) {
      suggestions.push(`Review warnings before finalizing`);
    }
  }
  
  return {
    ok: true,
    canAssign,
    employee: {
      id: employee.id,
      name: employee.name,
      weeklyMinutes: employee.weeklyMinutes,
      weeklyMinutesTarget: employee.weeklyMinutesTarget,
    },
    shift: {
      id: shift.id,
      day: shift.day,
      start: shift.start,
      end: shift.end,
      workTypeName: shift.workTypeName,
    },
    checks,
    summary,
    suggestions,
  };
}
