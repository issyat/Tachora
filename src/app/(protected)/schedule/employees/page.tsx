"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Modal } from "@/components/ui/modal";
import { ErrorModal } from "@/components/ui/error-modal";
import { StoreSelector } from "@/components/ui/store-selector";
import { readableTextColor } from "@/lib/color";

const dayOptions = [
  { key: "SUN", label: "Sunday" },
  { key: "MON", label: "Monday" },
  { key: "TUE", label: "Tuesday" },
  { key: "WED", label: "Wednesday" },
  { key: "THU", label: "Thursday" },
  { key: "FRI", label: "Friday" },
  { key: "SAT", label: "Saturday" },
] as const;

type DayKey = (typeof dayOptions)[number]["key"];



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
});

export default function EmployeesPage() {
  const [selectedStoreId, setSelectedStoreId] = useState<string>();
  const [stores, setStores] = useState<Store[]>([]);
  const [currentStore, setCurrentStore] = useState<Store | null>(null);
  const [items, setItems] = useState<EmployeePayload[]>([]);
  const [workTypes, setWorkTypes] = useState<WorkType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<{ title: string; message: string; suggestion?: string } | null>(null);
  const [saving, setSaving] = useState(false);

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
              const transformedEmployees = employeesData.employees.map((emp: any) => {
                console.log('Loading employee:', emp.id, emp.name);
                return {
                  id: emp.id,
                  name: emp.name,
                  email: emp.email,
                  phone: emp.phone,
                  color: emp.color,
                  canWorkAcrossStores: emp.canWorkAcrossStores,
                  weeklyMinutesTarget: emp.weeklyMinutesTarget,
                  availability: emp.availability, // Already properly formatted by serializer
                  roleIds: emp.roleIds, // Already properly formatted by serializer
                  storeId: emp.storeId,
                  storeName: emp.storeName,
                };
              });
              setItems(transformedEmployees);
            } else {
              // Fallback to setup API employees if new API fails
              setItems(data.employees ?? []);
            }
          } catch (err) {
            console.error("Error fetching employees:", err);
            // Fallback to setup API employees
            setItems(data.employees ?? []);
          }
        } else {
          setItems([]);
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

  function openCreate() {
    setDraft(createEmptyEmployee(currentStore?.id || ""));
    setEditIndex(null);
    setOpen(true);
  }

  function openEdit(index: number) {
    setDraft(JSON.parse(JSON.stringify(items[index])));
    setEditIndex(index);
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
      console.log('Deleting employee:', employee.id);
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
    // validate minimal
    if (!draft.name || !draft.email) {
      setError({
        title: "Missing Information",
        message: "Name and email are required fields.",
        suggestion: "Please fill in both the employee's name and email address."
      });
      return;
    }
    if (workTypes.length > 0 && draft.roleIds.length === 0) {
      setError({
        title: "Work Type Required",
        message: "Please select at least one work type for this employee.",
        suggestion: "Work types determine what shifts this employee can be assigned to."
      });
      return;
    }

    if (!currentStore?.id) {
      setError({
        title: "Store Required",
        message: "You need to create a store before adding employees.",
        suggestion: "Go to the Store tab and create your store first."
      });
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
              contractType: "FULL_TIME",
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
        
        // Transform the response to match our local format
        const newEmployee: EmployeePayload = {
          id: employee.id,
          name: employee.name,
          email: employee.email,
          phone: employee.phone,
          color: employee.color,
          canWorkAcrossStores: employee.canWorkAcrossStores,
          weeklyMinutesTarget: employee.weeklyMinutesTarget,
          availability: employee.availability, // Already properly formatted by serializer
          roleIds: employee.roleIds, // Already properly formatted by serializer
          storeId: employee.storeId,
          storeName: employee.storeName,
        };

        setItems((s) => [...s, newEmployee]);
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

        console.log('Updating employee:', employeeToUpdate.id, 'with data:', draft);
        const response = await fetch(`/api/employees-v2/${employeeToUpdate.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            employee: {
              ...draft,
              contractType: "FULL_TIME",
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
        
        // Transform the response to match our local format
        const updatedEmployee: EmployeePayload = {
          id: employee.id,
          name: employee.name,
          email: employee.email,
          phone: employee.phone,
          color: employee.color,
          canWorkAcrossStores: employee.canWorkAcrossStores,
          weeklyMinutesTarget: employee.weeklyMinutesTarget,
          availability: employee.availability, // Already properly formatted by serializer
          roleIds: employee.roleIds, // Already properly formatted by serializer
          storeId: employee.storeId,
          storeName: employee.storeName,
        };

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



  return (
    <div className="rounded-xl bg-white p-6 shadow-sm">
      <div className="flex items-end justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-4 mb-2">
            <h1 className="text-xl font-semibold">Employees</h1>
            <StoreSelector 
              stores={stores}
              currentStoreId={currentStore?.id}
              onStoreChange={(storeId) => {
                setSelectedStoreId(storeId);
                fetchData(storeId);
              }}
            />
          </div>
          <p className="text-sm text-slate-600">
            Manage employees, colors and availability.
            {stores.length > 1 && (
              <span className="text-blue-600"> Cross-store employees are shown with a ↗ indicator.</span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={openCreate} className="rounded-md border px-3 py-2">+ Add Employee</button>
        </div>
      </div>

      {isLoading ? (
        <div className="mt-6 text-sm text-slate-500">Loading…</div>
      ) : (
        <>
          {!currentStore && (
            <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
              No store yet. Create your store first in the Store tab.
            </div>
          )}

          <div className="mt-4 rounded-lg border">
            {items.length === 0 ? (
              <div className="p-6 text-sm text-slate-500">No employees yet. Add one or import via CSV.</div>
            ) : (
              items.map((e, idx) => {
                const chipText = readableTextColor(e.color);
                const isFromOtherStore = e.storeId !== currentStore?.id;
                return (
                  <div key={idx} className={`flex items-center justify-between gap-4 border-b p-4 last:border-b-0 ${
                    isFromOtherStore ? 'bg-blue-50' : ''
                  }`}>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-medium text-slate-900">
                          {e.name || "(no name)"}
                          {isFromOtherStore && (
                            <span className="ml-1 text-blue-600">↗</span>
                          )}
                        </span>
                        <span className="truncate text-sm text-slate-500">{e.email}</span>
                        <span className="truncate text-sm text-slate-500">{e.phone}</span>
                        {isFromOtherStore && e.storeName && (
                          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
                            From: {e.storeName}
                          </span>
                        )}

                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                          Weekly: {formatMinutes(e.weeklyMinutesTarget)}
                        </span>
                        {e.canWorkAcrossStores && (
                          <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
                            Cross-store
                          </span>
                        )}
                        {e.roleIds && e.roleIds.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {e.roleIds.slice(0, 3).map(wtId => {
                              const wt = workTypes.find(w => w.id === wtId);
                              if (!wt) return null;
                              const chipText = readableTextColor(wt.color);
                              return (
                                <span 
                                  key={wtId}
                                  className="rounded-full px-2 py-0.5 text-xs"
                                  style={{ backgroundColor: wt.color, color: chipText }}
                                >
                                  {wt.name}
                                </span>
                              );
                            })}
                            {e.roleIds.length > 3 && (
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                                +{e.roleIds.length - 3} more
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {!isFromOtherStore && (
                        <>
                          <button onClick={() => openEdit(idx)} className="text-sm text-slate-700 hover:underline" disabled={saving}>Edit</button>
                          <button onClick={() => remove(idx)} className="text-sm text-red-600 hover:underline disabled:opacity-50" disabled={saving}>
                            {saving ? "..." : "Delete"}
                          </button>
                        </>
                      )}
                      {isFromOtherStore && (
                        <span className="text-xs text-slate-500">Read-only</span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <ErrorModal
            open={!!error}
            onClose={() => setError(null)}
            title={error?.title || "Error"}
            message={error?.message || "An unexpected error occurred"}
            suggestion={error?.suggestion}
          />
        </>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editIndex === null ? "Add employee" : "Edit employee"} widthClass="max-w-3xl">
        <div className="grid gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <input value={draft.name} onChange={(e) => updateDraft({ name: e.target.value })} placeholder="Name" className="rounded-md border px-3 py-2" />
            <input value={draft.email} onChange={(e) => updateDraft({ email: e.target.value })} placeholder="Email" className="rounded-md border px-3 py-2" />
            <input value={draft.phone} onChange={(e) => updateDraft({ phone: e.target.value })} placeholder="Phone" className="rounded-md border px-3 py-2" />
          </div>
          <div className="flex flex-wrap items-center gap-3">

            <label className="flex items-center gap-2 text-sm text-slate-700">
              <span>Color</span>
              <input type="color" value={draft.color} onChange={(e) => updateDraft({ color: e.target.value })} className="h-8 w-12 rounded" />
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={draft.canWorkAcrossStores} onChange={(e) => updateDraft({ canWorkAcrossStores: e.target.checked })} />
              Can work across stores
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <span>Max weekly hours</span>
              <input
                type="number"
                min={0}
                step={1}
                value={Math.round((draft.weeklyMinutesTarget ?? DEFAULT_WEEKLY_MINUTES) / 60)}
                onChange={(e) => {
                  const hours = Math.max(0, Number(e.target.value) || 0);
                  updateDraft({ weeklyMinutesTarget: hours * 60 });
                }}
                className="w-20 rounded-md border px-2 py-1"
              />
            </label>
          </div>

          {workTypes.length > 0 && (
            <div className="rounded-md border">
              <div className="border-b bg-slate-50 px-3 py-2 text-sm font-semibold">Work Types</div>
              <div className="p-3">
                <p className="mb-3 text-sm text-slate-600">Select the work types this employee can perform:</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {workTypes.map((wt) => {
                    const isSelected = draft.roleIds.includes(wt.id);
                    const chipText = readableTextColor(wt.color);
                    return (
                      <label key={wt.id} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            if (e.target.checked) {
                              updateDraft({ roleIds: [...draft.roleIds, wt.id] });
                            } else {
                              updateDraft({ roleIds: draft.roleIds.filter(id => id !== wt.id) });
                            }
                          }}
                        />
                        <span 
                          className="rounded-full px-2 py-1 text-xs"
                          style={{ backgroundColor: wt.color, color: chipText }}
                        >
                          {wt.name}
                        </span>
                      </label>
                    );
                  })}
                </div>
                {workTypes.length === 0 && (
                  <p className="text-sm text-slate-500">
                    No work types defined. 
                    <Link href="/schedule/work-types" className="ml-1 text-blue-600 hover:underline">
                      Create work types first
                    </Link>
                    .
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="rounded-md border">
            <div className="border-b bg-slate-50 px-3 py-2 text-sm font-semibold">Weekly availability</div>
            <div className="divide-y">
              {dayOptions.map((d, dIdx) => {
                const slot = draft.availability[dIdx];
                const isOff = slot?.isOff ?? true;
                return (
                  <div key={d.key} className="flex flex-col gap-3 px-3 py-2 sm:flex-row sm:items-center">
                    <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                      <input type="checkbox" checked={isOff} onChange={(ev) => updateDraftAvailability(dIdx, { isOff: ev.target.checked })} />
                      {d.label}
                    </label>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2 text-xs uppercase text-slate-500">
                        <span>start</span>
                        <input type="time" value={slot?.startTime ?? "09:00"} onChange={(ev) => updateDraftAvailability(dIdx, { startTime: ev.target.value })} disabled={isOff} className="w-28 rounded-md border px-2 py-1" />
                      </div>
                      <div className="flex items-center gap-2 text-xs uppercase text-slate-500">
                        <span>end</span>
                        <input type="time" value={slot?.endTime ?? "17:00"} onChange={(ev) => updateDraftAvailability(dIdx, { endTime: ev.target.value })} disabled={isOff} className="w-28 rounded-md border px-2 py-1" />
                      </div>
                      {isOff && <span className="text-xs text-slate-500">Off</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button onClick={() => setOpen(false)} className="rounded-md border px-3 py-2" disabled={saving}>Cancel</button>
            <button onClick={confirmDraft} className="rounded-md bg-slate-800 px-3 py-2 text-white disabled:opacity-50" disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
