# Preview → Apply Flow - Implementation Plan

## Goal

Keep humans in control by showing AI-suggested changes visually before committing them to the database.

## Architecture

```
┌─────────────┐
│ User Query  │ "Assign Emma to Monday Supervisor shift"
└──────┬──────┘
       │
       ▼
┌─────────────────────┐
│ LLM Analysis        │ Validates constraints, generates operations
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ Preview API         │ POST /api/preview
│ - Validates ops     │ Returns previewId + diffs (NO DB writes)
│ - Stores in memory  │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ UI Renders Preview  │ Shows changes in calendar with:
│ - Green: New        │ - Color-coded diffs
│ - Yellow: Modified  │ - "Apply", "Discard", "Undo" buttons
│ - Red: Removed      │ - Highlights exact locations
└──────┬──────────────┘
       │
       ├──→ [Apply] ──→ POST /api/preview/:id/apply
       │                 └─→ Single DB transaction
       │                     Idempotent, version-checked
       │                     Audit logged
       │
       ├──→ [Undo] ───→ POST /api/preview/:id/undo
       │                 └─→ Replays inverse diff
       │
       └──→ [Discard] ─→ DELETE /api/preview/:id
                         └─→ Clears preview from memory
```

## 1. Define Canonical Operations

### Operation Types

```typescript
// src/types/preview.ts

export type OperationType =
  | 'assign_shift'      // Assign employee to open shift
  | 'unassign_shift'    // Remove employee from shift
  | 'swap_shifts'       // Swap two employees' shifts
  | 'add_shift'         // Create new shift template
  | 'edit_shift'        // Modify shift times/role
  | 'edit_employee'     // Update employee details
  | 'delete_shift';     // Remove shift template

export interface BaseOperation {
  type: OperationType;
  storeId: string;
  weekId: string;
  timestamp: string;
  source: 'ai' | 'user';
}

export interface AssignShiftOp extends BaseOperation {
  type: 'assign_shift';
  shiftId: string;
  employeeId: string;
  reason?: string; // Why AI suggested this
}

export interface UnassignShiftOp extends BaseOperation {
  type: 'unassign_shift';
  assignmentId: string;
  reason?: string;
}

export interface SwapShiftsOp extends BaseOperation {
  type: 'swap_shifts';
  assignment1Id: string;
  assignment2Id: string;
  employee1Id: string;
  employee2Id: string;
  reason?: string;
}

export interface AddShiftOp extends BaseOperation {
  type: 'add_shift';
  day: Weekday;
  start: string; // HH:MM
  end: string;
  workTypeName: string;
  capacity: number;
}

export interface EditShiftOp extends BaseOperation {
  type: 'edit_shift';
  shiftId: string;
  changes: {
    start?: string;
    end?: string;
    workTypeName?: string;
    capacity?: number;
  };
}

export interface EditEmployeeOp extends BaseOperation {
  type: 'edit_employee';
  employeeId: string;
  changes: {
    name?: string;
    weeklyMinutesTarget?: number;
    alias?: string;
  };
}

export type Operation =
  | AssignShiftOp
  | UnassignShiftOp
  | SwapShiftsOp
  | AddShiftOp
  | EditShiftOp
  | EditEmployeeOp;
```

### Diff Structure

```typescript
export interface Diff {
  operation: Operation;
  before: DiffSnapshot; // State before change
  after: DiffSnapshot;  // State after change
  inverseDiff?: Diff;   // For undo functionality
  constraints: {
    checked: string[];  // List of constraints validated
    warnings: string[]; // Non-blocking warnings
    blockers: string[]; // Would prevent apply
  };
}

export interface DiffSnapshot {
  assignments?: Assignment[];
  shifts?: Shift[];
  employees?: Employee[];
  weeklyMinutes?: Record<string, number>; // employeeId → minutes
}

export interface Preview {
  id: string;
  storeId: string;
  weekId: string;
  snapshotVersion: string; // For optimistic locking
  operations: Operation[];
  diffs: Diff[];
  createdAt: string;
  expiresAt: string; // Auto-expire after 30 minutes
  status: 'pending' | 'applied' | 'discarded' | 'expired';
  appliedAt?: string;
  appliedBy?: string; // User ID
}
```

## 2. Preview API Endpoints

### 2.1 Create Preview

