import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import { z } from "zod";

import { resolveAdvisorThread, recordAdvisorMessage, updateAdvisorThreadState } from "@/server/copilot/context";
import { interpretIntent } from "@/server/copilot/intent";
import { interpretToolIntent } from "@/server/copilot/tool-intent";
import { executeToolIntent } from "@/server/copilot/tool-handler";
import { fetchAvailability } from "@/server/copilot/data/availability";
import { fetchHoursSummary } from "@/server/copilot/data/hours";
import { fetchUnassignedGaps } from "@/server/copilot/data/gaps";
import { suggestCoverage } from "@/server/copilot/data/suggestions";
import type {
  AdvisorScope,
  ClarificationChoice,
  HoursSummary,
  ThreadContext,
  ThreadState,
  AvailabilityQuery,
} from "@/server/copilot/types";
import { formatMinutes, formatTime } from "@/server/copilot/utils";
import { prisma } from "@/lib/prisma";
import { getIsoWeekId, getWeekStartDate, ensureIsoWeekId, parseIsoWeekId } from "@/lib/week";

const RequestSchema = z.object({
  message: z.string().min(1),
  threadId: z.string().optional().nullable(),
  storeId: z.string().optional().nullable(),
  isoWeek: z.string().optional().nullable(),
  scope: z.enum(["HomeOnly", "AllManaged", "Specific"]).optional().nullable(),
  scopeStores: z.array(z.string()).optional().nullable(),
});

const DAY_DISPLAY: Record<AvailabilityQuery["day"], string> = {
  MON: "Mon",
  TUE: "Tue",
  WED: "Wed",
  THU: "Thu",
  FRI: "Fri",
  SAT: "Sat",
  SUN: "Sun",
};

const DAY_ORDER: AvailabilityQuery["day"][] = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

const DAY_INPUT_MAP: Record<string, AvailabilityQuery["day"]> = {
  mon: "MON",
  monday: "MON",
  tue: "TUE",
  tues: "TUE",
  tuesday: "TUE",
  wed: "WED",
  weds: "WED",
  wednesday: "WED",
  thu: "THU",
  thurs: "THU",
  thursday: "THU",
  fri: "FRI",
  friday: "FRI",
  sat: "SAT",
  saturday: "SAT",
  sun: "SUN",
  sunday: "SUN",
  lun: "MON",
  lunes: "MON",
  lundi: "MON",
  mardi: "TUE",
  martes: "TUE",
  miercoles: "WED",
  mercredi: "WED",
  jueves: "THU",
  jeudi: "THU",
  viernes: "FRI",
  vendredi: "FRI",
  sabado: "SAT",
  sab: "SAT",
  samedi: "SAT",
  domingo: "SUN",
  dimanche: "SUN",
  dom: "SUN",
};

const DAYPART_LABELS: Record<string, { start: string; end: string }> = {
  morning: { start: "08:00", end: "12:00" },
  afternoon: { start: "12:00", end: "16:00" },
  evening: { start: "16:00", end: "20:00" },
  night: { start: "20:00", end: "23:00" },
};

function scopeLabel(scope: AdvisorScope): string {
  switch (scope) {
    case "HomeOnly":
      return "HomeOnly";
    case "AllManaged":
      return "AllManaged";
    case "Specific":
      return "Specific";
    default:
      return scope;
  }
}

function formatHeader(params: { storeName: string; isoWeek: string; scope: AdvisorScope }): string {
  // Context is already clear from the page UI - no need to repeat it in chat
  return "";
}

function joinSources(sources: string[], isoWeek: string): string {
  // Don't show sources in chat - just return empty string
  return "";
}

function logAdvisorTurn(entry: {
  threadId: string;
  storeId: string;
  isoWeek: string;
  scope: AdvisorScope;
  intent: string;
  sources: string[];
  outcome: "clarification" | "response";
}) {
  console.info("[COPILOT_ADVISOR_TURN]", {
    threadId: entry.threadId,
    storeId: entry.storeId,
    isoWeek: entry.isoWeek,
    scope: entry.scope,
    intent: entry.intent,
    sources: entry.sources,
    outcome: entry.outcome,
  });
}

function shiftIsoWeek(isoWeek: string, delta: number): string {
  const start = getWeekStartDate(isoWeek);
  start.setUTCDate(start.getUTCDate() + delta * 7);
  return getIsoWeekId(start);
}

interface WeekReference {
  isoWeek: string;
  onlyContextChange: boolean;
}

