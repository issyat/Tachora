/**
 * PreviewOverlay Component
 * 
 * Adds visual indicators to calendar cells for preview changes.
 * Shows color-coded borders and backgrounds for add/modify/remove operations.
 */

'use client';

import type { CalendarChange } from '@/types/preview';
import { PREVIEW_COLORS } from '@/types/preview';

interface PreviewOverlayProps {
  changes: CalendarChange[];
  className?: string;
}

export function PreviewOverlay({ changes, className = '' }: PreviewOverlayProps) {
  if (changes.length === 0) {
    return null;
  }

  return (
    <div className={`preview-overlay ${className}`}>
      {changes.map((change, idx) => (
        <div
          key={idx}
          className={`absolute ${change.color.bg} ${change.color.border} ${change.color.text} rounded-md p-1 text-xs font-medium pointer-events-none transition-all`}
          style={{
            // Position based on row/col
            top: `${change.position.row * 60}px`, // Adjust based on your calendar row height
            left: `${change.position.col * 100}px`, // Adjust based on your calendar column width
            zIndex: 10,
          }}
          title={`${change.type}: ${change.diff.before} → ${change.diff.after}`}
        >
          <div className="flex items-center gap-1">
            {change.type === 'add' && (
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
              </svg>
            )}
            {change.type === 'modify' && (
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
              </svg>
            )}
            {change.type === 'remove' && (
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
              </svg>
            )}
            <span className="truncate">
              {change.employeeName}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Higher-order component to add preview highlighting to calendar cells
 */
interface WithPreviewHighlightProps {
  assignmentId?: string;
  employeeId?: string;
  day: string;
  previewChanges?: CalendarChange[];
  children: React.ReactNode;
  className?: string;
}

export function WithPreviewHighlight({
  assignmentId,
  employeeId,
  day,
  previewChanges = [],
  children,
  className = '',
}: WithPreviewHighlightProps) {
  // Find matching preview change
  const matchingChange = previewChanges.find(
    change =>
      (change.employeeId === employeeId || !employeeId) &&
      change.day === day
  );

  if (!matchingChange) {
    return <div className={className}>{children}</div>;
  }

  // Apply preview styling
  return (
    <div
      className={`
        ${className}
        ${matchingChange.color.bg}
        ${matchingChange.color.border}
        ${matchingChange.color.text}
        relative
        animate-pulse
      `}
      title={`Preview: ${matchingChange.diff.before} → ${matchingChange.diff.after}`}
    >
      {/* Preview indicator badge */}
      <div className="absolute top-0 right-0 -mt-1 -mr-1 z-10">
        <div className={`
          w-4 h-4 rounded-full flex items-center justify-center text-white text-xs font-bold
          ${matchingChange.type === 'add' ? 'bg-green-500' : ''}
          ${matchingChange.type === 'modify' ? 'bg-yellow-500' : ''}
          ${matchingChange.type === 'remove' ? 'bg-red-500' : ''}
        `}>
          {matchingChange.type === 'add' && '+'}
          {matchingChange.type === 'modify' && '~'}
          {matchingChange.type === 'remove' && '×'}
        </div>
      </div>

      {children}
    </div>
  );
}