```typescript
// POST /api/preview
// Creates preview without modifying DB

interface CreatePreviewRequest {
  storeId: string;
  weekId: string;
  operations: Operation[];
  snapshotVersion: string; // Current version for conflict detection
}

interface CreatePreviewResponse {
  preview: Preview;
  diffs: Diff[];
  visualization: {
    calendarChanges: CalendarChange[]; // For UI rendering
    employeeImpacts: EmployeeImpact[];
  };
}

// Implementation:
// 1. Load current snapshot from DB
// 2. For each operation:
//    a. Validate constraints (NO writes)
//    b. Compute before/after states
//    c. Generate inverse diff for undo
// 3. Store preview in Redis/memory (30min TTL)
// 4. Return previewId + visualization data
```

### 2.2 Apply Preview

```typescript
// POST /api/preview/:id/apply
// Commits all changes in single transaction

interface ApplyPreviewRequest {
  previewId: string;
  snapshotVersion: string; // Must match current version
}

interface ApplyPreviewResponse {
  success: boolean;
  appliedOps: number;
  newSnapshotVersion: string;
  conflicts?: ConflictInfo[]; // If version mismatch
}

// Implementation:
// 1. Load preview from storage
// 2. Check preview not expired
// 3. Verify snapshotVersion matches current (optimistic locking)
// 4. BEGIN TRANSACTION
// 5. Apply all operations
// 6. Update snapshotVersion
// 7. Log audit trail
// 8. COMMIT
// 9. Mark preview as 'applied'
// 10. Invalidate related caches
```

### 2.3 Undo Preview

```typescript
// POST /api/preview/:id/undo
// Reverts changes using inverse diffs

interface UndoPreviewResponse {
  success: boolean;
  revertedOps: number;
  newSnapshotVersion: string;
}

// Implementation:
// 1. Load applied preview
// 2. Extract inverse diffs
// 3. Create new preview with inverse operations
// 4. Apply inverse preview (same flow as apply)
// 5. Log undo in audit trail
```

### 2.4 Discard Preview

```typescript
// DELETE /api/preview/:id
// Removes preview from storage

interface DiscardPreviewResponse {
  success: boolean;
}

// Implementation:
// 1. Mark preview as 'discarded'
// 2. Remove from storage
// 3. No DB changes needed
```

## 3. UI Visualization

### 3.1 Calendar Changes

```typescript
export interface CalendarChange {
  type: 'add' | 'modify' | 'remove';
  entity: 'assignment' | 'shift';
  day: Weekday;
  start: string;
  end: string;
  employeeName?: string;
  workTypeName: string;
  color: {
    bg: string;    // Background color
    border: string; // Border color
    text: string;   // Text color
  };
  position: {
    row: number; // Employee row index
    col: number; // Day column (0-6)
  };
  diff: {
    before?: string; // Previous state description
    after?: string;  // New state description
  };
}

// Color scheme:
const PREVIEW_COLORS = {
  add: {
    bg: 'bg-green-50',
    border: 'border-green-500 border-2 border-dashed',
    text: 'text-green-900'
  },
  modify: {
    bg: 'bg-yellow-50',
    border: 'border-yellow-500 border-2 border-dashed',
    text: 'text-yellow-900'
  },
  remove: {
    bg: 'bg-red-50',
    border: 'border-red-500 border-2 border-dashed',
    text: 'text-red-900'
  }
};
```

### 3.2 Employee Impact

```typescript
export interface EmployeeImpact {
  employeeId: string;
  employeeName: string;
  changes: {
    weeklyMinutes: {
      before: number;
      after: number;
      delta: number; // Positive = more hours
    };
    assignmentCount: {
      before: number;
      after: number;
      delta: number;
    };
    daysWorked: {
      before: Weekday[];
      after: Weekday[];
      added: Weekday[];
      removed: Weekday[];
    };
  };
  warnings: string[]; // e.g., "Exceeds weekly target by 2h"
}
```

### 3.3 Preview Component

