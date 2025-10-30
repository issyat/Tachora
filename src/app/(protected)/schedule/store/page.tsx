"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { ErrorModal } from "@/components/ui/error-modal";

type Store = {
  id: string;
  name: string;
  address?: string;
  city: string;
  country: string;
  openingTime?: string;
  closingTime?: string;
};

type StoresResponse = {
  stores?: Store[];
};

type CitiesResponse = {
  cities?: string[];
};

type ErrorState =
  | {
      title: string;
      message: string;
      suggestion?: string;
    }
  | null;

type Mode = "create" | "edit";

const TEXT_INPUT_CLASS =
  "rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 shadow-sm focus:border-[#04ADBF] focus:outline-none focus:ring-2 focus:ring-[#04ADBF]/30";
const SELECT_INPUT_CLASS =
  "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition focus:border-[#04ADBF] focus:outline-none focus:ring-2 focus:ring-[#04ADBF]/30";
const PAGE_SIZE = 6;
const ACCENT_COLORS = ["#04ADBF", "#F2A30F", "#FF8057", "#04ADBF", "#E1F2BD", "#04ADBF"];

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

const safeJson = async <T,>(response: Response): Promise<T> => {
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  const text = await response.text();
  if (!text) return {} as T;
  return JSON.parse(text) as T;
};

const formatTime = (time?: string) => (time && time.trim().length > 0 ? time : "--");

const diffMinutes = (start?: string, end?: string) => {
  if (!start || !end) return 0;
  const [sH, sM] = start.split(":").map(Number);
  const [eH, eM] = end.split(":").map(Number);
  return eH * 60 + eM - (sH * 60 + sM);
};

const formatDuration = (minutes: number) => {
  if (minutes <= 0) return "--";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours && mins) return `${hours}h ${mins}m`;
  if (hours) return `${hours}h`;
  return `${mins}m`;
};

