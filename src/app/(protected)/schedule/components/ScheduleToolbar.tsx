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

  schedule: _schedule,
}: ScheduleToolbarProps) {
  return (
    <div className="flex w-full justify-center">
        <StoreSelector
          className="max-w-xs w-full justify-center"
          stores={stores}
          currentStoreId={currentStore?.id}
          onStoreChange={onSelectStore}
          disabled={loading}
        />
    </div>
  );
}
