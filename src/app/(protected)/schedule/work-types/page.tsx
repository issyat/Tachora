"use client";

import { useEffect, useState } from "react";
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

export default function WorkTypesPage() {
  const [selectedStoreId, setSelectedStoreId] = useState<string>();
  const [stores, setStores] = useState<Store[]>([]);
  const [currentStore, setCurrentStore] = useState<Store | null>(null);
  const [items, setItems] = useState<WorkType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<{ title: string; message: string; suggestion?: string } | null>(null);


  // modal
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
      })
      .catch((err) => {
        console.error(err);
        setError({
          title: "Loading Error",
          message: "Unable to load work types from the server.",
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
    setDraft(createEmptyWorkType());
    setEditIndex(null);
    setOpen(true);
  }

  function openEdit(index: number) {
    setDraft(JSON.parse(JSON.stringify(items[index])));
    setEditIndex(index);
    setOpen(true);
  }

  function updateDraft(patch: Partial<WorkType>) {
    setDraft((d) => ({ ...d, ...patch }));
  }

  async function deleteWorkType(index: number) {
    const newItems = items.filter((_, i) => i !== index);
    await saveWorkTypes(newItems);
  }

  async function confirmDraft() {
    // validate minimal
    if (!draft.name.trim()) {
      setError({
        title: "Missing Information",
        message: "Work type name is required.",
        suggestion: "Please enter a name for this work type."
      });
      return;
    }

    // Check for duplicate names
    const existingNames = items
      .filter((_, i) => i !== editIndex)
      .map(item => item.name.toLowerCase().trim());
    
    if (existingNames.includes(draft.name.toLowerCase().trim())) {
      setError({
        title: "Duplicate Name",
        message: "A work type with this name already exists.",
        suggestion: "Please choose a different name for this work type."
      });
      return;
    }

    const newItems = editIndex === null 
      ? [...items, draft] 
      : items.map((it, i) => (i === editIndex ? draft : it));
    
    setItems(newItems);
    setOpen(false);
    await saveWorkTypes(newItems);
  }

  async function saveWorkTypes(workTypesToSave: WorkType[], forceDelete: boolean = false) {
    if (!currentStore?.id) {
      setError({
        title: "Store Required",
        message: "You need to create a store before adding work types.",
        suggestion: "Go to the Store tab and create your store first."
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
          forceDelete, // Pass force delete flag
          workTypes: workTypesToSave.map(wt => ({
            id: wt.id, // Include ID if it exists (for updates)
            name: wt.name.trim(),
            color: wt.color
          }))
        }),
      });
      
      const data = await response.json().catch(() => ({}));
      
      // Handle conflict (needs confirmation)
      if (response.status === 409 && data.needsConfirmation) {
        const details = data.details || {};
        const confirmMessage = `${data.error}\n\nAre you sure you want to delete and remove all associated data?\n\n` +
          `This will delete:\n` +
          `• ${details.affectedShiftTemplates || 0} shift template(s)\n` +
          `• ${details.affectedAssignments || 0} assignment(s)\n\n` +
          `This action cannot be undone.`;
        
        if (confirm(confirmMessage)) {
          // Retry with force delete
          return await saveWorkTypes(workTypesToSave, true);
        } else {
          // User cancelled, revert to original items
          fetchData(currentStore.id);
          return;
        }
      }
      
      if (!response.ok) {
        setError({
          title: "Save Failed",
          message: typeof data.error === "string" ? data.error : "Unable to save work types",
          suggestion: "Please check your work type information and try again."
        });
        return;
      }
      
      // Update with server response
      setItems(data.workTypes ?? workTypesToSave);

    } catch (err) {
      console.error(err);
      setError({
        title: "Save Failed",
        message: "Unable to save work types due to a network error.",
        suggestion: "Please check your connection and try again."
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="rounded-xl bg-white p-6 shadow-sm">
      <div className="flex items-end justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-4 mb-2">
            <h1 className="text-xl font-semibold">Work Types</h1>
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
            Define job roles and positions for {currentStore?.name || 'your store'}.
            {isSaving && <span className="ml-2 text-blue-600">Saving...</span>}
          </p>

          <ErrorModal
            open={!!error}
            onClose={() => setError(null)}
            title={error?.title || "Error"}
            message={error?.message || "An unexpected error occurred"}
            suggestion={error?.suggestion}
          />
        </div>
        <div className="flex gap-2">
          <button onClick={openCreate} className="rounded-md border px-3 py-2">+ Add Work Type</button>
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
              <div className="p-6 text-sm text-slate-500">
                No work types yet. Add roles like "Cashier", "Manager", "Cook", etc.
              </div>
            ) : (
              items.map((workType, idx) => {
                const chipText = readableTextColor(workType.color);
                return (
                  <div key={idx} className="flex items-center justify-between gap-4 border-b p-4 last:border-b-0">
                    <div className="flex items-center gap-3">
                      <span 
                        className="inline-flex items-center rounded-full px-3 py-1 text-sm font-medium"
                        style={{ backgroundColor: workType.color, color: chipText }}
                      >
                        {workType.name}
                      </span>
                      <span className="text-xs text-slate-500">{workType.color}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <button onClick={() => openEdit(idx)} className="text-sm text-slate-700 hover:underline">Edit</button>
                      <button onClick={() => deleteWorkType(idx)} className="text-sm text-red-600 hover:underline">Delete</button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editIndex === null ? "Add work type" : "Edit work type"}>
        <div className="grid gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input 
              value={draft.name} 
              onChange={(e) => updateDraft({ name: e.target.value })} 
              placeholder="Work type name (e.g., Cashier, Manager)" 
              className="rounded-md border px-3 py-2" 
            />
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <span>Color</span>
              <input 
                type="color" 
                value={draft.color} 
                onChange={(e) => updateDraft({ color: e.target.value })} 
                className="h-8 w-12 rounded" 
              />
            </label>
          </div>

          <div className="flex justify-end gap-2">
            <button onClick={() => setOpen(false)} className="rounded-md border px-3 py-2">Cancel</button>
            <button 
              onClick={confirmDraft} 
              disabled={isSaving}
              className="rounded-md bg-slate-800 px-3 py-2 text-white disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : (editIndex === null ? 'Add Work Type' : 'Update Work Type')}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}