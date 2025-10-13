/**
 * Minimal Snapshot Builder
 * 
 * Builds a compact, PII-free snapshot for LLM consumption (≤50KB target).
 * Only includes essential fields needed for scheduling queries.
 */

import type {
  ScheduleFacts,
  MinimalSnapshot,
  MinimalEmployee,
  MinimalAssignment,
  MinimalOpenShift,
} from "@/types";
import { computeSnapshotVersion } from "./eval-query";

const MAX_SNAPSHOT_SIZE_BYTES = 50 * 1024; // 50KB

interface BuildMinimalSnapshotOptions {
  includeAvailability?: boolean;
  includeHistory?: boolean;
}

function calculateDurationMinutes(start: string, end: string): number {
  const [startHour, startMin] = start.split(':').map(Number);
  const [endHour, endMin] = end.split(':').map(Number);
  const startMins = startHour * 60 + startMin;
  const endMins = endHour * 60 + endMin;
  return endMins - startMins;
}

function buildMinimalEmployees(facts: ScheduleFacts): MinimalEmployee[] {
  return facts.employees.map((emp) => ({
    id: emp.id,
    name: emp.name,
    alias: undefined, // Add alias support if available in employee data
    weeklyMinutes: emp.weeklyMinutes,
    weeklyMinutesTarget: emp.targetMinutes,
  }));
}

function buildMinimalAssignments(facts: ScheduleFacts): MinimalAssignment[] {
  const assignments: MinimalAssignment[] = [];

  // Extract from snapshot assignments
  facts.snapshot.assignments.forEach((assignment) => {
    const durationMins = calculateDurationMinutes(assignment.start, assignment.end);
    
    assignments.push({
      id: assignment.id,
      day: assignment.day,
      durationMins,
      employeeId: assignment.employeeId,
      workTypeName: assignment.workTypeName,
    });
  });

  return assignments;
}

function buildMinimalOpenShifts(facts: ScheduleFacts): MinimalOpenShift[] {
  return facts.openShifts.map((shift) => ({
    id: shift.id,
    day: shift.day,
    start: shift.start,
    end: shift.end,
    workTypeName: shift.workTypeName,
  }));
}

export function buildMinimalSnapshot(
  facts: ScheduleFacts,
  options: BuildMinimalSnapshotOptions = {}
): MinimalSnapshot {
  const employees = buildMinimalEmployees(facts);
  const assignments = buildMinimalAssignments(facts);
  const openShifts = buildMinimalOpenShifts(facts);

  const base = {
    storeId: facts.meta.storeId,
    storeName: facts.meta.storeName,
    isoWeek: facts.meta.weekId,
    tz: facts.meta.timezone || "UTC",
    generatedAt: facts.meta.generatedAt,
    employees,
    assignments,
    openShifts,
  };

  // Compute version based on content
  const version = computeSnapshotVersion(base);

  const snapshot: MinimalSnapshot = {
    version,
    ...base,
  };

  // Calculate size
  const snapshotJson = JSON.stringify(snapshot);
  const sizeBytes = Buffer.byteLength(snapshotJson, 'utf8');
  snapshot.sizeBytes = sizeBytes;

  // Check if truncation is needed
  if (sizeBytes > MAX_SNAPSHOT_SIZE_BYTES) {
    snapshot.truncated = true;
    
    // If truncation needed, try reducing open shifts first
    if (openShifts.length > 20) {
      const truncatedSnapshot = {
        ...snapshot,
        openShifts: openShifts.slice(0, 20),
      };
      const truncatedJson = JSON.stringify(truncatedSnapshot);
      const truncatedSize = Buffer.byteLength(truncatedJson, 'utf8');
      
      if (truncatedSize <= MAX_SNAPSHOT_SIZE_BYTES) {
        return {
          ...truncatedSnapshot,
          sizeBytes: truncatedSize,
          truncated: true,
        };
      }
    }

    // If still too large, reduce assignments (keep only assigned ones)
    const assignedOnly = assignments.filter((a) => a.employeeId);
    if (assignedOnly.length < assignments.length) {
      const reducedSnapshot = {
        ...snapshot,
        assignments: assignedOnly,
        openShifts: openShifts.slice(0, 10),
      };
      const reducedJson = JSON.stringify(reducedSnapshot);
      const reducedSize = Buffer.byteLength(reducedJson, 'utf8');
      
      return {
        ...reducedSnapshot,
        sizeBytes: reducedSize,
        truncated: true,
      };
    }
  }

  return snapshot;
}

export function estimateSnapshotSize(snapshot: MinimalSnapshot): number {
  return Buffer.byteLength(JSON.stringify(snapshot), 'utf8');
}

export function isSnapshotWithinSizeLimit(snapshot: MinimalSnapshot): boolean {
  return estimateSnapshotSize(snapshot) <= MAX_SNAPSHOT_SIZE_BYTES;
}
