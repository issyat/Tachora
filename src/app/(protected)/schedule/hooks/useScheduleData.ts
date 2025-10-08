import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  Assignment,
  Employee,
  ScheduleDataPayload,
  ScheduleSummary,
  StoreSummary,
  Template,
} from "../types";

interface UseScheduleDataOptions {
  initialStoreId?: string;
}

interface UseScheduleDataResult {
  stores: StoreSummary[];
  currentStore: StoreSummary | null;
  templates: Template[];
  employees: Employee[];
  assignments: Assignment[];
  schedule: ScheduleSummary | null;
  loading: boolean;
  error: string | null;
  selectStore: (storeId: string) => void;
  refresh: (storeId?: string) => Promise<void>;
  setAssignments: React.Dispatch<React.SetStateAction<Assignment[]>>;
}

async function fetchJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, { cache: "no-store", ...init });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with status ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export function useScheduleData(options: UseScheduleDataOptions = {}): UseScheduleDataResult {
  const [stores, setStores] = useState<StoreSummary[]>([]);
  const [currentStore, setCurrentStore] = useState<StoreSummary | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [schedule, setSchedule] = useState<ScheduleSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const selectedStoreRef = useRef<string | null>(options.initialStoreId ?? null);

  const performFetch = useCallback(async (storeId?: string) => {
    setLoading(true);
    setError(null);

    try {
      const setupUrl = storeId ? `/api/setup?storeId=${storeId}` : "/api/setup";
      const setupData = await fetchJson<ScheduleDataPayload>(setupUrl);

      const nextStore = setupData.store ?? null;
      selectedStoreRef.current = nextStore?.id ?? null;

      setStores(setupData.stores ?? []);
      setCurrentStore(nextStore);
      setTemplates(setupData.shiftTemplates ?? []);
      setEmployees(setupData.employees ?? []);

      if (nextStore?.id) {
        const assignmentsUrl = `/api/schedule/assignments?storeId=${nextStore.id}`;
        const assignmentsData = await fetchJson<{ assignments: Assignment[]; schedule: ScheduleSummary | null }>(assignmentsUrl);
        setAssignments(assignmentsData.assignments ?? []);
        setSchedule(assignmentsData.schedule ?? null);
      } else {
        setAssignments([]);
        setSchedule(null);
      }
    } catch (err) {
      console.error("Failed to load schedule data", err);
      setError(err instanceof Error ? err.message : "Failed to load schedule data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void performFetch(selectedStoreRef.current ?? undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectStore = useCallback(
    (storeId: string) => {
      selectedStoreRef.current = storeId;
      void performFetch(storeId);
    },
    [performFetch],
  );

  const refresh = useCallback(
    async (storeId?: string) => {
      await performFetch(storeId ?? selectedStoreRef.current ?? undefined);
    },
    [performFetch],
  );

  return useMemo(
    () => ({
      stores,
      currentStore,
      templates,
      employees,
      assignments,
      schedule,
      loading,
      error,
      selectStore,
      refresh,
      setAssignments,
    }),
    [assignments, currentStore, employees, error, loading, refresh, schedule, selectStore, stores, templates],
  );
}
