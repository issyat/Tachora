import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { resolveScope } from "../scope";
import type { HoursSummary, ThreadContext } from "../types";
import { fetchScopedEmployees } from "./employees";

interface HoursParams {
  managerId: string;
  context: ThreadContext;
}

const sqlArray = (values: string[]) =>
  Prisma.sql`ARRAY[${Prisma.join(values.map((value) => Prisma.sql`${value}`))}]`;

export async function fetchHoursSummary({
  managerId,
  context,
}: HoursParams): Promise<HoursSummary[]> {
  const scope = await resolveScope(managerId, context);
  const employees = await fetchScopedEmployees(managerId, scope);

  if (employees.length === 0) {
    return [];
  }

  const employeeIds = employees.map((employee) => employee.id);

  const rows = await prisma.$queryRaw<Array<{
    employee_id: string;
    minutes: unknown;
    home_store_id: string;
  }>>(Prisma.sql`
    SELECT employee_id, SUM(minutes) AS minutes, MAX(home_store_id) AS home_store_id
    FROM "v_employee_hours_week"
    WHERE iso_week = ${context.isoWeek}
      AND schedule_store_id = ANY(${sqlArray(scope.allStoreIds)}::text[])
      AND employee_id = ANY(${sqlArray(employeeIds)}::text[])
    GROUP BY employee_id
  `);

  const hoursMap = new Map(
    rows.map((row) => [row.employee_id, Number(row.minutes) || 0]),
  );

  return employees.map((employee) => ({
    employeeId: employee.id,
    employeeName: employee.name,
    homeStoreId: employee.storeId,
    totalMinutes: hoursMap.get(employee.id) ?? 0,
    targetMinutes: employee.weeklyMinutesTarget,
  }));
}
