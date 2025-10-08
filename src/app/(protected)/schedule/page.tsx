"use client";

import { useMemo, useState } from "react";

import { ErrorModal } from "@/components/ui/error-modal";

import { useScheduleData } from "./hooks/useScheduleData";
import { useEmployeeHours } from "./hooks/useEmployeeHours";
import { ScheduleToolbar } from "./components/ScheduleToolbar";
import { AvailabilitySidebar } from "./components/AvailabilitySidebar";
import { ScheduleTimeline } from "./components/ScheduleTimeline";
import { ScheduleChatAssistant } from "./components/ScheduleChatAssistant";
import { AssignmentDrawer, type AssignmentSelection } from "./components/AssignmentDrawer";
import { buildEmployeeSnapshots } from "./utils/snapshots";
import { buildLayouts, type LaidBlock } from "./utils/layout";
import { DAY_ORDER, MIN_WINDOW_MINUTES } from "./utils/constants";
import { minutesToTime, timeToMinutes } from "./utils/time";
import type { Assignment, DayKey, Employee, Template } from "./types";

const DEFAULT_OPENING_TIME = "09:00";
const DEFAULT_CLOSING_TIME = "22:00";


type DayFilter = DayKey | "ALL";

function deriveWindowBounds({
  openingTime,
  closingTime,
  templates,
  assignments,
}: {
  openingTime?: string | null;
  closingTime?: string | null;
  templates: Template[];
  assignments: Assignment[];
}) {
  const defaultStart = timeToMinutes(DEFAULT_OPENING_TIME);
  const defaultEnd = timeToMinutes(DEFAULT_CLOSING_TIME, defaultStart + MIN_WINDOW_MINUTES);
  const fallbackStart = timeToMinutes(openingTime ?? DEFAULT_OPENING_TIME, defaultStart);
  const fallbackEnd = timeToMinutes(closingTime ?? DEFAULT_CLOSING_TIME, defaultEnd);

  let earliest = fallbackStart;
  let latest = Math.max(fallbackStart + MIN_WINDOW_MINUTES, fallbackEnd);

  assignments.forEach((assignment) => {
    const start = timeToMinutes(assignment.startTime, fallbackStart);
    const end = timeToMinutes(assignment.endTime, fallbackEnd);
    earliest = Math.min(earliest, start);
    latest = Math.max(latest, end);
  });

  templates.forEach((template) => {
    const start = timeToMinutes(template.startTime, fallbackStart);
    const end = timeToMinutes(template.endTime, fallbackEnd);
    earliest = Math.min(earliest, start);
    latest = Math.max(latest, end);
  });

  const windowEnd = Math.max(latest, earliest + MIN_WINDOW_MINUTES);

  return { start: earliest, end: windowEnd };
}

function deriveHourMarks(startMin: number, endMin: number) {
  const startHour = Math.floor(startMin / 60);
  const endHour = Math.ceil(endMin / 60);
  const marks: number[] = [];
  for (let hour = startHour; hour <= endHour; hour += 1) {
    marks.push(hour);
  }
  return marks;
}

function toSelection(day: DayKey, block: LaidBlock): AssignmentSelection {
  return {
    day,
    role: block.role,
    startMin: block.startMin,
    endMin: block.endMin,
    templateId: block.templateId ?? block.assignment?.sourceTemplate?.id ?? null,
    assignment: block.assignment ?? null,
  };
}

function formatServerErrors(prefix: string, errors: string[]) {
  return [prefix, ...errors.map((msg) => `- ${msg}`)].join("\n");
}

