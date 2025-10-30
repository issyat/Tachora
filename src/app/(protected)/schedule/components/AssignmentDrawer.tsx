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
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .sort((a, b) => {
        if (a.canAssign === b.canAssign) {
          return a.employee.name.localeCompare(b.employee.name);
        }
        return a.canAssign ? -1 : 1;
      });
  }, [assignment?.id, day, dayIndex, employees, endMin, workType, selection, snapshots, startMin, storeId, templateWorkTypes]);

  return (
    <Modal open={Boolean(selection)} onClose={onClose} title="Shift details" widthClass="max-w-3xl">
      <div className="space-y-6">
        <header className="rounded-3xl border border-[#04ADBF]/30 bg-white/85 p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span
                className="rounded-full px-3 py-1 text-sm font-semibold"
                style={{ backgroundColor: `${workType.color}20`, color: workType.color }}
              >
                {workType.name}
              </span>
              <span className="rounded-full bg-[#E1F2BD]/60 px-3 py-1 text-[11px] font-semibold text-slate-700">
                {day}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm font-semibold text-[#04ADBF]">
              <span className="rounded-full bg-[#04ADBF]/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[#04ADBF]">
                {durationLabel}
              </span>
              <span className="text-slate-500">•</span>
              <span>{timeRangeLabel}</span>
            </div>
          </div>
        </header>

        {assignment?.employee ? (
          <div className="rounded-3xl border border-[#04ADBF]/25 bg-[#04ADBF]/5 p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold"
                  style={{ backgroundColor: `${assignment.employee.color ?? '#04ADBF'}20`, color: assignment.employee.color ?? '#04ADBF' }}
                >
                  {assignment.employee.name
                    .split(" ")
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((part) => part.charAt(0).toUpperCase())
                    .join("")}
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">Assigned to {assignment.employee.name}</p>
                  <p className="text-xs text-slate-500">Drag someone else or unassign below.</p>
                </div>
              </div>
              <button
                type="button"
                className="rounded-full border border-[#FF8057]/50 bg-[#FF8057]/10 px-4 py-2 text-sm font-semibold text-[#FF8057] transition hover:bg-[#FF8057]/20"
                onClick={() => onUnassign(assignment)}
              >
                Unassign
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500 shadow-sm">
            <p className="font-semibold text-slate-600">No one is assigned yet.</p>
            <p className="mt-1 text-xs">Pick a teammate from the list below or drop them directly onto the shift.</p>
          </div>
        )}

        {assignment?.employee ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm">
            Unassign this shift to explore other available teammates.
          </div>
        ) : (
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500">
                  Available employees
                </p>
                <p className="text-sm text-slate-500">
                  {employeeRows.length} matching teammate{employeeRows.length === 1 ? "" : "s"} for {day}.
                </p>
              </div>
            </div>
            <div className="max-h-[340px] space-y-3 overflow-y-auto pr-1">
              {employeeRows.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 p-6 text-center text-sm text-slate-500">
                  No available employees for this shift window.
                </div>
              ) : (
                employeeRows.map(({ employee, availabilityLabel, weeklyMinutes, validationErrors, canAssign }) => (
                  <div
                    key={employee.id}
                    className={`rounded-3xl border p-4 transition ${
                      canAssign
                        ? "border-white bg-white shadow-sm hover:border-[#04ADBF]/40 hover:shadow-md"
                        : "border-[#F2A30F]/40 bg-[#F2A30F]/10"
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div
                          className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold"
                          style={{ backgroundColor: `${employee.color ?? '#04ADBF'}20`, color: employee.color ?? '#04ADBF' }}
                        >
                          {employee.name
                            .split(" ")
                            .filter(Boolean)
                            .slice(0, 2)
                            .map((part) => part.charAt(0).toUpperCase())
                            .join("")}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{employee.name}</p>
                          <p className="text-xs text-[#04ADBF]">{availabilityLabel}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">
                          Weekly {formatMinutesAsHours(weeklyMinutes)}
                        </span>
                      </div>
                    </div>

                    {validationErrors.length > 0 && (
                      <ul className="mt-3 list-disc space-y-1 pl-6 text-xs text-[#F2A30F]">
                        {validationErrors.map((message) => (
                          <li key={message}>{message}</li>
                        ))}
                      </ul>
                    )}

                    <div className="mt-4 flex justify-end">
                      <button
                        type="button"
                        className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                          canAssign
                            ? "bg-gradient-to-r from-[#04ADBF] via-[#F2A30F] to-[#E1F2BD] text-slate-900 hover:scale-[1.01]"
                            : "cursor-not-allowed bg-slate-200 text-slate-500"
                        }`}
                        disabled={!canAssign}
                        onClick={() => {
                          setError(null);
                          onAssign(employee, selection);
                        }}
                      >
                        Assign to shift
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        )}

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
            className="rounded-full border border-slate-200 bg-white px-5 py-2 text-sm font-semibold text-slate-600 transition hover:border-[#04ADBF]/40 hover:text-[#04ADBF]"
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

