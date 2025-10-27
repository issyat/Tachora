/**
 * Formatters for tool results
 * 
 * Converts raw tool output into user-friendly text responses
 */

import type { MetricResult } from "./tools/metrics";
import type { SuggestionResult } from "./tools/suggest";
import type { SqlQueryResult } from "./tools/sql-query";
import type { ThreadContext } from "./types";
import { getMetricDefinition } from "./tools/metrics";

const DAY_DISPLAY: Record<string, string> = {
  MON: "Monday",
  TUE: "Tuesday", 
  WED: "Wednesday",
  THU: "Thursday",
  FRI: "Friday",
  SAT: "Saturday",
  SUN: "Sunday",
};

interface FormattedResult {
  text: string;
  sources: string[];
  hadDataRead: boolean;
}

function formatMinutes(minutes: number): string {
  if (minutes === 0) return "0m";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}.0h`;
  return `${hours}.${Math.round((mins / 60) * 10)}h`;
}

function formatTime(time: Date | string | null | undefined): string | null {
  if (!time) return null;
  if (typeof time === "string") return time;
  const hours = time.getUTCHours().toString().padStart(2, "0");
  const minutes = time.getUTCMinutes().toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

// =====================
// OUTPUT CONTRACT WRAPPER
// =====================

/**
 * Wraps formatted output with scope and source information
 * This is the OUTPUT CONTRACT: all responses MUST include scope and source
 */
function wrapWithContract(
  text: string,
  sources: string[],
  context: ThreadContext,
  view?: string,
  rowCount?: number
): FormattedResult {
  const scopeLabel = context.scope === "AllManaged" 
    ? "All managed stores" 
    : "This store only";
  
  // Prepend scope
  const withScope = `**Scope: ${scopeLabel}**\n\n${text}`;
  
  // Append source with contract format
  const sourceStr = view 
    ? `**Source: ${view} • ISO week: ${context.isoWeek} • ${rowCount || 0} rows**`
    : `**Source: ${sources.join(", ")} • ISO week: ${context.isoWeek}**`;
  
  const withContract = `${withScope}\n\n${sourceStr}`;
  
  return {
    text: withContract,
    sources,
    hadDataRead: rowCount !== undefined && rowCount > 0,
  };
}

// =====================
// METRIC FORMATTERS
// =====================

export function formatMetricResult(
  result: MetricResult, 
  storeId: string,
  context: ThreadContext
): FormattedResult {
  console.log("🎨 [FORMATTER] formatMetricResult called");
  console.log("📊 [FORMATTER] Metric:", result.metricName);
  console.log("📈 [FORMATTER] Row count:", result.rowCount);
  
  const metric = getMetricDefinition(result.metricName);
  if (!metric) {
    console.log("❌ [FORMATTER] Unknown metric:", result.metricName);
    return wrapWithContract(
      `Unknown metric: ${result.metricName}`,
      [],
      context
    );
  }

  const sources = [result.view];

  if (result.rows.length === 0) {
    console.log("⚠️ [FORMATTER] No rows found for:", metric.description);
    return wrapWithContract(
      `No data found for ${metric.description}`,
      sources,
      context,
      result.view,
      0
    );
  }

  console.log("✅ [FORMATTER] Formatting", result.rows.length, "rows for", result.metricName);

  // Format based on metric type
  let formatted: { text: string; sources: string[] };
  
  switch (result.metricName) {
    case "hours:employee":
      formatted = formatHoursEmployee(result, sources);
      break;
    
    case "hours:all":
      formatted = formatHoursAll(result, sources, storeId);
      break;
    
    case "hours:under-target":
      formatted = formatHoursUnderTarget(result, sources);
      break;
    
    case "hours:over-target":
      formatted = formatHoursOverTarget(result, sources);
      break;
    
    case "hours:top-workers":
      formatted = formatHoursTopWorkers(result, sources);
      break;
    
    case "availability:day":
      formatted = formatAvailabilityDay(result, sources, storeId);
      break;
    
    case "coverage:gaps":
      formatted = formatCoverageGaps(result, sources);
      break;
    
    case "coverage:biggest-gap":
      formatted = formatBiggestGap(result, sources);
      break;
    
    case "coverage:day-assignments":
    case "coverage:week-assignments":
      formatted = formatAssignments(result, sources);
      break;
    
    case "compare:weeks":
      formatted = formatWeekComparison(result, sources);
      break;
    
    default:
      formatted = formatGeneric(result, sources);
  }
  
  return wrapWithContract(
    formatted.text,
    formatted.sources,
    context,
    result.view,
    result.rowCount
  );
}

function formatHoursEmployee(result: MetricResult, sources: string[]) {
  const row: any = result.rows[0];
  const minutes = Number(row.minutes || row.total_minutes) || 0;
  const target = Number(row.target_minutes) || 0;
  const shortfall = target - minutes;

  let text = `${row.employee_name}: ${formatMinutes(minutes)}`;
  if (target > 0) {
    text += ` / ${formatMinutes(target)}`;
    if (shortfall > 0) {
      text += ` (${formatMinutes(shortfall)} short)`;
    } else if (shortfall < 0) {
      text += ` (${formatMinutes(-shortfall)} over)`;
    }
  }

  return { text, sources };
}

function formatHoursAll(result: MetricResult, sources: string[], storeId: string) {
  const lines = result.rows.map((row: any) => {
    const minutes = Number(row.minutes || row.total_minutes) || 0;
    const target = Number(row.target_minutes) || 0;
    const tag = row.home_store_id === storeId ? "home" : "borrow";
    return `- ${row.employee_name} (${tag}): ${formatMinutes(minutes)} / ${formatMinutes(target)}`;
  });

  return {
    text: `Hours this week:\n${lines.join("\n")}`,
    sources,
  };
}

function formatHoursUnderTarget(result: MetricResult, sources: string[]) {
  const lines = result.rows.map((row: any) => {
    const minutes = Number(row.total_minutes) || 0;
    const target = Number(row.target_minutes) || 0;
    const shortfall = target - minutes;
    return `- ${row.employee_name}: ${formatMinutes(minutes)} / ${formatMinutes(target)} (${formatMinutes(shortfall)} short)`;
  });

  return {
    text: `Under target this week:\n${lines.join("\n")}`,
    sources,
  };
}

function formatHoursOverTarget(result: MetricResult, sources: string[]) {
  const lines = result.rows.map((row: any) => {
    const minutes = Number(row.total_minutes) || 0;
    const target = Number(row.target_minutes) || 0;
    const status = minutes >= target ? "at target" : "near target";
    return `- ${row.employee_name}: ${formatMinutes(minutes)} / ${formatMinutes(target)} (${status})`;
  });

  return {
    text: `At/near target this week:\n${lines.join("\n")}`,
    sources,
  };
}

function formatHoursTopWorkers(result: MetricResult, sources: string[]) {
  const lines = result.rows.map((row: any, index: number) => {
    const minutes = Number(row.total_minutes) || 0;
    return `${index + 1}. ${row.employee_name}: ${formatMinutes(minutes)}`;
  });

  return {
    text: `Top workers this week:\n${lines.join("\n")}`,
    sources,
  };
}

function formatAvailabilityDay(result: MetricResult, sources: string[], storeId: string) {
  // Handle both old fetchAvailability() format and raw SQL format
  const lines = result.rows.slice(0, 20).map((row: any) => {
    // Old format (from fetchAvailability)
    if (row.employeeName && row.availability) {
      const start = row.availability.startTime || "00:00";
      const end = row.availability.endTime || "24:00";
      const tag = row.homeStoreId === storeId ? "home" : "borrow";
      const scheduled = row.scheduledMinutes ? formatMinutes(row.scheduledMinutes) : "0m";
      const weekly = row.totalWeekMinutes ? formatMinutes(row.totalWeekMinutes) : "0m";
      const target = row.targetMinutes ? formatMinutes(row.targetMinutes) : "?";
      
      return `- ${row.employeeName} (${tag}): ${start}-${end} | ${scheduled} scheduled today | ${weekly}/${target} this week`;
    }
    
    // Raw SQL format (fallback)
    const start = formatTime(row.start_time) || "??";
    const end = formatTime(row.end_time) || "??";
    const tag = row.home_store_id === storeId ? "home" : "borrow";
    return `- ${row.employee_name} (${tag}): ${start}-${end}`;
  });

  if (lines.length === 0) {
    return {
      text: "No one is available at that time.",
      sources,
    };
  }

  let text = `Available:\n${lines.join("\n")}`;
  if (result.rows.length > 20) {
    text += `\n…${result.rows.length - 20} more results truncated`;
  }

  return { text, sources };
}

function formatCoverageGaps(result: MetricResult, sources: string[]) {
  if (result.rows.length === 0) {
    return {
      text: "No unassigned coverage gaps found.",
      sources,
    };
  }

  const lines = result.rows.map((row: any) => {
    const start = formatTime(row.start_time) || "??";
    const end = formatTime(row.end_time) || "??";
    const minutes = Number(row.duration_minutes) || 0;
    const workType = row.work_type_name || "Unassigned role";
    return `- ${row.day} ${start}-${end} (${workType}) - ${formatMinutes(minutes)}`;
  });

  return {
    text: `Unassigned coverage gaps:\n${lines.join("\n")}`,
    sources,
  };
}

function formatBiggestGap(result: MetricResult, sources: string[]) {
  if (result.rows.length === 0) {
    return {
      text: "No unassigned coverage gaps found this week.",
      sources,
    };
  }

  const row: any = result.rows[0];
  const dayName = DAY_DISPLAY[row.day] || row.day;
  const totalMinutes = Number(row.total_gap_minutes) || 0;
  const gapCount = Number(row.gap_count) || 0;
  
  let text = `**Biggest gap: ${dayName}** with ${formatMinutes(totalMinutes)} unassigned (${gapCount} shift${gapCount !== 1 ? 's' : ''})`;
  
  // Show list of unassigned shifts if available
  if (row.unassigned_shifts && Array.isArray(row.unassigned_shifts)) {
    const shiftLines = row.unassigned_shifts.map((shift: string) => `  • ${shift}`);
    text += `\n\nUnassigned shifts:\n${shiftLines.join("\n")}`;
  }
  
  return {
    text,
    sources,
  };
}

function formatWeekComparison(result: MetricResult, sources: string[]) {
  if (result.rows.length === 0) {
    return {
      text: "No data available for week comparison.",
      sources,
    };
  }

  // Group by employee
  const byEmployee: Record<string, any[]> = {};
  for (const row of result.rows as any[]) {
    const empName = row.employee_name;
    if (!byEmployee[empName]) byEmployee[empName] = [];
    byEmployee[empName].push(row);
  }

  // Get the two weeks being compared
  const allWeeks = (result.rows as any[]).map(r => r.iso_week);
  const uniqueWeeks = Array.from(new Set(allWeeks));
  const weeks = uniqueWeeks.sort();
  const [week1, week2] = weeks;

  const lines = Object.entries(byEmployee).map(([name, weekData]) => {
    const w1Data = weekData.find(w => w.iso_week === week1);
    const w2Data = weekData.find(w => w.iso_week === week2);
    
    const w1Minutes = w1Data ? Number(w1Data.total_minutes) || 0 : 0;
    const w2Minutes = w2Data ? Number(w2Data.total_minutes) || 0 : 0;
    const difference = w2Minutes - w1Minutes;
    
    const diffStr = difference > 0 
      ? `+${formatMinutes(difference)}` 
      : difference < 0 
      ? formatMinutes(difference) 
      : "no change";
    
    return `- ${name}: ${formatMinutes(w1Minutes)} → ${formatMinutes(w2Minutes)} (${diffStr})`;
  });

  return {
    text: `**Week Comparison: ${week1} vs ${week2}**\n\n${lines.join("\n")}`,
    sources,
  };
}

function formatAssignments(result: MetricResult, sources: string[]) {
  // Group by day
  const byDay: Record<string, any[]> = {};
  for (const row of result.rows as any[]) {
    if (!byDay[row.day]) byDay[row.day] = [];
    byDay[row.day].push(row);
  }

  const dayLines = Object.entries(byDay).map(([day, assignments]) => {
    const shiftLines = assignments.map((a) => {
      const start = formatTime(a.start_time) || "??";
      const end = formatTime(a.end_time) || "??";
      const employee = a.employee_name || "unassigned";
      return `  • ${start}-${end} ${a.work_type_name}: ${employee}`;
    });
    return `**${DAY_DISPLAY[day] || day}:**\n${shiftLines.join("\n")}`;
  });

  return {
    text: `Schedule:\n\n${dayLines.join("\n\n")}`,
    sources,
  };
}

function formatGeneric(result: MetricResult, sources: string[]) {
  const preview = result.rows.slice(0, 5).map((row) => JSON.stringify(row)).join("\n");
  return {
    text: `Results (${result.rowCount} rows):\n${preview}${result.rowCount > 5 ? "\n…" : ""}`,
    sources,
  };
}

// =====================
// SUGGESTION FORMATTER
// =====================

export function formatSuggestions(
  result: SuggestionResult,
  context: ThreadContext
): FormattedResult {
  if (result.candidates.length === 0) {
    return wrapWithContract(
      "No suitable candidates found for this gap.",
      ["availability", "hours"],
      context
    );
  }

  const gapDesc = `${DAY_DISPLAY[result.gap.day]} ${result.gap.startTime || ""}${result.gap.endTime ? `-${result.gap.endTime}` : ""}${result.gap.workType ? ` (${result.gap.workType})` : ""}`;

  const lines = result.candidates.map((candidate, index) => {
    const reasons = candidate.reasons.join(", ");
    return `${index + 1}. ${candidate.employeeName}: ${reasons}`;
  });

  return wrapWithContract(
    `Coverage suggestions for ${gapDesc}:\n${lines.join("\n")}`,
    ["availability", "hours", "assignments"],
    context,
    undefined,
    result.candidates.length
  );
}

// =====================
// SQL RESULT FORMATTER
// =====================

export function formatSqlResult(
  result: SqlQueryResult,
  context: ThreadContext,
  view?: string
): FormattedResult {
  if (result.rowCount === 0) {
    return wrapWithContract(
      "Query returned no results.",
      ["custom query"],
      context,
      view,
      0
    );
  }

  const preview = result.rows.slice(0, 10).map((row) => JSON.stringify(row)).join("\n");
  let text = `Query results (${result.rowCount} rows):\n${preview}`;
  if (result.rowCount > 10) {
    text += `\n…${result.rowCount - 10} more rows`;
  }

  return wrapWithContract(
    text,
    ["custom query"],
    context,
    view,
    result.rowCount
  );
}
