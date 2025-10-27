import { prisma } from "@/lib/prisma";
import { ensureIsoWeekId } from "@/lib/week";
import { ensureManager } from "@/server/manager";
import type { AdvisorScope, ThreadContext, ThreadState, PendingClarification } from "./types";

interface ResolveThreadOptions {
  threadId?: string;
  storeIdOverride?: string;
  isoWeekOverride?: string;
  scopeOverride?: AdvisorScope;
  extraStoreIdsOverride?: string[];
}

const defaultState = (): ThreadState => ({
  clarifications: {},
  pendingClarification: null,
  notes: {},
});

function parseState(raw: unknown): ThreadState {
  if (!raw || typeof raw !== "object") {
    return defaultState();
  }

  const value = raw as any;
  const clarifications: Record<string, string> =
    typeof value.clarifications === "object" && value.clarifications !== null
      ? Object.entries(value.clarifications).reduce<Record<string, string>>((acc, [key, val]) => {
          if (typeof val === "string") {
            acc[key] = val;
          }
          return acc;
        }, {})
      : {};

  const notes: ThreadState["notes"] = {};
  if (value.notes && typeof value.notes === "object") {
    if ("daypartReminderShown" in value.notes) {
      notes.daypartReminderShown = Boolean(value.notes.daypartReminderShown);
    }
  }

  let pendingClarification: PendingClarification | null = null;
  if (value.pendingClarification && typeof value.pendingClarification === "object") {
    const pending = value.pendingClarification as any;
    if (pending.kind === "employee" && Array.isArray(pending.options) && typeof pending.originalQuestion === "string") {
      const options = pending.options
        .filter((option: any) => option && typeof option.employeeId === "string" && typeof option.employeeName === "string" && typeof option.homeStoreId === "string")
        .map((option: any) => ({
          employeeId: option.employeeId,
          employeeName: option.employeeName,
          homeStoreId: option.homeStoreId,
        }));
      pendingClarification = {
        kind: "employee",
        normalizedName: typeof pending.normalizedName === "string" ? pending.normalizedName : "",
        originalQuestion: pending.originalQuestion,
        options,
      };
    } else if (pending.kind === "availability-day" && typeof pending.originalQuestion === "string") {
      pendingClarification = {
        kind: "availability-day",
        originalQuestion: pending.originalQuestion,
        query: {
          startTime: typeof pending.query?.startTime === "string" ? pending.query.startTime : undefined,
          endTime: typeof pending.query?.endTime === "string" ? pending.query.endTime : undefined,
          daypartLabel:
            typeof pending.query?.daypartLabel === "string" ? pending.query.daypartLabel : undefined,
        },
      };
    }
  }

  return {
    clarifications,
    pendingClarification,
    notes,
  };
}

async function pickInitialContext(managerId: string): Promise<{
  storeId: string;
  isoWeek: string;
}> {
  const stores = await prisma.store.findMany({
    where: { managerId },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });

  if (stores.length === 0) {
    throw new Error("No stores found for this manager.");
  }

  const currentIsoWeek = ensureIsoWeekId(undefined, new Date());

  const scheduleForCurrentWeek = await prisma.schedule.findFirst({
    where: {
      store: { managerId },
      isoWeek: currentIsoWeek,
    },
    orderBy: { createdAt: "desc" },
  });

  if (scheduleForCurrentWeek) {
    return {
      storeId: scheduleForCurrentWeek.storeId,
      isoWeek: currentIsoWeek,
    };
  }

  const latestSchedule = await prisma.schedule.findFirst({
    where: { store: { managerId } },
    orderBy: [{ generatedAt: "desc" }, { createdAt: "desc" }],
  });

  if (latestSchedule) {
    return {
      storeId: latestSchedule.storeId,
      isoWeek: latestSchedule.isoWeek,
    };
  }

  return {
    storeId: stores[0].id,
    isoWeek: currentIsoWeek,
  };
}

export async function resolveAdvisorThread(
  userId: string,
  clerkId: string,
  overrides: ResolveThreadOptions = {},
): Promise<ThreadContext> {
  const manager = await ensureManager({ clerkId });

  let thread = overrides.threadId
    ? await prisma.advisorThread.findFirst({
        where: { id: overrides.threadId, userId: manager.id },
      })
    : null;

  if (!thread) {
    const initial = await pickInitialContext(manager.id);
    thread = await prisma.advisorThread.create({
      data: {
        userId: manager.id,
        storeId: initial.storeId,
        isoWeek: initial.isoWeek,
        scope: "AllManaged",
        extraStoreIds: [],
        context: defaultState(),
      },
    });
  }

  let state = parseState((thread as any).context);

  const nextStoreId = overrides.storeIdOverride ?? thread.storeId;
  const nextIsoWeek = overrides.isoWeekOverride ?? thread.isoWeek;
  const nextScope = overrides.scopeOverride ?? (thread.scope as AdvisorScope);
  const nextExtraStoreIds =
    overrides.extraStoreIdsOverride ??
    (Array.isArray(thread.extraStoreIds) ? (thread.extraStoreIds as string[]) : []);

  if (
    nextStoreId !== thread.storeId ||
    nextIsoWeek !== thread.isoWeek ||
    nextScope !== thread.scope ||
    JSON.stringify(nextExtraStoreIds) !== JSON.stringify(thread.extraStoreIds ?? [])
  ) {
    thread = await prisma.advisorThread.update({
      where: { id: thread.id },
      data: {
        storeId: nextStoreId,
        isoWeek: nextIsoWeek,
        scope: nextScope,
        extraStoreIds: nextExtraStoreIds,
        context: state,
      },
    });
  }

  if (!thread.storeId || !thread.isoWeek) {
    const fallback = await pickInitialContext(manager.id);
    thread = await prisma.advisorThread.update({
      where: { id: thread.id },
      data: {
        storeId: fallback.storeId,
        isoWeek: fallback.isoWeek,
        context: state,
      },
    });
  }

  return {
    threadId: thread.id,
    userId: manager.id,
    storeId: thread.storeId!,
    isoWeek: thread.isoWeek!,
    scope: thread.scope as AdvisorScope,
    extraStoreIds: Array.isArray(thread.extraStoreIds)
      ? (thread.extraStoreIds as string[])
      : [],
    state,
  };
}

export async function updateAdvisorThreadState(
  threadId: string,
  updater: (state: ThreadState) => ThreadState,
): Promise<ThreadState> {
  const thread = await prisma.advisorThread.findUnique({
    where: { id: threadId },
    select: { context: true },
  });

  const current = parseState(thread?.context ?? null);
  const next = updater(current);

  await prisma.advisorThread.update({
    where: { id: threadId },
    data: {
      context: next,
    },
  });

  return next;
}

export async function recordAdvisorMessage(params: {
  threadId: string;
  role: "user" | "assistant";
  content: unknown;
}) {
  const { threadId, role, content } = params;
  await prisma.advisorMessage.create({
    data: {
      threadId,
      role,
      content,
    },
  });
}

export async function loadRecentMessages(threadId: string, limit = 20) {
  return prisma.advisorMessage.findMany({
    where: { threadId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
