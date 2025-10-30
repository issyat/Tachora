import { useMemo, type CSSProperties } from "react";

import { DAY_ORDER } from "../utils/constants";
import { describeShift, minutesToLeft, minutesToWidth, type DayLayout, type LaidBlock } from "../utils/layout";
import type { DayKey } from "../types";

const LANE_HEIGHT = 64;
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

  const containerClassName = `flex flex-col min-h-0 overflow-hidden rounded-[32px] border border-[#04ADBF]/60 bg-white${className ? ` ${className}` : ""}`;

  return (
    <section className={containerClassName}>
      <header className="sticky top-0 z-10 border-b border-[#04ADBF]/60 bg-slate-50/90 px-6 py-5 backdrop-blur-sm">
        <div className="ml-24 pr-6">
          <div className="relative rounded-2xl border border-[#04ADBF]/60 bg-white/95 shadow-sm">
            <div className="grid" style={{ gridTemplateColumns: `repeat(${hours.length - 1}, minmax(0, 1fr))` }}>
              {hours.slice(0, -1).map((hour) => (
                <div
                  key={hour}
                  className="border-r border-[#04ADBF]/60 py-2 text-center text-[11px] font-semibold text-slate-600 last:border-r-0"
                >
                  {String(hour).padStart(2, "0")}:00
                </div>
              ))}
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="divide-y divide-slate-200">
          {days.map((day) => {
            const { lanes, laneCount } = layouts[day];
            const minHeight = laneCount > 0 ? laneCount * LANE_STRIDE : LANE_STRIDE;
            const blocks = lanes.slice().sort((a, b) => (a.lane === b.lane ? a.startMin - b.startMin : a.lane - b.lane));
            const isFocused = selectedDay !== "ALL" && day === selectedDay;
            return (
              <div
                key={day}
                className={`relative bg-white transition-colors ${isFocused ? "bg-[#E1F2BD]/35" : ""}`}
                style={{ minHeight, paddingTop: LANE_GAP / 2, paddingBottom: LANE_GAP / 2 }}
              >
                <div className="absolute left-0 top-4 flex h-full w-20 items-start justify-center">
                  <span
                    className={`rounded-full border px-4 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                      isFocused ? "border-[#04ADBF] text-[#04ADBF] bg-white" : "border-slate-200 text-slate-600 bg-white"
                    }`}
                  >
                    {day}
                  </span>
                </div>
                <div className="ml-24 pr-6">
                  <div className="relative rounded-xl bg-white/80 p-2" style={{ height: minHeight }}>
                    {blocks.map((block, blockIndex) => (
                      <TimelineBlock
                        key={`${day}-${block.workType?.name || block.role}-${block.startMin}-${block.endMin}-${block.lane}-${block.assignment?.id ?? block.templateId ?? "template"}-${blockIndex}`}
                        day={day}
                        block={block}
                        windowStartMin={windowStartMin}
                        windowEndMin={windowEndMin}
                        onSelectBlock={onSelectBlock}
                        onDropEmployee={onDropEmployee}
                      />
                    ))}
                    <div className="pointer-events-none absolute inset-0 rounded-xl border border-white/70" />
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
  const top = block.lane * LANE_STRIDE + LANE_GAP / 2;
  const hasAssignment = Boolean(block.assignment);
  const employee = block.assignment?.employee;
  const employeeColor = employee?.color ?? "#04ADBF";
  const employeeInitials = employee?.name
    ? employee.name
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part.charAt(0).toUpperCase())
        .join("")
    : "";
  
  // Check if this is a preview assignment or preview template
  const isPreview = (block.assignment && 'isPreview' in block.assignment && block.assignment.isPreview) || ('isPreview' in block && block.isPreview);
  const isPreviewRemoved = Boolean(block.assignment && 'isPreviewRemoved' in block.assignment && block.assignment.isPreviewRemoved);

  // Different styles for preview vs regular vs removed
  let blockClassName; let blockStyle: CSSProperties = {};
  const workColor = block.workType?.color || "#04ADBF";
  if (isPreviewRemoved) {
    blockClassName = "border-red-300 bg-red-50/60 hover:border-red-400 opacity-60";
  } else if (isPreview) {
    blockClassName = "border-[#04ADBF] bg-[#E1F2BD]/60 hover-border-[#04ADBF]/70";
  } else if (hasAssignment) {
    blockClassName = "border-[#04ADBF]/30 bg-white hover-border-[#04ADBF]";
  } else {
    blockClassName = "border border-dashed hover-border-[#04ADBF]";
    blockStyle = {
      backgroundColor: `${workColor}1A`,
      borderColor: `${workColor}70`,
    };
  }

  return (
    <div
      role="button"
      tabIndex={0}
      className={`absolute cursor-pointer rounded-lg border px-4 py-3 text-xs shadow-sm transition ${blockClassName}`}
      style={{ left: `${left}%`, width: `${width}%`, top, height: LANE_HEIGHT, zIndex: 10 - block.lane, ...blockStyle }}
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
      {employee ? (
        <div className="grid h-full grid-cols-2 grid-rows-[auto_auto] gap-x-3 gap-y-1 text-[11px] font-medium text-slate-600">
          <div className="flex items-center">
            <span
              className="rounded-full px-3 py-1 text-[11px] font-semibold"
              style={{ backgroundColor: `${workColor}20`, color: workColor }}
            >
              {block.workType?.name || block.role}
            </span>
          </div>
          <div className="flex items-center justify-end">
            <div
              className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold shadow-sm"
              style={{ backgroundColor: `${employeeColor}20`, color: employeeColor }}
              aria-hidden
            >
              {employeeInitials || employee.name.charAt(0).toUpperCase()}
            </div>
          </div>
          <div className="flex items-center text-[11px] font-semibold text-[#04ADBF]">
            {describeShift(block.startMin, block.endMin)}
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-700">{block.workType?.name || block.role}</span>
            <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
              {describeShift(block.startMin, block.endMin)}
            </span>
          </div>
        <div className="mt-1 text-xs text-blue-600">
          Drop an employee
          {isPreview && <span className="ml-1 text-green-600 font-semibold">(Preview)</span>}
        </div>
        </>
      )}
    </div>
  );
}
