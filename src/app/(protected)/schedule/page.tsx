"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { ErrorModal } from "@/components/ui/error-modal";
import { usePreview } from "@/hooks/use-preview";

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
import { useScheduleFacts } from "./hooks/useScheduleFacts";

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
    workType: block.workType || block.assignment?.workType || { id: 'unknown', name: block.role, color: '#6b7280' },
    startMin: block.startMin,
    endMin: block.endMin,
    templateId: block.templateId ?? block.assignment?.sourceTemplate?.id ?? null,
    assignment: block.assignment ?? null,
  };
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

  const {
    facts: scheduleFacts,
    loading: scheduleFactsLoading,
    error: scheduleFactsError,
  } = useScheduleFacts(assignments, {
    storeId: currentStore?.id,
    weekId: schedule?.weekId,
  });

  useEffect(() => {
    if (scheduleFactsError) {
      console.warn("Failed to refresh schedule facts", scheduleFactsError);
    }
  }, [scheduleFactsError]);

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
  const [operationInProgress, setOperationInProgress] = useState(false);
  const [optimisticTemplates, setOptimisticTemplates] = useState<Template[]>([]);

  // Preview state management (only enabled when store and schedule are loaded)
  const {
    preview,
    visualization,
    isLoading: previewLoading,
    error: previewError,
    fetchPreviewById,
    applyPreview,
    undoPreview,
    discardPreview,
  } = usePreview({
    storeId: currentStore?.id ?? '',
    weekId: schedule?.weekId ?? '',
    snapshotVersion: schedule?.version?.toString() ?? '1', // Use actual schedule version
    onApplySuccess: async () => {
      // Wait for refresh to complete before UI updates
      await refresh();
      // Clear optimistic templates after real data loads
      setOptimisticTemplates([]);
    },
    onUndoSuccess: async () => {
      // Wait for refresh to complete before UI updates
      await refresh();
    },
    onError: (err) => {
      setAssignmentError({
        title: 'Preview Error',
        message: err.message || 'Failed to process preview',
        suggestion: 'Please try again or discard the preview.'
      });
      // Clear optimistic templates on error
      setOptimisticTemplates([]);
    },
  });



  const { start: windowStartMin, end: windowEndMin } = useMemo(() =>
    deriveWindowBounds({
      openingTime: currentStore?.openingTime,
      closingTime: currentStore?.closingTime,
      templates,
      assignments,
    }),
    [assignments, currentStore?.closingTime, currentStore?.openingTime, templates]);

  const hours = useMemo(() => deriveHourMarks(windowStartMin, windowEndMin), [windowEndMin, windowStartMin]);

  // Merge preview shift templates for calendar display
  const templatesWithPreview = useMemo(() => {
    // Start with real templates
    let merged = [...templates];
    
    // Add optimistic templates (from applied previews waiting for refresh)
    if (optimisticTemplates.length > 0) {
      merged = [...merged, ...optimisticTemplates];
    }

    if (!preview || preview.status !== 'pending') {
      return merged;
    }

    // Add new shift templates from preview
    for (const diff of preview.diffs) {
      if (diff.operation.type === 'add_shift') {
        const op = diff.operation as any;
        
        // Find the work type from existing templates
        let workType = templates.find(t => t.workType?.name === op.workTypeName)?.workType;
        
        // If not found in templates, create a placeholder work type
        // (This happens when adding a shift for a newly created work type)
        if (!workType) {
          workType = {
            id: `temp-worktype-${Date.now()}`,
            name: op.workTypeName,
            color: '#6366f1', // Default indigo color for new work types
          };
        }

        // Create preview template
        const previewTemplate = {
          id: `preview-${Date.now()}`,
          storeId: currentStore?.id || '',
          days: {
            MON: op.day === 'MON',
            TUE: op.day === 'TUE',
            WED: op.day === 'WED',
            THU: op.day === 'THU',
            FRI: op.day === 'FRI',
            SAT: op.day === 'SAT',
            SUN: op.day === 'SUN',
          },
          startTime: op.start,
          endTime: op.end,
          workTypeId: workType.id,
          workType: workType,
          capacity: op.capacity || 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          isPreview: true, // Mark as preview
        };

        merged.push(previewTemplate as any);
      }
    }

    return merged;
  }, [templates, optimisticTemplates, preview, currentStore?.id]);

  // Merge preview changes into assignments for calendar display
  const assignmentsWithPreview = useMemo(() => {
    if (!preview || preview.status !== 'pending') {
      return assignments;
    }

    // Start with existing assignments
    const merged = [...assignments];
    
    // Apply each diff's "after" state
    for (const diff of preview.diffs) {
      if (diff.operation.type === 'assign_shift') {
        const op = diff.operation as any;
        
        // Find the shift template to get timing info
        const shiftId = op.shiftId;
        const [templateId, day] = shiftId.split('-');
        const template = templates.find(t => t.id === templateId);
        let startTime = template?.startTime;
        let endTime = template?.endTime;
        let workTypeId = template?.workTypeId;
        let workType = template?.workType;
        let assignmentDay: DayKey | string | undefined = day;

        if (!template) {
          const existingAssignment = assignments.find((a) => a.id === shiftId);
          if (existingAssignment) {
            assignmentDay = existingAssignment.day;
            startTime = existingAssignment.startTime;
            endTime = existingAssignment.endTime;
            workTypeId = existingAssignment.workType.id;
            workType = existingAssignment.workType;
          } else if (diff.after.assignments?.length) {
            const after = diff.after.assignments[0];
            assignmentDay = after.day;
          }
        }

        if (!startTime || !endTime || !workTypeId || !workType) continue;

        // Find the employee
        const employee = employees.find(e => e.id === op.employeeId);
        if (!employee) continue;
        
        // Create preview assignment with full structure
        const previewAssignment = {
          id: `preview-${op.shiftId}-${op.employeeId}`,
          scheduleId: schedule?.id || '',
          day: assignmentDay || day,
          startTime,
          endTime,
          workTypeId,
          employeeId: op.employeeId,
          sourceTemplateId: templateId || shiftId,
          locked: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          employee: {
            id: employee.id,
            name: employee.name,
            color: employee.color,
          },
          workType,
          isPreview: true, // Mark as preview
        };
        
        merged.push(previewAssignment as any);
      } else if (diff.operation.type === 'unassign_shift') {
        // Remove assignment (mark as preview-removed)
        const op = diff.operation as any;
        const index = merged.findIndex(a => a.id === op.assignmentId);
        if (index >= 0) {
          merged[index] = { ...merged[index], isPreviewRemoved: true } as any;
        }
      }
    }

    return merged;
  }, [assignments, preview, templates, employees, schedule]);

  const layouts = useMemo(
    () => buildLayouts(templatesWithPreview, assignmentsWithPreview, windowStartMin, windowEndMin),
    [assignmentsWithPreview, templatesWithPreview, windowEndMin, windowStartMin],
  );

  const parseTimeToMinutes = useCallback((timeStr: string): number => {
    const [hours, minutes] = timeStr.split(":").map(Number);
    return hours * 60 + minutes;
  }, []);

  const validateAssignment = useCallback((employee: Employee, selection: AssignmentSelection): { isValid: boolean; error?: { title: string; message: string; suggestion: string } } => {
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

    // Check if employee can work the required work type
    const employeeWorkTypeNames = employee.roles.map(r => r.name.toLowerCase().trim());
    const requiredWorkType = selection.workType.name.toLowerCase().trim();

    if (!employeeWorkTypeNames.includes(requiredWorkType)) {
      return {
        isValid: false,
        error: {
          title: "Work Type Mismatch",
          message: `${employee.name} cannot work as "${selection.workType.name}". They can work as: ${employee.roles.map(r => r.name).join(', ')}`,
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
      const shiftStart = parseTimeToMinutes(minutesToTime(selection.startMin));
      const shiftEnd = parseTimeToMinutes(minutesToTime(selection.endMin));
      const availStart = parseTimeToMinutes(dayAvailability.startTime);
      const availEnd = parseTimeToMinutes(dayAvailability.endTime);

      // Check if shift times overlap with availability
      if (shiftStart < availStart || shiftEnd > availEnd) {
        return {
          isValid: false,
          error: {
            title: "Time Conflict",
            message: `${employee.name} is only available from ${dayAvailability.startTime} to ${dayAvailability.endTime}, but the ${selection.workType.name} shift is from ${minutesToTime(selection.startMin)} to ${minutesToTime(selection.endMin)}.`,
            suggestion: "Either choose a different employee, adjust the shift times, or update this employee's availability in the Employees tab."
          }
        };
      }
    }

    return { isValid: true };
  }, [parseTimeToMinutes]);

  const handleAssign = useCallback(async (employee: Employee, selection: AssignmentSelection) => {
    if (!currentStore?.id || loading || operationInProgress) {
      return;
    }

    setOperationInProgress(true);

    // Client-side validation first
    const validation = validateAssignment(employee, selection);
    if (!validation.isValid && validation.error) {
      setAssignmentError(validation.error);
      setOperationInProgress(false);
      return;
    }

    // Clear UI state immediately
    setDrawerError(null);
    setAssignmentError(null);
    setDrawerSelection(null);

    // Create optimistic assignment
    const tempId = `temp-${Date.now()}-${employee.id}-${Math.random()}`;
    const optimisticAssignment: Assignment = {
      id: selection.assignment?.id || tempId,
      day: selection.day,
      workType: selection.workType,
      startTime: minutesToTime(selection.startMin),
      endTime: minutesToTime(selection.endMin),
      locked: false,
      employee: {
        id: employee.id,
        name: employee.name,
        color: employee.color,
        storeName: employee.storeName,
      },
      sourceTemplate: selection.templateId ? {
        id: selection.templateId,
        workTypeId: selection.workType.id
      } : undefined,
    };

    // Apply optimistic update immediately
    setAssignments(prev => {
      if (selection.assignment) {
        // Reassignment - update existing
        return prev.map(a => a.id === selection.assignment!.id ? optimisticAssignment : a);
      } else {
        // New assignment - add to list
        return [...prev, optimisticAssignment];
      }
    });

    // Background API call
    try {
      const payload = {
        storeId: currentStore.id,
        day: selection.day,
        workTypeId: selection.workType.id,
        startTime: minutesToTime(selection.startMin),
        endTime: minutesToTime(selection.endMin),
        employeeId: employee.id,
        sourceTemplateId: selection.templateId || null,
        weekId: schedule?.weekId,
      };

      const response = await fetch('/api/schedule/assignments/fast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));

        // Revert optimistic update
        setAssignments(prev => {
          if (selection.assignment) {
            // Restore original assignment
            return prev.map(a => a.id === selection.assignment!.id ? selection.assignment! : a);
          } else {
            // Remove temporary assignment
            return prev.filter(a => a.id !== tempId);
          }
        });

        // Show error
        setAssignmentError({
          title: "Assignment Failed",
          message: data.details || data.error || `Cannot assign ${employee.name} to this shift.`,
          suggestion: data.suggestion || "Please check the employee's work types and availability."
        });
        return;
      }

      const result = await response.json();

      // Replace temporary assignment with real one
      if (!selection.assignment && result.assignment) {
        setAssignments(prev => prev.map(a =>
          a.id === tempId ? result.assignment : a
        ));
      }

      setOperationInProgress(false);

    } catch (error) {
      console.error('Assignment failed:', error);

      // Revert optimistic update
      setAssignments(prev => {
        if (selection.assignment) {
          return prev.map(a => a.id === selection.assignment!.id ? selection.assignment! : a);
        } else {
          return prev.filter(a => a.id !== tempId);
        }
      });

      setAssignmentError({
        title: "Network Error",
        message: "Failed to save assignment due to connection issues.",
        suggestion: "Please check your internet connection and try again."
      });
    } finally {
      setOperationInProgress(false);
    }
  }, [
    currentStore?.id,
    loading,
    schedule?.weekId,
    validateAssignment,
    operationInProgress,
    setAssignments,
    setAssignmentError,
    setDrawerError,
    setDrawerSelection,
    setOperationInProgress,
  ]);

  const handleUnassign = useCallback(async (assignment: Assignment) => {
    // Prevent double-clicks and concurrent operations
    if (loading || operationInProgress) {
      return;
    }

    setOperationInProgress(true);

    // Clear UI state immediately
    setDrawerError(null);
    setDrawerSelection(null);

    // Store original state for potential revert
    const originalAssignments = assignments;

    // Optimistic update - remove assignment immediately
    setAssignments(prev => prev.filter(a => a.id !== assignment.id));

    try {
      const response = await fetch(`/api/schedule/assignments/unassign?assignmentId=${assignment.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error(`Unassign failed: ${response.status}`);
      }

      // Success - assignment already removed from UI
      setOperationInProgress(false);

    } catch (error) {
      console.error('Unassign failed:', error);

      // Revert optimistic update
      setAssignments(originalAssignments);

      setAssignmentError({
        title: "Unassign Failed",
        message: "Failed to remove the shift assignment.",
        suggestion: "Please check your connection and try again."
      });
    } finally {
      setOperationInProgress(false);
    }
  }, [
    loading,
    assignments,
    operationInProgress,
    setAssignments,
    setDrawerError,
    setDrawerSelection,
    setAssignmentError,
    setOperationInProgress,
  ]);

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

  // Wrapper for applyPreview to add optimistic updates
  const handleApplyPreview = useCallback(async () => {
    if (!preview || !currentStore?.id) {
      return applyPreview();
    }

    const previousAssignments = assignments;
    const previousOptimisticTemplates = optimisticTemplates;

    const cloneAssignment = (assignment: Assignment): Assignment => ({
      ...assignment,
      workType: { ...assignment.workType },
      employee: assignment.employee ? { ...assignment.employee } : undefined,
      sourceTemplate: assignment.sourceTemplate ? { ...assignment.sourceTemplate } : undefined,
    });

    let nextAssignments = assignments.map(cloneAssignment);
    let assignmentsMutated = false;

    const newTemplates: Template[] = [];

    const ensureWorkType = (
      template: Template,
      existing?: Assignment
    ): Assignment['workType'] => {
      if (template.workType) {
        return { ...template.workType };
      }
      if (existing?.workType) {
        return { ...existing.workType };
      }
      return {
        id: template.workTypeId ?? `worktype-${template.id}`,
        name: existing?.workType?.name ?? 'Shift',
        color: existing?.workType?.color ?? '#1f2937',
      };
    };

    const buildEmployeeInfo = (employeeId: string) => {
      const employee = employees.find((candidate) => candidate.id === employeeId);
      if (!employee) {
        return undefined;
      }
      return {
        id: employee.id,
        name: employee.name,
        color: employee.color,
        storeName: employee.storeName,
      };
    };

    for (const diff of preview.diffs) {
      const operation = diff.operation;

      if (operation.type === 'add_shift') {
        const op = operation as any;

        let workType = templates.find((t) => t.workType?.name === op.workTypeName)?.workType;
        if (!workType) {
          workType = {
            id: `temp-worktype-${Date.now()}`,
            name: op.workTypeName,
            color: '#6366f1',
          };
        }

        const optimisticTemplate: Template = {
          id: `optimistic-${Date.now()}-${Math.random()}`,
          storeId: currentStore.id,
          days: {
            MON: op.day === 'MON',
            TUE: op.day === 'TUE',
            WED: op.day === 'WED',
            THU: op.day === 'THU',
            FRI: op.day === 'FRI',
            SAT: op.day === 'SAT',
            SUN: op.day === 'SUN',
          },
          startTime: op.start,
          endTime: op.end,
          workTypeId: workType.id,
          workType,
        };

        newTemplates.push(optimisticTemplate);
        continue;
      }

      if (operation.type === 'assign_shift') {
        const op = operation as any;
        const [templateId, day] = op.shiftId.split('-');
        const template = templates.find((t) => t.id === templateId);
        const employeeInfo = buildEmployeeInfo(op.employeeId);

        if (!template || !employeeInfo || !day) {
          continue;
        }

        const dayKey = day as DayKey;
        const existingIndex = nextAssignments.findIndex(
          (assignment) =>
            assignment.sourceTemplate?.id === template.id && assignment.day === dayKey
        );

        const existingAssignment = existingIndex >= 0 ? nextAssignments[existingIndex] : undefined;
        const workType = ensureWorkType(template, existingAssignment);

        const updatedAssignment: Assignment = {
          id:
            existingAssignment?.id ??
            `optimistic-${template.id}-${op.employeeId}-${Date.now()}`,
          day: dayKey,
          startTime: template.startTime,
          endTime: template.endTime,
          workType,
          locked: existingAssignment?.locked ?? false,
          employee: employeeInfo,
          sourceTemplate: {
            id: template.id,
            workTypeId: template.workTypeId ?? workType.id,
          },
        };

        if (existingIndex >= 0) {
          nextAssignments[existingIndex] = updatedAssignment;
        } else {
          nextAssignments = [...nextAssignments, updatedAssignment];
        }

        assignmentsMutated = true;
        continue;
      }

      if (operation.type === 'unassign_shift') {
        const op = operation as any;
        const index = nextAssignments.findIndex((assignment) => assignment.id === op.assignmentId);
        if (index >= 0) {
          nextAssignments[index] = {
            ...nextAssignments[index],
            employee: undefined,
          };
          assignmentsMutated = true;
        }
        continue;
      }

      if (operation.type === 'swap_shifts') {
        const op = operation as any;
        const index1 = nextAssignments.findIndex((assignment) => assignment.id === op.assignment1Id);
        const index2 = nextAssignments.findIndex((assignment) => assignment.id === op.assignment2Id);

        if (index1 >= 0 || index2 >= 0) {
          const employeeForFirst = buildEmployeeInfo(op.employeeId2 ?? op.employee2Id);
          const employeeForSecond = buildEmployeeInfo(op.employeeId ?? op.employee1Id);

          if (index1 >= 0 && employeeForFirst) {
            nextAssignments[index1] = {
              ...nextAssignments[index1],
              employee: employeeForFirst,
            };
            assignmentsMutated = true;
          }

          if (index2 >= 0 && employeeForSecond) {
            nextAssignments[index2] = {
              ...nextAssignments[index2],
              employee: employeeForSecond,
            };
            assignmentsMutated = true;
          }
        }
      }
    }

    let optimisticTemplatesChanged = false;
    if (newTemplates.length > 0) {
      const mergedTemplates = [...optimisticTemplates, ...newTemplates];
      setOptimisticTemplates(mergedTemplates);
      optimisticTemplatesChanged = true;
    }

    if (assignmentsMutated) {
      setAssignments(nextAssignments);
    }

    try {
      await applyPreview();
    } catch (error) {
      if (assignmentsMutated) {
        setAssignments(previousAssignments);
      }
      if (optimisticTemplatesChanged) {
        setOptimisticTemplates([...previousOptimisticTemplates]);
      }
      throw error;
    }
  }, [
    preview,
    currentStore?.id,
    applyPreview,
    assignments,
    templates,
    employees,
    optimisticTemplates,
    setAssignments,
  ]);

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
        onClose={() => { }} // Schedule errors are typically from data loading, not user actions
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
          <ScheduleChatAssistant
            storeId={currentStore?.id}
            weekId={schedule?.weekId}
            assignments={assignments}
            facts={scheduleFacts}
            factsLoading={scheduleFactsLoading}
            onPreviewCreated={fetchPreviewById}
            preview={preview}
            onApplyPreview={handleApplyPreview}
            onDiscardPreview={discardPreview}
          />
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