```tsx
// src/components/preview-panel.tsx

interface PreviewPanelProps {
  preview: Preview;
  onApply: () => void;
  onDiscard: () => void;
  onUndo: () => void;
}

export function PreviewPanel({ preview, onApply, onDiscard, onUndo }: PreviewPanelProps) {
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t-2 border-blue-500 shadow-lg p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Icon name="preview" className="text-blue-500" />
          <h3 className="font-semibold">Preview Changes ({preview.diffs.length})</h3>
          <Badge variant="info">AI Suggested</Badge>
        </div>
        
        {/* Actions */}
        <div className="flex gap-2">
          <Button variant="outline" onClick={onDiscard}>
            Discard
          </Button>
          {preview.status === 'applied' && (
            <Button variant="outline" onClick={onUndo}>
              Undo
            </Button>
          )}
          <Button variant="primary" onClick={onApply} disabled={hasBlockers}>
            Apply Changes
          </Button>
        </div>
      </div>

      {/* Changes List */}
      <div className="space-y-2 max-h-60 overflow-y-auto">
        {preview.diffs.map((diff, idx) => (
          <DiffCard key={idx} diff={diff} />
        ))}
      </div>

      {/* Warnings */}
      {preview.diffs.some(d => d.constraints.warnings.length > 0) && (
        <Alert variant="warning" className="mt-4">
          <AlertTitle>Warnings</AlertTitle>
          <ul className="list-disc list-inside">
            {preview.diffs.flatMap(d => d.constraints.warnings).map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </Alert>
      )}
    </div>
  );
}
```

### 3.4 Diff Card Component

```tsx
function DiffCard({ diff }: { diff: Diff }) {
  const op = diff.operation;
  
  return (
    <div className="flex items-start gap-3 p-3 border rounded-lg bg-gray-50">
      {/* Icon based on operation type */}
      <OperationIcon type={op.type} />
      
      {/* Description */}
      <div className="flex-1">
        <div className="font-medium">
          {getOperationDescription(op)}
        </div>
        
        {/* Before/After comparison */}
        {diff.before && diff.after && (
          <div className="mt-2 text-sm text-gray-600 space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-red-600">Before:</span>
              <StateDisplay state={diff.before} />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-green-600">After:</span>
              <StateDisplay state={diff.after} />
            </div>
          </div>
        )}
        
        {/* Reason */}
        {op.reason && (
          <div className="mt-2 text-sm text-blue-600 flex items-start gap-1">
            <Icon name="info" className="w-4 h-4 mt-0.5" />
            <span>{op.reason}</span>
          </div>
        )}
      </div>
      
      {/* Status badges */}
      <div className="flex flex-col gap-1">
        {diff.constraints.blockers.length > 0 && (
          <Badge variant="error">Blocked</Badge>
        )}
        {diff.constraints.warnings.length > 0 && (
          <Badge variant="warning">Warning</Badge>
        )}
      </div>
    </div>
  );
}
```

### 3.5 Calendar Integration

```tsx
// Modify existing ScheduleCalendar component

function ScheduleCalendar({ schedule, preview }: ScheduleCalendarProps) {
  // Merge preview changes into calendar view
  const calendarData = useMemo(() => {
    if (!preview) return schedule;
    
    return {
      ...schedule,
      assignments: applyPreviewToAssignments(schedule.assignments, preview),
      shifts: applyPreviewToShifts(schedule.shifts, preview)
    };
  }, [schedule, preview]);

  return (
    <div className="schedule-calendar">
      {/* Render cells with preview highlighting */}
      {calendarData.assignments.map(assignment => (
        <AssignmentCell
          key={assignment.id}
          assignment={assignment}
          previewStyle={getPreviewStyle(assignment.id, preview)}
        />
      ))}
      
      {/* Preview overlay */}
      {preview && <PreviewOverlay preview={preview} />}
    </div>
  );
}

function getPreviewStyle(assignmentId: string, preview?: Preview) {
  if (!preview) return null;
  
  const change = preview.diffs.find(d => 
    d.operation.type === 'assign_shift' && 
    // Match assignment ID
  );
  
  if (!change) return null;
  
  return PREVIEW_COLORS[change.type];
}
```

## 4. Backend Implementation

### 4.1 Preview Service

