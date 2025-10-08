import { DAY_TO_INDEX } from "../utils/constants";
import { timeToMinutes } from "../utils/time";
import type { Assignment, DayKey } from "../types";
import type { EmployeeAssignmentSegment } from "../utils/validation";

export interface EmployeeSnapshot {
  weeklyMinutes: number;
  dailyMinutes: Map<DayKey, number>;
  segments: EmployeeAssignmentSegment[];
}

export function buildEmployeeSnapshots(assignments: Assignment[]): Map<string, EmployeeSnapshot> {
  const map = new Map<string, EmployeeSnapshot>();

  assignments.forEach((assignment) => {
    const employeeId = assignment.employee?.id;
    if (!employeeId) {
      return;
    }

    const startMin = timeToMinutes(assignment.startTime);
    const endMin = timeToMinutes(assignment.endTime);
    const duration = endMin - startMin;

    if (!map.has(employeeId)) {
      map.set(employeeId, {
        weeklyMinutes: 0,
        dailyMinutes: new Map<DayKey, number>(),
        segments: [],
      });
    }

    const snapshot = map.get(employeeId)!;
    snapshot.weeklyMinutes += duration;

    const existingDayMinutes = snapshot.dailyMinutes.get(assignment.day) ?? 0;
    snapshot.dailyMinutes.set(assignment.day, existingDayMinutes + duration);

    snapshot.segments.push({
      assignmentId: assignment.id,
      day: assignment.day,
      startMin,
      endMin,
    });
  });

  return map;
}
