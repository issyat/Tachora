import { AIGenerateButton } from "@/components/ui/ai-generate-button";
import { StoreSelector } from "@/components/ui/store-selector";

import type { ScheduleSummary, StoreSummary } from "../types";

interface ScheduleToolbarProps {
  stores: StoreSummary[];
  currentStore: StoreSummary | null;
  loading: boolean;
  onSelectStore: (storeId: string) => void;

  onGenerated: () => void;
  onError: (message: string) => void;

  schedule: ScheduleSummary | null;
}

export function ScheduleToolbar({
  stores,
  currentStore,
  loading,
  onSelectStore,

  onGenerated,
  onError,

  schedule,
}: ScheduleToolbarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border bg-white p-4 shadow-sm">
      <div className="flex items-center gap-6">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold text-slate-900">Schedule</h1>
          {schedule ? (
            <p className="text-sm text-slate-500">
              {schedule.state}
            </p>
          ) : (
            <p className="text-sm text-slate-500">Select a store to view the weekly schedule.</p>
          )}
        </div>

      </div>
      <div className="flex flex-wrap items-center gap-3">
        <StoreSelector
          stores={stores}
          currentStoreId={currentStore?.id}
          onStoreChange={onSelectStore}
          disabled={loading}
        />
        <AIGenerateButton
          storeId={currentStore?.id}
          onSuccess={onGenerated}
          onError={onError}
          disabled={!currentStore || loading}
        />
      </div>
    </div>
  );
}
