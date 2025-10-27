/**
 * Metrics Catalog
 * 
 * A declarative registry of all read-only metrics the AI assistant can query.
 * Each metric defines:
 * - SQL query template (uses v_* views only)
 * - Parameters it accepts
 * - How to format the result
 * 
 * Adding a new metric = adding one entry here, no code changes needed.
 */

export interface MetricParam {
  name: string;
  type: "string" | "day" | "time" | "employeeId" | "workType";
  required: boolean;
  description: string;
}

export interface MetricDefinition {
  name: string;
  description: string;
  view: string; // Which v_* view to query
  params: MetricParam[];
  query: string; // SQL template with {{param}} placeholders
  resultType: "list" | "single" | "aggregate";
  formatHint?: string; // How to display results
}

/**
 * All available metrics
 */
export const METRICS_CATALOG: Record<string, MetricDefinition> = {
  // =====================
  // HOURS METRICS
  // =====================
  "hours:employee": {
    name: "hours:employee",
    description: "Get hours worked by a specific employee this week",
    view: "v_employee_hours_week",
    params: [
      { name: "employeeId", type: "employeeId", required: true, description: "Employee to check" },
    ],
    query: `
      SELECT employee_id, employee_name, SUM(minutes) as minutes, MAX(home_store_id) as home_store_id
      FROM "v_employee_hours_week"
      WHERE iso_week = {{isoWeek}}
        AND schedule_store_id = ANY({{allStoreIds}})
        AND employee_id = {{employeeId}}
      GROUP BY employee_id, employee_name
    `,
    resultType: "single",
    formatHint: "Show: name, hours worked, target hours, home store",
  },

  "hours:all": {
    name: "hours:all",
    description: "Get hours for all employees this week",
    view: "v_employee_hours_week",
    params: [],
    query: `
      SELECT employee_id, employee_name, SUM(minutes) as minutes, MAX(home_store_id) as home_store_id
      FROM "v_employee_hours_week"
      WHERE iso_week = {{isoWeek}}
        AND schedule_store_id = ANY({{allStoreIds}})
        AND employee_id = ANY({{scopedEmployeeIds}})
      GROUP BY employee_id, employee_name
    `,
    resultType: "list",
    formatHint: "List each employee with hours worked / target",
  },

  "hours:under-target": {
    name: "hours:under-target",
    description: "Employees who are under their weekly target",
    view: "v_employee_hours_week",
    params: [],
    query: `
      SELECT employee_id, employee_name, SUM(minutes) as total_minutes, 
             MAX(target_minutes) as target_minutes, MAX(home_store_id) as home_store_id
      FROM "v_employee_hours_week"
      WHERE iso_week = {{isoWeek}}
        AND schedule_store_id = ANY({{allStoreIds}})
        AND employee_id = ANY({{scopedEmployeeIds}})
      GROUP BY employee_id, employee_name
      HAVING SUM(minutes) < MAX(target_minutes)
      ORDER BY (MAX(target_minutes) - SUM(minutes)) DESC
    `,
    resultType: "list",
    formatHint: "Show: name, hours worked / target, hours short",
  },

  "hours:over-target": {
    name: "hours:over-target",
    description: "Employees approaching or exceeding their weekly target",
    view: "v_employee_hours_week",
    params: [],
    query: `
      SELECT employee_id, employee_name, SUM(minutes) as total_minutes,
             MAX(target_minutes) as target_minutes, MAX(home_store_id) as home_store_id
      FROM "v_employee_hours_week"
      WHERE iso_week = {{isoWeek}}
        AND schedule_store_id = ANY({{allStoreIds}})
        AND employee_id = ANY({{scopedEmployeeIds}})
      GROUP BY employee_id, employee_name
      HAVING SUM(minutes) >= MAX(target_minutes) * 0.9
      ORDER BY SUM(minutes) DESC
    `,
    resultType: "list",
    formatHint: "Show: name, hours worked / target, status (near/over)",
  },

  "hours:top-workers": {
    name: "hours:top-workers",
    description: "Top 5 employees by hours worked this week",
    view: "v_employee_hours_week",
    params: [],
    query: `
      SELECT employee_id, employee_name, SUM(minutes) as total_minutes,
             MAX(target_minutes) as target_minutes, MAX(home_store_id) as home_store_id
      FROM "v_employee_hours_week"
      WHERE iso_week = {{isoWeek}}
        AND schedule_store_id = ANY({{allStoreIds}})
        AND employee_id = ANY({{scopedEmployeeIds}})
      GROUP BY employee_id, employee_name
      ORDER BY SUM(minutes) DESC
      LIMIT 5
    `,
    resultType: "list",
    formatHint: "Ranked list with hours worked",
  },

  // =====================
  // AVAILABILITY METRICS
  // =====================
  "availability:day": {
    name: "availability:day",
    description: "Who is available on a specific day/time",
    view: "v_availability",
    params: [
      { name: "day", type: "day", required: true, description: "Day of week (MON, TUE, WED, etc.)" },
      { name: "startTime", type: "time", required: false, description: "Start time filter (HH:MM format)" },
      { name: "endTime", type: "time", required: false, description: "End time filter (HH:MM format)" },
      { name: "workType", type: "workType", required: false, description: "Filter by role (e.g., 'Sales Associate')" },
    ],
    query: `
      -- NOTE: This metric uses custom logic (fetchAvailability) not raw SQL
      -- The query below is just for documentation
      SELECT employee_id, employee_name, home_store_id, can_work_across_stores,
             day, is_off, start_time, end_time
      FROM "v_availability"
      WHERE employee_id = ANY({{scopedEmployeeIds}})
        AND day = {{day}}
        AND is_off = false
    `,
    resultType: "list",
    formatHint: "List each person with availability window, scheduled hours that day, weekly total, and roles",
  },

  // =====================
  // COVERAGE METRICS
  // =====================
  "coverage:gaps": {
    name: "coverage:gaps",
    description: "Unassigned shifts (coverage gaps)",
    view: "v_day_assignments",
    params: [
      { name: "day", type: "day", required: false, description: "Filter by specific day" },
      { name: "workType", type: "workType", required: false, description: "Filter by work type (e.g., 'Security')" },
    ],
    query: `
      SELECT schedule_store_id, iso_week, day, start_time, end_time,
             duration_minutes, assignment_id, work_type_id, work_type_name
      FROM "v_day_assignments"
      WHERE iso_week = {{isoWeek}}
        AND schedule_store_id = {{storeId}}
        AND employee_id IS NULL
        {{#if day}}AND day = {{day}}{{/if}}
        {{#if workType}}AND work_type_name ILIKE {{workType}}{{/if}}
      ORDER BY day, start_time
    `,
    resultType: "list",
    formatHint: "Group by day, show time ranges and work types",
  },

  "coverage:day-assignments": {
    name: "coverage:day-assignments",
    description: "All assignments for a specific day",
    view: "v_day_assignments",
    params: [
      { name: "day", type: "day", required: true, description: "Day to check" },
    ],
    query: `
      SELECT day, work_type_name, start_time, end_time, employee_name, duration_minutes
      FROM "v_day_assignments"
      WHERE iso_week = {{isoWeek}}
        AND schedule_store_id = {{storeId}}
        AND day = {{day}}
      ORDER BY start_time
    `,
    resultType: "list",
    formatHint: "Group by shift, show assigned employee or 'unassigned'",
  },

  "coverage:week-assignments": {
    name: "coverage:week-assignments",
    description: "All assignments for the entire week",
    view: "v_day_assignments",
    params: [],
    query: `
      SELECT day, work_type_name, start_time, end_time, employee_name, duration_minutes
      FROM "v_day_assignments"
      WHERE iso_week = {{isoWeek}}
        AND schedule_store_id = {{storeId}}
      ORDER BY CASE day
        WHEN 'MON' THEN 1 WHEN 'TUE' THEN 2 WHEN 'WED' THEN 3
        WHEN 'THU' THEN 4 WHEN 'FRI' THEN 5 WHEN 'SAT' THEN 6 WHEN 'SUN' THEN 7
      END, start_time
    `,
    resultType: "list",
    formatHint: "Group by day, then by shift",
  },

  "coverage:biggest-gap": {
    name: "coverage:biggest-gap",
    description: "Day with the most unassigned time this week",
    view: "v_day_assignments",
    params: [],
    query: `
      SELECT day, 
             SUM(duration_minutes) as total_gap_minutes,
             COUNT(*) as gap_count,
             ARRAY_AGG(work_type_name || ' ' || start_time || '-' || end_time ORDER BY start_time) as unassigned_shifts
      FROM "v_day_assignments"
      WHERE iso_week = {{isoWeek}}
        AND schedule_store_id = {{storeId}}
        AND employee_id IS NULL
      GROUP BY day
      ORDER BY total_gap_minutes DESC
      LIMIT 1
    `,
    resultType: "single",
    formatHint: "Show day name, total unassigned hours, and list of unassigned shifts",
  },

  "compare:weeks": {
    name: "compare:weeks",
    description: "Compare employee hours across two weeks",
    view: "v_employee_hours_week",
    params: [
      { name: "employeeId", type: "employeeId", required: false, description: "Specific employee (optional, otherwise all)" },
      { name: "week1", type: "string", required: true, description: "First ISO week (e.g., '2025-W43')" },
      { name: "week2", type: "string", required: true, description: "Second ISO week (e.g., '2025-W44')" },
    ],
    query: `
      SELECT iso_week, 
             employee_name, 
             employee_id,
             SUM(minutes) as total_minutes,
             MAX(target_minutes) as target_minutes
      FROM "v_employee_hours_week"
      WHERE iso_week IN ({{week1}}, {{week2}})
        AND schedule_store_id = {{storeId}}
        {{#if employeeId}}AND employee_id = {{employeeId}}{{/if}}
      GROUP BY iso_week, employee_name, employee_id
      ORDER BY employee_name, iso_week
    `,
    resultType: "list",
    formatHint: "Group by employee, show side-by-side weeks with difference",
  },
};

/**
 * Whitelisted views for sql.query tool
 */
export const ALLOWED_VIEWS = [
  "v_availability",
  "v_employee_hours_week",
  "v_day_assignments",
];

/**
 * Reserved keywords that must be auto-injected (prevent SQL injection)
 */
export const AUTO_INJECT_PARAMS = [
  "storeId",
  "isoWeek",
  "allStoreIds",
  "scopedEmployeeIds",
];
