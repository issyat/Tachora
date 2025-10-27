import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { formatTime, timeToDayMinutes } from "../utils";
import type { AvailabilityQuery, AvailabilityResult, ThreadContext } from "../types";
import { resolveScope } from "../scope";
import { fetchScopedEmployees } from "./employees";

interface AvailabilityParams {
  managerId: string;
  context: ThreadContext;
  query: AvailabilityQuery;
}

const sqlArray = (values: string[]) =>
  Prisma.sql`ARRAY[${Prisma.join(values.map((value) => Prisma.sql`${value}`))}]`;

export async function fetchAvailability({
  managerId,
  context,
  query,
}: AvailabilityParams): Promise<AvailabilityResult[]> {
  console.log("🔍 [AVAILABILITY] Starting fetchAvailability");
  console.log("   managerId:", managerId);
  console.log("   context:", { storeId: context.storeId, isoWeek: context.isoWeek });
  console.log("   query:", query);
  console.log("   🎯 workType:", query.workType);
  console.log("   🎯 workType type:", typeof query.workType);
  console.log("   🎯 workType truthy?:", !!query.workType);
  
  if (!query.day) {
    throw new Error("Availability query requires a day.");
  }
  
  const scope = await resolveScope(managerId, context);
  console.log("   scope:", { primaryStoreId: scope.primaryStoreId, allStoreIds: scope.allStoreIds });
  
  const employees = await fetchScopedEmployees(managerId, scope);
  console.log(`   ✅ Found ${employees.length} scoped employees`);

  if (employees.length === 0) {
    console.log("   ❌ NO SCOPED EMPLOYEES - returning empty");
    return [];
  }

  const employeeIds = employees.map((employee) => employee.id);
  console.log(`   📋 Querying availability for ${employeeIds.length} employee IDs`);

  const availabilityRows = await prisma.$queryRaw<
    Array<{
      employee_id: string;
      day: string;
      is_off: boolean;
      start_time: Date | null;
      end_time: Date | null;
    }>
  >(Prisma.sql`
    SELECT employee_id, day, is_off, start_time, end_time
    FROM "v_availability"
    WHERE employee_id = ANY(${sqlArray(employeeIds)}::text[])
      AND day = ${query.day}::"Weekday"
  `);
  
  console.log(`   📊 availabilityRows: ${availabilityRows.length} rows`);
  if (availabilityRows.length === 0) {
    console.log("   ⚠️ NO AVAILABILITY DATA in v_availability for these employees on", query.day);
  }  const weeklyRows = await prisma.$queryRaw<
    Array<{ employee_id: string; minutes: unknown }>
  >(Prisma.sql`
    SELECT employee_id, minutes
    FROM "v_employee_hours_week"
    WHERE iso_week = ${context.isoWeek}
      AND schedule_store_id = ANY(${sqlArray(scope.allStoreIds)}::text[])
      AND employee_id = ANY(${sqlArray(employeeIds)}::text[])
  `);

  const dayAssignmentRows = await prisma.$queryRaw<
    Array<{
      employee_id: string;
      start_time: Date;
      end_time: Date;
      duration_minutes: unknown;
    }>
  >(Prisma.sql`
    SELECT employee_id, start_time, end_time, duration_minutes
    FROM "v_day_assignments"
    WHERE iso_week = ${context.isoWeek}
      AND day = ${query.day}::"Weekday"
      AND employee_id IS NOT NULL
      AND schedule_store_id = ANY(${sqlArray(scope.allStoreIds)}::text[])
      AND employee_id = ANY(${sqlArray(employeeIds)}::text[])
  `);

  const availabilityMap = new Map(
    availabilityRows.map((row) => [row.employee_id, row]),
  );
  const weeklyMinutesMap = new Map(
    weeklyRows.map((row) => [row.employee_id, Number(row.minutes) || 0]),
  );
  const dayMinutesMap = new Map<string, { total: number; windows: Array<{ start: number; end: number }> }>();

  for (const row of dayAssignmentRows) {
    const start = timeToDayMinutes(formatTime(row.start_time) ?? "00:00");
    const end = timeToDayMinutes(formatTime(row.end_time) ?? "24:00");
    const duration = Number(row.duration_minutes) || Math.max(end - start, 0);
    const entry = dayMinutesMap.get(row.employee_id) ?? { total: 0, windows: [] };
    entry.total += duration;
    entry.windows.push({ start, end });
    dayMinutesMap.set(row.employee_id, entry);
  }

  const results = employees
    .map<AvailabilityResult | null>((employee) => {
      const availability = availabilityMap.get(employee.id);
      if (!availability || availability.is_off) {
        return null;
      }

      const availabilityStart = availability.start_time
        ? timeToDayMinutes(formatTime(availability.start_time) ?? "00:00")
        : 0;
      const availabilityEnd = availability.end_time
        ? timeToDayMinutes(formatTime(availability.end_time) ?? "24:00")
        : 24 * 60;

      const requestedStart = query.startTime ? timeToDayMinutes(query.startTime) : availabilityStart;
      const requestedEnd = query.endTime ? timeToDayMinutes(query.endTime) : availabilityEnd;

      // Overlap logic: employee must have SOME availability during requested time
      // There is overlap if: requestedStart < availabilityEnd AND requestedEnd > availabilityStart
      const hasOverlap = requestedStart < availabilityEnd && requestedEnd > availabilityStart;
      
      if (!hasOverlap) {
        return null; // No overlap at all
      }

      const dayEntry = dayMinutesMap.get(employee.id);
      const dayMinutes = dayEntry?.total ?? 0;
      const weeklyMinutes = weeklyMinutesMap.get(employee.id) ?? 0;
      const windows = dayEntry?.windows ?? [];

      const conflictsWithWindow = windows.some((window) => {
        return requestedStart < window.end && requestedEnd > window.start;
      });

      return {
        employeeId: employee.id,
        employeeName: employee.name,
        homeStoreId: employee.storeId,
        canBorrow: employee.canWorkAcrossStores && employee.storeId !== scope.primaryStoreId,
        availability: {
          day: query.day,
          startTime: formatTime(availability.start_time),
          endTime: formatTime(availability.end_time),
          fullDay: !availability.start_time && !availability.end_time,
        },
        scheduledMinutes: dayMinutes,
        totalWeekMinutes: weeklyMinutes,
        targetMinutes: employee.weeklyMinutesTarget,
        roles: employee.roles,
        conflictsWithWindow,
      };
    })
    .filter((result): result is AvailabilityResult => result !== null);

  // Filter by work type if specified
  if (query.workType) {
    console.log(`   🎯 [AVAILABILITY] Filtering by workType: "${query.workType}"`);
    console.log(`   🎯 [AVAILABILITY] Before filter: ${results.length} results`);
    results.forEach((r, i) => {
      console.log(`      [${i}] ${r.employeeName}: roles = [${r.roles.join(', ')}]`);
    });
    
    const filtered = results.filter((result) => 
      result.roles.some((role) => 
        role.toLowerCase().includes(query.workType!.toLowerCase()) ||
        query.workType!.toLowerCase().includes(role.toLowerCase())
      )
    );
    console.log(`   🎯 [AVAILABILITY] After filter: ${filtered.length} results`);
    filtered.forEach((r, i) => {
      console.log(`      [${i}] ${r.employeeName}: roles = [${r.roles.join(', ')}]`);
    });
    return filtered;
  }

  console.log(`   ✅ [AVAILABILITY] Returning ${results.length} final results`);
  return results;
}


