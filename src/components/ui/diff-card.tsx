/**
 * DiffCard Component
 * 
 * Displays a single operation change with icon, description, and status.
 * Shows before/after states and constraint validation results.
 */

'use client';

import type { Diff, Operation, AssignShiftOp, UnassignShiftOp, SwapShiftsOp } from '@/types/preview';
import type { ReactElement } from 'react';

interface DiffCardProps {
  diff: Diff;
}

function getOperationIcon(type: Operation['type']): ReactElement {
  switch (type) {
    case 'assign_shift':
      return (
        <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
          <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </div>
      );
    case 'unassign_shift':
      return (
        <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
          <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
          </svg>
        </div>
      );
    case 'swap_shifts':
      return (
        <div className="w-8 h-8 rounded-full bg-yellow-100 flex items-center justify-center flex-shrink-0">
          <svg className="w-5 h-5 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
          </svg>
        </div>
      );
    default:
      return (
        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
          <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
      );
  }
}

function getOperationDescription(op: Operation, diff: Diff): {
  title: string;
  before?: string;
  after?: string;
  reason?: string;
} {
  switch (op.type) {
    case 'assign_shift': {
      const assignOp = op as AssignShiftOp;
      const beforeAssignment = diff.before.assignments?.[0];
      const afterAssignment = diff.after.assignments?.find(a => a.employeeId === assignOp.employeeId);
      
      return {
        title: 'Assign Employee to Shift',
        before: beforeAssignment 
          ? `Open shift` 
          : 'No assignment',
        after: afterAssignment 
          ? `Assigned to ${afterAssignment.workTypeName} shift` 
          : 'Assignment',
        reason: assignOp.reason,
      };
    }

    case 'unassign_shift': {
      const unassignOp = op as UnassignShiftOp;
      const beforeAssignment = diff.before.assignments?.[0];
      
      return {
        title: 'Remove Employee from Shift',
        before: beforeAssignment 
          ? `Assigned to ${beforeAssignment.workTypeName}` 
          : 'Assignment',
        after: 'Open shift',
        reason: unassignOp.reason,
      };
    }

    case 'swap_shifts': {
      const swapOp = op as SwapShiftsOp;
      const assignment1 = diff.before.assignments?.[0];
      const assignment2 = diff.before.assignments?.[1];
      
      return {
        title: 'Swap Two Employees',
        before: `Employee 1 → ${assignment1?.workTypeName || 'Shift 1'}, Employee 2 → ${assignment2?.workTypeName || 'Shift 2'}`,
        after: `Employee 1 → ${assignment2?.workTypeName || 'Shift 2'}, Employee 2 → ${assignment1?.workTypeName || 'Shift 1'}`,
        reason: swapOp.reason,
      };
    }

    default:
      return {
        title: `${op.type}`,
        reason: (op as any).reason,
      };
  }
}

function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

export function DiffCard({ diff }: DiffCardProps) {
  const op = diff.operation;
  const description = getOperationDescription(op, diff);
  const hasBlockers = diff.constraints.blockers.length > 0;
  const hasWarnings = diff.constraints.warnings.length > 0;

  // Get weekly minutes impact if available
  const weeklyImpact = diff.after.weeklyMinutes && diff.before.weeklyMinutes
    ? Object.entries(diff.after.weeklyMinutes).map(([empId, afterMins]) => {
        const beforeMins = diff.before.weeklyMinutes?.[empId] || 0;
        const delta = afterMins - beforeMins;
        return { empId, beforeMins, afterMins, delta };
      }).filter(impact => impact.delta !== 0)
    : [];

  return (
    <div className={`flex items-start gap-3 p-4 border rounded-lg ${
      hasBlockers ? 'bg-red-50 border-red-200' :
      hasWarnings ? 'bg-yellow-50 border-yellow-200' :
      'bg-gray-50 border-gray-200'
    }`}>
      {/* Icon */}
      {getOperationIcon(op.type)}

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Title */}
        <div className="font-medium text-gray-900">
          {description.title}
        </div>

        {/* Before/After comparison */}
        {description.before && description.after && (
          <div className="mt-2 space-y-1 text-sm text-gray-600">
            <div className="flex items-center gap-2">
              <span className="text-red-600 font-medium">Before:</span>
              <span>{description.before}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-green-600 font-medium">After:</span>
              <span>{description.after}</span>
            </div>
          </div>
        )}

        {/* Weekly hours impact */}
        {weeklyImpact.length > 0 && (
          <div className="mt-2 text-sm text-gray-600">
            {weeklyImpact.map(impact => (
              <div key={impact.empId} className="flex items-center gap-2">
                <span className="font-medium">Hours:</span>
                <span className="text-gray-500">
                  {formatMinutes(impact.beforeMins)} → {formatMinutes(impact.afterMins)}
                </span>
                <span className={impact.delta > 0 ? 'text-green-600' : 'text-red-600'}>
                  ({impact.delta > 0 ? '+' : ''}{formatMinutes(Math.abs(impact.delta))})
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Reason */}
        {description.reason && (
          <div className="mt-2 flex items-start gap-2 text-sm text-blue-600">
            <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
            <span>{description.reason}</span>
          </div>
        )}

        {/* Constraint checks */}
        {diff.constraints.checked.length > 0 && (
          <div className="mt-2 flex items-center gap-1 text-xs text-gray-500">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span>Checked: {diff.constraints.checked.join(', ')}</span>
          </div>
        )}
      </div>

      {/* Status badges */}
      <div className="flex flex-col gap-1 flex-shrink-0">
        {hasBlockers && (
          <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-700 rounded">
            Blocked
          </span>
        )}
        {hasWarnings && !hasBlockers && (
          <span className="px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-700 rounded">
            Warning
          </span>
        )}
        {!hasBlockers && !hasWarnings && (
          <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-700 rounded">
            Valid
          </span>
        )}
      </div>
    </div>
  );
}