```typescript
// src/server/preview/preview-service.ts

import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';

export class PreviewService {
  private redis: Redis;
  private prisma: PrismaClient;
  
  async createPreview(request: CreatePreviewRequest): Promise<Preview> {
    // 1. Load current snapshot
    const snapshot = await this.loadSnapshot(request.storeId, request.weekId);
    
    // 2. Validate version
    if (snapshot.version !== request.snapshotVersion) {
      throw new VersionMismatchError('Snapshot has been modified');
    }
    
    // 3. Compute diffs for each operation
    const diffs: Diff[] = [];
    for (const op of request.operations) {
      const diff = await this.computeDiff(op, snapshot);
      diffs.push(diff);
    }
    
    // 4. Create preview object
    const preview: Preview = {
      id: generateId(),
      storeId: request.storeId,
      weekId: request.weekId,
      snapshotVersion: request.snapshotVersion,
      operations: request.operations,
      diffs,
      createdAt: new Date().toISOString(),
      expiresAt: addMinutes(new Date(), 30).toISOString(),
      status: 'pending'
    };
    
    // 5. Store in Redis (30min TTL)
    await this.redis.setex(
      `preview:${preview.id}`,
      1800, // 30 minutes
      JSON.stringify(preview)
    );
    
    return preview;
  }
  
  private async computeDiff(op: Operation, snapshot: Snapshot): Promise<Diff> {
    switch (op.type) {
      case 'assign_shift':
        return this.computeAssignDiff(op as AssignShiftOp, snapshot);
      case 'unassign_shift':
        return this.computeUnassignDiff(op as UnassignShiftOp, snapshot);
      // ... other cases
    }
  }
  
  private async computeAssignDiff(
    op: AssignShiftOp,
    snapshot: Snapshot
  ): Promise<Diff> {
    const shift = snapshot.shifts.find(s => s.id === op.shiftId);
    const employee = snapshot.employees.find(e => e.id === op.employeeId);
    
    if (!shift || !employee) {
      throw new Error('Shift or employee not found');
    }
    
    // Before state
    const before: DiffSnapshot = {
      assignments: snapshot.assignments.filter(a => 
        a.employeeId === op.employeeId && a.day === shift.day
      ),
      weeklyMinutes: {
        [op.employeeId]: employee.weeklyMinutes
      }
    };
    
    // After state (simulated)
    const newAssignment = {
      id: generateId(),
      shiftId: op.shiftId,
      employeeId: op.employeeId,
      day: shift.day,
      durationMins: calculateDuration(shift.start, shift.end),
      workTypeName: shift.workTypeName
    };
    
    const after: DiffSnapshot = {
      assignments: [...before.assignments!, newAssignment],
      weeklyMinutes: {
        [op.employeeId]: employee.weeklyMinutes + newAssignment.durationMins
      }
    };
    
    // Check constraints
    const constraints = await this.checkConstraints(op, before, after);
    
    // Generate inverse for undo
    const inverseDiff: Diff = {
      operation: {
        type: 'unassign_shift',
        assignmentId: newAssignment.id,
        ...op
      } as UnassignShiftOp,
      before: after,
      after: before,
      constraints: { checked: [], warnings: [], blockers: [] }
    };
    
    return {
      operation: op,
      before,
      after,
      inverseDiff,
      constraints
    };
  }
  
  async applyPreview(previewId: string, userId: string): Promise<void> {
    // 1. Load preview
    const preview = await this.loadPreview(previewId);
    
    if (!preview) {
      throw new Error('Preview not found or expired');
    }
    
    if (preview.status !== 'pending') {
      throw new Error('Preview already applied or discarded');
    }
    
    // 2. Begin transaction
    await this.prisma.$transaction(async (tx) => {
      // 3. Check version (optimistic locking)
      const currentVersion = await tx.schedule.findUnique({
        where: { storeId_weekId: { storeId: preview.storeId, weekId: preview.weekId } },
        select: { version: true }
      });
      
      if (currentVersion?.version !== preview.snapshotVersion) {
        throw new VersionMismatchError('Schedule has been modified');
      }
      
      // 4. Apply each operation
      for (const op of preview.operations) {
        await this.applyOperation(op, tx);
      }
      
      // 5. Increment version
      await tx.schedule.update({
        where: { storeId_weekId: { storeId: preview.storeId, weekId: preview.weekId } },
        data: { version: { increment: 1 } }
      });
      
      // 6. Audit log
      await tx.auditLog.create({
        data: {
          action: 'APPLY_PREVIEW',
          previewId,
          userId,
          operations: preview.operations,
          timestamp: new Date()
        }
      });
    });
    
    // 7. Update preview status
    preview.status = 'applied';
    preview.appliedAt = new Date().toISOString();
    preview.appliedBy = userId;
    await this.redis.setex(
      `preview:${previewId}`,
      3600, // Keep for 1 hour after apply (for undo)
      JSON.stringify(preview)
    );
  }
}
```

## 5. Security & Validation

### 5.1 Version Control

```typescript
// Optimistic locking pattern
interface Schedule {
  id: string;
  storeId: string;
  weekId: string;
  version: number; // Incremented on every change
  updatedAt: Date;
}

// Before apply:
const current = await prisma.schedule.findUnique({ where: { id } });
if (current.version !== preview.snapshotVersion) {
  throw new ConflictError('Schedule was modified by another user');
}
```

