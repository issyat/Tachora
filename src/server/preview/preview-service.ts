/**
 * PreviewService
 * 
 * Manages preview lifecycle: create, store, apply, undo, discard.
 * Uses Redis for temporary storage (30min TTL).
 */

import { PrismaClient } from '@prisma/client';
import {
  ConstraintViolationError,
  type Operation,
  type Preview,
  type Diff,
  type DiffSnapshot,
  type CreatePreviewRequest,
  type AssignShiftOp,
  type UnassignShiftOp,
  type SwapShiftsOp,
  type AddShiftOp,
  type PreviewVisualization,
  type CalendarChange,
  type EmployeeImpact,
  type VersionMismatchError,
  type PreviewNotFoundError,
  type PreviewExpiredError,
} from '@/types/preview';
import { Weekday } from '@/types';
import { checkAssignConstraints, checkSwapConstraints } from './constraint-checker';

// Redis client will be initialized later
// For now, we'll use an in-memory Map for development
type RedisClient = {
  setex: (key: string, ttl: number, value: string) => Promise<void>;
  get: (key: string) => Promise<string | null>;
  del: (key: string) => Promise<void>;
};

class InMemoryRedis implements RedisClient {
  private store = new Map<string, { value: string; expiresAt: number }>();

  async setex(key: string, ttl: number, value: string): Promise<void> {
    console.log('[InMemoryRedis.setex] Storing key:', key, 'TTL:', ttl);
    console.log('[InMemoryRedis.setex] Current instance ID:', (this as any).__instanceId || 'unknown');
    console.log('[InMemoryRedis.setex] Store memory address:', (this.store as any).__address || this.store);
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttl * 1000,
    });
    console.log('[InMemoryRedis.setex] Store now has', this.store.size, 'keys:', Array.from(this.store.keys()));
  }

  async get(key: string): Promise<string | null> {
    console.log('[InMemoryRedis.get] Looking for key:', key);
    console.log('[InMemoryRedis.get] Current instance ID:', (this as any).__instanceId || 'unknown');
    console.log('[InMemoryRedis.get] Store memory address:', (this.store as any).__address || this.store);
    console.log('[InMemoryRedis.get] Store has', this.store.size, 'keys:', Array.from(this.store.keys()));
    const entry = this.store.get(key);
    if (!entry) {
      console.log('[InMemoryRedis.get] Key not found');
      return null;
    }
    
    if (Date.now() > entry.expiresAt) {
      console.log('[InMemoryRedis.get] Key expired');
      this.store.delete(key);
      return null;
    }
    
    console.log('[InMemoryRedis.get] Key found, returning value');
    return entry.value;
  }

  async del(key: string): Promise<void> {
    console.log('[InMemoryRedis.del] Deleting key:', key);
    this.store.delete(key);
  }
}

// Use global object to persist singleton across Next.js hot reloads
declare global {
  var __previewRedis: InMemoryRedis | undefined;
}

if (!global.__previewRedis) {
  console.log('[PreviewService] Creating NEW InMemoryRedis singleton instance');
  global.__previewRedis = new InMemoryRedis();
  (global.__previewRedis as any).__instanceId = Date.now();
} else {
  console.log('[PreviewService] Reusing EXISTING InMemoryRedis singleton instance');
  console.log('[PreviewService] Instance ID:', (global.__previewRedis as any).__instanceId);
}

const globalRedis = global.__previewRedis;

interface MinimalSnapshot {
  scheduleId: string; // Added for apply operations
  version: string;
  shifts: Array<{
    id: string;
    templateId: string; // Original template ID
    day: Weekday;
    start: string;
    end: string;
    startTime: Date; // Full Date object for DB
    endTime: Date;   // Full Date object for DB
    workTypeName: string;
    workTypeId: string; // Added for DB operations
    capacity: number;
  }>;
  assignments: Array<{
    id: string;
    shiftId: string;
    employeeId: string | null;
    day: Weekday;
    start: string;
    end: string;
    durationMins: number;
    workTypeId: string;
    workTypeName: string;
  }>;
  employees: Array<{
    id: string;
    name: string;
    alias?: string;
    storeId: string;
    canWorkAcrossStores: boolean;
    contractType: string | null;
    weeklyMinutes: number;
    weeklyMinutesTarget: number;
    workTypeIds: string[];
    workTypeNames: string[];
    availability?: Array<{
      day: Weekday;
      isOff: boolean;
      startTime?: string; // HH:mm format
      endTime?: string;   // HH:mm format
    }>;
  }>;
}

