"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Modal } from "@/components/ui/modal";
import { ErrorModal } from "@/components/ui/error-modal";
import { StoreSelector } from "@/components/ui/store-selector";
import { readableTextColor } from "@/lib/color";

const dayOptions = [
  { key: "MON", label: "Monday" },
  { key: "TUE", label: "Tuesday" },
  { key: "WED", label: "Wednesday" },
  { key: "THU", label: "Thursday" },
  { key: "FRI", label: "Friday" },
  { key: "SAT", label: "Saturday" },
  { key: "SUN", label: "Sunday" },
] as const;

type DayKey = (typeof dayOptions)[number]["key"];

const dayLabelMap: Record<DayKey, string> = dayOptions.reduce(
  (acc, option) => ({ ...acc, [option.key]: option.label }),
  {} as Record<DayKey, string>,
);

const DEFAULT_WEEKLY_MINUTES = 40 * 60;

function formatMinutes(total: number): string {
  const minutes = Math.max(0, Math.round(total));
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h`;
  return `${mins}m`;
}

type Availability = {
  day: DayKey;
  isOff: boolean;
  startTime: string;
  endTime: string;
};

type WorkType = {
  id: string;
  name: string;
  color: string;
};

type ContractType = "FULL_TIME" | "PART_TIME" | "STUDENT" | "FLEXI_JOB";

const CONTRACT_TYPE_LABELS: Record<ContractType, string> = {
  FULL_TIME: "Full time",
  PART_TIME: "Part time",
  STUDENT: "Student",
  FLEXI_JOB: "Flexi job",
};
const CONTRACT_TYPE_ORDER: ContractType[] = ["FULL_TIME", "PART_TIME", "STUDENT", "FLEXI_JOB"];

type EmployeePayload = {
  id?: string;
  name: string;
  email: string;
  phone: string;
  color: string;
  canWorkAcrossStores: boolean;
  weeklyMinutesTarget: number;
  availability: Availability[];
  roleIds: string[];
  storeId: string;
  storeName?: string;
  contractType: ContractType;
};

type Store = {
  id: string;
  name: string;
  address: string;
  city: string;
};

type SetupResponse = {
  stores: Store[];
  store: Store | null;
  employees: EmployeePayload[];
  workTypes: WorkType[];
};

const createDefaultAvailability = (): Availability[] =>
  dayOptions.map((d) => ({ day: d.key, isOff: true, startTime: "09:00", endTime: "17:00" }));

const createEmptyEmployee = (storeId: string = ""): EmployeePayload => ({
  name: "",
  email: "",
  phone: "",
  color: "#1D4ED8",
  canWorkAcrossStores: false,
  weeklyMinutesTarget: DEFAULT_WEEKLY_MINUTES,
  availability: createDefaultAvailability(),
  roleIds: [],
  storeId,
  contractType: "FULL_TIME",
});

const asString = (value: unknown, fallback = ""): string => (typeof value === "string" ? value : fallback);
const asNumber = (value: unknown, fallback: number): number => {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
};
const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
const isAvailabilityArray = (value: unknown): value is Availability[] =>
  Array.isArray(value) &&
  value.every(
    (item) =>
      item &&
      typeof item === "object" &&
      "day" in item &&
      typeof (item as Availability).day === "string" &&
      "isOff" in item &&
      typeof (item as Availability).isOff === "boolean" &&
      "startTime" in item &&
      "endTime" in item
  );
const normalizeContractType = (value: unknown): ContractType | null => {
  if (typeof value !== "string") return null;
  const normalized = value.toUpperCase().replace(/[\s-]+/g, "_");
  return (CONTRACT_TYPE_ORDER as string[]).includes(normalized) ? (normalized as ContractType) : null;
};
const cloneAvailability = (slots: Availability[]): Availability[] =>
  slots.map((slot) => ({ ...slot }));
const hexToRgba = (hex: string, alpha: number): string => {
  if (typeof hex !== "string") return `rgba(4, 173, 191, ${alpha})`;
  let sanitized = hex.replace("#", "");
  if (sanitized.length === 3) {
    sanitized = sanitized
      .split("")
      .map((char) => char + char)
      .join("");
  }
  if (sanitized.length !== 6) {
    return `rgba(4, 173, 191, ${alpha})`;
  }
  const r = parseInt(sanitized.slice(0, 2), 16);
  const g = parseInt(sanitized.slice(2, 4), 16);
  const b = parseInt(sanitized.slice(4, 6), 16);
  if ([r, g, b].some((v) => Number.isNaN(v))) {
    return `rgba(4, 173, 191, ${alpha})`;
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const transformEmployeeResponse = (emp: Record<string, unknown>): EmployeePayload => ({
  id: asString(emp.id, ""),
  name: asString(emp.name, ""),
  email: asString(emp.email, ""),
  phone: asString(emp.phone, ""),
  color: asString(emp.color, "#1D4ED8"),
  canWorkAcrossStores: emp.canWorkAcrossStores === true,
  weeklyMinutesTarget: asNumber(emp.weeklyMinutesTarget, DEFAULT_WEEKLY_MINUTES),
  availability: isAvailabilityArray(emp.availability)
    ? cloneAvailability(emp.availability)
    : createDefaultAvailability(),
  roleIds: [...asStringArray(emp.roleIds)],
  storeId: asString(emp.storeId, ""),
  storeName: typeof emp.storeName === "string" ? emp.storeName : undefined,
  contractType: normalizeContractType(emp.contractType) ?? "FULL_TIME",
});

const TEXT_INPUT_CLASS =
  "rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 shadow-sm focus:border-[#04ADBF] focus:outline-none focus:ring-2 focus:ring-[#04ADBF]/30";
const SELECT_INPUT_CLASS =
  "rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-[#04ADBF] focus:outline-none focus:ring-2 focus:ring-[#04ADBF]/30";
const PAGE_SIZE = 6;

export default function EmployeesPage() {
  const [selectedStoreId, setSelectedStoreId] = useState<string>();
  const [stores, setStores] = useState<Store[]>([]);
  const [currentStore, setCurrentStore] = useState<Store | null>(null);
  const [items, setItems] = useState<EmployeePayload[]>([]);
  const [workTypes, setWorkTypes] = useState<WorkType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<{ title: string; message: string; suggestion?: string } | null>(null);
  const [formWarning, setFormWarning] = useState<string | null>(null);
  const warningRef = useRef<HTMLDivElement | null>(null);
  const [saving, setSaving] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  // modal
  const [open, setOpen] = useState(false);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState<EmployeePayload>(createEmptyEmployee(""));

  const fetchData = (storeId?: string) => {
    let active = true;
    setIsLoading(true);

    const setupUrl = storeId ? `/api/setup?storeId=${storeId}` : "/api/setup";

    // First fetch setup data (stores, current store, work types)
    fetch(setupUrl, { cache: "no-store" })
      .then((r) => r.json())
      .then(async (data: SetupResponse) => {
        if (!active) return;

        setStores(data.stores ?? []);
        setCurrentStore(data.store ?? null);
        setWorkTypes(data.workTypes ?? []);

        // If we have a store, fetch employees separately
        const targetStoreId = storeId || data.store?.id;
        if (targetStoreId) {
          try {
            const employeesResponse = await fetch(`/api/employees-v2?storeId=${targetStoreId}`, { cache: "no-store" });
            if (employeesResponse.ok) {
              const employeesData = await employeesResponse.json();
              const transformedEmployees = employeesData.employees.map(transformEmployeeResponse);
              setItems(transformedEmployees);
              setCurrentPage(1);
            } else {
              // Fallback to setup API employees if new API fails
              setItems((data.employees ?? []).map(transformEmployeeResponse));
              setCurrentPage(1);
            }
          } catch (err) {
            console.error("Error fetching employees:", err);
            // Fallback to setup API employees
            setItems((data.employees ?? []).map(transformEmployeeResponse));
            setCurrentPage(1);
          }
        } else {
          setItems([]);
          setCurrentPage(1);
        }
      })
      .catch((err) => {
        console.error(err);
        setError({
          title: "Loading Error",
          message: "Unable to load employees from the server.",
          suggestion: "Please check your internet connection and try refreshing the page."
        });
      })
      .finally(() => active && setIsLoading(false));

    return () => {
      active = false;
    };
  };

  useEffect(() => {
    return fetchData(selectedStoreId);
  }, [selectedStoreId]);

  useEffect(() => {
    const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
    setCurrentPage((prev) => (prev > pages ? pages : prev));
  }, [items.length]);

  function openCreate() {
    setDraft(createEmptyEmployee(currentStore?.id || ""));
    setEditIndex(null);
    setFormWarning(null);
    setOpen(true);
  }

  function openEdit(index: number) {
    const employee = items[index];
    setDraft({
      ...employee,
      availability: cloneAvailability(employee.availability ?? createDefaultAvailability()),
      roleIds: [...(employee.roleIds ?? [])],
      contractType: employee.contractType ?? "FULL_TIME",
    });
    setEditIndex(index);
    setFormWarning(null);
    setOpen(true);
  }

  function updateDraft(patch: Partial<EmployeePayload>) {
    setDraft((d) => ({ ...d, ...patch }));
  }

  function updateDraftAvailability(dayIndex: number, patch: Partial<Availability>) {
    setDraft((d) => ({
      ...d,
      availability: d.availability.map((a, i) => (i === dayIndex ? { ...a, ...patch } : a)),
    }));
  }

  async function remove(index: number) {
    const employee = items[index];
    if (!employee.id) {
      // If no ID, just remove from local state
      setItems((s) => s.filter((_, i) => i !== index));
      return;
    }

    if (!confirm(`Are you sure you want to delete ${employee.name}?`)) {
      return;
    }

    try {
      setSaving(true);
      const response = await fetch(`/api/employees-v2/${employee.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError({
          title: "Delete Failed",
          message: typeof data.error === "string" ? data.error : "Unable to delete employee",
          suggestion: "The employee might be assigned to shifts. Try removing their assignments first."
        });
        return;
      }

      // Remove from local state immediately
      setItems((s) => s.filter((_, i) => i !== index));
      setError(null);
    } catch (err) {
      console.error(err);
      setError({
        title: "Delete Failed",
        message: "Unable to delete employee due to a network error.",
        suggestion: "Please check your connection and try again."
      });
    } finally {
      setSaving(false);
    }
  }

  async function confirmDraft() {
    setFormWarning(null);

    // validate minimal
    if (!draft.name || !draft.email) {
      setFormWarning("Add both the employee's name and email before saving.");
      requestAnimationFrame(() => warningRef.current?.scrollIntoView({ behavior: "smooth" }));
      return;
    }

    if (workTypes.length > 0 && draft.roleIds.length === 0) {
      setFormWarning("Select at least one work type so the teammate can be scheduled.");
      requestAnimationFrame(() => warningRef.current?.scrollIntoView({ behavior: "smooth" }));
      return;
    }

    if (!currentStore?.id) {
      setFormWarning("Create or choose a store before adding employees.");
      requestAnimationFrame(() => warningRef.current?.scrollIntoView({ behavior: "smooth" }));
      return;
    }

    try {
      setError(null);
      setSaving(true);

      if (editIndex === null) {
        // Create new employee
        const response = await fetch("/api/employees-v2", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            storeId: currentStore.id, 
            employee: {
              ...draft,
              roleIds: draft.roleIds.length > 0 ? draft.roleIds : (workTypes.length > 0 ? [workTypes[0].id] : []),
            }
          }),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          setError({
            title: "Creation Failed",
            message: typeof data.error === "string" ? data.error : "Unable to create employee",
            suggestion: "Please check the employee information and try again."
          });
          return;
        }

        const { employee } = await response.json();

        const newEmployee = transformEmployeeResponse(employee);

        setItems((s) => {
          const next = [...s, newEmployee];
          setCurrentPage(Math.max(1, Math.ceil(next.length / PAGE_SIZE)));
          return next;
        });
      } else {
        // Update existing employee
        const employeeToUpdate = items[editIndex];
        if (!employeeToUpdate.id) {
          setError({
            title: "Update Error",
            message: "Cannot update employee without a valid ID.",
            suggestion: "Please refresh the page and try again."
          });
          return;
        }

        const response = await fetch(`/api/employees-v2/${employeeToUpdate.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            employee: {
              ...draft,
              roleIds: draft.roleIds.length > 0 ? draft.roleIds : (workTypes.length > 0 ? [workTypes[0].id] : []),
            }
          }),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          setError({
            title: "Update Failed",
            message: typeof data.error === "string" ? data.error : "Unable to update employee",
            suggestion: "Please check the employee information and try again."
          });
          return;
        }

        const { employee } = await response.json();

        const updatedEmployee = transformEmployeeResponse(employee);

        setItems((s) => s.map((it, i) => (i === editIndex ? updatedEmployee : it)));
      }

      setOpen(false);
    } catch (err) {
      console.error(err);
      setError({
        title: "Save Failed",
        message: "Unable to save employee due to a network error.",
        suggestion: "Please check your connection and try again."
      });
    } finally {
      setSaving(false);
    }
  }

  const stats = useMemo(() => {
    const total = items.length;
    const crossStore = items.filter((emp) => emp.canWorkAcrossStores).length;
    const visiting = items.filter((emp) => currentStore?.id && emp.storeId !== currentStore.id).length;
    const totalMinutes = items.reduce((sum, emp) => sum + (emp.weeklyMinutesTarget || 0), 0);

    const summary = [
      { label: "Team members", value: total.toString() },
      { label: "Cross-store ready", value: crossStore.toString() },
      { label: "Weekly capacity", value: `${formatMinutes(totalMinutes)} total` },
    ];

    if (visiting > 0) {
      summary.push({ label: "Visiting staff", value: visiting.toString() });
    }

    return summary;
  }, [items, currentStore?.id]);

  const hasMultipleStores = stores.length > 1;
  const totalPages = useMemo(() => Math.max(1, Math.ceil(items.length / PAGE_SIZE)), [items.length]);
  const pagedItems = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return items.slice(start, start + PAGE_SIZE);
  }, [items, currentPage]);

  return (
    <div className="space-y-6">
      <section className="rounded-3xl bg-[#04ADBF] text-white shadow-xl">
        <div className="flex flex-col gap-6 p-6 md:flex-row md:items-end md:justify-between md:p-10">
          <div className="space-y-4">
            <div className="inline-flex rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-white/70">
              Team Directory
            </div>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold leading-tight md:text-4xl">Employees</h1>
              <p className="max-w-xl text-sm text-white/80 md:text-base">
                Keep your stores staffed at a glance. {hasMultipleStores ? "Switch between locations without losing context." : "Track availability and hours in one place."}
              </p>
            </div>
            <div className="flex flex-wrap gap-3 text-xs md:text-sm">
              {stats.length > 0 ? (
                stats.map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-full bg-white/15 px-4 py-1.5 font-medium backdrop-blur-sm transition hover:bg-white/25"
                  >
                    <span className="font-semibold">{stat.value}</span>
                    <span className="ml-2 text-white/70">{stat.label}</span>
                  </div>
                ))
              ) : (
                <div className="rounded-full bg-white/10 px-4 py-1.5 text-white/70">No employees yet</div>
              )}
            </div>
          </div>
          <div className="flex w-full flex-col items-stretch gap-3 md:w-auto md:items-end">
            <StoreSelector
              stores={stores}
              currentStoreId={currentStore?.id}
              onStoreChange={(storeId) => {
                setSelectedStoreId(storeId);
                fetchData(storeId);
              }}
              className="self-center md:self-end"
              disabled={isLoading}
            />
            <button
              type="button"
              onClick={openCreate}
              disabled={saving}
              className="group inline-flex items-center justify-center rounded-full bg-[#F2A30F] px-6 py-2.5 text-sm font-semibold text-slate-900 shadow-lg shadow-black/10 transition hover:bg-[#d9910d] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-white/60 disabled:cursor-not-allowed disabled:opacity-70"
            >
              <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/80 text-[#04ADBF] transition group-hover:bg-white">
                +
              </span>
              Add teammate
            </button>
          </div>
        </div>
      </section>

      {!currentStore && !isLoading && (
        <div className="rounded-2xl border border-[#F2A30F]/40 bg-[#E5EF5B]/30 p-5 text-sm text-slate-800 shadow-sm">
          No store yet. Create your store first in the Store tab to start inviting employees.
        </div>
      )}

      <section className="space-y-4">
        {isLoading ? (
          <div className="rounded-2xl border border-slate-200 bg-white/80 p-10 text-center text-sm text-slate-500 shadow-sm">
            Loading your team...
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-3xl border-2 border-dashed border-[#04ADBF]/40 bg-white/80 p-12 text-center shadow-sm">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#04ADBF]/10 text-[#04ADBF]">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-slate-900">No employees yet</h2>
            <p className="mt-2 text-sm text-slate-600">
              Add your first teammate to start assigning shifts and tracking availability.
            </p>
            <button
              type="button"
              onClick={openCreate}
              disabled={saving}
              className="mt-6 inline-flex items-center justify-center rounded-full bg-[#04ADBF] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#0394a4] focus:outline-none focus:ring-2 focus:ring-[#04ADBF]/40 disabled:cursor-not-allowed disabled:opacity-70"
            >
              Add employee
            </button>
          </div>
        ) : (
          <>
            {totalPages > 1 && (
              <div className="mb-4 flex items-center justify-center gap-4 text-sm text-slate-600">
                <button
                  type="button"
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="rounded-full border border-slate-300 px-3 py-1 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="font-medium">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className="rounded-full border border-slate-300 px-3 py-1 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
              {pagedItems.map((employee, idx) => {
                const key = employee.id ?? `employee-${idx}`;
                const isFromOtherStore = !!currentStore?.id && employee.storeId !== currentStore.id;
                const availableDays = employee.availability?.filter((slot) => !slot.isOff) ?? [];
                const availabilityPreview = availableDays.slice(0, 3);
                const contractLabel = CONTRACT_TYPE_LABELS[employee.contractType] ?? CONTRACT_TYPE_LABELS.FULL_TIME;
              return (
                <article
                  key={key}
                  className={`group flex h-full flex-col justify-between rounded-3xl border bg-white p-5 shadow-sm transition-all hover:-translate-y-1 hover:shadow-2xl ${
                    isFromOtherStore ? "border-[#04ADBF]/40 bg-[#E1F2BD]/60" : "border-slate-200/70"
                  }`}
                >
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className="inline-flex h-3 w-3 flex-shrink-0 rounded-full"
                            style={{ backgroundColor: employee.color }}
                            aria-hidden
                          />
                          <h2 className="text-lg font-semibold text-slate-900">
                            {employee.name || "(no name)"}
                            {isFromOtherStore && <span className="ml-2 text-sm text-[#04ADBF]">?</span>}
                          </h2>
                        </div>
                        <div className="space-y-1 text-sm text-slate-600">
                          {employee.email && <div>{employee.email}</div>}
                          {employee.phone && <div>{employee.phone}</div>}
                          {isFromOtherStore && employee.storeName && (
                            <div className="text-xs font-medium text-[#04ADBF]">From {employee.storeName}</div>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <span className="rounded-full bg-[#04ADBF]/10 px-3 py-1 text-xs font-semibold text-[#04ADBF]">
                          Weekly {formatMinutes(employee.weeklyMinutesTarget)}
                        </span>
                        <span className="rounded-full bg-[#E1F2BD]/80 px-3 py-1 text-xs font-semibold text-[#386641]">
                          {contractLabel}
                        </span>
                        {employee.canWorkAcrossStores && (
                          <span className="rounded-full bg-[#F2A30F]/10 px-3 py-1 text-xs font-semibold text-[#F2A30F]">
                            Cross-store
                          </span>
                        )}
                      </div>
                    </div>
                    {availabilityPreview.length > 0 && (
                      <div className="space-y-2 rounded-2xl bg-slate-50/70 p-3 text-xs text-slate-600">
                        <div className="font-semibold uppercase tracking-wide text-slate-500">Availability</div>
                        <div className="flex flex-wrap gap-2">
                          {availabilityPreview.map((slot) => (
                            <span
                              key={`${key}-${slot.day}`}
                              className="rounded-full bg-white px-3 py-1 font-medium text-slate-700 shadow-sm"
                            >
                              {dayLabelMap[slot.day]} - {slot.startTime}-{slot.endTime}
                            </span>
                          ))}
                          {availableDays.length > 3 && (
                            <span className="rounded-full bg-white px-3 py-1 font-medium text-slate-500 shadow-sm">
                              +{availableDays.length - 3} more
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                    {employee.roleIds && employee.roleIds.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {employee.roleIds.slice(0, 4).map((roleId) => {
                          const role = workTypes.find((w) => w.id === roleId);
                          if (!role) return null;
                          return (
                            <span
                              key={`${key}-role-${roleId}`}
                              className="rounded-full border px-3 py-1 text-xs font-semibold"
                              style={{
                                color: role.color,
                                backgroundColor: hexToRgba(role.color, 0.2),
                                borderColor: hexToRgba(role.color, 0.35),
                              }}
                            >
                              {role.name}
                            </span>
                          );
                        })}
                        {employee.roleIds.length > 4 && (
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                            +{employee.roleIds.length - 4} more
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="mt-6 flex items-center justify-end gap-3">
                    {isFromOtherStore ? (
                      <span className="text-xs font-medium text-slate-500">Read-only</span>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => openEdit(idx)}
                          disabled={saving}
                          className="rounded-full bg-[#E1F2BD]/60 px-4 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-[#E1F2BD] focus:outline-none focus:ring-2 focus:ring-[#04ADBF]/30 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(idx)}
                          disabled={saving}
                          className="rounded-full bg-[#FF8057]/10 px-4 py-1.5 text-xs font-semibold text-[#FF8057] transition hover:bg-[#FF8057]/20 focus:outline-none focus:ring-2 focus:ring-[#FF8057]/40 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {saving ? "..." : "Delete"}
                        </button>
                      </>
                    )}
                  </div>
                </article>
              );
              })}
            </div>
          </>
        )}
      </section>

      <ErrorModal
        open={!!error}
        onClose={() => setError(null)}
        title={error?.title || "Error"}
        message={error?.message || "An unexpected error occurred"}
        suggestion={error?.suggestion}
      />

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editIndex === null ? "Add employee" : "Edit employee"}
        widthClass="max-w-3xl"
      >
        <div className="max-h-[75vh] space-y-6 overflow-y-auto pr-1">
          {formWarning && (
            <div ref={warningRef} className="rounded-2xl border border-[#FF8057]/40 bg-[#FF8057]/10 px-4 py-3 text-sm font-medium text-[#8c2f1a]">
              {formWarning}
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm">
              <span className="font-semibold text-slate-700">Name</span>
              <input
                value={draft.name}
                onChange={(e) => updateDraft({ name: e.target.value })}
                placeholder="Employee name"
                className={TEXT_INPUT_CLASS}
              />
            </label>
            <label className="flex flex-col gap-2 text-sm">
              <span className="font-semibold text-slate-700">Email</span>
              <input
                value={draft.email}
                onChange={(e) => updateDraft({ email: e.target.value })}
                placeholder="work@email.com"
                className={TEXT_INPUT_CLASS}
              />
            </label>
            <label className="flex flex-col gap-2 text-sm">
              <span className="font-semibold text-slate-700">Phone</span>
              <input
                value={draft.phone}
                onChange={(e) => updateDraft({ phone: e.target.value })}
                placeholder="+1 (555) 123-4567"
                className={TEXT_INPUT_CLASS}
              />
            </label>
            <label className="flex flex-col gap-2 text-sm">
              <span className="font-semibold text-slate-700">Schedule color</span>
              <input
                type="color"
                value={draft.color}
                onChange={(e) => updateDraft({ color: e.target.value })}
                className="h-10 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm focus:border-[#F2A30F] focus:outline-none focus:ring-2 focus:ring-[#F2A30F]/40"
              />
            </label>
            <label className="flex flex-col gap-2 text-sm">
              <span className="font-semibold text-slate-700">Contract type</span>
              <select
                value={draft.contractType}
                onChange={(e) => updateDraft({ contractType: e.target.value as ContractType })}
                className={SELECT_INPUT_CLASS}
              >
                {CONTRACT_TYPE_ORDER.map((value) => (
                  <option key={value} value={value}>
                    {CONTRACT_TYPE_LABELS[value]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm">
              <div>
                <div className="font-semibold text-slate-700">Cross-store coverage</div>
                <p className="text-xs text-slate-500">Allow this employee to appear in other store schedules.</p>
              </div>
              <input
                type="checkbox"
                checked={draft.canWorkAcrossStores}
                onChange={(e) => updateDraft({ canWorkAcrossStores: e.target.checked })}
                className="h-5 w-5 rounded border-slate-300 text-[#04ADBF] focus:ring-[#04ADBF]"
              />
            </label>
            <label className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm">
              <div>
                <div className="font-semibold text-slate-700">Weekly hours target</div>
                <p className="text-xs text-slate-500">Used to highlight under and over-coverage.</p>
              </div>
              <input
                type="number"
                min={0}
                step={1}
                value={Math.round((draft.weeklyMinutesTarget ?? DEFAULT_WEEKLY_MINUTES) / 60)}
                onChange={(e) => {
                  const hours = Math.max(0, Number(e.target.value) || 0);
                  updateDraft({ weeklyMinutesTarget: hours * 60 });
                }}
                className="w-20 rounded-xl border border-slate-200 px-3 py-2 text-right text-slate-900 shadow-sm focus:border-[#04ADBF] focus:outline-none focus:ring-2 focus:ring-[#04ADBF]/30"
              />
            </label>
          </div>

          {workTypes.length > 0 && (
            <div className="space-y-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">Work types</h3>
                  <p className="text-xs text-slate-500">Select at least one role so the assistant can match shifts correctly.</p>
                </div>
                <span className="rounded-full bg-[#04ADBF]/10 px-3 py-1 text-xs font-semibold text-[#04ADBF]">
                  {draft.roleIds.length} selected
                </span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {workTypes.map((wt) => {
                  const isSelected = draft.roleIds.includes(wt.id);
                  const chipText = readableTextColor(wt.color);
                  return (
                    <label
                      key={wt.id}
                      className={`flex items-center justify-between gap-3 rounded-2xl border px-3 py-2 text-sm shadow-sm transition ${
                        isSelected ? "border-[#04ADBF] bg-white" : "border-slate-200 bg-white hover:border-[#04ADBF]/40"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold shadow"
                          style={{ backgroundColor: wt.color, color: chipText }}
                        >
                          {wt.name.slice(0, 2).toUpperCase()}
                        </span>
                        <span className="font-medium text-slate-700">{wt.name}</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          if (e.target.checked) {
                            updateDraft({ roleIds: [...draft.roleIds, wt.id] });
                          } else {
                            updateDraft({ roleIds: draft.roleIds.filter((id) => id !== wt.id) });
                          }
                        }}
                        className="h-4 w-4 rounded border-slate-300 text-[#04ADBF] focus:ring-[#04ADBF]"
                      />
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {workTypes.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              No work types defined.
              <Link href="/schedule/work-types" className="ml-1 font-semibold text-[#04ADBF] hover:underline">
                Create work types first
              </Link>
              .
            </div>
          )}

          <div className="space-y-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800">Weekly availability</h3>
              <span className="text-xs text-slate-500">Times are local to the selected store.</span>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {dayOptions.map((dayOption, dIdx) => {
                const slot = draft.availability[dIdx];
                const isOff = slot?.isOff ?? true;
                return (
                  <div
                    key={dayOption.key}
                    className={`flex flex-col gap-3 rounded-2xl border px-3 py-3 shadow-sm transition ${
                      isOff ? "border-dashed border-slate-300 bg-slate-50" : "border-[#04ADBF]/60 bg-white"
                    }`}
                  >
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-semibold text-slate-700">{dayOption.label}</span>
                      <label className="flex items-center gap-2 text-xs text-slate-500">
                        <input
                          type="checkbox"
                          checked={isOff}
                          onChange={(ev) => updateDraftAvailability(dIdx, { isOff: ev.target.checked })}
                          className="h-4 w-4 rounded border-slate-300 text-[#04ADBF] focus:ring-[#04ADBF]"
                        />
                        Off day
                      </label>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-wide text-slate-500">
                      <div className="flex items-center gap-2">
                        <span>Start</span>
                        <input
                          type="time"
                          value={slot?.startTime ?? "09:00"}
                          onChange={(ev) => updateDraftAvailability(dIdx, { startTime: ev.target.value })}
                          disabled={isOff}
                          className="w-28 rounded-xl border border-slate-200 px-2 py-1 text-sm text-slate-900 focus:border-[#04ADBF] focus:outline-none focus:ring-2 focus:ring-[#04ADBF]/30 disabled:cursor-not-allowed disabled:opacity-60"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <span>End</span>
                        <input
                          type="time"
                          value={slot?.endTime ?? "17:00"}
                          onChange={(ev) => updateDraftAvailability(dIdx, { endTime: ev.target.value })}
                          disabled={isOff}
                          className="w-28 rounded-xl border border-slate-200 px-2 py-1 text-sm text-slate-900 focus:border-[#04ADBF] focus:outline-none focus:ring-2 focus:ring-[#04ADBF]/30 disabled:cursor-not-allowed disabled:opacity-60"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={saving}
              className="rounded-full border border-slate-300 bg-white px-5 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmDraft}
              disabled={saving}
              className="rounded-full bg-[#04ADBF] px-6 py-2 text-sm font-semibold text-white shadow-md transition hover:bg-[#0394a4] hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-[#04ADBF]/40 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {saving ? "Saving..." : "Save changes"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