function detectWeekReference(message: string, baseIsoWeek: string): WeekReference | null {
  const lower = message.toLowerCase();
  const trimmed = lower.trim();

  if (trimmed === "next week") {
    return { isoWeek: shiftIsoWeek(baseIsoWeek, 1), onlyContextChange: true };
  }
  if (trimmed === "last week" || trimmed === "previous week") {
    return { isoWeek: shiftIsoWeek(baseIsoWeek, -1), onlyContextChange: true };
  }
  if (trimmed === "this week") {
    return { isoWeek: ensureIsoWeekId(undefined, new Date()), onlyContextChange: true };
  }

  if (lower.includes("next week")) {
    return { isoWeek: shiftIsoWeek(baseIsoWeek, 1), onlyContextChange: false };
  }
  if (lower.includes("last week") || lower.includes("previous week")) {
    return { isoWeek: shiftIsoWeek(baseIsoWeek, -1), onlyContextChange: false };
  }
  if (lower.includes("this week")) {
    return { isoWeek: ensureIsoWeekId(undefined, new Date()), onlyContextChange: false };
  }

  const yearWeekMatch = lower.match(/(20\d{2})[-\s]?w?(\d{1,2})/);
  if (yearWeekMatch) {
    const year = Number(yearWeekMatch[1]);
    const week = Number(yearWeekMatch[2]);
    if (week >= 1 && week <= 53) {
      const isoWeek = `${year}-W${week.toString().padStart(2, "0")}`;
      return {
        isoWeek: ensureIsoWeekId(isoWeek, new Date(Date.UTC(year, 0, 1))),
        onlyContextChange: yearWeekMatch[0].trim() === trimmed,
      };
    }
  }

  const weekNumberMatch = lower.match(/week\s*(\d{1,2})/);
  if (weekNumberMatch) {
    const week = Number(weekNumberMatch[1]);
    if (week >= 1 && week <= 53) {
      const { year } = parseIsoWeekId(baseIsoWeek);
      const isoWeek = `${year}-W${week.toString().padStart(2, "0")}`;
      return {
        isoWeek: ensureIsoWeekId(isoWeek, new Date(Date.UTC(year, 0, 1))),
        onlyContextChange: weekNumberMatch[0].trim() === trimmed,
      };
    }
  }

  return null;
}

function parseDaySelection(input: string): AvailabilityQuery["day"] | undefined {
  const normalized = input.trim().toLowerCase();
  if (normalized.length === 0) {
    return undefined;
  }
  if (/^[1-7]$/.test(normalized)) {
    const index = Number(normalized) - 1;
    return DAY_ORDER[index];
  }
  return DAY_INPUT_MAP[normalized];
}

function describeChoice(choice: ClarificationChoice, scopeStoreId: string): string {
  const tag = choice.homeStoreId === scopeStoreId ? "home" : `borrow (${choice.homeStoreId})`;
  return `${choice.employeeName} - ${tag}`;
}

function resolveClarificationSelection(input: string, options: ClarificationChoice[]): ClarificationChoice | null {
  const trimmed = input.trim().toLowerCase();
  if (trimmed.length === 0) {
    return null;
  }
  if (/^[1-9]\d*$/.test(trimmed)) {
    const index = Number(trimmed) - 1;
    return options[index] ?? null;
  }
  return (
    options.find((option) => option.employeeName.toLowerCase() === trimmed) ??
    options.find((option) => option.employeeName.toLowerCase().includes(trimmed)) ??
    null
  );
}

function scoreEmployeeOptions(
  summaries: HoursSummary[],
  inputName: string,
  clarifications: Record<string, string>,
): { summary?: HoursSummary; options?: ClarificationChoice[]; normalizedName: string } {
  const normalizedInput = inputName.toLowerCase().trim();
  if (normalizedInput.length === 0) {
    return { normalizedName: normalizedInput };
  }

  const clarifierId = clarifications[normalizedInput];
  if (clarifierId) {
    const summary = summaries.find((entry) => entry.employeeId === clarifierId);
    if (summary) {
      return { summary, normalizedName: normalizedInput };
    }
  }

  const tokens = normalizedInput.split(/\s+/).filter(Boolean);
  const candidates = summaries
    .map((summary) => {
      const normalizedName = summary.employeeName.toLowerCase();
      const tokenMatches = tokens.filter((token) => normalizedName.includes(token)).length;
      if (tokenMatches === 0) {
        return null;
      }
      const score = tokenMatches * 10 - Math.abs(normalizedName.length - normalizedInput.length);
      return { summary, score };
    })
    .filter((entry): entry is { summary: HoursSummary; score: number } => entry !== null)
    .sort((a, b) => b.score - a.score);

  if (candidates.length === 0) {
    return { normalizedName: normalizedInput };
  }
  if (candidates.length === 1 || candidates[0].score > (candidates[1]?.score ?? -Infinity)) {
    return { summary: candidates[0].summary, normalizedName: normalizedInput };
  }

  const topScore = candidates[0].score;
  const tied = candidates.filter((entry) => entry.score === topScore).slice(0, 3);
  const options: ClarificationChoice[] = tied.map((entry) => ({
    employeeId: entry.summary.employeeId,
    employeeName: entry.summary.employeeName,
    homeStoreId: entry.summary.homeStoreId,
  }));

  return { options, normalizedName: normalizedInput };
}

