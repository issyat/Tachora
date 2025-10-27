import type { ThreadContext, SuggestionCandidate } from "../types";
import { fetchUnassignedGaps } from "./gaps";
import { fetchAvailability } from "./availability";
import { formatMinutes } from "../utils";

interface SuggestionParams {
  managerId: string;
  context: ThreadContext;
  day?: "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";
}

export interface CoverageSuggestion {
  gap: {
    day: string;
    startTime: string;
    endTime: string;
    minutes: number;
    workTypeName: string | null;
  };
  candidates: SuggestionCandidate[];
}

function describeCandidate({
  remainingMinutes,
  roles,
  workTypeName,
  isBorrowed,
  gapWindow,
}: {
  remainingMinutes: number;
  roles: string[];
  workTypeName: string | null;
  isBorrowed: boolean;
  gapWindow: { start: string; end: string };
}): string {
  const pieces: string[] = [];

  if (remainingMinutes > 0) {
    pieces.push(`${formatMinutes(remainingMinutes)} under target`);
  } else {
    pieces.push("balanced workload");
  }

  if (workTypeName && roles.includes(workTypeName)) {
    pieces.push(`${workTypeName}-qualified`);
  }

  pieces.push(isBorrowed ? "borrowable" : "home store");
  pieces.push(`no conflict ${gapWindow.start}-${gapWindow.end}`);

  return pieces.join(", ");
}

export async function suggestCoverage({
  managerId,
  context,
  day,
}: SuggestionParams): Promise<CoverageSuggestion[]> {
  const gaps = await fetchUnassignedGaps({ context });

  const relevantGaps = day
    ? gaps.filter((gap) => gap.day === day)
    : gaps;

  const suggestions: CoverageSuggestion[] = [];

  for (const gap of relevantGaps) {
    const availability = await fetchAvailability({
      managerId,
      context,
      query: {
        day: gap.day,
        startTime: gap.startTime,
        endTime: gap.endTime,
      },
    });

    const ranked = availability
      .filter((candidate) => !candidate.conflictsWithWindow)
      .map((candidate) => {
        const remainingMinutes = candidate.targetMinutes - candidate.totalWeekMinutes;
        const roleMatch = gap.workTypeName
          ? candidate.roles.includes(gap.workTypeName)
          : false;

        let score = 0;
        score += candidate.homeStoreId === context.storeId ? 200 : 120;
        if (candidate.canBorrow && candidate.homeStoreId !== context.storeId) {
          score += 40;
        }
        if (roleMatch) {
          score += 80;
        }
        if (remainingMinutes > 0) {
          score += Math.min(remainingMinutes, 4 * 60); // cap at 4h boost
        }

        return {
            score,
            candidate,
            reason: describeCandidate({
              remainingMinutes,
              roles: candidate.roles,
              workTypeName: gap.workTypeName,
              isBorrowed: candidate.homeStoreId !== context.storeId,
              gapWindow: { start: gap.startTime, end: gap.endTime },
            }),
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((entry) => ({
        employeeId: entry.candidate.employeeId,
        employeeName: entry.candidate.employeeName,
        homeStoreId: entry.candidate.homeStoreId,
        reason: entry.reason,
      }));

    suggestions.push({
      gap: {
        day: gap.day,
        startTime: gap.startTime,
        endTime: gap.endTime,
        minutes: gap.minutes,
        workTypeName: gap.workTypeName,
      },
      candidates: ranked,
    });
  }

  return suggestions;
}
