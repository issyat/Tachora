import { useMemo } from "react";

import { formatMinutesAsHours } from "../utils/time";
import { DAY_TO_INDEX } from "../utils/constants";
import { readableTextColor } from "@/lib/color";
import type { Assignment, DayKey, Employee } from "../types";

interface AvailabilitySidebarProps {
  day: DayKey;
  storeId?: string;
  employees: Employee[];
  assignments: Assignment[];
  employeeWeeklyMinutes: Record<string, number>;
  crossStoreMinutes: Record<string, number>;
  onSelectEmployee: (employee: Employee) => void;
}

export function AvailabilitySidebar({
  day,
  storeId,
  employees,
  assignments,
  employeeWeeklyMinutes,
  crossStoreMinutes,
  onSelectEmployee,
}: AvailabilitySidebarProps) {
  const items = useMemo(() => {
    const index = DAY_TO_INDEX[day];
    return employees
      .map((employee) => {
        const availability = employee.availability?.[index];
        if (!availability || availability.isOff) {
          return null;
        }
        const isCrossStore = Boolean(storeId && employee.storeId !== storeId);
        const weeklyMinutes = crossStoreMinutes[employee.id] ?? employeeWeeklyMinutes[employee.id] ?? 0;
        const weeklyTarget = employee.weeklyMinutesTarget ?? 40 * 60;
        const assignmentCount = assignments.filter((assignment) => assignment.employee?.id === employee.id && assignment.day === day).length;
        return {
          employee,
          availabilityLabel: `${availability.startTime} - ${availability.endTime}`,
          weeklyMinutes,
          weeklyTarget,
          assignmentCount,
          isCrossStore,
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .sort((a, b) => a.employee.name.localeCompare(b.employee.name));
  }, [assignments, crossStoreMinutes, day, employeeWeeklyMinutes, employees, storeId]);

  return (
    <aside className="flex h-full min-h-0 flex-col rounded-3xl border border-[#04ADBF]/60 bg-white/85 p-6 shadow-sm">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-[#04ADBF]">Available today</p>
          <p className="text-sm text-slate-500">Drag a teammate straight onto the timeline</p>
        </div>
        <span className="rounded-full bg-[#04ADBF]/10 px-3 py-1 text-xs font-semibold text-[#04ADBF]">
          {items.length}
        </span>
      </header>

      <div className="mt-4 flex-1 space-y-3 overflow-y-auto pr-2 min-h-0">
        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#E1F2BD]/80 bg-white/80 p-6 text-center text-sm text-slate-500">
            No employees available on this day.
          </div>
        ) : (
          items.map(({ employee, availabilityLabel, weeklyMinutes, weeklyTarget, assignmentCount, isCrossStore }) => {
            const overTarget = weeklyMinutes > weeklyTarget;
            const nearTarget = weeklyMinutes >= weeklyTarget * 0.9 && !overTarget;
            const loadPercent = Math.min(100, (weeklyMinutes / weeklyTarget) * 100);
            const workedHoursLabel = formatMinutesAsHours(weeklyMinutes);
            const targetHoursLabel = formatMinutesAsHours(weeklyTarget);
            const remainingMinutes = Math.max(weeklyTarget - weeklyMinutes, 0);
            const remainingLabel = formatMinutesAsHours(remainingMinutes);
            const initials = employee.name
              .split(" ")
              .slice(0, 2)
              .map((part) => part.charAt(0).toUpperCase())
              .join("");

            return (
              <button
                key={employee.id}
                type="button"
                className="group relative w-full text-left"
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData('application/json', JSON.stringify({ employeeId: employee.id }));
                  event.dataTransfer.effectAllowed = 'copy';
                }}
                onClick={() => onSelectEmployee(employee)}
              >
                <div className="relative rounded-2xl border border-transparent bg-white/95 p-4 shadow-sm transition duration-200 group-hover:border-[#04ADBF]">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold"
                        style={{ backgroundColor: `${employee.color}20`, color: employee.color }}
                      >
                        {initials || employee.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{employee.name}</p>
                        <p className="text-xs font-medium text-[#04ADBF]">{availabilityLabel}</p>
                      </div>
                    </div>
                    {assignmentCount > 0 && (
                      <span className="rounded-full bg-[#04ADBF]/10 px-2 py-1 text-[11px] font-semibold text-[#04ADBF]">
                        {assignmentCount} shift{assignmentCount > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>

                  <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500">
                    <div className="flex flex-wrap gap-2">
                      {employee.roles && employee.roles.length > 0 ? (
                        employee.roles.slice(0, 3).map((role) => {
                          const background = `${role.color}20`;
                          return (
                            <span
                              key={role.id}
                              className="rounded-full px-3 py-1 text-[11px] font-semibold"
                              style={{ backgroundColor: background, color: role.color }}
                            >
                              {role.name}
                            </span>
                          );
                        })
                      ) : (
                        <span className="italic text-slate-400">No work types</span>
                      )}
                      {employee.roles && employee.roles.length > 3 && (
                        <span className="text-slate-400">+{employee.roles.length - 3}</span>
                      )}
                    </div>
                    {isCrossStore && employee.storeName && (
                      <span className="rounded-full bg-[#04ADBF]/10 px-2 py-0.5 text-[10px] font-semibold text-[#04ADBF]">
                        {employee.storeName}
                      </span>
                    )}
                  </div>

                  <div className="mt-4 rounded-xl bg-slate-100/70 p-3">

                    <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[10px] text-slate-500">
                      <div className="flex flex-col items-center justify-center rounded-lg bg-white px-3 py-2">
                        <p className="text-xs font-semibold text-slate-700 leading-tight">{workedHoursLabel}</p>
                        <p className="leading-tight">Worked</p>
                      </div>
                      <div className="flex flex-col items-center justify-center rounded-lg bg-white px-3 py-2">
                        <p className="text-xs font-semibold text-slate-700 leading-tight">{targetHoursLabel}</p>
                        <p className="leading-tight">Target</p>
                      </div>
                      <div className="flex flex-col items-center justify-center rounded-lg bg-white px-3 py-2">
                        <p className={`text-xs font-semibold leading-tight ${overTarget ? 'text-[#FF8057]' : 'text-[#04ADBF]'}`}>
                          {overTarget ? `+${formatMinutesAsHours(weeklyMinutes - weeklyTarget)}` : remainingLabel}
                        </p>
                        <p className="leading-tight">{overTarget ? 'Over' : 'Remaining'}</p>
                      </div>
                    </div>

                    <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-200/70">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          overTarget ? 'bg-gradient-to-r from-[#FF8057] via-[#F2A30F] to-[#F2A30F]' : nearTarget ? 'bg-gradient-to-r from-[#F2A30F] to-[#E5EF5B]' : 'bg-gradient-to-r from-[#04ADBF] to-[#04ADBF]'
                        }`}
                        style={{ width: `${loadPercent}%` }}
                      />
                    </div>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}