function formatScopeDetails(scope: AdvisorScope): string | undefined {
  // Don't show scope details in chat - context is clear from page
  return undefined;
}

async function buildAvailabilityAnswer(
  context: ThreadContext,
  query: AvailabilityQuery,
  daypartLabel?: string,
): Promise<{ body: string; sources: string[]; daypartUsed?: string }> {
  if (!query.day) {
    throw new Error("Availability query requires a day.");
  }

  const results = await fetchAvailability({ managerId: context.userId, context, query });
  const sources: string[] = [];
  sources.push(`v_availability (store ${context.storeId}, day ${query.day}, scope ${context.scope})`);
  sources.push(`v_day_assignments (store ${context.storeId}, week ${context.isoWeek}, scope ${context.scope})`);
  sources.push(`v_employee_hours_week (store ${context.storeId}, week ${context.isoWeek}, scope ${context.scope})`);

  let body = "";
  if (results.length === 0) {
    const workTypePhrase = query.workType ? ` (${query.workType})` : "";
    body = `No availability recorded for ${DAY_DISPLAY[query.day]}${query.startTime ? ` ${query.startTime}-${query.endTime ?? ""}` : ""}${workTypePhrase}.`;
  } else {
    const lines = results.slice(0, 10).map((result) => {
      const windowLabel = result.availability.fullDay
        ? "available all day"
        : `${result.availability.startTime ?? "??"}-${result.availability.endTime ?? "??"}`;
      const dayMinutes = formatMinutes(result.scheduledMinutes);
      const weekMinutes = `${formatMinutes(result.totalWeekMinutes)} of ${formatMinutes(result.targetMinutes)}`;
      const tag = result.homeStoreId === context.storeId ? "home" : "borrow";
      return `- ${result.employeeName} (${tag}): ${windowLabel}, scheduled ${dayMinutes} that day, week ${weekMinutes}`;
    });
    const workTypePhrase = query.workType ? ` (${query.workType})` : "";
    body = `Available ${DAY_DISPLAY[query.day]}${query.startTime ? ` ${query.startTime}-${query.endTime ?? ""}` : ""}${workTypePhrase}:
${lines.join("\n")}`;
    if (results.length > 10) {
      body += "\n…more results truncated.";
    }
  }

  if (daypartLabel) {
    const assumed = DAYPART_LABELS[daypartLabel];
    if (assumed) {
      body += `\nAssumption: ${daypartLabel} = ${assumed.start}-${assumed.end}.`;
    }
  }

  const scopeDetails = formatScopeDetails(context.scope);
  if (scopeDetails) {
    body += `\n${scopeDetails}`;
  }

  return { body, sources, daypartUsed: daypartLabel };
}

async function handlePendingClarification(
  state: ThreadState,
  input: string,
  context: ThreadContext,
): Promise<
  | { kind: "ask-again"; message: string; state: ThreadState }
  | {
      kind: "resolved";
      state: ThreadState;
      replayMessage?: string;
      availabilityQuery?: AvailabilityQuery & { daypartLabel?: string };
    }
