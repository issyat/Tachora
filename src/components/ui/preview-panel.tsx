/**
 * PreviewPanel Component
 * 
 * Displays AI-suggested schedule changes with Apply/Discard/Undo buttons.
 * Shows list of operations with before/after states and constraint warnings.
 */

'use client';

import { useState } from 'react';
import type { Preview, Diff } from '@/types/preview';
import { DiffCard } from '@/components/ui/diff-card';

interface PreviewPanelProps {
  preview: Preview;
  onApply: () => Promise<void>;
  onDiscard: () => Promise<void>;
  onUndo?: () => Promise<void>;
}

export function PreviewPanel({
  preview,
  onApply,
  onDiscard,
  onUndo,
}: PreviewPanelProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check if any diffs have blockers
  const hasBlockers = preview.diffs.some(d => d.constraints.blockers.length > 0);
  const hasWarnings = preview.diffs.some(d => d.constraints.warnings.length > 0);
  const isApplied = preview.status === 'applied';
  const canUndo = isApplied && onUndo;

  const handleApply = async () => {
    if (hasBlockers) return;
    
    setIsLoading(true);
    setError(null);
    try {
      await onApply();
    } catch (err: any) {
      setError(err.message || 'Failed to apply changes');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDiscard = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await onDiscard();
    } catch (err: any) {
      setError(err.message || 'Failed to discard preview');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUndo = async () => {
    if (!onUndo) return;
    
    setIsLoading(true);
    setError(null);
    try {
      await onUndo();
    } catch (err: any) {
      setError(err.message || 'Failed to undo changes');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t-2 border-blue-500 shadow-lg z-50">
      <div className="max-w-7xl mx-auto p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            <h3 className="font-semibold text-lg">
              {isApplied ? 'Changes Applied' : 'Preview Changes'}
            </h3>
            <span className="text-sm text-gray-600">
              {preview.diffs.length} {preview.diffs.length === 1 ? 'operation' : 'operations'}
            </span>
            {preview.operations[0]?.source === 'ai' && (
              <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded">
                AI Suggested
              </span>
            )}
            {isApplied && (
              <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-700 rounded">
                ✓ Applied
              </span>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            {!isApplied && (
              <>
                <button
                  onClick={handleDiscard}
                  disabled={isLoading}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Discard
                </button>
                <button
                  onClick={handleApply}
                  disabled={isLoading || hasBlockers}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? 'Applying...' : hasBlockers ? 'Cannot Apply' : 'Apply Changes'}
                </button>
              </>
            )}
            {canUndo && (
              <button
                onClick={handleUndo}
                disabled={isLoading}
                className="px-4 py-2 text-sm font-medium text-white bg-orange-600 rounded-md hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Undoing...' : 'Undo Changes'}
              </button>
            )}
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {/* Changes List */}
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {preview.diffs.map((diff, idx) => (
            <DiffCard key={idx} diff={diff} />
          ))}
        </div>

        {/* Warnings Summary */}
        {hasWarnings && !hasBlockers && (
          <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
            <div className="flex items-start gap-2">
              <svg className="w-5 h-5 text-yellow-600 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <div>
                <p className="text-sm font-medium text-yellow-800">Warnings</p>
                <ul className="mt-1 text-sm text-yellow-700 list-disc list-inside">
                  {preview.diffs.flatMap(d => d.constraints.warnings).map((warning, i) => (
                    <li key={i}>{warning}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Blockers Summary */}
        {hasBlockers && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
            <div className="flex items-start gap-2">
              <svg className="w-5 h-5 text-red-600 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <div>
                <p className="text-sm font-medium text-red-800">Cannot Apply - Conflicts Detected</p>
                <ul className="mt-1 text-sm text-red-700 list-disc list-inside">
                  {preview.diffs.flatMap(d => d.constraints.blockers).map((blocker, i) => (
                    <li key={i}>{blocker}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