export class PreviewService {
  private redis: RedisClient;
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient, redis?: RedisClient) {
    this.prisma = prisma;
    this.redis = redis || globalRedis; // Use singleton instead of new instance
  }

  /**
   * Create a preview without modifying the database.
   * Validates operations and computes diffs.
   */
  async createPreview(request: CreatePreviewRequest): Promise<{
    preview: Preview;
    visualization: PreviewVisualization;
  }> {
    // 1. Load current snapshot
    const snapshot = await this.loadSnapshot(request.storeId, request.weekId);

    // 2. Validate version (optimistic locking)
    if (snapshot.version !== request.snapshotVersion) {
      const error = new Error('Snapshot has been modified by another user') as VersionMismatchError;
      error.name = 'VersionMismatchError';
      throw error;
    }

    // 3. Compute diffs for each operation
    const diffs: Diff[] = [];
    for (const op of request.operations) {
      const diff = await this.computeDiff(op, snapshot);
      diffs.push(diff);
    }

    // 4. Check for blockers - reject preview if any operation has blockers
    const allBlockers = diffs.flatMap(d => d.constraints.blockers);
    if (allBlockers.length > 0) {
      throw new ConstraintViolationError(
        `Cannot create preview due to constraint violations: ${allBlockers.join('; ')}`,
        allBlockers
      );
    }

    // 5. Create preview object
    const previewId = this.generateId();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 60 * 1000); // 30 minutes

    const preview: Preview = {
      id: previewId,
      storeId: request.storeId,
      weekId: request.weekId,
      snapshotVersion: request.snapshotVersion,
      operations: request.operations,
      diffs,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      status: 'pending',
    };

    // 5. Store in Redis (30min TTL)
    console.log('[createPreview] Storing preview with ID:', preview.id);
    console.log('[createPreview] Using redis instance:', (this.redis as any).__instanceId || 'unknown');
    await this.redis.setex(
      `preview:${preview.id}`,
      1800, // 30 minutes in seconds
      JSON.stringify(preview)
    );
    console.log('[createPreview] Preview stored successfully');

    // 6. Generate visualization data
    const visualization = this.generateVisualization(preview, snapshot);

    return { preview, visualization };
  }

  /**
   * Apply a pending preview to the database.
   * Uses a single transaction with optimistic locking.
   */
  async applyPreview(
    previewId: string,
    userId: string,
    currentVersion: string
  ): Promise<{ success: boolean; appliedOps: number; newVersion: string }> {
    // 1. Load preview
    const preview = await this.loadPreview(previewId);

    if (!preview) {
      const error = new Error(`Preview ${previewId} not found or expired`) as PreviewNotFoundError;
      error.name = 'PreviewNotFoundError';
      throw error;
    }

    if (preview.status !== 'pending') {
      throw new Error(`Preview ${previewId} is not pending (status: ${preview.status})`);
    }

    // 2. Check if expired
    if (new Date(preview.expiresAt) < new Date()) {
      const error = new Error(`Preview ${previewId} has expired`) as PreviewExpiredError;
      error.name = 'PreviewExpiredError';
      throw error;
    }

    let newVersion = '1';
    let appliedCount = 0;

    // Load snapshot for operation context
    const snapshot = await this.loadSnapshot(preview.storeId, preview.weekId);

    // 3. Apply in transaction
    await this.prisma.$transaction(async (tx: any) => {
      // Verify version hasn't changed
      const schedule = await tx.schedule.findUnique({
        where: {
          storeId_isoWeek: {
            storeId: preview.storeId,
            isoWeek: preview.weekId,
          },
        },
        select: { version: true },
      });

      if (!schedule) {
        throw new Error('Schedule not found');
      }

      if (schedule.version.toString() !== currentVersion) {
        const error = new Error('Schedule has been modified by another user') as VersionMismatchError;
        error.name = 'VersionMismatchError';
        throw error;
      }

      // Apply each operation
      for (const op of preview.operations) {
        await this.applyOperation(op, tx as unknown as PrismaClient, snapshot);
        appliedCount++;
      }

      // Increment version
      const updated = await tx.schedule.update({
        where: {
          storeId_isoWeek: {
            storeId: preview.storeId,
            isoWeek: preview.weekId,
          },
        },
        data: { version: { increment: 1 } },
        select: { version: true },
      });

      newVersion = updated.version.toString();
    });

    // 4. Mark preview as applied
    preview.status = 'applied';
    preview.appliedAt = new Date().toISOString();
    preview.appliedBy = userId;

    // Keep for 1 hour after apply (for potential undo)
    await this.redis.setex(
      `preview:${previewId}`,
      3600,
      JSON.stringify(preview)
    );

    return {
      success: true,
      appliedOps: appliedCount,
      newVersion,
    };
  }

  /**
   * Discard a preview without applying it.
   */
  /**
   * Get a preview by ID (for LLM tool integration)
   */
  async getPreview(previewId: string): Promise<Preview | null> {
    return this.loadPreview(previewId);
  }

  async discardPreview(previewId: string): Promise<{ success: boolean }> {
    const preview = await this.loadPreview(previewId);
    
    if (!preview) {
      return { success: false };
    }

    preview.status = 'discarded';
    await this.redis.del(`preview:${previewId}`);

    return { success: true };
  }

  /**
   * Undo an applied preview by creating and applying inverse operations.
   */
  async undoPreview(
    previewId: string,
    userId: string
  ): Promise<{ success: boolean; revertedOps: number; newVersion: string }> {
    const preview = await this.loadPreview(previewId);

    if (!preview || preview.status !== 'applied') {
      throw new Error('Preview not found or not applied');
    }

    // Extract inverse operations from diffs
    const inverseOperations: Operation[] = [];
    for (const diff of preview.diffs) {
      if (diff.inverseDiff) {
        inverseOperations.push(diff.inverseDiff.operation);
      }
    }

    // Create new preview with inverse operations
    const snapshot = await this.loadSnapshot(preview.storeId, preview.weekId);
    
    const undoPreview = await this.createPreview({
      storeId: preview.storeId,
      weekId: preview.weekId,
      operations: inverseOperations,
      snapshotVersion: snapshot.version,
    });

    // Apply the undo preview
    const result = await this.applyPreview(
      undoPreview.preview.id,
      userId,
      snapshot.version
    );

    return {
      success: true,
      revertedOps: result.appliedOps,
      newVersion: result.newVersion,
    };
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private async loadSnapshot(
    storeId: string,
    weekId: string
  ): Promise<MinimalSnapshot> {
    const schedule = await this.prisma.schedule.findUnique({
      where: {
        storeId_isoWeek: {
          storeId,
          isoWeek: weekId,
        },
      },
      include: {
        assignments: {
          include: {
            workType: true,
            employee: true,
          },
        },
      },
    });

    if (!schedule) {
      throw new Error('Schedule not found');
    }

    // Get shift templates
    const shiftTemplates = await this.prisma.shiftTemplate.findMany({
      where: { storeId },
      include: { workType: true },
    });

    // Get employees with availability
    const employees = await this.prisma.employee.findMany({
      where: { storeId },
      include: {
        availability: true,
        roles: {
          include: {
            workType: true,
          },
        },
      },
    });

    // Convert to minimal snapshot format
    const shifts = shiftTemplates.flatMap((template: any) => {
      // Prisma returns JSON fields as already-parsed objects
      // Days can be either an array ["MON", "TUE"] or object {MON: true, TUE: true}
      const daysField = template.days;
      let days: Weekday[];
      
      if (Array.isArray(daysField)) {
        days = daysField as Weekday[];
      } else if (daysField && typeof daysField === 'object') {
        // Convert {MON: true, TUE: false} to ["MON"]
        days = Object.entries(daysField)
          .filter(([_, enabled]) => enabled === true)
          .map(([day, _]) => day as Weekday);
      } else {
        console.warn(`Template ${template.id} has invalid days field:`, daysField);
        return [];
      }
      
      return days.map((day) => ({
        id: `${template.id}-${day}`,
        templateId: template.id,
        day,
        start: this.formatTime(template.startTime),
        end: this.formatTime(template.endTime),
        startTime: template.startTime,
        endTime: template.endTime,
        workTypeName: template.workType.name,
        workTypeId: template.workTypeId,
        capacity: 1, // TODO: Get from template
      }));
    });

    const assignments = schedule.assignments.map((a: any) => {
      const start = this.formatTime(a.startTime);
      const end = this.formatTime(a.endTime);
      return {
        id: a.id,
        shiftId: a.sourceTemplateId ? `${a.sourceTemplateId}-${a.day}` : a.id,
        employeeId: a.employeeId ?? null,
        day: a.day,
        start,
        end,
        durationMins: this.calculateDuration(start, end),
        workTypeId: a.workTypeId,
        workTypeName: a.workType.name,
      };
    });

    // Calculate weekly minutes per employee
    const weeklyMinutesMap = new Map<string, number>();
    for (const assignment of assignments) {
      if (assignment.employeeId) {
        const current = weeklyMinutesMap.get(assignment.employeeId) || 0;
        weeklyMinutesMap.set(assignment.employeeId, current + assignment.durationMins);
      }
    }

    return {
      scheduleId: schedule.id,
      version: (schedule.version ?? 1).toString(),
      shifts,
      assignments,
      employees: employees.map((e: any) => ({
        id: e.id,
        name: e.name,
        alias: e.email || undefined,
        storeId: e.storeId,
        canWorkAcrossStores: e.canWorkAcrossStores,
        contractType: e.contractType ?? null,
        weeklyMinutes: weeklyMinutesMap.get(e.id) || 0,
        weeklyMinutesTarget: e.weeklyMinutesTarget,
        workTypeIds: e.roles?.map((role: any) => role.workTypeId) ?? [],
        workTypeNames: e.roles?.map((role: any) => role.workType?.name).filter(Boolean) ?? [],
        availability: e.availability?.map((a: any) => ({
          day: a.day,
          isOff: a.isOff,
          startTime: a.startTime ? this.formatTime(a.startTime) : undefined,
          endTime: a.endTime ? this.formatTime(a.endTime) : undefined,
        })),
      })),
    };
  }

  private async computeDiff(
    op: Operation,
    snapshot: MinimalSnapshot
  ): Promise<Diff> {
    switch (op.type) {
      case 'assign_shift':
        return this.computeAssignDiff(op as AssignShiftOp, snapshot);
      case 'unassign_shift':
        return this.computeUnassignDiff(op as UnassignShiftOp, snapshot);
      case 'swap_shifts':
        return this.computeSwapDiff(op as SwapShiftsOp, snapshot);
      case 'add_shift':
        return this.computeAddShiftDiff(op as AddShiftOp, snapshot);
      // TODO: Add other operation types (edit_shift, etc.)
      default:
        throw new Error(`Unsupported operation type: ${(op as any).type}`);
    }
  }

  private async computeAssignDiff(
    op: AssignShiftOp,
    snapshot: MinimalSnapshot
  ): Promise<Diff> {
    const shift = snapshot.shifts.find((s) => s.id === op.shiftId);
    const employee = snapshot.employees.find((e) => e.id === op.employeeId);

    if (!shift) {
      // Log available shifts for debugging
      const availableShiftIds = snapshot.shifts.slice(0, 10).map(s => s.id);
      console.error(`Shift ${op.shiftId} not found. Sample available shifts:`, availableShiftIds);
      throw new Error(`Shift ${op.shiftId} not found`);
    }
    if (!employee) {
      throw new Error(`Employee ${op.employeeId} not found`);
    }

    const durationMins = this.calculateDuration(shift.start, shift.end);

    // Before state: employee's current assignments on that day
    const existingAssignments = snapshot.assignments.filter(
      (a) => a.employeeId === op.employeeId && a.day === shift.day
    );

    const before: DiffSnapshot = {
      assignments: existingAssignments,
      weeklyMinutes: {
        [op.employeeId]: employee.weeklyMinutes,
      },
    };

    // After state: add new assignment
    const newAssignment = {
      id: this.generateId(),
      shiftId: op.shiftId,
      employeeId: op.employeeId,
      day: shift.day,
      durationMins,
      workTypeName: shift.workTypeName,
    };

    const after: DiffSnapshot = {
      assignments: [...existingAssignments, newAssignment],
      weeklyMinutes: {
        [op.employeeId]: employee.weeklyMinutes + durationMins,
      },
    };

    // Generate inverse diff for undo
    const inverseDiff: Diff = {
      operation: {
        type: 'unassign_shift',
        assignmentId: newAssignment.id,
        storeId: op.storeId,
        weekId: op.weekId,
        timestamp: op.timestamp,
        source: op.source,
        reason: `Undo: ${op.reason || 'assignment'}`,
      } as UnassignShiftOp,
      before: after,
      after: before,
      constraints: { checked: [], warnings: [], blockers: [] },
    };

    // Check constraints
    const constraints = checkAssignConstraints(op, snapshot);

    return {
      operation: op,
      before,
      after,
      inverseDiff,
      constraints,
    };
  }

  private async computeUnassignDiff(
    op: UnassignShiftOp,
    snapshot: MinimalSnapshot
  ): Promise<Diff> {
    const assignment = snapshot.assignments.find((a) => a.id === op.assignmentId);

    if (!assignment) {
      throw new Error(`Assignment ${op.assignmentId} not found`);
    }

    const employee = snapshot.employees.find((e) => e.id === assignment.employeeId);

    if (!employee) {
      throw new Error(`Employee ${assignment.employeeId} not found`);
    }

    const before: DiffSnapshot = {
      assignments: [assignment],
      weeklyMinutes: {
        [assignment.employeeId]: employee.weeklyMinutes,
      },
    };

    const after: DiffSnapshot = {
      assignments: [],
      weeklyMinutes: {
        [assignment.employeeId]: employee.weeklyMinutes - assignment.durationMins,
      },
    };

    // Generate inverse diff for undo
    const inverseDiff: Diff = {
      operation: {
        type: 'assign_shift',
        shiftId: assignment.shiftId,
        employeeId: assignment.employeeId,
        storeId: op.storeId,
        weekId: op.weekId,
        timestamp: op.timestamp,
        source: op.source,
        reason: `Undo: ${op.reason || 'unassignment'}`,
      } as AssignShiftOp,
      before: after,
      after: before,
      constraints: { checked: [], warnings: [], blockers: [] },
    };

    return {
      operation: op,
      before,
      after,
      inverseDiff,
      constraints: { checked: [], warnings: [], blockers: [] },
    };
  }

  private async computeSwapDiff(
    op: SwapShiftsOp,
    snapshot: MinimalSnapshot
  ): Promise<Diff> {
    const assignment1 = snapshot.assignments.find((a) => a.id === op.assignment1Id);
    const assignment2 = snapshot.assignments.find((a) => a.id === op.assignment2Id);

    if (!assignment1) {
      throw new Error(`Assignment ${op.assignment1Id} not found`);
    }
    if (!assignment2) {
      throw new Error(`Assignment ${op.assignment2Id} not found`);
    }

    const employee1 = snapshot.employees.find((e) => e.id === op.employee1Id);
    const employee2 = snapshot.employees.find((e) => e.id === op.employee2Id);

    if (!employee1) {
      throw new Error(`Employee ${op.employee1Id} not found`);
    }
    if (!employee2) {
      throw new Error(`Employee ${op.employee2Id} not found`);
    }

    // Before state: original assignments
    const before: DiffSnapshot = {
      assignments: [assignment1, assignment2],
      weeklyMinutes: {
        [op.employee1Id]: employee1.weeklyMinutes,
        [op.employee2Id]: employee2.weeklyMinutes,
      },
    };

    // After state: swapped employees
    const swappedAssignment1 = {
      ...assignment1,
      employeeId: op.employee2Id,
    };
    const swappedAssignment2 = {
      ...assignment2,
      employeeId: op.employee1Id,
    };

    // Calculate new weekly minutes (swap durations)
    const after: DiffSnapshot = {
      assignments: [swappedAssignment1, swappedAssignment2],
      weeklyMinutes: {
        [op.employee1Id]:
          employee1.weeklyMinutes - assignment1.durationMins + assignment2.durationMins,
        [op.employee2Id]:
          employee2.weeklyMinutes - assignment2.durationMins + assignment1.durationMins,
      },
    };

    // Generate inverse diff (swap back)
    const inverseDiff: Diff = {
      operation: {
        type: 'swap_shifts',
        assignment1Id: op.assignment1Id,
        assignment2Id: op.assignment2Id,
        employee1Id: op.employee2Id, // Swap the employee IDs for inverse
        employee2Id: op.employee1Id,
        storeId: op.storeId,
        weekId: op.weekId,
        timestamp: op.timestamp,
        source: op.source,
        reason: `Undo: ${op.reason || 'swap'}`,
      } as SwapShiftsOp,
      before: after,
      after: before,
      constraints: { checked: [], warnings: [], blockers: [] },
    };

    // Check constraints
    const constraints = checkSwapConstraints(op, snapshot);

    return {
      operation: op,
      before,
      after,
      inverseDiff,
      constraints,
    };
  }

  private async computeAddShiftDiff(
    op: AddShiftOp,
    snapshot: MinimalSnapshot
  ): Promise<Diff> {
    // Before state: no shift exists
    const before: DiffSnapshot = {
      shifts: [],
    };

    // After state: new shift will be created
    // We don't know the ID yet (it will be generated on apply), so use a placeholder
    const newShift = {
      id: 'pending-' + Date.now(), // Temporary ID until applied
      day: op.day,
      start: op.start,
      end: op.end,
      workTypeName: op.workTypeName,
      capacity: op.capacity,
    };

    const after: DiffSnapshot = {
      shifts: [newShift],
    };

    // No inverse diff for add_shift (would be delete_shift, not implemented yet)
    const inverseDiff = undefined;

    // Check constraints: none for now (shift creation is validated in handler)
    const constraints = {
      checked: ['valid_work_type', 'valid_time_format', 'valid_time_range'],
      warnings: [],
      blockers: [],
    };

    return {
      operation: op,
      before,
      after,
      inverseDiff,
      constraints,
    };
  }

  private async applyOperation(
    op: Operation,
    tx: PrismaClient,
    snapshot: MinimalSnapshot
  ): Promise<void> {
    switch (op.type) {
      case 'assign_shift': {
        const assignOp = op as AssignShiftOp;
        
        // Find shift details from snapshot
        const shift = snapshot.shifts.find((s) => s.id === assignOp.shiftId);
        const existingAssignment = snapshot.assignments.find(
          (a) => a.shiftId === assignOp.shiftId || a.id === assignOp.shiftId,
        );

        if (!shift && !existingAssignment) {
          throw new Error(`Shift ${assignOp.shiftId} not found in snapshot`);
        }

        const validation = checkAssignConstraints(assignOp, snapshot);
        if (validation.blockers.length > 0) {
          const error = new Error('shift changed - refresh options') as Error & { blockers?: string[] };
          error.name = 'ShiftValidationError';
          error.blockers = validation.blockers;
          throw error;
        }

        const durationMins = shift
          ? this.calculateDuration(shift.start, shift.end)
          : existingAssignment
            ? this.calculateDuration(existingAssignment.start, existingAssignment.end)
            : 0;

        if (existingAssignment) {
          await tx.assignment.update({
            where: { id: existingAssignment.id },
            data: { employeeId: assignOp.employeeId },
          });

          existingAssignment.employeeId = assignOp.employeeId;
        } else if (shift) {
          const created = await tx.assignment.create({
            data: {
              scheduleId: snapshot.scheduleId,
              day: shift.day,
              startTime: shift.startTime,
              endTime: shift.endTime,
              workTypeId: shift.workTypeId,
              employeeId: assignOp.employeeId,
              sourceTemplateId: shift.templateId,
            },
            select: {
              id: true,
              day: true,
            },
          });

          snapshot.assignments.push({
            id: created.id,
            shiftId: assignOp.shiftId,
            employeeId: assignOp.employeeId,
            day: shift.day,
            start: shift.start,
            end: shift.end,
            durationMins,
            workTypeId: shift.workTypeId,
            workTypeName: shift.workTypeName,
          });
        }

        const employeeRecord = snapshot.employees.find((e) => e.id === assignOp.employeeId);
        if (employeeRecord) {
          employeeRecord.weeklyMinutes += durationMins;
        }
        break;
      }
      case 'unassign_shift': {
        const unassignOp = op as UnassignShiftOp;
        
        // Set employeeId to null (keeps the open shift)
        await tx.assignment.update({
          where: { id: unassignOp.assignmentId },
          data: { employeeId: null },
        });
        break;
      }
      case 'swap_shifts': {
        const swapOp = op as SwapShiftsOp;
        
        // Swap the two employees' assignments
        await tx.assignment.update({
          where: { id: swapOp.assignment1Id },
          data: { employeeId: swapOp.employee2Id },
        });
        
        await tx.assignment.update({
          where: { id: swapOp.assignment2Id },
          data: { employeeId: swapOp.employee1Id },
        });
        break;
      }
      case 'add_shift': {
        const addOp = op as import('@/types/preview').AddShiftOp;
        
        // Find workType by name
        const workType = await tx.workType.findFirst({
          where: {
            storeId: op.storeId,
            name: {
              equals: addOp.workTypeName,
              mode: 'insensitive',
            },
          },
        });
        
        if (!workType) {
          throw new Error(`Work type "${addOp.workTypeName}" not found`);
        }
        
        // Convert HH:mm string to DateTime (stored as @db.Time in UTC)
        const [startHour, startMin] = addOp.start.split(':').map(Number);
        const [endHour, endMin] = addOp.end.split(':').map(Number);
        
        const startTime = new Date(Date.UTC(1970, 0, 1, startHour, startMin, 0));
        const endTime = new Date(Date.UTC(1970, 0, 1, endHour, endMin, 0));
        
        // Create days object with the selected day set to true
        const days: Record<string, boolean> = {
          MON: addOp.day === 'MON',
          TUE: addOp.day === 'TUE',
          WED: addOp.day === 'WED',
          THU: addOp.day === 'THU',
          FRI: addOp.day === 'FRI',
          SAT: addOp.day === 'SAT',
          SUN: addOp.day === 'SUN',
        };
        
        // Create shift template
        await tx.shiftTemplate.create({
          data: {
            storeId: op.storeId,
            workTypeId: workType.id,
            days, // Store as Record<string, boolean>
            startTime,
            endTime,
          },
        });
        break;
      }
      default:
        throw new Error(`Unsupported operation type: ${(op as any).type}`);
    }
  }

  private async loadPreview(previewId: string): Promise<Preview | null> {
    console.log('[loadPreview] Looking for preview:', previewId);
    console.log('[loadPreview] Using redis instance:', (this.redis as any).__instanceId || 'unknown');
    const data = await this.redis.get(`preview:${previewId}`);
    console.log('[loadPreview] Redis returned:', data ? 'FOUND' : 'NOT FOUND');
    if (!data) return null;
    return JSON.parse(data) as Preview;
  }

  private generateVisualization(
    preview: Preview,
    snapshot: MinimalSnapshot
  ): PreviewVisualization {
    const calendarChanges: CalendarChange[] = [];
    const employeeImpactsMap = new Map<string, EmployeeImpact>();

    // Generate calendar changes and track employee impacts
    for (const diff of preview.diffs) {
      const op = diff.operation;

      switch (op.type) {
        case 'assign_shift': {
          const assignOp = op as AssignShiftOp;
          const shift = snapshot.shifts.find(s => s.id === assignOp.shiftId);
          const employee = snapshot.employees.find(e => e.id === assignOp.employeeId);

          if (shift && employee) {
            // Calendar change: new or modified assignment
            const existingAssignment = diff.before.assignments?.find(
              a => a.employeeId === assignOp.employeeId && a.day === shift.day
            );

            const changeType: 'add' | 'modify' = existingAssignment ? 'modify' : 'add';

            calendarChanges.push({
              type: changeType,
              entity: 'assignment',
              day: shift.day,
              start: shift.start,
              end: shift.end,
              employeeId: employee.id,
              employeeName: employee.name,
              workTypeName: shift.workTypeName,
              color: this.getChangeColor(changeType),
              position: {
                row: this.getEmployeeRowIndex(employee.id, snapshot),
                col: this.getDayColumnIndex(shift.day),
              },
              diff: {
                before: existingAssignment 
                  ? `${existingAssignment.workTypeName} shift` 
                  : 'Open shift',
                after: `${employee.name} assigned to ${shift.workTypeName}`,
              },
            });

            // Track employee impact
            this.updateEmployeeImpact(
              employeeImpactsMap,
              employee,
              diff,
              snapshot
            );
          }
          break;
        }

        case 'unassign_shift': {
          const unassignOp = op as UnassignShiftOp;
          const assignment = diff.before.assignments?.[0];

          if (assignment) {
            const shift = snapshot.shifts.find(s => s.id === assignment.shiftId);
            const employee = snapshot.employees.find(e => e.id === assignment.employeeId);

            if (shift && employee) {
              calendarChanges.push({
                type: 'remove',
                entity: 'assignment',
                day: shift.day,
                start: shift.start,
                end: shift.end,
                employeeId: employee.id,
                employeeName: employee.name,
                workTypeName: shift.workTypeName,
                color: this.getChangeColor('remove'),
                position: {
                  row: this.getEmployeeRowIndex(employee.id, snapshot),
                  col: this.getDayColumnIndex(shift.day),
                },
                diff: {
                  before: `${employee.name} assigned`,
                  after: 'Open shift',
                },
              });

              this.updateEmployeeImpact(
                employeeImpactsMap,
                employee,
                diff,
                snapshot
              );
            }
          }
          break;
        }

        case 'swap_shifts': {
          const swapOp = op as SwapShiftsOp;
          const assignment1 = snapshot.assignments.find(a => a.id === swapOp.assignment1Id);
          const assignment2 = snapshot.assignments.find(a => a.id === swapOp.assignment2Id);

          if (assignment1 && assignment2) {
            const shift1 = snapshot.shifts.find(s => s.id === assignment1.shiftId);
            const shift2 = snapshot.shifts.find(s => s.id === assignment2.shiftId);
            const employee1 = snapshot.employees.find(e => e.id === swapOp.employee1Id);
            const employee2 = snapshot.employees.find(e => e.id === swapOp.employee2Id);

            if (shift1 && shift2 && employee1 && employee2) {
              // Change for employee 1 (moved to shift 2)
              calendarChanges.push({
                type: 'modify',
                entity: 'assignment',
                day: shift2.day,
                start: shift2.start,
                end: shift2.end,
                employeeId: employee1.id,
                employeeName: employee1.name,
                workTypeName: shift2.workTypeName,
                color: this.getChangeColor('modify'),
                position: {
                  row: this.getEmployeeRowIndex(employee1.id, snapshot),
                  col: this.getDayColumnIndex(shift2.day),
                },
                diff: {
                  before: `${employee2.name} on ${shift2.workTypeName}`,
                  after: `${employee1.name} on ${shift2.workTypeName}`,
                },
              });

              // Change for employee 2 (moved to shift 1)
              calendarChanges.push({
                type: 'modify',
                entity: 'assignment',
                day: shift1.day,
                start: shift1.start,
                end: shift1.end,
                employeeId: employee2.id,
                employeeName: employee2.name,
                workTypeName: shift1.workTypeName,
                color: this.getChangeColor('modify'),
                position: {
                  row: this.getEmployeeRowIndex(employee2.id, snapshot),
                  col: this.getDayColumnIndex(shift1.day),
                },
                diff: {
                  before: `${employee1.name} on ${shift1.workTypeName}`,
                  after: `${employee2.name} on ${shift1.workTypeName}`,
                },
              });

              // Track impacts for both employees
              this.updateEmployeeImpact(employeeImpactsMap, employee1, diff, snapshot);
              this.updateEmployeeImpact(employeeImpactsMap, employee2, diff, snapshot);
            }
          }
          break;
        }

        case 'add_shift': {
          const addOp = op as AddShiftOp;
          const shift = diff.after.shifts?.[0];

          if (shift) {
            // Calendar change: new shift template (shown as a new shift slot)
            calendarChanges.push({
              type: 'add',
              entity: 'shift',
              day: addOp.day,
              start: addOp.start,
              end: addOp.end,
              workTypeName: addOp.workTypeName,
              color: this.getChangeColor('add'),
              position: {
                row: -1, // New shift, not assigned to anyone yet
                col: this.getDayColumnIndex(addOp.day),
              },
              diff: {
                before: undefined,
                after: `New ${addOp.workTypeName} shift ${addOp.start}-${addOp.end}`,
              },
            });
          }
          break;
        }
      }
    }

    return {
      calendarChanges,
      employeeImpacts: Array.from(employeeImpactsMap.values()),
    };
  }

  private getChangeColor(type: 'add' | 'modify' | 'remove'): {
    bg: string;
    border: string;
    text: string;
  } {
    const colors = {
      add: {
        bg: 'bg-green-50',
        border: 'border-green-500 border-2 border-dashed',
        text: 'text-green-900',
      },
      modify: {
        bg: 'bg-yellow-50',
        border: 'border-yellow-500 border-2 border-dashed',
        text: 'text-yellow-900',
      },
      remove: {
        bg: 'bg-red-50',
        border: 'border-red-500 border-2 border-dashed',
        text: 'text-red-900',
      },
    };
    return colors[type];
  }

  private getEmployeeRowIndex(employeeId: string, snapshot: MinimalSnapshot): number {
    return snapshot.employees.findIndex(e => e.id === employeeId);
  }

  private getDayColumnIndex(day: Weekday): number {
    const dayMap: Record<Weekday, number> = {
      MON: 0,
      TUE: 1,
      WED: 2,
      THU: 3,
      FRI: 4,
      SAT: 5,
      SUN: 6,
    };
    return dayMap[day];
  }

  private updateEmployeeImpact(
    map: Map<string, EmployeeImpact>,
    employee: MinimalSnapshot['employees'][0],
    diff: Diff,
    snapshot: MinimalSnapshot
  ): void {
    const existing = map.get(employee.id);

    const beforeMinutes = diff.before.weeklyMinutes?.[employee.id] ?? employee.weeklyMinutes;
    const afterMinutes = diff.after.weeklyMinutes?.[employee.id] ?? employee.weeklyMinutes;

    const beforeAssignments = diff.before.assignments?.filter(a => a.employeeId === employee.id) ?? [];
    const afterAssignments = diff.after.assignments?.filter(a => a.employeeId === employee.id) ?? [];

    const beforeDays = new Set(beforeAssignments.map(a => a.day));
    const afterDays = new Set(afterAssignments.map(a => a.day));

    const impact: EmployeeImpact = existing || {
      employeeId: employee.id,
      employeeName: employee.name,
      changes: {
        weeklyMinutes: {
          before: beforeMinutes,
          after: afterMinutes,
          delta: afterMinutes - beforeMinutes,
        },
        assignmentCount: {
          before: beforeAssignments.length,
          after: afterAssignments.length,
          delta: afterAssignments.length - beforeAssignments.length,
        },
        daysWorked: {
          before: Array.from(beforeDays) as Weekday[],
          after: Array.from(afterDays) as Weekday[],
          added: Array.from(afterDays).filter(d => !beforeDays.has(d)) as Weekday[],
          removed: Array.from(beforeDays).filter(d => !afterDays.has(d)) as Weekday[],
        },
      },
      warnings: diff.constraints.warnings,
    };

    map.set(employee.id, impact);
  }

  // Utility methods
  private generateId(): string {
    return `prev_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  private formatTime(date: Date): string {
    return date.toTimeString().substring(0, 5); // HH:MM
  }

  private calculateDuration(start: string, end: string): number {
    const [startHour, startMin] = start.split(':').map(Number);
    const [endHour, endMin] = end.split(':').map(Number);
    return (endHour * 60 + endMin) - (startHour * 60 + startMin);
  }
}