### 5.2 Scope Validation

```typescript
// Ensure preview only affects authorized store/week
function validatePreviewScope(preview: Preview, userId: string) {
  const user = await getUser(userId);
  
  if (!user.stores.includes(preview.storeId)) {
    throw new ForbiddenError('Not authorized for this store');
  }
  
  // Validate all operations are scoped to same store/week
  for (const op of preview.operations) {
    if (op.storeId !== preview.storeId || op.weekId !== preview.weekId) {
      throw new Error('Operation out of scope');
    }
  }
}
```

### 5.3 Constraint Re-validation

```typescript
// ALWAYS re-check constraints before apply
async function applyPreview(preview: Preview) {
  // Even though we checked during preview creation,
  // re-validate in case something changed
  for (const diff of preview.diffs) {
    const freshConstraints = await checkConstraints(diff.operation);
    
    if (freshConstraints.blockers.length > 0) {
      throw new ConstraintViolationError(
        'Constraints no longer satisfied',
        freshConstraints.blockers
      );
    }
  }
  
  // Proceed with apply...
}
```

## 6. LLM Integration

### 6.1 Generate Operations Tool

```typescript
// Add new tool to chat API

{
  type: "function",
  function: {
    name: "generate_preview",
    description: "Generate preview of scheduling changes before applying. Returns previewId and visualization.",
    parameters: {
      type: "object",
      properties: {
        operations: {
          type: "array",
          items: {
            type: "object",
            properties: {
              type: { type: "string", enum: ["assign_shift", "unassign_shift", "swap_shifts"] },
              // ... operation-specific fields
            }
          }
        },
        reason: {
          type: "string",
          description: "Why these changes are suggested"
        }
      },
      required: ["operations"]
    }
  }
}
```

### 6.2 LLM Response Format

```typescript
// When LLM suggests changes:
{
  "tool": "generate_preview",
  "operations": [
    {
      "type": "assign_shift",
      "shiftId": "shift-mon-supervisor-1",
      "employeeId": "emp-emma",
      "reason": "Emma Brown has 0h/16h target and no Monday conflicts"
    },
    {
      "type": "assign_shift",
      "shiftId": "shift-mon-supervisor-2",
      "employeeId": "emp-bob",
      "reason": "Bob Smith has 26h/40h target and availability"
    }
  ],
  "explanation": "Assigned Emma and Bob to cover both Monday Supervisor shifts. Emma needs hours and Bob is under target."
}
```

## 7. Implementation Phases

### Phase 1: Core Infrastructure (Week 1)
- [ ] Define types (`preview.ts`)
- [ ] Create Preview API routes
- [ ] Implement PreviewService
- [ ] Add Redis for preview storage
- [ ] Set up version control in schema

### Phase 2: Operations (Week 2)
- [ ] Implement `assign_shift` operation
- [ ] Implement `unassign_shift` operation
- [ ] Implement `swap_shifts` operation
- [ ] Add constraint validation
- [ ] Create inverse diff generation

### Phase 3: UI Components (Week 3)
- [ ] Build PreviewPanel component
- [ ] Create DiffCard component
- [ ] Integrate with calendar
- [ ] Add color-coded highlighting
- [ ] Implement Apply/Discard/Undo buttons

### Phase 4: LLM Integration (Week 4)
- [ ] Add `generate_preview` tool
- [ ] Update prompts for preview generation
- [ ] Handle preview responses
- [ ] Add AI reasoning display

### Phase 5: Testing & Polish (Week 5)
- [ ] Unit tests for operations
- [ ] Integration tests for apply flow
- [ ] UI/UX testing
- [ ] Performance optimization
- [ ] Documentation

## 8. Success Criteria

✅ Manager can see AI suggestions before they're applied  
✅ Changes appear in calendar with distinct visual styling  
✅ Can apply/discard/undo in single click  
✅ No data loss or corruption during apply  
✅ Version conflicts detected and prevented  
✅ Audit trail for all applied changes  
✅ Preview expires after 30 minutes  
✅ Undo functionality works reliably  

## Next Steps

1. Start with Phase 1 (types + API structure)
2. Implement simple `assign_shift` operation first
3. Build minimal UI for preview display
4. Iterate and expand to other operation types

Ready to start implementation?
