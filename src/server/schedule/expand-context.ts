/**
 * Expand Context Tool
 * 
 * Expands the minimal snapshot with additional data (history, availability)
 * on demand while maintaining the ≤50KB size limit.
 */

import type {
  ExpandContextRequest,
  ExpandContextResult,
  MinimalSnapshot,
  ScheduleFacts,
} from "@/types";
import { buildScheduleFacts } from "./facts-builder";
import { buildMinimalSnapshot, estimateSnapshotSize } from "./minimal-snapshot";
import { prisma } from "@/lib/prisma";
import { ensureIsoWeekId } from "@/lib/week";

const MAX_SNAPSHOT_SIZE_BYTES = 50 * 1024; // 50KB

interface ExpandContextOptions {
  managerId: string;
  storeId: string;
  weekId: string;
}

async function fetchHistoricalData(
  storeId: string,
  currentWeekId: string,
  historyWeeks: number
): Promise<unknown[]> {
  // Fetch assignments from previous weeks
  const schedules = await prisma.schedule.findMany({
    where: {
      storeId,
      isoWeek: {
        lt: currentWeekId,
      },
    },
    include: {
      assignments: {
        select: {
          day: true,
          employeeId: true,
          workTypeId: true,
          startTime: true,
          endTime: true,
        },
      },
    },
    orderBy: {
      isoWeek: 'desc',
    },
    take: historyWeeks,
  });

  return schedules.map((schedule) => ({
    isoWeek: schedule.isoWeek,
    assignmentCount: schedule.assignments.length,
    assignedCount: schedule.assignments.filter((a) => a.employeeId).length,
  }));
}

async function fetchAvailabilityData(storeId: string): Promise<unknown[]> {
  const employees = await prisma.employee.findMany({
    where: { storeId },
    select: {
      id: true,
      name: true,
      availability: {
        select: {
          day: true,
          isOff: true,
          startTime: true,
          endTime: true,
        },
      },
    },
  });

  return employees.map((emp) => ({
    employeeId: emp.id,
    employeeName: emp.name,
    availability: emp.availability.map((slot) => ({
      day: slot.day,
      isOff: slot.isOff,
      start: slot.isOff || !slot.startTime ? null : slot.startTime.toISOString().slice(11, 16),
      end: slot.isOff || !slot.endTime ? null : slot.endTime.toISOString().slice(11, 16),
    })),
  }));
}

export async function expandContext(
  request: ExpandContextRequest,
  options: ExpandContextOptions
): Promise<ExpandContextResult> {
  const { historyWeeks = 0, availability = false } = request;
  const { managerId, storeId, weekId } = options;

  try {
    // First, rebuild the base facts
    const facts = await buildScheduleFacts({
      managerId,
      storeId,
      weekId,
    });

    // Start with minimal snapshot
    let snapshot = buildMinimalSnapshot(facts);
    const expanded: ExpandContextResult["expanded"] = {};

    // Try to add history if requested
    if (historyWeeks > 0) {
      const history = await fetchHistoricalData(storeId, weekId, historyWeeks);
      
      // Check if adding history exceeds size limit
      const testSnapshot = {
        ...snapshot,
        history,
      };
      const testSize = estimateSnapshotSize(testSnapshot as MinimalSnapshot);
      
      if (testSize <= MAX_SNAPSHOT_SIZE_BYTES) {
        expanded.history = history;
        snapshot = testSnapshot as MinimalSnapshot;
      } else {
        // Try with reduced history
        const reducedHistory = history.slice(0, Math.floor(historyWeeks / 2));
        const reducedSnapshot = {
          ...snapshot,
          history: reducedHistory,
        };
        const reducedSize = estimateSnapshotSize(reducedSnapshot as MinimalSnapshot);
        
        if (reducedSize <= MAX_SNAPSHOT_SIZE_BYTES) {
          expanded.history = reducedHistory;
          snapshot = reducedSnapshot as MinimalSnapshot;
          snapshot.truncated = true;
        }
      }
    }

    // Try to add availability if requested
    if (availability) {
      const availabilityData = await fetchAvailabilityData(storeId);
      
      const testSnapshot = {
        ...snapshot,
        availability: availabilityData,
      };
      const testSize = estimateSnapshotSize(testSnapshot as MinimalSnapshot);
      
      if (testSize <= MAX_SNAPSHOT_SIZE_BYTES) {
        expanded.availability = availabilityData;
        snapshot = testSnapshot as MinimalSnapshot;
      } else {
        snapshot.truncated = true;
      }
    }

    // Recalculate size and version
    snapshot.sizeBytes = estimateSnapshotSize(snapshot);

    return {
      snapshot,
      expanded,
    };
  } catch (error) {
    console.error("expandContext error:", error);
    throw error;
  }
}
