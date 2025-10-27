"use client";

import { useCallback, useState } from "react";

import type { Preview } from "@/types/preview";

interface UsePreviewOptions {
  storeId: string;
  weekId: string;
  snapshotVersion: string;
}

type AsyncFn = (...args: unknown[]) => Promise<void>;

interface UsePreviewReturn {
  preview: Preview | null;
  visualization: null;
  isLoading: boolean;
  error: Error | null;
  createPreview: AsyncFn;
  fetchPreviewById: AsyncFn;
  applyPreview: AsyncFn;
  undoPreview: AsyncFn;
  discardPreview: AsyncFn;
  clearError: () => void;
}

const notImplemented: AsyncFn = async () => Promise.resolve();

export function usePreview(_: UsePreviewOptions): UsePreviewReturn {
  const [error, setError] = useState<Error | null>(null);

  const clearError = useCallback(() => setError(null), []);

  return {
    preview: null,
    visualization: null,
    isLoading: false,
    error,
    createPreview: notImplemented,
    fetchPreviewById: notImplemented,
    applyPreview: notImplemented,
    undoPreview: notImplemented,
    discardPreview: notImplemented,
    clearError,
  };
}
