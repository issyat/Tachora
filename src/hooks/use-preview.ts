/**
 * usePreview Hook
 * 
 * Manages preview state and API interactions for schedule changes.
 * Handles create, apply, undo, and discard operations.
 */

'use client';

import { useState, useCallback } from 'react';
import type {
  Preview,
  CreatePreviewRequest,
  CreatePreviewResponse,
  ApplyPreviewResponse,
  UndoPreviewResponse,
  Operation,
} from '@/types/preview';

interface UsePreviewOptions {
  storeId: string;
  weekId: string;
  snapshotVersion: string;
  onApplySuccess?: () => void | Promise<void>;
  onUndoSuccess?: () => void | Promise<void>;
  onError?: (error: Error) => void;
}

interface UsePreviewReturn {
  preview: Preview | null;
  visualization: CreatePreviewResponse['visualization'] | null;
  isLoading: boolean;
  error: Error | null;
  createPreview: (operations: Operation[]) => Promise<void>;
  fetchPreviewById: (previewOrId: string | Preview, visualizationData?: CreatePreviewResponse['visualization']) => Promise<void>; // Accept both preview object and ID, with optional visualization
  applyPreview: () => Promise<void>;
  undoPreview: () => Promise<void>;
  discardPreview: () => Promise<void>;
  clearError: () => void;
}

export function usePreview(options: UsePreviewOptions): UsePreviewReturn {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [visualization, setVisualization] = useState<CreatePreviewResponse['visualization'] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  /**
   * Create a new preview from operations
   */
  const createPreview = useCallback(async (operations: Operation[]) => {
    setIsLoading(true);
    setError(null);

    try {
      const request: CreatePreviewRequest = {
        storeId: options.storeId,
        weekId: options.weekId,
        operations,
        snapshotVersion: options.snapshotVersion,
      };

      const response = await fetch('/api/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to create preview');
      }

      const data: CreatePreviewResponse = await response.json();
      setPreview(data.preview);
      setVisualization(data.visualization);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      setError(error);
      options.onError?.(error);
    } finally {
      setIsLoading(false);
    }
  }, [options]);

  /**
   * Fetch an existing preview by ID or set preview directly
   * Accepts either a preview object (instant) or a preview ID (needs fetch)
   */
  const fetchPreviewById = useCallback(async (previewOrId: string | Preview, visualizationData?: CreatePreviewResponse['visualization']) => {
    // If we received a preview object directly, use it instantly
    if (typeof previewOrId === 'object') {
      setPreview(previewOrId);
      setVisualization(visualizationData || null); // Use provided visualization or null
      return;
    }

    // Otherwise, fetch by ID
    const previewId = previewOrId;
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/preview/${previewId}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to fetch preview');
      }

      const data = await response.json();
      if (data.preview) {
        setPreview(data.preview);
        // Note: Visualization may not be included in GET response
        // If needed, we could enhance the endpoint to return it
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      setError(error);
      options.onError?.(error);
    } finally {
      setIsLoading(false);
    }
  }, [options]);

  /**
   * Apply the current preview to the database (optimistic UI)
   */
  const applyPreview = useCallback(async () => {
    if (!preview) {
      throw new Error('No preview to apply');
    }

    const previewId = preview.id;
    const snapshotVersion = preview.snapshotVersion;
    
    // Clear preview IMMEDIATELY for instant feedback
    setPreview(null);
    setVisualization(null);
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/preview/${previewId}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          previewId,
          snapshotVersion,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        if (errorData.code === 'VERSION_MISMATCH') {
          throw new Error('Schedule was modified by another user. Please refresh and try again.');
        }
        throw new Error(errorData.message || 'Failed to apply preview');
      }

      const data: ApplyPreviewResponse = await response.json();
      
      // Refresh data in background (already cleared preview above)
      await Promise.resolve(options.onApplySuccess?.());
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      setError(error);
      options.onError?.(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [preview, options]);

  /**
   * Undo an applied preview
   */
  const undoPreview = useCallback(async () => {
    if (!preview) {
      throw new Error('No preview to undo');
    }

    if (preview.status !== 'applied') {
      throw new Error('Can only undo applied previews');
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/preview/${preview.id}/undo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to undo preview');
      }

      const data: UndoPreviewResponse = await response.json();
      
      // Clear preview after undo
      setPreview(null);
      setVisualization(null);
      
      // Notify success and wait for callback to complete
      await Promise.resolve(options.onUndoSuccess?.());
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      setError(error);
      options.onError?.(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [preview, options]);

  /**
   * Discard a preview without applying it (optimistic update)
   */
  const discardPreview = useCallback(async () => {
    if (!preview) {
      return;
    }

    const previewId = preview.id;

    // Optimistically clear preview immediately for instant UI feedback
    setPreview(null);
    setVisualization(null);
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/preview/${previewId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to discard preview');
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      setError(error);
      options.onError?.(error);
      // Note: Preview already cleared optimistically, so no rollback
    } finally {
      setIsLoading(false);
    }
  }, [preview, options]);

  return {
    preview,
    visualization,
    isLoading,
    error,
    createPreview,
    fetchPreviewById,
    applyPreview,
    undoPreview,
    discardPreview,
    clearError,
  };
}
