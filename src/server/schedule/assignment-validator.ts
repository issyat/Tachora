import { prisma } from '@/lib/prisma';
import {
  DAY_TO_INDEX,
  DEFAULT_WEEKLY_TARGET_MINUTES,
  MAX_DAILY_MINUTES,
  MIN_REST_MINUTES,
  MINUTES_PER_DAY,
  STUDENT_WEEKLY_LIMIT_MINUTES,
} from '@/lib/schedule/constants';
import { ensureIsoWeekId } from '@/lib/week';
import type { Weekday } from '@/types';

export interface AssignmentValidationInput {
  managerId: string;
  store: {
    id: string;
    openingTime: Date | null;
    closingTime: Date | null;
  };
  isoWeek?: string | null;
  day: Weekday;
  workTypeId: string;
  startTime: string; // HH:mm
  endTime: string;   // HH:mm
  employeeId: string;
  sourceTemplateId?: string | null;
  assignmentId?: string | null;
}

export interface AssignmentValidationError {
  code:
    | 'employee_not_found'
    | 'store_restriction'
    | 'availability'
    | 'role_mismatch'
    | 'template_mismatch'
    | 'invalid_time'
    | 'overlap'
    | 'weekly_limit'
    | 'daily_limit'
    | 'rest_violation'
    | 'outside_store_hours';
  message: string;
}

export interface AssignmentValidationResult {
  ok: boolean;
  errors?: AssignmentValidationError[];
  employee?: Awaited<ReturnType<typeof loadEmployee>>;
  template?: Awaited<ReturnType<typeof loadTemplate>>;
  isoWeek: string;
}

const TIME_PATTERN = /^(\d{2}):(\d{2})$/;

function parseTime(value: string): number | null {
  const match = TIME_PATTERN.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    return null;
  }
  return hour * 60 + minute;
}

function timeDateToMinutes(date: Date | null | undefined): number | null {
  if (!date) return null;
  // Use UTC time to avoid timezone issues since times are stored as UTC
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}

function minutesToTime(minutes: number): string {
  const clamped = Math.max(0, minutes);
  const hour = Math.floor(clamped / 60)
    .toString()
    .padStart(2, '0');
  const minute = (clamped % 60)
    .toString()
    .padStart(2, '0');
  return `${hour}:${minute}`;
}

async function loadEmployee(employeeId: string, managerId: string) {
  return prisma.employee.findFirst({
    where: {
      id: employeeId,
      store: {
        managerId,
      },
    },
    include: {
      availability: true,
      store: {
        select: {
          id: true,
          managerId: true,
          name: true,
        },
      },
      roles: {
        include: {
          workType: true,
        },
      },
    },
  });
}

async function loadTemplate(templateId: string, storeId: string) {
  return prisma.shiftTemplate.findFirst({
    where: {
      id: templateId,
      storeId,
    },
  });
}

function addError(collection: AssignmentValidationError[], error: AssignmentValidationError) {
  if (!collection.some((existing) => existing.code === error.code && existing.message === error.message)) {
    collection.push(error);
  }
}

