"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { ErrorModal } from "@/components/ui/error-modal";
import { StoreSelector } from "@/components/ui/store-selector";
import { readableTextColor } from "@/lib/color";

type WorkType = {
  id?: string;
  name: string;
  color: string;
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
  workTypes: WorkType[];
};

const createEmptyWorkType = (): WorkType => ({
  name: "",
  color: "#1D4ED8",
});

const TEXT_INPUT_CLASS =
  "rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 shadow-sm focus:border-[#04ADBF] focus:outline-none focus:ring-2 focus:ring-[#04ADBF]/30";
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
  if ([r, g, b].some((v) => Number.isNaN(v))) {
    return `rgba(4, 173, 191, ${alpha})`;
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

export default function WorkTypesPage() {
  const [selectedStoreId, setSelectedStoreId] = useState<string>();
  const [stores, setStores] = useState<Store[]>([]);
  const [currentStore, setCurrentStore] = useState<Store | null>(null);
  const [items, setItems] = useState<WorkType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<{ title: string; message: string; suggestion?: string } | null>(null);
  const [formWarning, setFormWarning] = useState<string | null>(null);
  const warningRef = useRef<HTMLDivElement | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const [open, setOpen] = useState(false);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState<WorkType>(createEmptyWorkType());

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
        setItems(data.workTypes ?? []);
        setCurrentPage(1);
      })
      .catch((err) => {
        console.error(err);
        setError({
          title: "Loading Error",
          message: "Unable to load work types from the server.",
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

  const stats = useMemo(() => {
    const total = items.length;
    const uniqueColors = new Set(items.map((it) => it.color.toLowerCase())).size;
    return [
      { label: "Defined roles", value: total.toString() },
      { label: "Unique colors", value: uniqueColors.toString() },
      { label: "Active store", value: currentStore?.name ?? "All stores" },
    ];
  }, [items, currentStore?.name]);
  const totalPages = useMemo(() => Math.max(1, Math.ceil(items.length / PAGE_SIZE)), [items.length]);
  const pagedItems = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return items.slice(start, start + PAGE_SIZE);
  }, [items, currentPage]);

  useEffect(() => {
    const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
    setCurrentPage((prev) => (prev > pages ? pages : prev));
  }, [items.length]);

  function openCreate() {
    setDraft(createEmptyWorkType());
    setEditIndex(null);
    setFormWarning(null);
    setOpen(true);
  }

  function openEdit(index: number) {
    setDraft({ ...items[index] });
    setEditIndex(index);
    setFormWarning(null);
    setOpen(true);
  }

  function updateDraft(patch: Partial<WorkType>) {
    setDraft((d) => ({ ...d, ...patch }));
  }

  async function deleteWorkType(index: number) {
    const nextItems = items.filter((_, i) => i !== index);
    setItems(nextItems);
    await saveWorkTypes(nextItems);
  }

  function scrollWarningIntoView(message: string) {
    setFormWarning(message);
    requestAnimationFrame(() => warningRef.current?.scrollIntoView({ behavior: "smooth" }));
  }

  async function confirmDraft() {
    const trimmedName = draft.name.trim();
    if (!trimmedName) {
      scrollWarningIntoView("Give this work type a clear name before saving.");
      return;
    }

    const duplicateNames = items
      .filter((_, i) => i !== editIndex)
      .map((item) => item.name.toLowerCase().trim());
    if (duplicateNames.includes(trimmedName.toLowerCase())) {
      scrollWarningIntoView("You already have a work type with this name. Try something distinctive.");
      return;
    }

    const nextItems =
      editIndex === null
        ? [...items, { ...draft, name: trimmedName }]
        : items.map((it, i) => (i === editIndex ? { ...draft, name: trimmedName } : it));

    setItems(nextItems);
    if (editIndex === null) {
      setCurrentPage(Math.max(1, Math.ceil(nextItems.length / PAGE_SIZE)));
    }
    setOpen(false);
    setFormWarning(null);
    await saveWorkTypes(nextItems);
  }

  async function saveWorkTypes(workTypesToSave: WorkType[], forceDelete = false) {
    if (!currentStore?.id) {
      setError({
        title: "Store Required",
        message: "You need to create a store before adding work types.",
        suggestion: "Go to the Store tab and create your store first.",
      });
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/work-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId: currentStore.id,
          forceDelete,
          workTypes: workTypesToSave.map((wt) => ({
            id: wt.id,
            name: wt.name.trim(),
            color: wt.color,
          })),
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (response.status === 409 && data?.needsConfirmation) {
        const details = data.details || {};
        const confirmMessage =
          `${data.error}\n\n` +
          "Delete the work type and remove all related assignments?\n\n" +
          `• ${details.affectedShiftTemplates || 0} shift template(s)\n` +
          `• ${details.affectedAssignments || 0} assignment(s)\n\n` +
          "This action cannot be undone.";

        if (confirm(confirmMessage)) {
          await saveWorkTypes(workTypesToSave, true);
        } else {
          fetchData(currentStore.id);
        }
        return;
      }

      if (!response.ok) {
        setError({
          title: "Save Failed",
          message: typeof data?.error === "string" ? data.error : "Unable to save work types.",
          suggestion: "Please review the work type details and try again.",
        });
        return;
      }

      setItems(data.workTypes ?? workTypesToSave);
    } catch (err) {
      console.error(err);
      setError({
        title: "Save Failed",
        message: "Unable to save work types due to a network error.",
        suggestion: "Please check your connection and try again.",
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl bg-[#04ADBF] text-white shadow-xl">
        <div className="flex flex-col gap-6 p-6 md:flex-row md:items-end md:justify-between md:p-10">
          <div className="space-y-4">
            <div className="inline-flex rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-white/70">
              Role Palette
            </div>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold leading-tight md:text-4xl">Work Types</h1>
              <p className="max-w-xl text-sm text-white/80 md:text-base">
                Create the roles your assistants rely on. Each work type unlocks smarter scheduling and richer
                assistant insights.
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
              Add work type
            </button>
          </div>
        </div>
      </section>

      {isLoading ? (
        <div className="rounded-3xl border border-slate-200 bg-white/80 p-10 text-center text-sm text-slate-500 shadow-sm">
          Loading your roles…
        </div>
      ) : (
        <>
          <ErrorModal
            open={!!error}
            onClose={() => setError(null)}
            title={error?.title || "Error"}
            message={error?.message || "An unexpected error occurred"}
            suggestion={error?.suggestion}
          />

          {!currentStore && (
            <div className="rounded-2xl border border-[#F2A30F]/40 bg-[#E5EF5B]/30 p-5 text-sm text-slate-800 shadow-sm">
              No store yet. Create your store first in the Store tab to start building roles.
            </div>
          )}

          {items.length === 0 ? (
            <div className="rounded-3xl border-2 border-dashed border-[#04ADBF]/35 bg-white/80 p-12 text-center shadow-sm">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#04ADBF]/10 text-[#04ADBF]">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-slate-900">No work types yet</h2>
              <p className="mt-2 text-sm text-slate-600">
                Add roles like “Cashier”, “Manager”, or “Barista” so the assistant knows who can do what.
              </p>
              <button
                type="button"
                onClick={openCreate}
                className="mt-6 inline-flex items-center justify-center rounded-full bg-[#04ADBF] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#0394a4] focus:outline-none focus:ring-2 focus:ring-[#04ADBF]/40"
              >
                Create a work type
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
                {pagedItems.map((workType, idx) => {
                  const textColor = readableTextColor(workType.color);
                  const tintedBackground = hexToRgba(workType.color, 0.18);
                  const tintedBorder = hexToRgba(workType.color, 0.35);

                  return (
                  <article
                    key={idx}
                    className="group flex h-full flex-col justify-between rounded-3xl border border-slate-200/70 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-2xl"
                  >
                    <div className="space-y-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                            <span
                              className="inline-flex h-3 w-3 flex-shrink-0 rounded-full"
                              style={{ backgroundColor: workType.color }}
                              aria-hidden
                            />
                            {workType.name}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 uppercase tracking-wide text-slate-600">
                              {workType.color.toUpperCase()}
                            </span>
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-500">Role #{idx + 1}</span>
                          </div>
                        </div>
                        <span
                          className="rounded-full border px-3 py-1 text-xs font-semibold shadow-sm"
                          style={{
                            color: textColor,
                            backgroundColor: tintedBackground,
                            borderColor: tintedBorder,
                          }}
                        >
                          Palette preview
                        </span>
                      </div>

                      <div
                        className="rounded-2xl border px-4 py-3 text-sm shadow-sm transition"
                        style={{ borderColor: tintedBorder, backgroundColor: hexToRgba(workType.color, 0.08) }}
                      >
                        <p className="text-slate-600">
                          Use this color to identify shifts, availability, and assignments tied to <strong className="text-slate-800">{workType.name}</strong>.
                        </p>
                      </div>
                    </div>

                    <div className="mt-6 flex items-center justify-end gap-3">
                      <button
                        type="button"
                        onClick={() => openEdit(idx)}
                        className="rounded-full bg-[#E1F2BD]/70 px-4 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-[#E1F2BD] focus:outline-none focus:ring-2 focus:ring-[#04ADBF]/30"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteWorkType(idx)}
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
        </>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editIndex === null ? "Add work type" : "Edit work type"}
        widthClass="max-w-md"
      >
        <div className="max-h-[70vh] space-y-6 overflow-y-auto pr-1">
          {formWarning && (
            <div
              ref={warningRef}
              className="rounded-2xl border border-[#FF8057]/35 bg-[#FF8057]/10 px-4 py-3 text-sm font-medium text-[#8c2f1a]"
            >
              {formWarning}
            </div>
          )}

          <div className="space-y-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <label className="flex flex-col gap-2 text-sm">
              <span className="font-semibold text-slate-700">Work type name</span>
              <input
                value={draft.name}
                onChange={(e) => updateDraft({ name: e.target.value })}
                placeholder="e.g. Sales Associate"
                className={TEXT_INPUT_CLASS}
              />
            </label>

            <label className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm shadow-sm">
              <div>
                <span className="font-semibold text-slate-700">Color swatch</span>
                <p className="text-xs text-slate-500">Pick a shade that keeps schedules easy to scan.</p>
              </div>
              <input
                type="color"
                value={draft.color}
                onChange={(e) => updateDraft({ color: e.target.value })}
                className="h-10 w-12 cursor-pointer rounded border border-slate-300 bg-white"
              />
            </label>

            <div
              className="rounded-2xl border px-4 py-3 text-xs text-slate-600"
              style={{ borderColor: hexToRgba(draft.color, 0.35), backgroundColor: hexToRgba(draft.color, 0.12) }}
            >
              <p>
                Preview:{" "}
                <span
                  className="inline-flex rounded-full border px-3 py-1 text-xs font-semibold"
                  style={{
                    color: draft.color,
                    backgroundColor: hexToRgba(draft.color, 0.2),
                    borderColor: hexToRgba(draft.color, 0.35),
                  }}
                >
                  {draft.name || "Work type"}
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full border border-slate-300 bg-white px-5 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmDraft}
              disabled={isSaving}
              className="rounded-full bg-[#04ADBF] px-6 py-2 text-sm font-semibold text-white shadow-md transition hover:bg-[#0394a4] hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-[#04ADBF]/40 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSaving ? "Saving…" : editIndex === null ? "Add work type" : "Save changes"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
