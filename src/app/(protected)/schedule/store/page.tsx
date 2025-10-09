"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";

type Store = { id: string; name: string; address?: string; city: string; country: string; openingTime?: string; closingTime?: string };

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  const text = await response.text();
  if (!text) {
    return {} as T;
  }
  try {
    return JSON.parse(text) as T;
  } catch (err) {
    console.error("Failed to parse JSON", err);
    throw err;
  }
}

enum Mode {
  Create = "Create",
  Edit = "Edit",
}

export default function StorePage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [cities, setCities] = useState<string[]>([]);

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>(Mode.Create);
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

  const baseCity = stores[0]?.city || "";

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    Promise.all([
      fetch("/api/stores", { cache: "no-store" }).then((r) => readJson<{ stores?: Store[] }>(r)),
      fetch("/api/be/cities", { cache: "force-cache" }).then((r) => readJson<{ cities?: string[] }>(r)),
    ])
      .then(([storesData, citiesData]) => {
        if (!active) return;
        setStores(storesData.stores ?? []);
        setCities(Array.isArray(citiesData.cities) ? citiesData.cities : []);
      })
      .catch((err) => {
        console.error(err);
        setError("Unable to load stores");
      })
      .finally(() => active && setIsLoading(false));
    return () => {
      active = false;
    };
  }, []);

  function openCreate() {
    setMode(Mode.Create);
    setEditingId(null);
    setName("");
    setAddress("");
    setCity(baseCity || "");
    setOpeningTime("09:00");
    setClosingTime("22:00");
    setOpen(true);
  }

  function openEdit(s: Store) {
    setMode(Mode.Edit);
    setEditingId(s.id);
    setName(s.name);
    setAddress(s.address || "");
    setCity(s.city);
    setOpeningTime(s.openingTime || "09:00");
    setClosingTime(s.closingTime || "22:00");
    setOpen(true);
  }

  async function save() {
    setError(null);
    try {
      if (mode === Mode.Create) {
        const response = await fetch("/api/stores", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, address, city, openingTime, closingTime }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          setError(typeof data.error === "string" ? data.error : "Unable to create store");
          return;
        }
        setStores((prev) => [...prev, data.store]);
        setOpen(false);
      } else if (editingId) {
        const response = await fetch("/api/store", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ storeId: editingId, name, address, openingTime, closingTime }),
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          setError(typeof data.error === "string" ? data.error : "Unable to update store");
          return;
        }
        setStores((prev) => prev.map((s) => (s.id === editingId ? data.store : s)));
        setOpen(false);
      }
    } catch (err) {
      console.error(err);
      setError("Unable to save store");
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
          // Store has data that would be lost
          setDeleteError(
            `Cannot delete "${storeToDelete.name}" because it contains data that would be lost:\n\n` +
            `• ${data.details?.employees || 0} employees\n` +
            `• ${data.details?.schedules || 0} schedules\n` +
            `• ${data.details?.shiftTemplates || 0} shift templates\n` +
            `• ${data.details?.workTypes || 0} work types\n\n` +
            `${data.suggestion || "Please remove all data before deleting the store."}`
          );
        } else {
          setDeleteError(data.error || "Failed to delete store");
        }
        return;
      }

      // Remove store from list
      setStores((prev) => prev.filter((s) => s.id !== storeToDelete.id));
      setDeleteModalOpen(false);
      setStoreToDelete(null);

    } catch (err) {
      console.error("Delete failed:", err);
      setDeleteError("Failed to delete store due to network error");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="rounded-xl bg-white p-6 shadow-sm">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Stores</h1>
          <p className="mt-1 text-sm text-slate-600">Manage your stores (all must be in the same city).</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={openCreate} className="rounded-md bg-slate-800 px-3 py-2 text-white">+ Add Store</button>
        </div>
      </div>

      {isLoading ? (
        <div className="mt-6 text-sm text-slate-500">Loading…</div>
      ) : (
        <>
          {stores.length === 0 ? (
            <div className="mt-6 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
              No stores yet. Click Add Store to get started.
            </div>
          ) : (
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {stores.map((s) => (
                <div key={s.id} className="rounded-lg border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm text-slate-500">Name</div>
                      <div className="truncate font-medium text-slate-900">{s.name}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => openEdit(s)} className="text-sm text-slate-700 hover:underline">Edit</button>
                      <button 
                        onClick={() => openDeleteModal(s)} 
                        className="text-sm text-red-600 hover:underline"
                        title="Delete store"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-3 text-sm">
                    <div className="text-slate-500">City</div>
                    <div className="col-span-2 text-slate-900">{s.city}</div>
                  </div>
                  <div className="grid grid-cols-3 text-sm">
                    <div className="text-slate-500">Country</div>
                    <div className="col-span-2 text-slate-900">{s.country}</div>
                  </div>
                  <div className="grid grid-cols-3 text-sm">
                    <div className="text-slate-500">Address</div>
                    <div className="col-span-2 whitespace-pre-wrap text-slate-900">{s.address || "—"}</div>
                  </div>
                  <div className="grid grid-cols-3 text-sm">
                    <div className="text-slate-500">Hours</div>
                    <div className="col-span-2 text-slate-900">
                      🕒 {s.openingTime || "09:00"} - {s.closingTime || "22:00"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={mode === Mode.Create ? "Add store" : "Edit store"}>
        <div className="grid gap-4">
          <div>
            <label className="text-sm font-medium text-slate-700">Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded-md border px-3 py-2" />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">City</label>
            <select value={city} onChange={(e) => setCity(e.target.value)} disabled={Boolean(baseCity) && mode === Mode.Create} className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm">
              <option value="">Select a city</option>
              {cities.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            {baseCity && mode === Mode.Create && (
              <p className="mt-1 text-xs text-slate-500">All stores must be in {baseCity}. City is locked.</p>
            )}
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Address</label>
            <textarea value={address} onChange={(e) => setAddress(e.target.value)} className="mt-1 w-full rounded-md border px-3 py-2" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-slate-700">Opening Time</label>
              <input
                type="time"
                value={openingTime}
                onChange={(e) => setOpeningTime(e.target.value)}
                className="mt-1 w-full rounded-md border px-3 py-2"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Closing Time</label>
              <input
                type="time"
                value={closingTime}
                onChange={(e) => setClosingTime(e.target.value)}
                className="mt-1 w-full rounded-md border px-3 py-2"
              />
            </div>
          </div>
          <p className="text-xs text-slate-500">The schedule timeline will show from opening to closing time.</p>
          {error && <div className="text-sm text-red-600">{error}</div>}
          <div className="flex justify-end gap-2">
            <button onClick={() => setOpen(false)} className="rounded-md border px-3 py-2">Cancel</button>
            <button onClick={save} className="rounded-md bg-slate-800 px-3 py-2 text-white">Save</button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal 
        open={deleteModalOpen} 
        onClose={() => !isDeleting && setDeleteModalOpen(false)} 
        title="Delete Store"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
              <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-medium text-gray-900">
                Delete "{storeToDelete?.name}"?
              </h3>
              <p className="mt-2 text-sm text-gray-600">
                This action cannot be undone. The store and all its associated data will be permanently deleted.
              </p>
            </div>
          </div>

          {deleteError && (
            <div className="rounded-md bg-red-50 border border-red-200 p-4">
              <div className="text-sm text-red-800 whitespace-pre-line">
                {deleteError}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <button
              onClick={() => setDeleteModalOpen(false)}
              disabled={isDeleting}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={confirmDelete}
              disabled={isDeleting}
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
            >
              {isDeleting && (
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              )}
              {isDeleting ? "Deleting..." : "Delete Store"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

