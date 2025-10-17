/**
 * Shift Candidate Generator
 * 
 * Generates deterministic list of shift candidates with availability checking.
 * Single source of truth for the availability rule.
 */

import type { Weekday } from '@/types';
import type { ShiftCandidate } from './conversation-state';

export interface EmployeeAvailability {
  day: Weekday;
  isOff: boolean;
  startTime?: string; // HH:mm
  endTime?: string; // HH:mm
}

export interface ShiftTemplate {
  id: string;
  day: Weekday;
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  workTypeName: string;
}

/**
 * AVAILABILITY RULE (Single Source of Truth):
 * 
 * A shift is available if:
 * 1. Employee is not marked as "off" that day
 * 2. shiftStart >= availabilityStart
 * 3. shiftEnd <= availabilityEnd (STRICT: shift must end before or at availability end)
 */
function checkAvailability(
  shift: ShiftTemplate,
  availability: EmployeeAvailability | undefined
): { fits: boolean; reason?: string } {
  // No availability defined = assume available all day
  if (!availability) {
    return { fits: true };
  }
  
  // Employee is off that day
  if (availability.isOff) {
    return {
      fits: false,
      reason: `Employee is marked as off on ${shift.day}`,
    };
  }
  
  // No time restrictions = available all day
  if (!availability.startTime || !availability.endTime) {
    return { fits: true };
  }
  
  const shiftStart = timeToMinutes(shift.startTime);
  const shiftEnd = timeToMinutes(shift.endTime);
  const availStart = timeToMinutes(availability.startTime);
  const availEnd = timeToMinutes(availability.endTime);
  
  // Check shift starts after availability starts
  if (shiftStart < availStart) {
    return {
      fits: false,
      reason: `Shift starts at ${shift.startTime} but employee is only available from ${availability.startTime}`,
    };
  }
  
  // Check shift ends before or at availability end (STRICT)
  if (shiftEnd > availEnd) {
    return {
      fits: false,
      reason: `Shift ends at ${shift.endTime} but employee's availability ends at ${availability.endTime}`,
    };
  }
  
  return { fits: true };
}

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

function getTimeOfDayLabel(startTime: string): string {
  const hour = parseInt(startTime.split(':')[0]);
  if (hour < 12) return 'Morning';
  if (hour < 18) return 'Afternoon';
  return 'Evening';
}

function calculateDuration(startTime: string, endTime: string): number {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  return (end - start) / 60; // hours
}

/**
 * Generate shift candidates for a specific employee, day, and role
 */
export function generateCandidates(
  shifts: ShiftTemplate[],
  employeeAvailability: EmployeeAvailability[],
  day: Weekday,
  role: string
): ShiftCandidate[] {
  // Filter shifts by day and role
  const matchingShifts = shifts.filter(
    s => s.day === day && s.workTypeName === role
  );
  
  // Get availability for this day
  const dayAvailability = employeeAvailability.find(a => a.day === day);
  
  // Generate candidates
  const candidates: ShiftCandidate[] = matchingShifts.map(shift => {
    const { fits, reason } = checkAvailability(shift, dayAvailability);
    const duration = calculateDuration(shift.startTime, shift.endTime);
    const timeLabel = getTimeOfDayLabel(shift.startTime);
    
    return {
      shiftId: `${shift.id}-${shift.day}`,
      templateId: shift.id,
      label: `${timeLabel} (${shift.startTime}-${shift.endTime})`,
      startTime: shift.startTime,
      endTime: shift.endTime,
      durationHours: duration,
      fits,
      reason,
    };
  });
  
  // Sort by start time
  candidates.sort((a, b) => 
    timeToMinutes(a.startTime) - timeToMinutes(b.startTime)
  );
  
  return candidates;
}

/**
 * Format candidates for display to user
 */
export function formatCandidatesMessage(
  candidates: ShiftCandidate[],
  employeeName: string,
  day: string,
  role: string
): string {
  const feasible = candidates.filter(c => c.fits);
  const blocked = candidates.filter(c => !c.fits);
  
  let message = `I found ${candidates.length} ${role} shift${candidates.length > 1 ? 's' : ''} on ${day}:\n\n`;
  
  // List feasible shifts first
  if (feasible.length > 0) {
    message += `✓ Available for ${employeeName}:\n`;
    feasible.forEach((c, i) => {
      message += `  ${i + 1}. ${c.label} (${c.durationHours}h)\n`;
    });
  }
  
  // List blocked shifts
  if (blocked.length > 0) {
    message += `\n✗ Cannot assign (conflicts):\n`;
    blocked.forEach((c, i) => {
      message += `  ${feasible.length + i + 1}. ${c.label} - ${c.reason}\n`;
    });
  }
  
  // Ask for selection
  if (feasible.length === 0) {
    message += `\n→ No shifts available. All shifts conflict with ${employeeName}'s availability.`;
  } else if (feasible.length === 1) {
    message += `\n→ Only one shift fits. Would you like to assign ${employeeName} to this shift?`;
  } else {
    message += `\n→ Which shift would you like to assign ${employeeName} to? (Enter the number or say "first", "second", etc.)`;
  }
  
  return message;
}
