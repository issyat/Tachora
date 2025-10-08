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
                    <button onClick={() => openEdit(s)} className="text-sm text-slate-700 hover:underline">Edit</button>
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
    </div>
  );
}