export default function StorePage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<ErrorState>(null);

  const [mode, setMode] = useState<Mode>("create");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [storeToDelete, setStoreToDelete] = useState<Store | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [openingTime, setOpeningTime] = useState("09:00");
  const [closingTime, setClosingTime] = useState("22:00");

  const [formWarning, setFormWarning] = useState<string | null>(null);
  const warningRef = useRef<HTMLDivElement | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const baseCity = stores[0]?.city ?? "";
  const isCityLocked = Boolean(baseCity) && mode === "create";

  useEffect(() => {
    let active = true;
    setIsLoading(true);

    Promise.all([
      fetch("/api/stores", { cache: "no-store" }).then((response) => safeJson<StoresResponse>(response)),
      fetch("/api/be/cities", { cache: "force-cache" }).then((response) => safeJson<CitiesResponse>(response)),
    ])
      .then(([storesResult, citiesResult]) => {
        if (!active) return;
        setStores(storesResult.stores ?? []);
        setCities(citiesResult.cities ?? []);
        setCity(storesResult.stores?.[0]?.city ?? "");
        setCurrentPage(1);
      })
      .catch((err) => {
        console.error(err);
        setError({
          title: "Loading failed",
          message: "We could not load your stores.",
          suggestion: "Please check your connection and try refreshing the page.",
        });
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const pages = Math.max(1, Math.ceil(stores.length / PAGE_SIZE));
    setCurrentPage((prev) => (prev > pages ? pages : prev));
  }, [stores.length]);

  const stats = useMemo(() => {
    const totalStores = stores.length;
    const totalMinutes = stores.reduce((sum, store) => sum + diffMinutes(store.openingTime, store.closingTime), 0);
    const avgMinutes = totalStores > 0 ? Math.round(totalMinutes / totalStores) : 0;
    const cityCount = new Set(stores.map((store) => store.city)).size;

    return [
      { label: "Stores", value: totalStores.toString() },
      { label: "Cities covered", value: cityCount.toString() },
      { label: "Avg opening hours", value: totalStores === 0 ? "--" : formatDuration(avgMinutes) },
    ];
  }, [stores]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(stores.length / PAGE_SIZE)), [stores.length]);
  const pagedStores = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return stores.slice(start, start + PAGE_SIZE);
  }, [stores, currentPage]);

  function resetForm() {
    setName("");
    setAddress("");
    setCity(baseCity || "");
    setOpeningTime("09:00");
    setClosingTime("22:00");
    setFormWarning(null);
  }

  function openCreateModal() {
    setMode("create");
    setEditingId(null);
    resetForm();
    setOpen(true);
  }

  function openEditModal(store: Store) {
    setMode("edit");
    setEditingId(store.id);
    setName(store.name);
    setAddress(store.address ?? "");
    setCity(store.city);
    setOpeningTime(store.openingTime ?? "09:00");
    setClosingTime(store.closingTime ?? "22:00");
    setFormWarning(null);
    setOpen(true);
  }

  function scrollWarningIntoView(message: string) {
    setFormWarning(message);
    requestAnimationFrame(() => warningRef.current?.scrollIntoView({ behavior: "smooth" }));
  }

  async function handleSave() {
    if (!name.trim()) {
      scrollWarningIntoView("Give your store a name before saving.");
      return;
    }

    if (!city.trim()) {
      scrollWarningIntoView("Select the city where this store operates.");
      return;
    }

    if (openingTime >= closingTime) {
      scrollWarningIntoView("Closing time must be after opening time.");
      return;
    }

    setError(null);

    try {
      if (mode === "create") {
        const response = await fetch("/api/stores", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim(), address, city, openingTime, closingTime }),
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          setError({
            title: "Create failed",
            message: typeof data.error === "string" ? data.error : "Unable to create store.",
            suggestion: "Please review the details and try again.",
          });
          return;
        }

        const nextStores = [...stores, data.store as Store];
        setStores(nextStores);
        setCurrentPage(Math.max(1, Math.ceil(nextStores.length / PAGE_SIZE)));
        setOpen(false);
      } else if (editingId) {
        const response = await fetch("/api/store", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ storeId: editingId, name: name.trim(), address, openingTime, closingTime }),
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          setError({
            title: "Update failed",
            message: typeof data.error === "string" ? data.error : "Unable to update store.",
            suggestion: "Please review the details and try again.",
          });
          return;
        }

        setStores((prev) => prev.map((store) => (store.id === editingId ? (data.store as Store) : store)));
        setOpen(false);
      }
    } catch (err) {
      console.error(err);
      setError({
        title: "Save failed",
        message: "We could not reach the server.",
        suggestion: "Please check your connection and try again.",
      });
    }
  }

  function openDeleteModal(store: Store) {
    setStoreToDelete(store);
    setDeleteError(null);
    setDeleteModalOpen(true);
  }

  async function confirmDelete() {
    if (!storeToDelete) return;

    setIsDeleting(true);
    setDeleteError(null);

    try {
      const response = await fetch(`/api/stores?id=${storeToDelete.id}`, {
        method: "DELETE",
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (response.status === 409) {
          setDeleteError(
            `Cannot delete "${storeToDelete.name}" because it contains data that would be lost:\n` +
              `- ${data.details?.employees || 0} employees\n` +
              `- ${data.details?.schedules || 0} schedules\n` +
              `- ${data.details?.shiftTemplates || 0} shift templates\n` +
              `- ${data.details?.workTypes || 0} work types\n\n` +
              (data.suggestion || "Please remove the associated data before deleting the store."),
          );
        } else {
          setDeleteError(data.error || "Failed to delete store.");
        }
        return;
      }

      const nextStores = stores.filter((store) => store.id !== storeToDelete.id);
      setStores(nextStores);
      setCurrentPage((prev) => Math.min(prev, Math.max(1, Math.ceil(nextStores.length / PAGE_SIZE))));
      setDeleteModalOpen(false);
      setStoreToDelete(null);
    } catch (err) {
      console.error("Delete failed:", err);
      setDeleteError("Failed to delete store due to a network error.");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl bg-[#04ADBF] text-white shadow-xl">
        <div className="flex flex-col gap-6 p-6 md:flex-row md:items-end md:justify-between md:p-10">
          <div className="space-y-4">
            <div className="inline-flex rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-white/70">
              Store Overview
            </div>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold leading-tight md:text-4xl">Stores</h1>
              <p className="max-w-xl text-sm text-white/80 md:text-base">
                Manage your locations, opening hours, and addresses. Store hours guide the schedule timeline and assistant recommendations.
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
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center justify-center rounded-full bg-[#F2A30F] px-6 py-2.5 text-sm font-semibold text-slate-900 shadow-lg shadow-black/10 transition hover:bg-[#d9910d] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-white/60"
            >
              <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/80 text-[#04ADBF]">
                +
              </span>
              Add store
            </button>
            {stores.length > 0 && (
              <span className="text-xs text-white/70">
                Baseline city: <strong className="font-semibold text-white">{baseCity || "not set"}</strong>
              </span>
            )}
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
          Loading your stores...
        </div>
      ) : stores.length === 0 ? (
        <div className="rounded-3xl border-2 border-dashed border-[#04ADBF]/35 bg-white/80 p-12 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#04ADBF]/10 text-[#04ADBF]">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-slate-900">No stores yet</h2>
          <p className="mt-2 text-sm text-slate-600">Add your first location so teams and schedules can line up with real hours.</p>
          <button
            type="button"
            onClick={openCreateModal}
            className="mt-6 inline-flex items-center justify-center rounded-full bg-[#04ADBF] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#0394a4] focus:outline-none focus:ring-2 focus:ring-[#04ADBF]/40"
          >
            Create a store
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
            {pagedStores.map((store, idx) => {
              const accent = ACCENT_COLORS[idx % ACCENT_COLORS.length];
              const tintedBg = hexToRgba(accent, 0.16);
              const tintedBorder = hexToRgba(accent, 0.35);
              const duration = formatDuration(diffMinutes(store.openingTime, store.closingTime));

              return (
                <article
                  key={store.id}
                  className="group flex h-full flex-col justify-between rounded-3xl border border-slate-200/70 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-2xl"
                >
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                          <span
                            className="inline-flex h-3 w-3 flex-shrink-0 rounded-full"
                            style={{ backgroundColor: accent }}
                            aria-hidden
                          />
                          {store.name}
                        </div>
                        <p className="text-xs text-slate-500">
                          {store.address && store.address.trim().length > 0 ? store.address : "No address set"}
                        </p>
                      </div>
                      <span
                        className="rounded-full border px-3 py-1 text-xs font-semibold shadow-sm"
                        style={{ color: accent, backgroundColor: tintedBg, borderColor: tintedBorder }}
                      >
                        {store.city}
                      </span>
                    </div>

                    <div className="rounded-2xl border border-slate-200/70 bg-slate-50/70 p-4 text-xs text-slate-600">
                      <p className="font-semibold uppercase tracking-[0.2em] text-slate-500">Opening hours</p>
                      <p className="mt-2 text-sm text-slate-700">
                        {formatTime(store.openingTime)} – {formatTime(store.closingTime)}{" "}
                        <span className="ml-2 text-xs text-slate-500">({duration})</span>
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 flex items-center justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => openEditModal(store)}
                      className="rounded-full bg-[#E1F2BD]/70 px-4 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-[#E1F2BD] focus:outline-none focus:ring-2 focus:ring-[#04ADBF]/30"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => openDeleteModal(store)}
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
        title={mode === "create" ? "Add store" : "Edit store"}
        widthClass="max-w-xl"
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

          <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <label className="flex flex-col gap-2 text-sm">
              <span className="font-semibold text-slate-700">Store name</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Tachora Main Street"
                className={TEXT_INPUT_CLASS}
              />
            </label>

            <label className="flex flex-col gap-2 text-sm">
              <span className="font-semibold text-slate-700">City</span>
              <select
                value={city}
                onChange={(event) => setCity(event.target.value)}
                disabled={isCityLocked}
                className={SELECT_INPUT_CLASS}
              >
                <option value="">Select a city</option>
                {cities.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
              {isCityLocked && (
                <span className="text-xs text-slate-500">City is locked to match your first location ({baseCity}).</span>
              )}
            </label>

            <label className="flex flex-col gap-2 text-sm">
              <span className="font-semibold text-slate-700">Address</span>
              <textarea
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                placeholder="Street, number, optional notes"
                className={`${TEXT_INPUT_CLASS} min-h-[80px] resize-y`}
              />
            </label>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-2 text-sm">
                <span className="font-semibold text-slate-700">Opening time</span>
                <input
                  type="time"
                  value={openingTime}
                  onChange={(event) => setOpeningTime(event.target.value)}
                  className={SELECT_INPUT_CLASS}
                />
              </label>
              <label className="flex flex-col gap-2 text-sm">
                <span className="font-semibold text-slate-700">Closing time</span>
                <input
                  type="time"
                  value={closingTime}
                  onChange={(event) => setClosingTime(event.target.value)}
                  className={SELECT_INPUT_CLASS}
                />
              </label>
            </div>

            <span className="text-xs text-slate-500">
              The schedule timeline will display availability between the opening and closing time.
            </span>
          </div>

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full border border-slate-200 bg-white px-5 py-2 text-sm font-semibold text-slate-600 transition hover:border-[#04ADBF]/40 hover:text-[#04ADBF]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="rounded-full bg-gradient-to-r from-[#04ADBF] via-[#F2A30F] to-[#E1F2BD] px-6 py-2 text-sm font-semibold text-slate-900 shadow-sm transition hover:scale-[1.01] focus:outline-none focus:ring-2 focus:ring-[#04ADBF]/40"
            >
              Save store
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={deleteModalOpen} onClose={() => (!isDeleting ? setDeleteModalOpen(false) : undefined)} title="Delete store">
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#FF8057]/15 text-[#FF8057]">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <div className="space-y-2 text-sm text-slate-600">
              <p className="text-base font-semibold text-slate-900">Delete {storeToDelete?.name}?</p>
              <p>Deleting a store removes it and all related data. This action cannot be undone.</p>
            </div>
          </div>

          {deleteError && (
            <div className="rounded-2xl border border-[#FF8057]/40 bg-[#FF8057]/10 px-4 py-3 text-xs text-[#8c2f1a] whitespace-pre-line">
              {deleteError}
            </div>
          )}

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setDeleteModalOpen(false)}
              disabled={isDeleting}
              className="rounded-full border border-slate-200 bg-white px-5 py-2 text-sm font-semibold text-slate-600 transition hover:border-[#04ADBF]/40 hover:text-[#04ADBF] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmDelete}
              disabled={isDeleting}
              className="rounded-full bg-[#FF8057] px-6 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#e46e48] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isDeleting ? "Deleting..." : "Delete store"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