export async function validateAssignment(
  input: AssignmentValidationInput,
): Promise<AssignmentValidationResult> {
  const errors: AssignmentValidationError[] = [];
  const isoWeek = ensureIsoWeekId(input.isoWeek, new Date());

  const startMinutes = parseTime(input.startTime);
  const endMinutes = parseTime(input.endTime);

  if (startMinutes === null || endMinutes === null) {
    addError(errors, {
      code: 'invalid_time',
      message: 'Shift time must be in HH:mm format.',
    });
  } else if (endMinutes <= startMinutes) {
    addError(errors, {
      code: 'invalid_time',
      message: 'Shift end time must be after the start time.',
    });
  }

  const employee = await loadEmployee(input.employeeId, input.managerId);
  if (!employee) {
    addError(errors, {
      code: 'employee_not_found',
      message: 'Employee not found or not part of your organisation.',
    });
  }

  let template = null;
  if (input.sourceTemplateId) {
    template = await loadTemplate(input.sourceTemplateId, input.store.id);
    // If template doesn't exist, just continue without it (don't fail validation)
    // This allows assignments to work even if the original template was deleted
  }

  // Template validation - only check day availability, allow flexible times
  if (template && startMinutes !== null && endMinutes !== null) {
    const templateDays = (template.days ?? {}) as Record<string, boolean>;
    if (!templateDays[input.day]) {
      addError(errors, {
        code: 'template_mismatch',
        message: 'This shift template is not active on the selected day.',
      });
    }
    // Allow flexible assignment times - templates are guidelines, not strict requirements
    // This enables drag-and-drop assignments with different times than the original template
  }

  // Store hours validation - allow some flexibility for opening/closing preparation
  if (errors.length === 0) {
    const storeOpening = timeDateToMinutes(input.store.openingTime);
    const storeClosing = timeDateToMinutes(input.store.closingTime);
    
    console.log('Store hours validation:', {
      openingTime: input.store.openingTime,
      closingTime: input.store.closingTime,
      storeOpening,
      storeClosing,
      shiftStart: startMinutes,
      shiftEnd: endMinutes
    });
    
    // Use default hours if store hours are not set
    const DEFAULT_OPENING_MINUTES = 8 * 60; // 08:00
    const DEFAULT_CLOSING_MINUTES = 22 * 60; // 22:00
    
    const effectiveOpening = storeOpening ?? DEFAULT_OPENING_MINUTES;
    const effectiveClosing = storeClosing ?? DEFAULT_CLOSING_MINUTES;
    
    // Allow shifts to start up to 2 hours before opening (for setup/preparation)
    const PREP_TIME_MINUTES = 2 * 60; // 2 hours
    
    if (startMinutes! < (effectiveOpening - PREP_TIME_MINUTES)) {
      addError(errors, {
        code: 'outside_store_hours',
        message: `Shift starts too early. Store opens at ${minutesToTime(effectiveOpening)}.`,
      });
    }

    // Allow shifts to end up to 2 hours after closing (for cleanup/closing tasks)
    if (endMinutes! > (effectiveClosing + PREP_TIME_MINUTES)) {
      addError(errors, {
        code: 'outside_store_hours',
        message: `Shift ends too late. Store closes at ${minutesToTime(effectiveClosing)}.`,
      });
    }
  }

  if (employee && errors.length === 0) {
    if (!employee.canWorkAcrossStores && employee.storeId !== input.store.id) {
      addError(errors, {
        code: 'store_restriction',
        message: `${employee.name} cannot work at this store.`,
      });
    }
  }

  if (employee && errors.length === 0) {
    const availabilityMap = new Map<Weekday, typeof employee.availability[number]>();
    for (const slot of employee.availability) {
      availabilityMap.set(slot.day, slot);
    }

    const slot = availabilityMap.get(input.day);
    if (!slot || slot.isOff) {
      addError(errors, {
        code: 'availability',
        message: `${employee.name} is not available on ${input.day}.`,
      });
    } else {
      const availStart = timeDateToMinutes(slot.startTime);
      const availEnd = timeDateToMinutes(slot.endTime);
      
      if (availStart !== null && startMinutes! < availStart) {
        addError(errors, {
          code: 'availability',
          message: `${employee.name} is only available after ${minutesToTime(availStart)} on ${input.day}.`,
        });
      }
      if (availEnd !== null && endMinutes! > availEnd) {
        addError(errors, {
          code: 'availability',
          message: `${employee.name} must finish by ${minutesToTime(availEnd)} on ${input.day}.`,
        });
      }
    }
  }

  if (employee && errors.length === 0) {
    const employeeWorkTypeIds = employee.roles.map((pivot) => pivot.workTypeId).filter(Boolean) as string[];
    const employeeWorkTypeNames = employee.roles
      .map((pivot) => pivot.workType?.name)
      .filter((name): name is string => Boolean(name));

    // Only validate work types if the employee has specific work type assignments
    if (employeeWorkTypeIds.length > 0) {
      // Check if employee has the required work type for this assignment
      if (!employeeWorkTypeIds.includes(input.workTypeId)) {
        addError(errors, {
          code: 'role_mismatch',
          message: `${employee.name} cannot work this shift type. They can work as: ${employeeWorkTypeNames.join(', ')}.`,
        });
      }
    }
    // If employee has no work type assignments, allow any assignment (flexible assignment)
  }

  let weeklyMinutesWorked = 0;
  const dailyMinutesWorked = new Map<Weekday, number>();

  if (employee && errors.length === 0) {
    const existingAssignments = await prisma.assignment.findMany({
      where: {
        employeeId: employee.id,
        schedule: {
          isoWeek,
          store: {
            managerId: input.managerId,
          },
        },
        ...(input.assignmentId
          ? {
              id: {
                not: input.assignmentId,
              },
            }
          : {}),
      },
    });

    const newStart = startMinutes!;
    const newEnd = endMinutes!;
    const newDuration = newEnd - newStart;
    const newAbsStart = DAY_TO_INDEX[input.day] * MINUTES_PER_DAY + newStart;
    const newAbsEnd = DAY_TO_INDEX[input.day] * MINUTES_PER_DAY + newEnd;

    for (const assignment of existingAssignments) {
      const assignStart = timeDateToMinutes(assignment.startTime);
      const assignEnd = timeDateToMinutes(assignment.endTime);
      if (assignStart === null || assignEnd === null) {
        continue;
      }
      const assignmentDuration = assignEnd - assignStart;
      weeklyMinutesWorked += assignmentDuration;

      const dayMinutes = dailyMinutesWorked.get(assignment.day) ?? 0;
      dailyMinutesWorked.set(assignment.day, dayMinutes + assignmentDuration);

      if (assignment.day === input.day) {
        const overlap = !(newEnd <= assignStart || newStart >= assignEnd);
        if (overlap) {
          addError(errors, {
            code: 'overlap',
            message: `${employee.name} already has a shift from ${minutesToTime(assignStart)} to ${minutesToTime(assignEnd)} on ${input.day}.`,
          });
        }
      }

      const otherAbsStart = DAY_TO_INDEX[assignment.day] * MINUTES_PER_DAY + assignStart;
      const otherAbsEnd = DAY_TO_INDEX[assignment.day] * MINUTES_PER_DAY + assignEnd;

      if (newAbsStart >= otherAbsEnd) {
        const gap = newAbsStart - otherAbsEnd;
        if (gap < MIN_REST_MINUTES) {
          addError(errors, {
            code: 'rest_violation',
            message: `${employee.name} needs at least ${MIN_REST_MINUTES / 60} hours rest before this shift.`,
          });
        }
      } else if (otherAbsStart >= newAbsEnd) {
        const gap = otherAbsStart - newAbsEnd;
        if (gap < MIN_REST_MINUTES) {
          addError(errors, {
            code: 'rest_violation',
            message: `${employee.name} needs at least ${MIN_REST_MINUTES / 60} hours between shifts.`,
          });
        }
      }
    }

    const totalWeekly = weeklyMinutesWorked + newDuration;
    const baseTarget = employee.weeklyMinutesTarget ?? DEFAULT_WEEKLY_TARGET_MINUTES;
    const cappedTarget =
      employee.contractType === "STUDENT"
        ? Math.min(baseTarget, STUDENT_WEEKLY_LIMIT_MINUTES)
        : baseTarget;

    if (totalWeekly > cappedTarget) {
      addError(errors, {
        code: 'weekly_limit',
        message: `${employee.name} would exceed the weekly limit (${Math.round(cappedTarget / 60)}h).`,
      });
    }

    const dayMinutes = (dailyMinutesWorked.get(input.day) ?? 0) + newDuration;
    if (dayMinutes > MAX_DAILY_MINUTES) {
      addError(errors, {
        code: 'daily_limit',
        message: `${employee.name} would exceed the daily maximum (${Math.round(MAX_DAILY_MINUTES / 60)}h).`,
      });
    }
  }

  return {
    ok: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
    employee: errors.length === 0 ? employee ?? undefined : undefined,
    template: errors.length === 0 ? template ?? undefined : undefined,
    isoWeek,
  };
}

