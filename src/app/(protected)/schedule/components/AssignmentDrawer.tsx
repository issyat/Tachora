import { memo, useMemo } from "react";

import { Modal } from "@/components/ui/modal";
import { ErrorModal } from "@/components/ui/error-modal";

import { formatMinutesAsHours, minutesToTime } from "../utils/time";
import { DAY_TO_INDEX } from "../utils/constants";
import { collectLocalValidationErrors, type EmployeeAssignmentSegment } from "../utils/validation";
import type { Assignment, DayKey, Employee } from "../types";

export interface EmployeeSnapshot {
  weeklyMinutes: number;
  dailyMinutes: Map<DayKey, number>;
  segments: EmployeeAssignmentSegment[];
}

export interface AssignmentSelection {
  day: DayKey;
  workType: {
    id: string;
    name: string;
    color: string;
  };
  startMin: number;
  endMin: number;
  templateId?: string | null;
  assignment?: Assignment | null;
}

interface AssignmentDrawerProps {
  selection: AssignmentSelection | null;
  storeId?: string;
  employees: Employee[];
  snapshots: Map<string, EmployeeSnapshot>;
  templateWorkTypes: Map<string, string | null>;
  onAssign: (employee: Employee, selection: AssignmentSelection) => void;
  onUnassign: (assignment: Assignment) => void;
  onClose: () => void;
  error: { title: string; message: string; suggestion?: string } | null;
  setError: (value: { title: string; message: string; suggestion?: string } | null) => void;
}

export const AssignmentDrawer = memo(function AssignmentDrawer({
  selection,
  storeId,
  employees,
  snapshots,
  templateWorkTypes,
  onAssign,
  onUnassign,
  onClose,
  error,
  setError,
}: AssignmentDrawerProps) {
  if (!selection) {
    return null;
  }

  const { day, workType, startMin, endMin, assignment } = selection;
  const dayIndex = DAY_TO_INDEX[day];
  const timeRangeLabel = `${minutesToTime(startMin)} - ${minutesToTime(endMin)}`;
  const durationLabel = formatMinutesAsHours(endMin - startMin);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const employeeRows = useMemo(() => {
    const templateWorkTypeId = resolveTemplateWorkType(selection, templateWorkTypes);

    return employees
      .map((employee) => {
        const availability = employee.availability?.[dayIndex];
        if (!availability || availability.isOff) {
          return null;
        }

        const snapshot = snapshots.get(employee.id) ?? {
          weeklyMinutes: 0,
          dailyMinutes: new Map<DayKey, number>(),
          segments: [],
        };

        const dailyMinutes = snapshot.dailyMinutes.get(day) ?? 0;
        const validationErrors = collectLocalValidationErrors({
          employee,
          day,
          workTypeId: workType.id,
          workTypeName: workType.name,
          startMin,
          endMin,
          templateWorkTypeId,
          existingAssignmentId: assignment?.id ?? null,
          weeklyMinutes: snapshot.weeklyMinutes,
          dailyMinutes,
          segments: snapshot.segments,
          currentStoreId: storeId,
        });

        return {
          employee,
          availabilityLabel: `${availability.startTime} - ${availability.endTime}`,
          weeklyMinutes: snapshot.weeklyMinutes,
          validationErrors,
          canAssign: validationErrors.length === 0,
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
  }, [assignment?.id, day, dayIndex, employees, endMin, workType, selection, snapshots, startMin, storeId, templateWorkTypes]);

  return (
    <Modal open={Boolean(selection)} onClose={onClose} title="Shift details" widthClass="max-w-xl">
      <div className="space-y-4">
        <header className="space-y-1">
          <h2 className="text-base font-semibold text-slate-900">{workType.name}</h2>
          <p className="text-sm text-slate-500">{day} - {timeRangeLabel} ({durationLabel})</p>
        </header>

        {assignment?.employee ? (
          <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3">
            <div className="text-sm font-medium text-slate-700">Assigned to {assignment.employee.name}</div>
            <button
              type="button"
              className="rounded bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700"
              onClick={() => onUnassign(assignment)}
            >
              Unassign
            </button>
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-slate-300 p-3 text-sm text-slate-500">
            No employee assigned yet.
          </div>
        )}

        <section className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Available employees ({employeeRows.length})
          </div>
          <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {employeeRows.map(({ employee, availabilityLabel, weeklyMinutes, validationErrors, canAssign }) => (
              <div
                key={employee.id}
                className={`rounded border p-3 ${canAssign ? 'border-slate-200 bg-white' : 'border-amber-200 bg-amber-50'}`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-slate-900">{employee.name}</div>

                  </div>
                  <span className="text-xs text-slate-500">{availabilityLabel}</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs">
                  <span className="text-slate-500">Weekly</span>
                  <span className="font-medium text-slate-600">{formatMinutesAsHours(weeklyMinutes)}</span>
                </div>
                {validationErrors.length > 0 && (
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-amber-700">
                    {validationErrors.map((message) => (
                      <li key={message}>{message}</li>
                    ))}
                  </ul>
                )}
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    className={`rounded px-3 py-1 text-xs font-medium ${
                      canAssign ? 'bg-slate-900 text-white hover:bg-slate-700' : 'cursor-not-allowed bg-slate-200 text-slate-500'
                    }`}
                    disabled={!canAssign}
                    onClick={() => {
                      setError(null);
                      onAssign(employee, selection);
                    }}
                  >
                    Assign
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <ErrorModal
          open={!!error}
          onClose={() => setError(null)}
          title={error?.title || "Assignment Error"}
          message={error?.message || "An error occurred"}
          suggestion={error?.suggestion}
        />

        <div className="flex justify-end">
          <button
            type="button"
            className="rounded border px-3 py-1 text-sm hover:bg-slate-50"
            onClick={() => onClose()}
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
});

function resolveTemplateWorkType(selection: AssignmentSelection, index: Map<string, string | null>) {
  if (selection.templateId) {
    return index.get(selection.templateId) ?? null;
  }
  const templateId = selection.assignment?.sourceTemplate?.id;
  if (templateId) {
    return index.get(templateId) ?? null;
  }
  return null;
}

