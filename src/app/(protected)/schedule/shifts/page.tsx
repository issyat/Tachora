"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { ErrorModal } from "@/components/ui/error-modal";
import { StoreSelector } from "@/components/ui/store-selector";

type Template = {
  id?: string; // Add ID for existing templates
  role: string;
  workTypeId?: string;
  days: Record<string, boolean>;
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

const emptyTemplate = (): Template => ({ 
  role: "", 
  workTypeId: "",
  days: { MON: false, TUE: false, WED: false, THU: false, FRI: false, SAT: false, SUN: false }, 
  startTime: "09:00", 
  endTime: "17:00"
});

export default function ShiftsPage() {
  const [selectedStoreId, setSelectedStoreId] = useState<string>();
  const [stores, setStores] = useState<Store[]>([]);
  const [currentStore, setCurrentStore] = useState<Store | null>(null);
  const [workTypes, setWorkTypes] = useState<WorkType[]>([]);
  const [items, setItems] = useState<Template[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<{ title: string; message: string; suggestion?: string } | null>(null);

  // modal
  const [open, setOpen] = useState(false);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState<Template>(emptyTemplate());

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
      })
      .catch((err) => {
        console.error(err);
        setError({
          title: "Loading Error",
          message: "Unable to load shift templates from the server.",
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
    setDraft(emptyTemplate());
    setEditIndex(null);
    setOpen(true);
  }

  function openEdit(index: number) {
    setDraft(JSON.parse(JSON.stringify(items[index])));
    setEditIndex(index);
    setOpen(true);
  }

  function updateDraft(patch: Partial<Template>) {
    setDraft((d) => ({ ...d, ...patch }));
  }

  function toggleDraftDay(day: string, checked: boolean) {
    setDraft((d) => ({ ...d, days: { ...(d.days ?? {}), [day]: checked } }));
  }

  async function confirmDraft() {
    if (!draft.workTypeId) {
      setError({
        title: "Missing Information",
        message: "Work type is required for this shift template.",
        suggestion: "Please select a work type from the dropdown."
      });
      return;
    }
    if (!draft.startTime || !draft.endTime) {
      setError({
        title: "Missing Times",
        message: "Both start and end times are required.",
        suggestion: "Please set both the start time and end time for this shift."
      });
      return;
    }
    if (draft.startTime >= draft.endTime) {
      setError({
        title: "Invalid Time Range",
        message: "End time must be after start time.",
        suggestion: "Please adjust the times so the shift has a valid duration."
      });
      return;
    }
    
    // Validate shift times are within store hours
    if (currentStore?.openingTime && currentStore?.closingTime) {
      const storeOpen = new Date(`1970-01-01T${currentStore.openingTime}`);
      const storeClose = new Date(`1970-01-01T${currentStore.closingTime}`);
      const shiftStart = new Date(`1970-01-01T${draft.startTime}:00`);
      const shiftEnd = new Date(`1970-01-01T${draft.endTime}:00`);
      
      if (shiftStart < storeOpen) {
        setError({
          title: "Shift Starts Too Early",
          message: `Shift cannot start before store opens at ${currentStore.openingTime}.`,
          suggestion: "Please adjust the start time to be within store hours."
        });
        return;
      }
      
      if (shiftEnd > storeClose) {
        setError({
          title: "Shift Ends Too Late", 
          message: `Shift cannot end after store closes at ${currentStore.closingTime}.`,
          suggestion: "Please adjust the end time to be within store hours."
        });
        return;
      }
    }
    
    const hasSelectedDays = Object.values(draft.days || {}).some(Boolean);
    if (!hasSelectedDays) {
      setError({
        title: "No Days Selected",
        message: "Please select at least one day for this shift template.",
        suggestion: "Check the boxes for the days when this shift should be available."
      });
      return;
    }
    
    setError(null);
    
    // Store original state for potential rollback
    const originalItems = items;
    
    // Optimistic update - immediately update UI
    let newItems;
    if (editIndex === null) {
      newItems = [...items, draft];
    } else {
      newItems = items.map((it, i) => (i === editIndex ? draft : it));
    }
    setItems(newItems);
    setOpen(false);
    
    // Save to server in background
    setIsSaving(true);
    try {
      await saveTemplatesOptimistic(newItems);
    } catch (err) {
      // Rollback on error
      setItems(originalItems);
      setError({
        title: "Save Failed",
        message: err instanceof Error ? err.message : "Unable to save template",
        suggestion: "Please check your shift information and try again."
      });
      setOpen(true); // Reopen modal so user can try again
      console.error("Save failed:", err);
    } finally {
      setIsSaving(false);
    }
  }



  // Optimistic save function without loading states
  async function saveTemplatesOptimistic(templatesToSave: Template[]) {
    if (!currentStore?.id) {
      throw new Error("You need to create a store before adding shift templates. Go to the Store tab and create your store first.");
    }
    
    // Transform templates to match API expectations
    const templatesForAPI = templatesToSave
      .filter(item => item.workTypeId) // Only save templates with work types
      .map(item => ({
        workTypeId: item.workTypeId,
        days: item.days,
        startTime: item.startTime,
        endTime: item.endTime,
      }));

    const response = await fetch("/api/shift-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storeId: currentStore.id, templates: templatesForAPI }),
    });
    
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(typeof data.error === "string" ? data.error : "Unable to save templates");
    }
    
    // Don't update UI here - we've already done optimistic updates
    // The server response confirms the operation succeeded
  }

  // Immediate database delete - best practice implementation
  async function deleteTemplate(index: number) {
    const template = items[index];
    
    // If template doesn't have an ID, it's not saved yet - just remove from UI
    if (!template.id) {
      setItems(items.filter((_, i) => i !== index));
      return;
    }

    if (!currentStore?.id) {
      setError({
        title: "Store Required",
        message: "Store not found.",
        suggestion: "Please select a store or create one in the Store tab."
      });
      return;
    }

    // Store original state for potential rollback
    const originalItems = items;
    
    // Immediately update UI (optimistic update)
    const newItems = items.filter((_, i) => i !== index);
    setItems(newItems);
    setError(null);
    setIsSaving(true);
    
    // Delete from database immediately
    try {
      const response = await fetch(`/api/shift-templates?id=${template.id}&storeId=${currentStore.id}`, {
        method: "DELETE",
      });
      
      const data = await response.json().catch(() => ({}));
      
      if (!response.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Failed to delete template");
      }
      
      // Success - template is permanently deleted from database
      console.log("Template deleted successfully:", data.deletedId);
      
    } catch (err) {
      // Rollback on error
      setItems(originalItems);
      setError({
        title: "Delete Failed",
        message: err instanceof Error ? err.message : "Failed to delete template",
        suggestion: "Please try again. The template might be in use by existing assignments."
      });
      console.error("Delete failed:", err);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="rounded-xl bg-white p-6 shadow-sm">
      <div className="flex items-end justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-4 mb-2">
            <h1 className="text-xl font-semibold">Shifts</h1>
            {isSaving && (
              <span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded">
                Saving...
              </span>
            )}
            <StoreSelector 
              stores={stores}
              currentStoreId={currentStore?.id}
              onStoreChange={(storeId) => {
                setSelectedStoreId(storeId);
                fetchData(storeId);
              }}
            />
            {currentStore?.openingTime && currentStore?.closingTime && (
              <span className="text-xs text-slate-500 bg-blue-50 px-2 py-1 rounded border border-blue-200">
                Store Hours: {currentStore.openingTime} - {currentStore.closingTime}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-600">
            Define recurring shift templates for {currentStore?.name || 'your store'}.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={openCreate} className="rounded-md border px-3 py-2">+ Add Template</button>
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

          <ErrorModal
            open={!!error}
            onClose={() => setError(null)}
            title={error?.title || "Error"}
            message={error?.message || "An unexpected error occurred"}
            suggestion={error?.suggestion}
          />

          <div className="mt-4 rounded-lg border">
            {items.length === 0 ? (
              <div className="p-6 text-sm text-slate-500">No shift templates yet. Add one to begin.</div>
            ) : (
              items.map((t, idx) => {
                const workType = workTypes.find(wt => wt.id === t.workTypeId);
                const activeDays = Object.entries(t.days || {}).filter(([, v]) => v).map(([k]) => k).join(" · ");
                
                return (
                  <div key={idx} className="flex items-center justify-between gap-4 border-b p-4 last:border-b-0">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-2">
                          {workType && (
                            <span 
                              className="inline-flex h-3 w-3 rounded-full" 
                              style={{ backgroundColor: workType.color }}
                            />
                          )}
                          <span className="truncate font-medium text-slate-900">
                            {t.workType?.name || workType?.name || "(no work type)"}
                          </span>
                        </div>
                        <span className="truncate text-sm text-slate-500">{t.startTime} – {t.endTime}</span>
                        <span className="truncate text-xs text-slate-500">
                          {activeDays || "(no days)"}
                        </span>
                      </div>
                      {workType && (
                        <div className="text-xs text-slate-400 mt-1">
                          Work Type: {workType.name}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <button onClick={() => openEdit(idx)} className="text-sm text-slate-700 hover:underline">Edit</button>
                      <button onClick={() => deleteTemplate(idx)} className="text-sm text-red-600 hover:underline">Delete</button>
                    </div>
                  </div>
                );
              })
            )}
          </div>


        </>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editIndex === null ? "Add shift template" : "Edit shift template"}>
        <div className="grid gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <select 
              value={draft.workTypeId || ''} 
              onChange={(e) => {
                const workType = workTypes.find(wt => wt.id === e.target.value);
                updateDraft({ 
                  workTypeId: e.target.value,
                  role: workType?.name || ''
                });
              }} 
              className="rounded-md border px-3 py-2"
            >
              <option value="">Select work type...</option>
              {workTypes.map(workType => (
                <option key={workType.id} value={workType.id}>
                  {workType.name}
                </option>
              ))}
            </select>
            <input type="time" value={draft.startTime} onChange={(e) => updateDraft({ startTime: e.target.value })} className="rounded-md border px-3 py-2" />
            <input type="time" value={draft.endTime} onChange={(e) => updateDraft({ endTime: e.target.value })} className="rounded-md border px-3 py-2" />
          </div>
          <div className="flex flex-wrap gap-3">
            {(["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const).map((d) => (
              <label key={d} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={Boolean(draft.days?.[d])} onChange={(e) => toggleDraftDay(d, e.target.checked)} />
                {d}
              </label>
            ))}
          </div>
          <ErrorModal
            open={!!error}
            onClose={() => setError(null)}
            title={error?.title || "Error"}
            message={error?.message || "An unexpected error occurred"}
            suggestion={error?.suggestion}
          />
          <div className="flex justify-end gap-2">
            <button onClick={() => setOpen(false)} className="rounded-md border px-3 py-2">Cancel</button>
            <button onClick={confirmDraft} className="rounded-md bg-slate-800 px-3 py-2 text-white">Save</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
