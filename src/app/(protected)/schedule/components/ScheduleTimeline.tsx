import { useMemo } from "react";

import { DAY_ORDER } from "../utils/constants";
import { describeShift, minutesToLeft, minutesToWidth, type DayLayout, type LaidBlock } from "../utils/layout";
import type { DayKey } from "../types";

const LANE_HEIGHT = 56;
const LANE_GAP = 12;
const LANE_STRIDE = LANE_HEIGHT + LANE_GAP;

interface ScheduleTimelineProps {
  layouts: Record<DayKey, DayLayout>;
  windowStartMin: number;
  windowEndMin: number;
  hours: number[];
  selectedDay: DayKey | "ALL";
  onSelectBlock: (payload: { day: DayKey; block: LaidBlock }) => void;
  onDropEmployee: (payload: { day: DayKey; block: LaidBlock; employeeId: string }) => void;
  className?: string;
}

export function ScheduleTimeline({
  layouts,
  windowStartMin,
  windowEndMin,
  hours,
  selectedDay,
  onSelectBlock,
  onDropEmployee,
  className,
}: ScheduleTimelineProps) {
  const days = useMemo(() => (
    selectedDay === "ALL" ? DAY_ORDER : DAY_ORDER.filter((day) => day === selectedDay)
  ), [selectedDay]);

  const containerClassName = `flex flex-col min-h-0 rounded-lg border bg-white${className ? ` ${className}` : ""}`;

  return (
    <section className={containerClassName}>
      <header className="sticky top-0 z-10 border-b bg-slate-50">
        <div className="relative ml-20">
          <div className="grid" style={{ gridTemplateColumns: `repeat(${hours.length - 1}, minmax(0, 1fr))` }}>
            {hours.slice(0, -1).map((hour) => (
              <div
                key={hour}
                className="border-r border-slate-200 py-2 text-center text-xs text-slate-600"
              >
                {String(hour).padStart(2, "0")}:00
              </div>
            ))}
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="divide-y">
          {days.map((day) => {
            const { lanes, laneCount } = layouts[day];
            const minHeight = laneCount > 0 ? laneCount * LANE_STRIDE : LANE_STRIDE;
            const blocks = lanes.slice().sort((a, b) => (a.lane === b.lane ? a.startMin - b.startMin : a.lane - b.lane));
            return (
              <div key={day} className="relative border-slate-200" style={{ minHeight, paddingBottom: LANE_GAP }}>
                <div className="absolute left-0 top-0 flex h-full w-16 items-start justify-start p-3 text-xs font-semibold text-slate-600">
                  <span>{day}</span>
                </div>
                <div className="ml-16">
                  <div className="relative" style={{ height: minHeight }}>
                    {blocks.map((block, blockIndex) => (
                      <TimelineBlock
                        key={`${day}-${block.workType?.name || block.role}-${block.startMin}-${block.endMin}-${block.lane}-${block.assignment?.id ?? block.templateId ?? 'template'}-${blockIndex}`}
                        day={day}
                        block={block}
                        windowStartMin={windowStartMin}
                        windowEndMin={windowEndMin}
                        onSelectBlock={onSelectBlock}
                        onDropEmployee={onDropEmployee}
                      />
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

interface TimelineBlockProps {
  day: DayKey;
  block: LaidBlock;
  windowStartMin: number;
  windowEndMin: number;
  onSelectBlock: (payload: { day: DayKey; block: LaidBlock }) => void;
  onDropEmployee: (payload: { day: DayKey; block: LaidBlock; employeeId: string }) => void;
}

function TimelineBlock({ day, block, windowStartMin, windowEndMin, onSelectBlock, onDropEmployee }: TimelineBlockProps) {
  const left = minutesToLeft(block.startMin, windowStartMin, windowEndMin);
  const width = minutesToWidth(block.startMin, block.endMin, windowStartMin, windowEndMin);
  const top = block.lane * LANE_STRIDE;
  const hasAssignment = Boolean(block.assignment);
  const employee = block.assignment?.employee;

  return (
    <div
      role="button"
      tabIndex={0}
      className={`absolute cursor-pointer rounded-md border px-3 py-2 text-xs shadow-sm transition ${hasAssignment ? 'border-slate-300 bg-slate-50 hover:border-slate-400' : 'border-dashed border-blue-300 bg-blue-50/70 hover:border-blue-400'
        }`}
      style={{ left: `${left}%`, width: `${width}%`, top, height: LANE_HEIGHT, zIndex: 10 - block.lane }}
      onClick={() => onSelectBlock({ day, block })}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
      }}
      onDrop={(event) => {
        event.preventDefault();
        try {
          const payload = JSON.parse(event.dataTransfer.getData('application/json'));
          if (!payload?.employeeId) return;
          onDropEmployee({ day, block, employeeId: payload.employeeId });
        } catch (error) {
          console.error('Failed to parse drop payload', error);
        }
      }}
    >
      <div className="flex items-center justify-between">
        <span className="font-semibold text-slate-700">{block.workType?.name || block.role}</span>
        <span className="font-medium text-slate-500">{describeShift(block.startMin, block.endMin)}</span>
      </div>
      {employee ? (
        <div className="mt-1 flex items-center gap-2 text-slate-600">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: employee.color }}
            aria-hidden
          />
          <span className="text-xs font-medium">{employee.name}</span>
        </div>
      ) : (
        <div className="mt-1 text-xs text-blue-600">Drop an employee</div>
      )}
    </div>
  );
}
