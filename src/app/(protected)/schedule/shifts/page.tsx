"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { ErrorModal } from "@/components/ui/error-modal";
import { StoreSelector } from "@/components/ui/store-selector";
import { readableTextColor } from "@/lib/color";

type DayKey = "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";

type Template = {
  id?: string;
  role: string;
  workTypeId?: string;
  days: Record<DayKey, boolean>;
  startTime: string;
  endTime: string;
};

type WorkType = {
  id: string;
  name: string;
  color: string;
};

type Store = {
  id: string;
  name: string;
  address: string;
  city: string;
  openingTime?: string;
  closingTime?: string;
};

type SetupResponse = {
  stores: Store[];
  store: Store | null;
  shiftTemplates: Template[];
  workTypes: WorkType[];
};

const dayOptions: Array<{ key: DayKey; label: string; short: string }> = [
  { key: "MON", label: "Monday", short: "Mon" },
  { key: "TUE", label: "Tuesday", short: "Tue" },
  { key: "WED", label: "Wednesday", short: "Wed" },
  { key: "THU", label: "Thursday", short: "Thu" },
  { key: "FRI", label: "Friday", short: "Fri" },
  { key: "SAT", label: "Saturday", short: "Sat" },
  { key: "SUN", label: "Sunday", short: "Sun" },
] as const;

const createEmptyTemplate = (): Template => ({
  role: "",
  workTypeId: "",
  days: dayOptions.reduce(
    (acc, option) => {
      acc[option.key] = false;
      return acc;
    },
    {} as Record<DayKey, boolean>,
  ),
  startTime: "09:00",
  endTime: "17:00",
});

const TEXT_INPUT_CLASS =
  "rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 shadow-sm focus:border-[#04ADBF] focus:outline-none focus:ring-2 focus:ring-[#04ADBF]/30";
const SELECT_INPUT_CLASS =
  "rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition focus:border-[#04ADBF] focus:outline-none focus:ring-2 focus:ring-[#04ADBF]/30";