> {
  const pending = state.pendingClarification;
  if (!pending) {
    return { kind: "resolved", state };
  }

  if (pending.kind === "employee") {
    const choice = resolveClarificationSelection(input, pending.options);
    if (!choice) {
      const lines = pending.options.map((option, index) => `  ${index + 1}. ${describeChoice(option, context.storeId)}`);
      return {
        kind: "ask-again",
        state,
        message: `I need to know which \"${pending.normalizedName}\" you meant:
${lines.join("\n")}\nReply with the number or the name to continue.`,
      };
    }

    const nextState: ThreadState = {
      ...state,
      clarifications: {
        ...state.clarifications,
        [pending.normalizedName]: choice.employeeId,
      },
      pendingClarification: null,
    };

    return {
      kind: "resolved",
      state: nextState,
      replayMessage: pending.originalQuestion,
    };
  }

  if (pending.kind === "availability-day") {
    const day = parseDaySelection(input);
    if (!day) {
      const examples = DAY_ORDER.map((dayKey, index) => `${index + 1}. ${DAY_DISPLAY[dayKey]}`).join("  ");
      return {
        kind: "ask-again",
        state,
        message: `Which day would you like to check? Choose 1-7 or type the day name (${examples}).`,
      };
    }

    const nextState: ThreadState = {
      ...state,
      pendingClarification: null,
    };

    return {
      kind: "resolved",
      state: nextState,
      availabilityQuery: {
        day,
        startTime: pending.query.startTime,
        endTime: pending.query.endTime,
        daypartLabel: pending.query.daypartLabel,
      },
    };
  }

  return { kind: "resolved", state };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const payload = RequestSchema.parse(await request.json());
    const message = payload.message.trim();

    const { userId } = getAuth(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // =====================================================
    // NEW: Tool-based architecture (feature flag)
    // =====================================================
    const USE_TOOL_ARCHITECTURE = process.env.NEXT_PUBLIC_USE_TOOL_ADVISOR === "true";
    
    if (USE_TOOL_ARCHITECTURE) {
      const overrides = {
        threadId: payload.threadId ?? undefined,
        storeIdOverride: payload.storeId ?? undefined,
        isoWeekOverride: payload.isoWeek ?? undefined,
        scopeOverride: payload.scope ?? undefined,
        extraStoreIdsOverride: payload.scopeStores ?? undefined,
      };

      const context = await resolveAdvisorThread(userId, userId, overrides);

      await recordAdvisorMessage({
        threadId: context.threadId,
        role: "user",
        content: { text: message },
      });

      // Interpret and execute
      const intent = interpretToolIntent(message);
      const result = await executeToolIntent(intent, message, context, userId);

      const finalText = result.text;

      await recordAdvisorMessage({
        threadId: context.threadId,
        role: "assistant",
        content: { text: finalText, sources: result.sources },
      });

      return NextResponse.json({
        threadId: context.threadId,
        storeId: context.storeId,
        isoWeek: context.isoWeek,
        scope: context.scope,
        text: finalText,
        sources: result.sources,
        needsClarification: result.needsClarification,
      });
    }
    // =====================================================
    // END: Tool-based architecture
    // =====================================================

    const overrides = {
      threadId: payload.threadId ?? undefined,
      storeIdOverride: payload.storeId ?? undefined,
      isoWeekOverride: payload.isoWeek ?? undefined,
      scopeOverride: payload.scope ?? undefined,
      extraStoreIdsOverride: payload.scopeStores ?? undefined,
    };

    let context = await resolveAdvisorThread(userId, userId, overrides);
    let threadState = context.state;

    let storeNameCache: string | null = null;
    const ensureStoreName = async (): Promise<string> => {
      if (storeNameCache !== null) {
        return storeNameCache;
      }
      const record = await prisma.store.findUnique({
        where: { id: context.storeId },
        select: { name: true },
      });
      storeNameCache = record?.name ?? context.storeId;
      return storeNameCache;
    };

    await recordAdvisorMessage({
      threadId: context.threadId,
      role: "user",
      content: { text: message },
    });

    const weekReference = detectWeekReference(message, context.isoWeek);
    if (weekReference) {
      context = await resolveAdvisorThread(userId, userId, {
        threadId: context.threadId,
        isoWeekOverride: weekReference.isoWeek,
      });
      threadState = context.state;
      storeNameCache = null;

      if (weekReference.onlyContextChange) {
        const header = formatHeader({
          storeName: await ensureStoreName(),
          isoWeek: context.isoWeek,
          scope: context.scope,
        });
        const finalText = `${header}
Week context updated to ${context.isoWeek}.
${joinSources([], context.isoWeek)}`;

        await recordAdvisorMessage({
          threadId: context.threadId,
          role: "assistant",
          content: { text: finalText, sources: [] },
        });

        logAdvisorTurn({
          threadId: context.threadId,
          storeId: context.storeId,
          isoWeek: context.isoWeek,
          scope: context.scope,
          intent: "context:update-week",
          sources: [],
          outcome: "response",
        });

        return NextResponse.json({
          threadId: context.threadId,
          storeId: context.storeId,
          isoWeek: context.isoWeek,
          scope: context.scope,
          text: finalText,
          sources: [],
        });
      }
    }

    const clarificationResolution = await handlePendingClarification(threadState, message, context);
    if (clarificationResolution.state !== threadState) {
      threadState = await updateAdvisorThreadState(context.threadId, () => clarificationResolution.state);
      context = { ...context, state: threadState };
    }

    if (clarificationResolution.kind === "ask-again") {
      const header = formatHeader({
        storeName: await ensureStoreName(),
        isoWeek: context.isoWeek,
        scope: context.scope,
      });
      const finalText = `${header}
${clarificationResolution.message}
${joinSources([], context.isoWeek)}`;

      await recordAdvisorMessage({
        threadId: context.threadId,
        role: "assistant",
        content: { text: finalText, sources: [] },
      });

      logAdvisorTurn({
        threadId: context.threadId,
        storeId: context.storeId,
        isoWeek: context.isoWeek,
        scope: context.scope,
        intent: "clarification",
        sources: [],
        outcome: "clarification",
      });

      return NextResponse.json({
        threadId: context.threadId,
        storeId: context.storeId,
        isoWeek: context.isoWeek,
        scope: context.scope,
        text: finalText,
        sources: [],
      });
    }

    const messageForIntent = clarificationResolution.replayMessage ?? message;

    if (clarificationResolution.availabilityQuery) {
      const header = formatHeader({
        storeName: await ensureStoreName(),
        isoWeek: context.isoWeek,
        scope: context.scope,
      });

      const availability = await buildAvailabilityAnswer(
        context,
        clarificationResolution.availabilityQuery,
        clarificationResolution.availabilityQuery.daypartLabel,
      );
      const finalText = `${header}
${availability.body}
${joinSources(availability.sources, context.isoWeek)}`;

      if (
        availability.daypartUsed &&
        !context.state.notes.daypartReminderShown
      ) {
        threadState = await updateAdvisorThreadState(context.threadId, (state) => ({
          ...state,
          notes: {
            ...state.notes,
            daypartReminderShown: true,
          },
        }));
        context = { ...context, state: threadState };
      }

      await recordAdvisorMessage({
        threadId: context.threadId,
        role: "assistant",
        content: { text: finalText, sources: availability.sources },
      });

      logAdvisorTurn({
        threadId: context.threadId,
        storeId: context.storeId,
        isoWeek: context.isoWeek,
        scope: context.scope,
        intent: "availability",
        sources: availability.sources,
        outcome: "response",
      });

      return NextResponse.json({
        threadId: context.threadId,
        storeId: context.storeId,
        isoWeek: context.isoWeek,
        scope: context.scope,
        text: finalText,
        sources: availability.sources,
      });
    }

    const intent = interpretIntent(messageForIntent);
    console.log("🎯 [ADVISOR] Intent extracted:", JSON.stringify(intent, null, 2));

    const header = formatHeader({
      storeName: await ensureStoreName(),
      isoWeek: context.isoWeek,
      scope: context.scope,
    });

    const sources: string[] = [];
    const addSource = (source: string) => {
      if (!sources.includes(source)) {
        sources.push(source);
      }
    };

    let bodyText = "";

    switch (intent.type) {
      case "scope:all-managed": {
        context = await resolveAdvisorThread(userId, userId, {
          threadId: context.threadId,
          scopeOverride: "AllManaged",
        });
        threadState = context.state;
        storeNameCache = null;
        const scopeHeader = formatHeader({
          storeName: await ensureStoreName(),
          isoWeek: context.isoWeek,
          scope: context.scope,
        });
        const finalText = `${scopeHeader}
Scope updated to include all managed stores.
${joinSources([], context.isoWeek)}`;

        await recordAdvisorMessage({
          threadId: context.threadId,
          role: "assistant",
          content: { text: finalText, sources: [] },
        });

        logAdvisorTurn({
          threadId: context.threadId,
          storeId: context.storeId,
          isoWeek: context.isoWeek,
          scope: context.scope,
          intent: "scope:all-managed",
          sources: [],
          outcome: "response",
        });

        return NextResponse.json({
          threadId: context.threadId,
          storeId: context.storeId,
          isoWeek: context.isoWeek,
          scope: context.scope,
          text: finalText,
          sources: [],
        });
      }
      case "scope:home-only": {
        context = await resolveAdvisorThread(userId, userId, {
          threadId: context.threadId,
          scopeOverride: "HomeOnly",
        });
        threadState = context.state;
        storeNameCache = null;
        const scopeHeader = formatHeader({
          storeName: await ensureStoreName(),
          isoWeek: context.isoWeek,
          scope: context.scope,
        });
        const finalText = `${scopeHeader}
Scope reset to home store only.
${joinSources([], context.isoWeek)}`;

        await recordAdvisorMessage({
          threadId: context.threadId,
          role: "assistant",
          content: { text: finalText, sources: [] },
        });

        logAdvisorTurn({
          threadId: context.threadId,
          storeId: context.storeId,
          isoWeek: context.isoWeek,
          scope: context.scope,
          intent: "scope:home-only",
          sources: [],
          outcome: "response",
        });

        return NextResponse.json({
          threadId: context.threadId,
          storeId: context.storeId,
          isoWeek: context.isoWeek,
          scope: context.scope,
          text: finalText,
          sources: [],
        });
      }
      case "availability": {
        if (intent.needsDay && !intent.query.day) {
          const reminder = intent.daypartLabel
            ? `I\'ll assume ${intent.daypartLabel} means ${DAYPART_LABELS[intent.daypartLabel].start}-${DAYPART_LABELS[intent.daypartLabel].end}. `
            : "";

          threadState = await updateAdvisorThreadState(context.threadId, (state) => ({
            ...state,
            pendingClarification: {
              kind: "availability-day",
              originalQuestion: message,
              query: {
                startTime: intent.query.startTime,
                endTime: intent.query.endTime,
                daypartLabel: intent.daypartLabel,
              },
            },
          }));
          context = { ...context, state: threadState };

          const finalText = `${header}
${reminder}Which day would you like to check? Choose 1-7 or type the day name.
${joinSources([], context.isoWeek)}`;

          await recordAdvisorMessage({
            threadId: context.threadId,
            role: "assistant",
            content: { text: finalText, sources: [] },
          });

          logAdvisorTurn({
            threadId: context.threadId,
            storeId: context.storeId,
            isoWeek: context.isoWeek,
            scope: context.scope,
            intent: "availability:clarify-day",
            sources: [],
            outcome: "clarification",
          });

          return NextResponse.json({
            threadId: context.threadId,
            storeId: context.storeId,
            isoWeek: context.isoWeek,
            scope: context.scope,
            text: finalText,
            sources: [],
          });
        }

        const availability = await buildAvailabilityAnswer(context, intent.query, intent.daypartLabel);
        bodyText = availability.body;
        availability.sources.forEach(addSource);

        if (
          availability.daypartUsed &&
          !context.state.notes.daypartReminderShown
        ) {
          threadState = await updateAdvisorThreadState(context.threadId, (state) => ({
            ...state,
            notes: {
              ...state.notes,
              daypartReminderShown: true,
            },
          }));
          context = { ...context, state: threadState };
        }
        break;
      }
      case "hours:employee": {
        const summaries = await fetchHoursSummary({ managerId: context.userId, context });
        const result = scoreEmployeeOptions(summaries, intent.employeeName, threadState.clarifications);

        if (result.options && result.options.length > 0) {
          threadState = await updateAdvisorThreadState(context.threadId, (state) => ({
            ...state,
            pendingClarification: {
              kind: "employee",
              normalizedName: result.normalizedName,
              originalQuestion: message,
              options: result.options,
            },
          }));
          context = { ...context, state: threadState };

          const lines = result.options.map((option, index) => `  ${index + 1}. ${describeChoice(option, context.storeId)}`);
          const finalText = `${header}
I found multiple matches for \"${intent.employeeName}\":
${lines.join("\n")}
Reply with the number or the name to continue.
${joinSources([], context.isoWeek)}`;

          await recordAdvisorMessage({
            threadId: context.threadId,
            role: "assistant",
            content: { text: finalText, sources: [] },
          });

          logAdvisorTurn({
            threadId: context.threadId,
            storeId: context.storeId,
            isoWeek: context.isoWeek,
            scope: context.scope,
            intent: "hours:employee-clarify",
            sources: [],
            outcome: "clarification",
          });

          return NextResponse.json({
            threadId: context.threadId,
            storeId: context.storeId,
            isoWeek: context.isoWeek,
            scope: context.scope,
            text: finalText,
            sources: [],
          });
        }

        const summary = result.summary;
        if (!summary) {
          bodyText = "I couldn\'t find that employee in the current scope.";
          break;
        }

        const scopeNote = formatScopeDetails(context.scope);
        bodyText = `${summary.employeeName} is scheduled ${formatMinutes(summary.totalMinutes)} this week (target ${formatMinutes(summary.targetMinutes)}).`;
        if (scopeNote) {
          bodyText += `\n${scopeNote}`;
        }

        addSource(`v_employee_hours_week (store ${context.storeId}, week ${context.isoWeek}, scope ${context.scope})`);
        break;
      }
      case "hours:under-target":
      case "hours:over-target":
      case "hours:top-workers":
      case "hours:all-employees": {
        const summaries = await fetchHoursSummary({ managerId: context.userId, context });
        addSource(`v_employee_hours_week (store ${context.storeId}, week ${context.isoWeek}, scope ${context.scope})`);

        const enriched = summaries.map((summary) => ({
          summary,
          deficit: summary.targetMinutes - summary.totalMinutes,
          surplus: summary.totalMinutes - summary.targetMinutes,
        }));

        if (intent.type === "hours:under-target") {
          const list = enriched
            .filter((entry) => entry.deficit > 0)
            .sort((a, b) => b.deficit - a.deficit)
            .slice(0, 10);
          bodyText = list.length === 0
            ? "No employees are currently under target."
            : `Under target this week:
${list.map((entry) => `- ${entry.summary.employeeName}: ${formatMinutes(entry.summary.totalMinutes)} / ${formatMinutes(entry.summary.targetMinutes)} (${formatMinutes(entry.deficit)} short)`).join("\n")}`;
        } else if (intent.type === "hours:over-target") {
          const list = enriched
            .filter((entry) => entry.surplus > 0)
            .sort((a, b) => b.surplus - a.surplus)
            .slice(0, 10);
          bodyText = list.length === 0
            ? "No employees are currently over target."
            : `Over target this week:
${list.map((entry) => `- ${entry.summary.employeeName}: ${formatMinutes(entry.summary.totalMinutes)} / ${formatMinutes(entry.summary.targetMinutes)} (${formatMinutes(entry.surplus)} over)`).join("\n")}`;
        } else if (intent.type === "hours:top-workers") {
          const list = enriched
            .filter((entry) => entry.summary.totalMinutes > 0)
            .sort((a, b) => b.summary.totalMinutes - a.summary.totalMinutes)
            .slice(0, 10);
          bodyText = list.length === 0
            ? "No scheduled hours yet for this week."
            : `Top workers this week:
${list.map((entry, index) => `${index + 1}. ${entry.summary.employeeName} - ${formatMinutes(entry.summary.totalMinutes)} (target ${formatMinutes(entry.summary.targetMinutes)})`).join("\n")}`;
        } else if (intent.type === "hours:all-employees") {
          // Show ALL employees with their hours
          const list = enriched.sort((a, b) => b.summary.totalMinutes - a.summary.totalMinutes);
          bodyText = list.length === 0
            ? "No employees found in the current scope."
            : `All employees this week:
${list.map((entry) => `- ${entry.summary.employeeName}: ${formatMinutes(entry.summary.totalMinutes)} / ${formatMinutes(entry.summary.targetMinutes)}${entry.summary.homeStoreId !== context.storeId ? ' (cross-store)' : ''}`).join("\n")}`;
        }

        const scopeNote = formatScopeDetails(context.scope);
        if (scopeNote) {
          bodyText += `\n${scopeNote}`;
        }
        break;
      }
      case "coverage:gaps": {
        const gaps = await fetchUnassignedGaps({ context });
        const filtered = intent.day ? gaps.filter((gap) => gap.day === intent.day) : gaps;
        addSource(`v_day_assignments (store ${context.storeId}, week ${context.isoWeek}, scope HomeOnly)`);

        if (filtered.length === 0) {
          bodyText = `No unassigned coverage gaps${intent.day ? ` on ${intent.day}` : ""}.`;
        } else {
          const lines = filtered.map((gap) => {
            const role = gap.workTypeName ?? "Unassigned role";
            return `- ${gap.day} ${gap.startTime}-${gap.endTime} (${role}) - ${formatMinutes(gap.minutes)}`;
          });
          bodyText = `Unassigned coverage gaps${intent.day ? ` (${intent.day})` : ""}:
${lines.join("\n")}`;
        }
        break;
      }
      case "suggest:cover": {
        const suggestions = await suggestCoverage({ managerId: context.userId, context, day: intent.day });
        addSource(`v_availability (store ${context.storeId}, day ${intent.day ?? "ALL"}, scope ${context.scope})`);
        addSource(`v_day_assignments (store ${context.storeId}, week ${context.isoWeek}, scope ${context.scope})`);
        addSource(`v_employee_hours_week (store ${context.storeId}, week ${context.isoWeek}, scope ${context.scope})`);

        if (suggestions.length === 0) {
          bodyText = "No open gaps to cover.";
        } else {
          const sections = suggestions.slice(0, 3).map((suggestion) => {
            const headerLine = `Gap ${suggestion.gap.day} ${suggestion.gap.startTime}-${suggestion.gap.endTime} (${suggestion.gap.workTypeName ?? "Any role"})`;
            if (suggestion.candidates.length === 0) {
              return `${headerLine}
  - No free candidates found.`;
            }
            const candidates = suggestion.candidates
              .map((candidate) => `  - ${candidate.employeeName} (${candidate.homeStoreId === context.storeId ? "home" : `borrow (${candidate.homeStoreId})`}): ${candidate.reason}`)
              .join("\n");
            return `${headerLine}
${candidates}`;
          });
          bodyText = `Coverage suggestions:
${sections.join("\n")}`;
        }
        break;
      }
      case "assignments:week":
      case "assignments:day": {
        // Fetch assignments from v_day_assignments
        const dayFilter = intent.type === "assignments:day" && intent.day ? intent.day : undefined;
        
        const query = dayFilter
          ? `SELECT day, work_type_name, start_time, end_time, employee_name, duration_minutes
             FROM v_day_assignments
             WHERE schedule_store_id = $1 AND iso_week = $2 AND day = $3::"Weekday"
             ORDER BY start_time`
          : `SELECT day, work_type_name, start_time, end_time, employee_name, duration_minutes
             FROM v_day_assignments
             WHERE schedule_store_id = $1 AND iso_week = $2
             ORDER BY CASE day
               WHEN 'MON' THEN 1
               WHEN 'TUE' THEN 2
               WHEN 'WED' THEN 3
               WHEN 'THU' THEN 4
               WHEN 'FRI' THEN 5
               WHEN 'SAT' THEN 6
               WHEN 'SUN' THEN 7
             END, start_time`;
        
        const params = dayFilter 
          ? [context.storeId, context.isoWeek, dayFilter]
          : [context.storeId, context.isoWeek];
        
        const assignments = await prisma.$queryRawUnsafe<Array<{
          day: string;
          work_type_name: string;
          start_time: Date;
          end_time: Date;
          employee_name: string | null;
          duration_minutes: number;
        }>>(query, ...params);

        addSource(`v_day_assignments (store ${context.storeId}, week ${context.isoWeek})`);

        if (assignments.length === 0) {
          bodyText = dayFilter 
            ? `No shifts scheduled on ${dayFilter}.`
            : "No shifts scheduled this week yet.";
        } else {
          const groupedByDay: Record<string, typeof assignments> = {};
          for (const assignment of assignments) {
            if (!groupedByDay[assignment.day]) {
              groupedByDay[assignment.day] = [];
            }
            groupedByDay[assignment.day].push(assignment);
          }

          const dayLines = Object.entries(groupedByDay).map(([day, dayAssignments]) => {
            const shiftLines = dayAssignments.map(a => {
              const startTime = typeof a.start_time === 'object' && a.start_time 
                ? formatTime(a.start_time) 
                : String(a.start_time);
              const endTime = typeof a.end_time === 'object' && a.end_time
                ? formatTime(a.end_time)
                : String(a.end_time);
              return `  • ${startTime}-${endTime} ${a.work_type_name}${a.employee_name ? `: ${a.employee_name}` : ' (unassigned)'}`;
            }).join('\n');
            return `**${DAY_DISPLAY[day as AvailabilityQuery["day"]]}:**\n${shiftLines}`;
          });

          bodyText = dayFilter
            ? `Shifts scheduled on ${DAY_DISPLAY[dayFilter]}:\n${dayLines.join('\n')}`
            : `Shifts this week:\n\n${dayLines.join('\n\n')}`;
        }
        break;
      }
      case "noop":
      default: {
        bodyText = "I can answer availability, hours, and coverage questions for this store and week.";
        break;
      }
    }

    const responseText = `${header}
${bodyText}`;
    const finalText = `${responseText}
${joinSources(sources, context.isoWeek)}`;

    await recordAdvisorMessage({
      threadId: context.threadId,
      role: "assistant",
      content: { text: finalText, sources },
    });

    logAdvisorTurn({
      threadId: context.threadId,
      storeId: context.storeId,
      isoWeek: context.isoWeek,
      scope: context.scope,
      intent: intent.type,
      sources,
      outcome: "response",
    });

    return NextResponse.json({
      threadId: context.threadId,
      storeId: context.storeId,
      isoWeek: context.isoWeek,
      scope: context.scope,
      text: finalText,
      sources,
    });
  } catch (error) {
    console.error("[COPILOT_ADVISOR] error", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request body", details: error.flatten() }, { status: 400 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Advisor failed" }, { status: 500 });
  }
}
