import { DAY_ORDER, MIN_WINDOW_MINUTES } from "./constants";
import { minutesToTime, timeToMinutes } from "../utils/time";
import type { Assignment, DayKey, Template } from "../types";

export interface Block {
  role: string;
  startMin: number;
  endMin: number;
  assignment?: Assignment;
  templateId?: string | null;
}

export interface LaidBlock extends Block {
  lane: number;
}

export interface DayLayout {
  day: DayKey;
  lanes: LaidBlock[];
  laneCount: number;
}

export function clampToWindow(start: number, end: number, min: number, max: number) {
  const clampedStart = Math.max(min, Math.min(start, max));
  const clampedEnd = Math.max(clampedStart, Math.min(end, max));
  return {
    start: clampedStart,
    end: clampedEnd,
    valid: clampedEnd > clampedStart,
  };
}

function layoutDay(day: DayKey, blocks: Block[]): DayLayout {
  const sorted = [...blocks].sort((a, b) => {
    // First sort by start time, then by role to ensure consistent ordering
    if (a.startMin !== b.startMin) {
      return a.startMin - b.startMin;
    }
    return a.role.localeCompare(b.role);
  });
  
  const placed: LaidBlock[] = [];
  const lanes: { endMin: number }[] = [];

  // Assign blocks to lanes based on time overlap
  for (const block of sorted) {
    let assignedLane = -1;
    
    // Find the first available lane (one where this block doesn't overlap)
    for (let laneIndex = 0; laneIndex < lanes.length; laneIndex++) {
      if (lanes[laneIndex].endMin <= block.startMin) {
        // This lane is available - the previous block in this lane ends before this one starts
        assignedLane = laneIndex;
        break;
      }
    }
    
    // If no existing lane is available, create a new one
    if (assignedLane === -1) {
      assignedLane = lanes.length;
      lanes.push({ endMin: block.endMin });
    } else {
      // Update the lane's end time
      lanes[assignedLane].endMin = block.endMin;
    }
    
    placed.push({ ...block, lane: assignedLane });
  }

  return { day, lanes: placed, laneCount: lanes.length };
}

export function buildLayouts(
  templates: Template[],
  assignments: Assignment[],
  windowStartMin: number,
  windowEndMin: number,
): Record<DayKey, DayLayout> {
  const dayMap = DAY_ORDER.reduce<Record<DayKey, Block[]>>((acc, day) => {
    acc[day] = [];
    return acc;
  }, {} as Record<DayKey, Block[]>);

  const groups = new Map<string, Assignment[]>();
  assignments.forEach((assignment) => {
    const key = `${assignment.day}|${assignment.role}|${assignment.startTime}|${assignment.endTime}`;
    const list = groups.get(key) ?? [];
    list.push(assignment);
    groups.set(key, list);
  });

  assignments.forEach((assignment) => {
    // Skip invalid or empty assignments
    if (!assignment || typeof assignment !== 'object' || !assignment.day || !assignment.startTime || !assignment.endTime) {
      console.warn('Skipping invalid assignment:', assignment);
      return;
    }

    const start = timeToMinutes(assignment.startTime);
    const end = timeToMinutes(assignment.endTime);
    
    // Defensive check: ensure the day exists in dayMap
    if (!dayMap[assignment.day]) {
      console.error(`Invalid assignment day: "${assignment.day}". Expected one of: ${DAY_ORDER.join(', ')}`);
      console.error('Assignment object:', assignment);
      return;
    }
    
    // Don't clamp assignments - use their actual times
    dayMap[assignment.day].push({
      role: assignment.role,
      startMin: start,
      endMin: end,
      assignment,
      templateId: assignment.sourceTemplate?.id ?? null,
    });
  });

  templates.forEach((template) => {
    const start = timeToMinutes(template.startTime);
    const end = timeToMinutes(template.endTime);
    const { start: s, end: e, valid } = clampToWindow(start, end, windowStartMin, windowEndMin);
    if (!valid) {
      return;
    }

    DAY_ORDER.forEach((day) => {
      if (!template.days?.[day]) {
        return;
      }
      const key = `${day}|${template.role}|${template.startTime}|${template.endTime}`;
      if (!groups.get(key)?.length) {
        dayMap[day].push({
          role: template.role,
          startMin: start,
          endMin: end,
          templateId: template.id,
        });
      }
    });
  });

  return DAY_ORDER.reduce<Record<DayKey, DayLayout>>((acc, day) => {
    acc[day] = layoutDay(day, dayMap[day]);
    return acc;
  }, {} as Record<DayKey, DayLayout>);
}

export function minutesToLeft(min: number, windowStartMin: number, windowEndMin: number): number {
  const total = Math.max(MIN_WINDOW_MINUTES, windowEndMin - windowStartMin);
  const clamped = Math.max(windowStartMin, Math.min(min, windowEndMin));
  return ((clamped - windowStartMin) / total) * 100;
}

export function minutesToWidth(startMin: number, endMin: number, windowStartMin: number, windowEndMin: number): number {
  const total = Math.max(MIN_WINDOW_MINUTES, windowEndMin - windowStartMin);
  const clampedStart = Math.max(windowStartMin, Math.min(startMin, windowEndMin));
  const clampedEnd = Math.max(clampedStart, Math.min(endMin, windowEndMin));
  return ((clampedEnd - clampedStart) / total) * 100;
}

export function describeShift(startMin: number, endMin: number): string {
  return `${minutesToTime(startMin)} - ${minutesToTime(endMin)}`;
}