const PAGE_SIZE = 6;

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
  if ([r, g, b].some((value) => Number.isNaN(value))) {
    return `rgba(4, 173, 191, ${alpha})`;
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const timeToMinutes = (time: string): number => {
  const [hours, minutes] = time.split(":").map((value) => Number(value));
  return hours * 60 + minutes;
};

const formatMinutes = (total: number): string => {
  const minutes = Math.max(0, Math.round(total));
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h`;
  return `${mins}m`;
};

export default function ShiftsPage() {
  const [selectedStoreId, setSelectedStoreId] = useState<string>();
  const [stores, setStores] = useState<Store[]>([]);
  const [currentStore, setCurrentStore] = useState<Store | null>(null);
  const [workTypes, setWorkTypes] = useState<WorkType[]>([]);
  const [items, setItems] = useState<Template[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<{ title: string; message: string; suggestion?: string } | null>(null);
  const [formWarning, setFormWarning] = useState<string | null>(null);
  const warningRef = useRef<HTMLDivElement | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const [open, setOpen] = useState(false);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState<Template>(createEmptyTemplate());

  const fetchData = (storeId?: string) => {
    let active = true;
    setIsLoading(true);
    const url = storeId ? `/api/setup?storeId=${storeId}` : "/api/setup";

    fetch(url, { cache: "no-store" })
      .then((r) => r.json())
      .then((data: SetupResponse) => {
        if (!active) return;
        setStores(data.stores ?? []);
        setCurrentStore(data.store ?? null);
        setWorkTypes(data.workTypes ?? []);
        setItems(data.shiftTemplates ?? []);
        setCurrentPage(1);
      })
      .catch((err) => {
        console.error(err);
        setError({
          title: "Loading Error",
          message: "Unable to load shift templates from the server.",
          suggestion: "Please check your internet connection and try refreshing the page.",
        });
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

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

  const stats = useMemo(() => {
    const totalTemplates = items.length;
    const totalActiveDays = items.reduce(
      (sum, template) => sum + Object.values(template.days ?? {}).filter(Boolean).length,
      0,
    );
    const avgDurationMinutes =
      items.length > 0
        ? Math.round(
            items.reduce((sum, template) => sum + (timeToMinutes(template.endTime) - timeToMinutes(template.startTime)), 0) /
              items.length,
          )
        : 0;

    return [
      { label: "Shift templates", value: totalTemplates.toString() },
      { label: "Weekly slots", value: totalActiveDays.toString() },
      { label: "Avg duration", value: items.length === 0 ? "—" : formatMinutes(avgDurationMinutes) },
    ];
  }, [items]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(items.length / PAGE_SIZE)), [items.length]);
  const pagedItems = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return items.slice(start, start + PAGE_SIZE);
  }, [items, currentPage]);

  function openCreate() {
    setDraft(createEmptyTemplate());
    setEditIndex(null);
    setFormWarning(null);
    setOpen(true);
  }

  function openEdit(index: number) {
    setDraft({ ...items[index], days: { ...items[index].days } });
    setEditIndex(index);
    setFormWarning(null);
    setOpen(true);
  }

  function updateDraft(patch: Partial<Template>) {
    setDraft((prev) => ({ ...prev, ...patch }));
  }

  function toggleDraftDay(day: DayKey, checked: boolean) {
    setDraft((prev) => ({
      ...prev,
      days: { ...(prev.days ?? {}), [day]: checked },
    }));
  }

  function scrollWarningIntoView(message: string) {
    setFormWarning(message);
    requestAnimationFrame(() => warningRef.current?.scrollIntoView({ behavior: "smooth" }));
  }

  async function confirmDraft() {
    if (!draft.workTypeId) {
      scrollWarningIntoView("Select a work type before saving this shift template.");
      return;
    }
    if (!draft.startTime || !draft.endTime) {
      scrollWarningIntoView("Provide both start and end times for the shift.");
      return;
    }
    if (draft.startTime >= draft.endTime) {
      scrollWarningIntoView("End time must be after the start time.");
      return;
    }

    if (currentStore?.openingTime && currentStore?.closingTime) {
      if (draft.startTime < currentStore.openingTime) {
        scrollWarningIntoView(`Shift cannot start before store opens at ${currentStore.openingTime}.`);
        return;
      }
      if (draft.endTime > currentStore.closingTime) {
        scrollWarningIntoView(`Shift cannot end after store closes at ${currentStore.closingTime}.`);
        return;
      }
    }

    const hasSelectedDays = dayOptions.some((option) => draft.days?.[option.key]);
    if (!hasSelectedDays) {
      scrollWarningIntoView("Pick at least one day for this shift to run.");
      return;
    }

    setFormWarning(null);
    setError(null);

    const originalItems = items;
    const updatedDraft: Template = {
      ...draft,
      role: draft.role || workTypes.find((wt) => wt.id === draft.workTypeId)?.name || "",
    };

    const nextItems =
      editIndex === null
        ? [...items, updatedDraft]
        : items.map((item, index) => (index === editIndex ? updatedDraft : item));

    setItems(nextItems);
    if (editIndex === null) {
      setCurrentPage(Math.max(1, Math.ceil(nextItems.length / PAGE_SIZE)));
    }
    setOpen(false);
    setIsSaving(true);

    try {
      await saveTemplatesOptimistic(nextItems);
    } catch (err) {
      console.error("Save failed:", err);
      setItems(originalItems);
      setError({
        title: "Save Failed",
        message: err instanceof Error ? err.message : "Unable to save template.",
        suggestion: "Please review the shift details and try again.",
      });
      setOpen(true);
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteTemplate(index: number) {
    const template = items[index];

    if (!template.id) {
      const nextItems = items.filter((_, i) => i !== index);
      setItems(nextItems);
      setCurrentPage((prev) => Math.min(prev, Math.max(1, Math.ceil(nextItems.length / PAGE_SIZE))));
      return;
    }

    if (!currentStore?.id) {
      setError({
        title: "Store Required",
        message: "Store not found.",
        suggestion: "Select or create a store before managing shift templates.",
      });
      return;
    }

    const originalItems = items;
    const nextItems = items.filter((_, i) => i !== index);
    setItems(nextItems);
    setError(null);
    setCurrentPage((prev) => Math.min(prev, Math.max(1, Math.ceil(nextItems.length / PAGE_SIZE))));
    setIsSaving(true);

    try {
      const response = await fetch(`/api/shift-templates?id=${template.id}&storeId=${currentStore.id}`, {
        method: "DELETE",
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Failed to delete template.");
      }
    } catch (err) {
      console.error("Delete failed:", err);
      setItems(originalItems);
      setError({
        title: "Delete Failed",
        message: err instanceof Error ? err.message : "Failed to delete template.",
        suggestion: "Please try again. The template might be linked to existing assignments.",
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function saveTemplatesOptimistic(templatesToSave: Template[]) {
    if (!currentStore?.id) {
      throw new Error("Select or create a store before saving shift templates.");
    }

    const templatesForAPI = templatesToSave
      .filter((template) => template.workTypeId)
      .map((template) => ({
        workTypeId: template.workTypeId,
        days: template.days,
        startTime: template.startTime,
        endTime: template.endTime,
      }));

    const response = await fetch("/api/shift-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storeId: currentStore.id, templates: templatesForAPI }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(typeof data.error === "string" ? data.error : "Unable to save templates.");
    }

    const updatedTemplates: Template[] = (data.templates ?? templatesToSave).map((template: Template) => ({
      ...createEmptyTemplate(),
      ...template,
      days: { ...createEmptyTemplate().days, ...template.days },
    }));

    setItems(updatedTemplates);
    setCurrentPage((prev) => Math.min(prev, Math.max(1, Math.ceil(updatedTemplates.length / PAGE_SIZE))));
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl bg-[#04ADBF] text-white shadow-xl">
        <div className="flex flex-col gap-6 p-6 md:flex-row md:items-end md:justify-between md:p-10">
          <div className="space-y-4">
            <div className="inline-flex rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-white/70">
              Shift Template Library
            </div>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold leading-tight md:text-4xl">Shifts</h1>
              <p className="max-w-xl text-sm text-white/80 md:text-base">
                Keep your coverage consistent week after week. Templates feed the assistant and power quick scheduling.
              </p>
            </div>
            <div className="flex flex-wrap gap-3 text-xs md:text-sm">
              {stats.map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-full bg-white/15 px-4 py-1.5 font-medium backdrop-blur-sm transition hover:bg-white/25"
                >
                  <span className="font-semibold">{stat.value}</span>
                  <span className="ml-2 text-white/70">{stat.label}</span>
                </div>
              ))}
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
            />
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center justify-center rounded-full bg-[#F2A30F] px-6 py-2.5 text-sm font-semibold text-slate-900 shadow-lg shadow-black/10 transition hover:bg-[#d9910d] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-white/60"
            >
              <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/80 text-[#04ADBF]">
                +
              </span>
              Add shift template
            </button>
          </div>
        </div>
      </section>

      <ErrorModal
        open={!!error}
        onClose={() => setError(null)}
        title={error?.title || "Error"}
        message={error?.message || "An unexpected error occurred"}
        suggestion={error?.suggestion}
      />

      {isLoading ? (
        <div className="rounded-3xl border border-slate-200 bg-white/80 p-10 text-center text-sm text-slate-500 shadow-sm">
          Loading your shift templates…
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-3xl border-2 border-dashed border-[#04ADBF]/35 bg-white/80 p-12 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#04ADBF]/10 text-[#04ADBF]">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-slate-900">No shift templates yet</h2>
          <p className="mt-2 text-sm text-slate-600">
            Add templates for common schedules to help the assistant and speed up planning.
          </p>
          <button
            type="button"
            onClick={openCreate}
            className="mt-6 inline-flex items-center justify-center rounded-full bg-[#04ADBF] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#0394a4] focus:outline-none focus:ring-2 focus:ring-[#04ADBF]/40"
          >
            Create a shift template
          </button>
        </div>
      ) : (
        <>
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 text-sm text-slate-600">
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
            {pagedItems.map((template, idx) => {
              const workType = workTypes.find((wt) => wt.id === template.workTypeId);
              const color = workType?.color ?? "#04ADBF";
              const durationMinutes = timeToMinutes(template.endTime) - timeToMinutes(template.startTime);
              const activeDays = dayOptions.filter((option) => template.days?.[option.key]);

              return (
                <article
                  key={`${template.id ?? "template"}-${idx}`}
                  className="group flex h-full flex-col justify-between rounded-3xl border border-slate-200/70 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-2xl"
                >
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                          <span
                            className="inline-flex h-3 w-3 flex-shrink-0 rounded-full"
                            style={{ backgroundColor: color }}
                            aria-hidden
                          />
                          {workType?.name || template.role || "Unnamed shift"}
                        </div>
                        <p className="text-sm text-slate-500">
                          {template.startTime} – {template.endTime}
                          {durationMinutes > 0 && (
                            <span className="ml-2 text-xs text-slate-400">({formatMinutes(durationMinutes)})</span>
                          )}
                        </p>
                      </div>
                      <span
                        className="rounded-full border px-3 py-1 text-xs font-semibold shadow-sm"
                        style={{
                          color: readableTextColor(color),
                          backgroundColor: hexToRgba(color, 0.2),
                          borderColor: hexToRgba(color, 0.35),
                        }}
                      >
                        {workType?.name ? `${workType.name} role` : "Template"}
                      </span>
                    </div>

                    <div className="rounded-2xl border border-slate-200/70 bg-slate-50/70 p-4 text-xs text-slate-600">
                      <p className="font-semibold uppercase tracking-[0.2em] text-slate-500">Assigned days</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {activeDays.length > 0 ? (
                          activeDays.map((option) => (
                            <span
                              key={option.key}
                              className="rounded-full border px-3 py-1 text-xs font-semibold shadow-sm"
                              style={{
                                color: color,
                                backgroundColor: hexToRgba(color, 0.15),
                                borderColor: hexToRgba(color, 0.3),
                              }}
                            >
                              {option.short}
                            </span>
                          ))
                        ) : (
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500">
                            No days selected
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 flex items-center justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => openEdit((currentPage - 1) * PAGE_SIZE + idx)}
                      className="rounded-full bg-[#E1F2BD]/70 px-4 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-[#E1F2BD] focus:outline-none focus:ring-2 focus:ring-[#04ADBF]/30"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteTemplate((currentPage - 1) * PAGE_SIZE + idx)}
                      className="rounded-full bg-[#FF8057]/10 px-4 py-1.5 text-xs font-semibold text-[#FF8057] transition hover:bg-[#FF8057]/20 focus:outline-none focus:ring-2 focus:ring-[#FF8057]/40"
                    >
                      Delete
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editIndex === null ? "Add shift template" : "Edit shift template"}
        widthClass="max-w-3xl"
      >
        <div className="max-h-[75vh] space-y-6 overflow-y-auto pr-1">
          {formWarning && (
            <div
              ref={warningRef}
              className="rounded-2xl border border-[#FF8057]/35 bg-[#FF8057]/10 px-4 py-3 text-sm font-medium text-[#8c2f1a]"
            >
              {formWarning}
            </div>
          )}

          <div className="rounded-3xl border border-[#04ADBF]/30 bg-white px-5 py-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-[#04ADBF]">Shift basics</p>
                <p className="mt-1 text-sm text-slate-600">Choose the role and time window this template should follow.</p>
              </div>
              {currentStore?.openingTime && currentStore?.closingTime && (
                <span className="rounded-full border border-[#E1F2BD]/70 bg-[#E1F2BD]/40 px-3 py-1 text-[11px] font-semibold text-slate-700">
                  Store hours {currentStore.openingTime} – {currentStore.closingTime}
                </span>
              )}
            </div>
            <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-[1.3fr_1fr_1fr]">
              <select
                value={draft.workTypeId || ""}
                onChange={(event) => {
                  const workType = workTypes.find((wt) => wt.id === event.target.value);
                  updateDraft({
                    workTypeId: event.target.value,
                    role: workType?.name || draft.role,
                  });
                }}
                className={SELECT_INPUT_CLASS}
              >
                <option value="">Select work type…</option>
                {workTypes.map((workType) => (
                  <option key={workType.id} value={workType.id}>
                    {workType.name}
                  </option>
                ))}
              </select>
              <input
                type="time"
                value={draft.startTime}
                onChange={(event) => updateDraft({ startTime: event.target.value })}
                className={SELECT_INPUT_CLASS}
              />
              <input
                type="time"
                value={draft.endTime}
                onChange={(event) => updateDraft({ endTime: event.target.value })}
                className={SELECT_INPUT_CLASS}
              />
            </div>
            <label className="mt-4 block text-sm">
              <span className="font-semibold text-slate-700">Optional label</span>
              <input
                value={draft.role}
                onChange={(event) => updateDraft({ role: event.target.value })}
                placeholder="e.g. Morning floor coverage"
                className={`${TEXT_INPUT_CLASS} mt-1`}
              />
            </label>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-slate-50/70 px-5 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500">Weekly coverage</p>
            <p className="mt-1 text-sm text-slate-600">Toggle the days this shift repeats.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {dayOptions.map((option) => {
                const active = Boolean(draft.days?.[option.key]);
                return (
                  <label
                    key={option.key}
                    className={`group flex cursor-pointer items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold transition ${
                      active
                        ? "border-[#04ADBF] bg-[#04ADBF]/10 text-[#04ADBF]"
                        : "border-slate-200 text-slate-500 hover:border-[#04ADBF]/40 hover:text-[#04ADBF]"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={(event) => toggleDraftDay(option.key, event.target.checked)}
                      className="sr-only"
                    />
                    <span>{option.short}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full border border-slate-200 bg-white px-5 py-2 text-sm font-semibold text-slate-600 transition hover:border-[#04ADBF]/40 hover:text-[#04ADBF]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmDraft}
              disabled={isSaving}
              className="rounded-full bg-gradient-to-r from-[#04ADBF] via-[#F2A30F] to-[#E1F2BD] px-6 py-2 text-sm font-semibold text-slate-900 shadow-sm transition hover:scale-[1.01] focus:outline-none focus:ring-2 focus:ring-[#04ADBF]/40 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? "Saving…" : "Save shift"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