export default function SchedulePage() {
  const {
    stores,
    currentStore,
    templates,
    employees,
    assignments,
    schedule,
    loading,
    error,
    selectStore,
    refresh,
    setAssignments,
  } = useScheduleData();

  const { hours: crossStoreMinutes } = useEmployeeHours(assignments, { 
    storeId: currentStore?.id,
    weekId: schedule?.weekId 
  });
  const snapshots = useMemo(() => buildEmployeeSnapshots(assignments), [assignments]);

  const templateWorkTypes = useMemo(() => {
    const index = new Map<string, string | null>();
    templates.forEach((template) => {
      index.set(template.id, template.workTypeId ?? null);
    });
    return index;
  }, [templates]);

  const defaultWeeklyMinutes = useMemo(() => {
    const map: Record<string, number> = {};
    snapshots.forEach((snapshot, employeeId) => {
      map[employeeId] = snapshot.weeklyMinutes;
    });
    return map;
  }, [snapshots]);

  const employeeWeeklyMinutes = useMemo(() => {
    const keys = Object.keys(crossStoreMinutes);
    if (keys.length > 0) {
      return crossStoreMinutes;
    }
    return defaultWeeklyMinutes;
  }, [crossStoreMinutes, defaultWeeklyMinutes]);

  const [selectedDay, setSelectedDay] = useState<DayFilter>("ALL");
  const [drawerSelection, setDrawerSelection] = useState<AssignmentSelection | null>(null);
  const [drawerError, setDrawerError] = useState<{ title: string; message: string; suggestion?: string } | null>(null);
  const [assignmentError, setAssignmentError] = useState<{ title: string; message: string; suggestion?: string } | null>(null);



  const { start: windowStartMin, end: windowEndMin } = useMemo(() =>
    deriveWindowBounds({
      openingTime: currentStore?.openingTime,
      closingTime: currentStore?.closingTime,
      templates,
      assignments,
    }),
    [assignments, currentStore?.closingTime, currentStore?.openingTime, templates]);

  const hours = useMemo(() => deriveHourMarks(windowStartMin, windowEndMin), [windowEndMin, windowStartMin]);

  const layouts = useMemo(
    () => buildLayouts(templates, assignments, windowStartMin, windowEndMin),
    [assignments, templates, windowEndMin, windowStartMin],
  );

  const timeToMinutes = (timeStr: string): number => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
  };

  const validateAssignment = (employee: Employee, selection: AssignmentSelection): { isValid: boolean; error?: { title: string; message: string; suggestion: string } } => {
    // Check if employee has any work types assigned
    if (!employee.roles || employee.roles.length === 0) {
      return {
        isValid: false,
        error: {
          title: "No Work Types Assigned",
          message: `${employee.name} has no work types assigned and cannot be scheduled for any shifts.`,
          suggestion: "Please assign work types to this employee in the Employees tab before scheduling them."
        }
      };
    }
    
    // Check if employee can work the required role (fix case-sensitive matching)
    const employeeWorkTypeNames = employee.roles.map(r => r.name.toLowerCase().trim());
    const requiredRole = selection.role.toLowerCase().trim();
    

    
    if (!employeeWorkTypeNames.includes(requiredRole)) {
      return {
        isValid: false,
        error: {
          title: "Work Type Mismatch", 
          message: `${employee.name} cannot work as "${selection.role}". They can work as: ${employee.roles.map(r => r.name).join(', ')}`,
          suggestion: "Either assign a different employee with the correct work type, or update this employee's work types in the Employees tab."
        }
      };
    }
    
    // Check availability for the day
    const dayAvailability = employee.availability?.find(a => a.day === selection.day);
    if (dayAvailability?.isOff) {
      return {
        isValid: false,
        error: {
          title: "Employee Not Available",
          message: `${employee.name} is not available on ${selection.day}.`,
          suggestion: "Please choose a different employee or update this employee's availability in the Employees tab."
        }
      };
    }
    
    // Check time availability overlap
    if (dayAvailability && !dayAvailability.isOff) {
      const shiftStart = timeToMinutes(minutesToTime(selection.startMin));
      const shiftEnd = timeToMinutes(minutesToTime(selection.endMin));
      const availStart = timeToMinutes(dayAvailability.startTime);
      const availEnd = timeToMinutes(dayAvailability.endTime);
      
      // Check if shift times overlap with availability
      if (shiftStart < availStart || shiftEnd > availEnd) {
        return {
          isValid: false,
          error: {
            title: "Time Conflict",
            message: `${employee.name} is only available from ${dayAvailability.startTime} to ${dayAvailability.endTime}, but the shift is from ${minutesToTime(selection.startMin)} to ${minutesToTime(selection.endMin)}.`,
            suggestion: "Either choose a different employee, adjust the shift times, or update this employee's availability in the Employees tab."
          }
        };
      }
    }
    
    return { isValid: true };
  };

  const handleAssign = async (employee: Employee, selection: AssignmentSelection) => {
    if (!currentStore?.id) {
      return;
    }

    // Validate assignment before any UI updates
    const validation = validateAssignment(employee, selection);
    if (!validation.isValid && validation.error) {
      setAssignmentError(validation.error);
      return;
    }

    // Clear errors and close drawer only after validation passes
    setDrawerError(null);
    setAssignmentError(null);
    setDrawerSelection(null);

    
    const originalAssignments = assignments;
    let optimisticAssignment: Assignment;

    try {
      if (selection.assignment) {
        // Optimistic update for reassignment - update existing assignment instantly
        optimisticAssignment = {
          ...selection.assignment,
          employee: {
            id: employee.id,
            name: employee.name,
            color: employee.color,
            storeName: employee.storeName,
          },
        };
        setAssignments(prev => prev.map(a => a.id === selection.assignment!.id ? optimisticAssignment : a));

        // Background API call for reassignment
        fetch('/api/schedule/assignments/unassign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            assignmentId: selection.assignment.id,
            employeeId: employee.id,
          }),
        }).catch((err: any) => {
          console.error('Reassignment failed:', err);
          // Revert on error
          setAssignments(originalAssignments);
          setAssignmentError({
            title: "Reassignment Failed",
            message: `Failed to reassign ${employee.name} to the new shift.`,
            suggestion: "Please try the assignment again or check for conflicts."
          });
        });

      } else {
        // Optimistic update for new assignment - add instantly
        optimisticAssignment = {
          id: `temp-${Date.now()}-${employee.id}`, // Unique temporary ID
          day: selection.day,
          role: selection.role,
          startTime: minutesToTime(selection.startMin),
          endTime: minutesToTime(selection.endMin),
          locked: false,
          employee: {
            id: employee.id,
            name: employee.name,
            color: employee.color,
            storeName: employee.storeName,
          },
          sourceTemplate: selection.templateId ? { id: selection.templateId, role: selection.role } : undefined,
        };
        setAssignments(prev => [...prev, optimisticAssignment]);

        // Background API call for new assignment
        const templateExists = selection.templateId && templates.some(t => t.id === selection.templateId);
        const payload = {
          storeId: currentStore.id,
          day: selection.day,
          role: selection.role,
          startTime: minutesToTime(selection.startMin),
          endTime: minutesToTime(selection.endMin),
          employeeId: employee.id,
          sourceTemplateId: templateExists ? selection.templateId : null,
          weekId: schedule?.weekId,
        };

        fetch('/api/schedule/assignments/fast', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        .then(async response => {
          if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            const serverErrors = Array.isArray((data as any).errors)
              ? (data as any).errors.map((err: any) => err.message ?? String(err))
              : [];
            const message = serverErrors.length > 0
              ? `Cannot assign ${employee.name}: ${serverErrors.join(', ')}`
              : (data as any).error || 'Failed to create assignment';
            
            // Revert optimistic update and show error modal for validation issues
            setAssignments(originalAssignments);
            
            // Check if this is a structured API error response
            if (data.code === 'WORK_TYPE_MISMATCH' || data.code === 'ROLE_MISMATCH') {
              setAssignmentError({
                title: data.error || "Work Type Mismatch",
                message: data.details || `${employee.name} cannot be assigned to this shift due to work type restrictions.`,
                suggestion: data.suggestion || "Please check the employee's work types in the Employees tab."
              });
            } else {
              // Fallback for other validation errors
              const isWorkTypeMismatch = serverErrors.some((err: string) => {
                const lowerErr = err.toLowerCase();
                return lowerErr.includes('work type') || 
                       lowerErr.includes('role') ||
                       lowerErr.includes('qualification') ||
                       lowerErr.includes('not qualified') ||
                       lowerErr.includes('mismatch') ||
                       lowerErr.includes('incompatible');
              });
              
              if (isWorkTypeMismatch) {
                setAssignmentError({
                  title: "Work Type Mismatch",
                  message: `${employee.name} cannot be assigned to this shift because their work types don't match the required role.`,
                  suggestion: "Either assign a different employee with the correct work type, or update the employee's work types in the Employees tab."
                });
              } else {
                setAssignmentError({
                  title: "Assignment Failed",
                  message: serverErrors.length > 0 
                    ? `Cannot assign ${employee.name}: ${serverErrors.join(', ')}`
                    : `Cannot assign ${employee.name} to this shift.`,
                  suggestion: "Please check the shift requirements and employee availability, then try again."
                });
              }
            }
            return;
          }
          
          const realAssignment = await response.json();
          
          // Replace temporary assignment with real one
          setAssignments(prev => prev.map(a => 
            a.id === optimisticAssignment.id ? realAssignment.assignment || realAssignment : a
          ));
        })
        .catch((err: any) => {
          console.error('Assignment failed:', err);
          // Revert on error
          setAssignments(originalAssignments);
          setAssignmentError({
            title: "Assignment Failed",
            message: err.message || `Failed to assign ${employee.name} due to a network error.`,
            suggestion: "Please check your connection and try again."
          });
        });
      }

    } catch (err: any) {
      console.error('Assignment error:', err);
      setAssignments(originalAssignments);
      setAssignmentError({
        title: "Assignment Failed",
        message: "Assignment failed due to an unexpected error.",
        suggestion: "Please try again or refresh the page."
      });
    }
  };

  const handleUnassign = async (assignment: Assignment) => {
    // Immediate UI updates for instant feedback
    setDrawerError(null);
    setDrawerSelection(null);

    
    const originalAssignments = assignments;
    // Remove the assignment completely from the UI
    setAssignments(prev => prev.filter(a => a.id !== assignment.id));
    
    // Background API call
    fetch(`/api/schedule/assignments/unassign?assignmentId=${assignment.id}`, {
      method: 'DELETE',
    }).catch((err: any) => {
      console.error('Unassign failed:', err);
      // Revert on error - restore the assignment
      setAssignments(originalAssignments);
      setAssignmentError({
        title: "Delete Failed",
        message: "Failed to delete the shift assignment.",
        suggestion: "Please try again or refresh the page."
      });
    });
  };

  const handleDropEmployee = ({ day, block, employeeId }: { day: DayKey; block: LaidBlock; employeeId: string }) => {
    const employee = employees.find((candidate) => candidate.id === employeeId);
    if (!employee) {
      setAssignmentError({
        title: "Employee Not Found",
        message: "The employee for this assignment could not be found.",
        suggestion: "Please refresh the page and try again."
      });
      return;
    }
    const selection = toSelection(day, block);
    void handleAssign(employee, selection);
  };



  const handleSelectBlock = ({ day, block }: { day: DayKey; block: LaidBlock }) => {
    setDrawerError(null);
    setAssignmentError(null);
    setDrawerSelection(toSelection(day, block));
  };

  const dayOptions: DayFilter[] = ['ALL', ...DAY_ORDER];

  return (
    <div className="flex min-h-screen flex-col gap-4 p-4 md:p-6">
      <ScheduleToolbar
        stores={stores}
        currentStore={currentStore}
        loading={loading}
        onSelectStore={selectStore}
        onGenerated={() => {
          void refresh();
        }}
        onError={(message) => setAssignmentError({
          title: "Generation Failed",
          message: message || "Failed to generate schedule.",
          suggestion: "Please check your settings and try again."
        })}

        schedule={schedule}
      />

      <div className="flex flex-wrap items-center gap-2">
        {dayOptions.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setSelectedDay(option)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${selectedDay === option ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
          >
            {option}
          </button>
        ))}
      </div>

      <ErrorModal
        open={!!error}
        onClose={() => {}} // Schedule errors are typically from data loading, not user actions
        title="Schedule Loading Error"
        message={error || "Failed to load schedule data"}
        suggestion="Please refresh the page or check your internet connection."
      />

      <ErrorModal
        open={!!assignmentError}
        onClose={() => setAssignmentError(null)}
        title={assignmentError?.title || "Assignment Error"}
        message={assignmentError?.message || "Failed to assign employee"}
        suggestion={assignmentError?.suggestion}
      />

      <div className="grid grid-cols-[300px_1fr_320px] gap-4 h-[75vh]">
        {/* Left: Availability Sidebar */}
        <div className="overflow-y-auto">
          <AvailabilitySidebar
            day={selectedDay === 'ALL' ? 'MON' : selectedDay}
            storeId={currentStore?.id}
            employees={employees}
            assignments={assignments}
            employeeWeeklyMinutes={employeeWeeklyMinutes}
            crossStoreMinutes={crossStoreMinutes}
            onSelectEmployee={(employee) => {
              if (!drawerSelection) {
                return;
              }
              void handleAssign(employee, drawerSelection);
            }}
          />
        </div>

        {/* Center: Timeline (centered content) */}
        <div className="flex justify-center items-start overflow-hidden">
          <ScheduleTimeline
            className="w-full max-w-4xl h-full"
            layouts={layouts}
            windowStartMin={windowStartMin}
            windowEndMin={windowEndMin}
            hours={hours}
            selectedDay={selectedDay}
            onSelectBlock={handleSelectBlock}
            onDropEmployee={handleDropEmployee}
          />
        </div>

        {/* Right: Chat Assistant */}
        <div className="h-full">
          <ScheduleChatAssistant />
        </div>
      </div>

      <AssignmentDrawer
        selection={drawerSelection}
        storeId={currentStore?.id}
        employees={employees}
        snapshots={snapshots}
        templateWorkTypes={templateWorkTypes}
        onAssign={handleAssign}
        onUnassign={handleUnassign}
        onClose={() => setDrawerSelection(null)}
        error={drawerError}
        setError={setDrawerError}
      />


    </div>
  );
}
