import { DAY_ORDER, MIN_WINDOW_MINUTES } from "./constants";
import { minutesToTime, timeToMinutes } from "../utils/time";
import type { Assignment, DayKey, Template } from "../types";

export interface Block {
  role: string; // Keep for backward compatibility during transition
  workType?: {
    id: string;
    name: string;
    color: string;
  };
  startMin: number;
  endMin: number;
  assignment?: Assignment;
  templateId?: string | null;
  isPreview?: boolean; // Flag for preview templates
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
    return (a.role || '').localeCompare(b.role || '');
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

  // Group assignments by time slot and work type for capacity management
  const assignmentsBySlot = new Map<string, Assignment[]>();
  assignments.forEach((assignment) => {
    if (!assignment || typeof assignment !== 'object' || !assignment.day || !assignment.startTime || !assignment.endTime) {
      console.warn('Skipping invalid assignment:', assignment);
      return;
    }

    const workTypeName = assignment.workType?.name || 'No Work Type';
    const key = `${assignment.day}|${workTypeName}|${assignment.startTime}|${assignment.endTime}`;
    const list = assignmentsBySlot.get(key) ?? [];
    list.push(assignment);
    assignmentsBySlot.set(key, list);
  });

  // Group templates by time slot and work type
  const templatesBySlot = new Map<string, Template[]>();
  templates.forEach((template) => {
    const start = timeToMinutes(template.startTime);
    const end = timeToMinutes(template.endTime);
    const { valid } = clampToWindow(start, end, windowStartMin, windowEndMin);
    if (!valid) {
      return;
    }

    DAY_ORDER.forEach((day) => {
      if (!template.days?.[day]) {
        return;
      }
      const workTypeName = template.workType?.name || 'No Work Type';
      const key = `${day}|${workTypeName}|${template.startTime}|${template.endTime}`;
      const list = templatesBySlot.get(key) ?? [];
      list.push(template);
      templatesBySlot.set(key, list);
    });
  });

  // Process each time slot and create blocks based on template capacity
  templatesBySlot.forEach((templatesInSlot, key) => {
    const [day, workTypeName, startTime, endTime] = key.split('|');
    const dayKey = day as DayKey;
    
    if (!dayMap[dayKey]) {
      return;
    }

    const start = timeToMinutes(startTime);
    const end = timeToMinutes(endTime);
    const assignmentsInSlot = assignmentsBySlot.get(key) || [];
    
    // Create blocks for each template in this slot
    templatesInSlot.forEach((template, templateIndex) => {
      // Check if this template slot is filled by an assignment
      const assignmentForThisSlot = assignmentsInSlot[templateIndex];
      
      if (assignmentForThisSlot) {
        // This template slot is filled - create an assignment block
        dayMap[dayKey].push({
          role: workTypeName,
          workType: assignmentForThisSlot.workType,
          startMin: start,
          endMin: end,
          assignment: assignmentForThisSlot,
          templateId: template.id,
        });
      } else {
        // This template slot is empty - create a template block
        dayMap[dayKey].push({
          role: workTypeName,
          workType: template.workType || undefined,
          startMin: start,
          endMin: end,
          templateId: template.id,
          isPreview: (template as any).isPreview, // Preserve preview flag from template
        });
      }
    });
  });

  // Handle assignments that don't have corresponding templates (manual assignments)
  assignmentsBySlot.forEach((assignmentsInSlot, key) => {
    const [day, workTypeName, startTime, endTime] = key.split('|');
    const dayKey = day as DayKey;
    
    if (!dayMap[dayKey]) {
      return;
    }

    const templatesInSlot = templatesBySlot.get(key) || [];
    
    // Add any assignments that exceed template capacity
    if (assignmentsInSlot.length > templatesInSlot.length) {
      const excessAssignments = assignmentsInSlot.slice(templatesInSlot.length);
      const start = timeToMinutes(startTime);
      const end = timeToMinutes(endTime);
      
      excessAssignments.forEach((assignment) => {
        dayMap[dayKey].push({
          role: workTypeName,
          workType: assignment.workType || undefined,
          startMin: start,
          endMin: end,
          assignment,
          templateId: assignment.sourceTemplate?.id ?? null,
        });
      });
    }
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
