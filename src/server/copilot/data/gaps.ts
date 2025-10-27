import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { formatTime } from "../utils";
import type { GapResult, ThreadContext } from "../types";

interface GapParams {
  context: ThreadContext;
}

export async function fetchUnassignedGaps({ context }: GapParams): Promise<GapResult[]> {
  // First, get unassigned assignments from the database
  const assignmentRows = await prisma.$queryRaw<
    Array<{
      schedule_store_id: string;
      iso_week: string;
      day: string;
      start_time: Date;
      end_time: Date;
      duration_minutes: unknown;
      assignment_id: string | null;
      work_type_id: string | null;
      work_type_name: string | null;
    }>
  >(Prisma.sql`
    SELECT schedule_store_id,
           iso_week,
           day,
           start_time,
           end_time,
           duration_minutes,
           assignment_id,
           work_type_id,
           work_type_name
    FROM "v_day_assignments"
    WHERE iso_week = ${context.isoWeek}
      AND schedule_store_id = ${context.storeId}
      AND employee_id IS NULL
    ORDER BY day, start_time
  `);

  // Also get shift templates that don't have assignments yet
  const templates = await prisma.shiftTemplate.findMany({
    where: {
      storeId: context.storeId,
    },
    include: {
      workType: {
        select: { name: true },
      },
      assignments: {
        where: {
          schedule: {
            isoWeek: context.isoWeek,
            storeId: context.storeId,
          },
        },
      },
    },
  });

  const gaps: GapResult[] = assignmentRows.map((row) => ({
    assignmentId: row.assignment_id,
    workTypeId: row.work_type_id,
    workTypeName: row.work_type_name,
    day: row.day as GapResult["day"],
    startTime: formatTime(row.start_time) ?? "00:00",
    endTime: formatTime(row.end_time) ?? "00:00",
    minutes: Number(row.duration_minutes) || 0,
  }));

  // Add templates that don't have assignments yet for each day
  const dayMap = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
  
  for (const template of templates) {
    const daysJson = template.days as Record<string, boolean>;
    
    for (const day of dayMap) {
      if (!daysJson[day]) continue;
      
      // Check if there's already an assignment for this template on this day
      const hasAssignmentForDay = template.assignments.some(
        (assignment) => assignment.day === day
      );
      
      if (!hasAssignmentForDay) {
        const startTime = formatTime(template.startTime) ?? "00:00";
        const endTime = formatTime(template.endTime) ?? "00:00";
        const durationMs = template.endTime.getTime() - template.startTime.getTime();
        const durationMinutes = Math.floor(durationMs / 60000);

        gaps.push({
          assignmentId: null,
          workTypeId: template.workTypeId,
          workTypeName: template.workType.name,
          day: day as GapResult["day"],
          startTime,
          endTime,
          minutes: durationMinutes,
        });
      }
    }
  }

  // Sort by day and time
  type DayType = "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";
  const dayOrder: Record<DayType, number> = { MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6, SUN: 7 };
  gaps.sort((a, b) => {
    const dayA = a.day as DayType;
    const dayB = b.day as DayType;
    const dayDiff = dayOrder[dayA] - dayOrder[dayB];
    if (dayDiff !== 0) return dayDiff;
    return a.startTime.localeCompare(b.startTime);
  });

  return gaps;
}
