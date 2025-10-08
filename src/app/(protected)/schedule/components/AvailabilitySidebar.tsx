import { memo, useMemo } from "react";

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

export const AvailabilitySidebar = memo(function AvailabilitySidebar({
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

  if (items.length === 0) {
    return (
      <aside className="rounded-lg border bg-white p-4 text-sm text-slate-500">
        No employees available on this day.
      </aside>
    );
  }

  return (
    <aside className="space-y-2 rounded-lg border bg-white p-4">
      <header className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500">
        <span>Worker Availabilities</span>
        <span>{items.length}</span>
      </header>
      <div className="space-y-2">
        {items.map(({ employee, availabilityLabel, weeklyMinutes, weeklyTarget, assignmentCount, isCrossStore }) => {
          const overTarget = weeklyMinutes > weeklyTarget;
          const nearTarget = weeklyMinutes >= weeklyTarget * 0.9 && !overTarget;
          const weeklyLabel = `${formatMinutesAsHours(weeklyMinutes)} / ${formatMinutesAsHours(weeklyTarget)}`;
          return (
            <button
              key={employee.id}
              type="button"
              className={`w-full rounded-lg border p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow ${
                isCrossStore ? 'border-blue-200 bg-blue-50' : 'border-slate-200 bg-white'
              }`}
              draggable
              onDragStart={(event) => {
                event.dataTransfer.setData('application/json', JSON.stringify({ employeeId: employee.id }));
                event.dataTransfer.effectAllowed = 'copy';
              }}
              onClick={() => onSelectEmployee(employee)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: employee.color }}
                    aria-hidden
                  />
                  <span className="font-medium text-slate-900">{employee.name}</span>
                </div>
                {assignmentCount > 0 && (
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                    {assignmentCount} shift{assignmentCount > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
                <div className="flex flex-wrap gap-1">
                  {employee.roles && employee.roles.length > 0 ? (
                    employee.roles.slice(0, 3).map((role) => {
                      const textColor = readableTextColor(role.color);
                      return (
                        <span
                          key={role.id}
                          className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                          style={{ 
                            backgroundColor: role.color, 
                            color: textColor
                          }}
                        >
                          {role.name}
                        </span>
                      );
                    })
                  ) : (
                    <span className="text-slate-400 italic">No work types</span>
                  )}
                  {employee.roles && employee.roles.length > 3 && (
                    <span className="text-slate-400">+{employee.roles.length - 3}</span>
                  )}
                </div>
                {isCrossStore && employee.storeName && (
                  <span className="text-blue-600">{employee.storeName}</span>
                )}
              </div>
              <div className="mt-2 flex items-center justify-between text-xs">
                <span className="text-slate-600">{availabilityLabel}</span>
                <span className={overTarget ? 'text-red-600' : nearTarget ? 'text-amber-600' : 'text-green-600'}>
                  {weeklyLabel}
                </span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                  className={`h-full transition-all duration-300 ${
                    overTarget ? 'bg-red-500' : nearTarget ? 'bg-amber-500' : 'bg-green-500'
                  }`}
                  style={{ width: `${Math.min(100, (weeklyMinutes / weeklyTarget) * 100)}%` }}
                />
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
});
