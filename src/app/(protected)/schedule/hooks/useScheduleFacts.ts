"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { Assignment } from "../types";
import type { ClientAssignmentInput, ScheduleFacts } from "@/types";

interface UseScheduleFactsOptions {
  storeId?: string | null;
  weekId?: string | null;
  enabled?: boolean;
  debounceMs?: number;
}

interface UseScheduleFactsResult {
  facts: ScheduleFacts | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function serializeAssignments(assignments: Assignment[]): ClientAssignmentInput[] {
  return assignments.map((assignment) => ({
    id: assignment.id,
    day: assignment.day,
    startTime: assignment.startTime,
    endTime: assignment.endTime,
    workType: {
      id: assignment.workType.id,
      name: assignment.workType.name,
      color: assignment.workType.color,
    },
    employee: assignment.employee
      ? {
          id: assignment.employee.id,
          name: assignment.employee.name,
          storeName: assignment.employee.storeName,
        }
      : null,
    locked: assignment.locked,
    sourceTemplate: assignment.sourceTemplate
      ? {
          id: assignment.sourceTemplate.id,
          workTypeId: assignment.sourceTemplate.workTypeId,
        }
      : null,
  }));
}

export function useScheduleFacts(
  assignments: Assignment[],
  { storeId, weekId, enabled = true, debounceMs = 250 }: UseScheduleFactsOptions = {},
): UseScheduleFactsResult {
  const [facts, setFacts] = useState<ScheduleFacts | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingRequest = useRef<AbortController | null>(null);

  const payloadAssignments = useMemo(() => serializeAssignments(assignments), [assignments]);
  const assignmentsSignature = useMemo(() => JSON.stringify(payloadAssignments), [payloadAssignments]);

  const fetchFacts = async (signal?: AbortSignal) => {
    if (!enabled || !storeId) {
      setFacts(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/schedule/facts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId,
          weekId,
          assignments: payloadAssignments,
        }),
        signal,
        cache: "no-store",
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Failed with status ${response.status}`);
      }

      const data = (await response.json()) as { facts: ScheduleFacts };
      setFacts(data.facts);
    } catch (err) {
      if (signal?.aborted) {
        return;
      }
      console.error("Failed to load schedule facts", err);
      setError(err instanceof Error ? err.message : "Failed to load schedule facts");
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    if (!enabled || !storeId) {
      setFacts(null);
      return;
    }

    const controller = new AbortController();
    pendingRequest.current?.abort();
    pendingRequest.current = controller;

    const timer = window.setTimeout(() => {
      void fetchFacts(controller.signal);
    }, debounceMs);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, weekId, assignmentsSignature, enabled, debounceMs]);

  const refresh = async () => {
    pendingRequest.current?.abort();
    const controller = new AbortController();
    pendingRequest.current = controller;
    await fetchFacts(controller.signal);
  };

  return {
    facts,
    loading,
    error,
    refresh,
  };
}
