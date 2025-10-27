DROP VIEW IF EXISTS "v_employee_hours_week";
DROP VIEW IF EXISTS "v_day_assignments";
DROP VIEW IF EXISTS "v_availability";

CREATE VIEW "v_employee_hours_week" AS
SELECT
  e."id" AS employee_id,
  e."name" AS employee_name,
  sch."storeId" AS schedule_store_id,
  e."storeId" AS home_store_id,
  sch."isoWeek" AS iso_week,
  SUM(EXTRACT(EPOCH FROM (a."endTime" - a."startTime")) / 60)::numeric AS minutes,
  e."weeklyMinutesTarget" AS target_minutes
FROM "Assignment" a
JOIN "Schedule" sch ON sch."id" = a."scheduleId"
JOIN "Employee" e ON e."id" = a."employeeId"
GROUP BY e."id", e."name", sch."storeId", e."storeId", sch."isoWeek", e."weeklyMinutesTarget";

CREATE VIEW "v_day_assignments" AS
SELECT
  sch."storeId" AS schedule_store_id,
  sch."isoWeek" AS iso_week,
  a."day" AS day,
  a."startTime" AS start_time,
  a."endTime" AS end_time,
  (EXTRACT(EPOCH FROM (a."endTime" - a."startTime")) / 60)::numeric AS duration_minutes,
  a."id" AS assignment_id,
  a."employeeId" AS employee_id,
  e."name" AS employee_name,
  a."workTypeId" AS work_type_id,
  wt."name" AS work_type_name
FROM "Assignment" a
JOIN "Schedule" sch ON sch."id" = a."scheduleId"
LEFT JOIN "Employee" e ON e."id" = a."employeeId"
LEFT JOIN "WorkType" wt ON wt."id" = a."workTypeId";

CREATE VIEW "v_availability" AS
SELECT
  e."id" AS employee_id,
  e."name" AS employee_name,
  e."storeId" AS home_store_id,
  e."canWorkAcrossStores" AS can_work_across_stores,
  av."day" AS day,
  av."isOff" AS is_off,
  av."startTime" AS start_time,
  av."endTime" AS end_time
FROM "Availability" av
JOIN "Employee" e ON e."id" = av."employeeId";
