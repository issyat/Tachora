/**
 * LLM Tool Handlers for Preview Operations
 * 
 * Implements the actual tool functions called by the AI chat assistant.
 * These handlers bridge the LLM function calling with the PreviewService.
 */

import { PreviewService } from './preview-service';
import { buildOperations, type LLMOperationInput, type OperationBuilderContext } from './operation-builder';
import { PREVIEW_RESPONSE_TEMPLATES } from './llm-tools';
import { generateCandidates, formatCandidatesMessage, type ShiftTemplate, type EmployeeAvailability } from './candidate-generator';
import { lockContext, storeCandidates } from './conversation-state';
import { saveTurnMemory, createShiftOptions, getTimeOfDay } from './turn-memory';
import { createAssignPreview } from './assign-preview';
import type { AssignShiftOp } from '@/types/preview';
import { formatHoursSummary, type EmployeeHoursIndex } from '@/server/schedule/hours-helper';
import type { Preview } from '@/types/preview';
import type { PrismaClient } from '@prisma/client';
import type { Weekday } from '@/types';
import { buildScheduleFacts } from '@/server/schedule/facts-builder';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert Prisma DateTime (stored as @db.Time) to HH:mm string
 */
function formatTime(date: Date | string): string {
  if (typeof date === 'string') return date;
  const hours = date.getUTCHours().toString().padStart(2, '0');
  const minutes = date.getUTCMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

function timeStringToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

function describeTimeOfDay(startTime: string): string {
  const hour = parseInt(startTime.split(':')[0], 10);
  if (hour < 12) return 'Morning';
  if (hour < 18) return 'Afternoon';
  return 'Evening';
}

// ============================================================================
// Tool Handler Results
// ============================================================================

export interface ToolResult {
  ok: boolean;
  data?: unknown;
  error?: string;
  errorCode?: string;
  message?: string; // User-friendly message for LLM to present
}

const UNSUPPORTED_ACTION_CODE = "UNSUPPORTED_ACTION";
const UNSUPPORTED_ACTION_MESSAGE = "I can't automate that yet; please change it manually in the schedule UI.";

function buildUnsupportedResult(reason: string, options?: { details?: string; data?: Record<string, unknown> }): ToolResult {
  const detailText = options?.details ? `\n\nWhy: ${options.details}` : "";
  const message = `${UNSUPPORTED_ACTION_MESSAGE}${detailText}`;

  return {
    ok: false,
    error: reason,
    errorCode: UNSUPPORTED_ACTION_CODE,
    message,
    ...(options?.data ? { data: options.data } : {}),
  };
}

// ============================================================================
// Handler Dependencies
// ============================================================================

export interface HandlerDependencies {
  prisma: PrismaClient;
  userId: string; // Clerk user ID for turn memory and apply/undo operations
  managerId?: string; // Database manager ID (optional, for backward compatibility)
  threadId?: string; // Chat thread identifier (per tab)
}

// ============================================================================
// analyze_shift_candidates Tool Handler
// ============================================================================

export interface AnalyzeCandidatesArgs {
  employeeId: string;
  day: Weekday;
  role: string;
}

export interface AnalyzeCandidatesToolContext {
  storeId: string;
  weekId: string;
  snapshotVersion?: string;
  hoursIndex?: EmployeeHoursIndex;
}

/**
 * Analyzes available shifts for an employee on a specific day/role.
 * Returns deterministic list of shift options with availability checking.
 * Locks the context (employee, day, role) and stores candidates for later selection.
 */
export async function handleAnalyzeCandidates(
  args: AnalyzeCandidatesArgs,
  context: AnalyzeCandidatesToolContext,
  deps: HandlerDependencies
): Promise<ToolResult> {
  const { employeeId, day, role } = args;
  const { storeId, weekId } = context;

  // Validate context
  if (!storeId || !weekId) {
    return {
      ok: false,
      error: 'Store ID and week ID are required',
      errorCode: 'MISSING_CONTEXT',
      message: 'I need store and week information to analyze shifts. Please ensure a schedule is loaded.',
    };
  }

  try {
    // Load employee with availability
    const employee = await deps.prisma.employee.findUnique({
      where: { id: employeeId },
      select: {
        id: true,
        name: true,
        storeId: true,
      },
    });

    if (!employee) {
      return {
        ok: false,
        error: `Employee not found: ${employeeId}`,
        errorCode: 'NOT_FOUND',
        message: `I couldn't find that employee. Please verify the employee ID.`,
      };
    }

    // Get employee availability from Availability table
    const availabilityRecords = await deps.prisma.availability.findMany({
      where: { employeeId },
      select: {
        day: true,
        isOff: true,
        startTime: true,
        endTime: true,
      },
    });

    // ============================================================================
    // FIX: Use buildScheduleFacts() to get ALL assignments (DB + template-based)
    // This ensures we see virtual assignments created from shift templates
    // ============================================================================
    if (!deps.managerId) {
      return {
        ok: false,
        error: 'Manager ID required',
        errorCode: 'MISSING_CONTEXT',
        message: 'Manager context is required for shift analysis',
      };
    }

    const scheduleFacts = await buildScheduleFacts({
      storeId,
      weekId,
      managerId: deps.managerId,
    });

    // Filter for open shifts matching the day and role
    const openShifts = scheduleFacts.openShifts.filter(shift =>
      shift.day === day && 
      shift.workTypeName.toLowerCase() === role.toLowerCase()
    );

    if (openShifts.length === 0) {
      return buildUnsupportedResult(`No open ${role} shifts found on ${day}`, {
        details: `All ${role} shifts on ${day} are already assigned.`,
      });
    }

    // Convert openShifts to assignments format for compatibility with existing code
    const openAssignments = openShifts.map(shift => ({
      id: shift.id,
      day: shift.day as Weekday,
      startTime: new Date(`1970-01-01T${shift.start}:00Z`),
      endTime: new Date(`1970-01-01T${shift.end}:00Z`),
      sourceTemplateId: shift.sourceTemplateId,
      workType: {
        id: shift.workTypeId,
        name: shift.workTypeName,
      },
    }));

    const employeeRoles = await deps.prisma.employeeWorkType.findMany({
      where: { employeeId },
      select: {
        workType: { select: { name: true } },
      },
    });
    const qualifiedForRole =
      employeeRoles.length === 0 ||
      employeeRoles.some((r) => r.workType?.name?.toLowerCase() === role.toLowerCase());

    const employeeAssignments = await deps.prisma.assignment.findMany({
      where: {
        schedule: {
          storeId,
          isoWeek: weekId,
        },
        employeeId,
      },
      select: {
        id: true,
        day: true,
        startTime: true,
        endTime: true,
      },
    });

    const weeklyMinutesScheduled = employeeAssignments.reduce((total, assignment) => {
      const start = formatTime(assignment.startTime);
      const end = formatTime(assignment.endTime);
      return total + (timeStringToMinutes(end) - timeStringToMinutes(start));
    }, 0);

    const availability: EmployeeAvailability[] = availabilityRecords.map((a: any) => ({
      day: a.day as Weekday,
      isOff: a.isOff,
      startTime: a.startTime ? formatTime(a.startTime) : undefined,
      endTime: a.endTime ? formatTime(a.endTime) : undefined,
    }));

    const baseShifts: ShiftTemplate[] = openAssignments.map((assignment) => ({
      id: assignment.id,
      day,
      startTime: formatTime(assignment.startTime),
      endTime: formatTime(assignment.endTime),
      workTypeName: role,
    }));

    const availabilityCandidates = generateCandidates(baseShifts, availability, day, role);
    const availabilityMap = new Map<string, ReturnType<typeof generateCandidates>[number]>();
    availabilityCandidates.forEach((candidate) => {
      const lastHyphen = candidate.shiftId.lastIndexOf('-');
      const assignmentId = lastHyphen >= 0 ? candidate.shiftId.slice(0, lastHyphen) : candidate.shiftId;
      availabilityMap.set(assignmentId, candidate);
    });

    const candidates = openAssignments.map((assignment) => {
      const assignmentId = assignment.id;
      const startTime = formatTime(assignment.startTime);
      const endTime = formatTime(assignment.endTime);
      const durationMins = timeStringToMinutes(endTime) - timeStringToMinutes(startTime);
      const durationHours = Math.round((durationMins / 60) * 10) / 10;
      const baseCandidate = availabilityMap.get(assignmentId);

      const reasons: string[] = [];
      let fits = baseCandidate?.fits ?? true;

      if (baseCandidate?.reason) {
        reasons.push(baseCandidate.reason);
      }

      if (!qualifiedForRole) {
        fits = false;
        reasons.push(`${employee.name} is not qualified for ${role} shifts.`);
      }

      const overlaps = employeeAssignments.some((existing) => {
        if (existing.day !== day) return false;
        const existingStart = formatTime(existing.startTime);
        const existingEnd = formatTime(existing.endTime);
        const existingStartMin = timeStringToMinutes(existingStart);
        const existingEndMin = timeStringToMinutes(existingEnd);
        return (
          timeStringToMinutes(startTime) < existingEndMin &&
          timeStringToMinutes(endTime) > existingStartMin
        );
      });

      if (overlaps) {
        fits = false;
        reasons.push(`${employee.name} already has a shift that overlaps ${startTime}-${endTime}.`);
      }

      if (employee.weeklyMinutesTarget) {
        const projectedMinutes = weeklyMinutesScheduled + durationMins;
        if (projectedMinutes > employee.weeklyMinutesTarget) {
          fits = false;
          const overHours = Math.round(((projectedMinutes - employee.weeklyMinutesTarget) / 60) * 10) / 10;
          reasons.push(`Assigning this shift would exceed weekly target by ${overHours}h.`);
        }
      }

      const label =
        baseCandidate?.label ?? `${describeTimeOfDay(startTime)} (${startTime}-${endTime})`;

      const templateId = assignment.sourceTemplateId ?? assignmentId;
      const resolvedShiftId = templateId ? `${templateId}-${day}` : assignmentId;

      return {
        shiftId: resolvedShiftId,
        templateId,
        label,
        startTime,
        endTime,
        durationHours,
        fits,
        reason: reasons.length ? reasons.join(' ') : undefined,
        assignmentId,
      };
    });

    if (candidates.length === 0) {
      return buildUnsupportedResult(`No shifts found for ${day} ${role}`, {
        details: `I couldn't find any ${role} shifts on ${day}.`,
      });
    }

    // Lock context in conversation state
    lockContext(deps.userId, {
      employeeId,
      employeeName: employee.name,
      day,
      role,
      storeId,
      weekId,
    });

    // Store candidates for later resolution
    storeCandidates(deps.userId, storeId, weekId, candidates);

    // NEW: Save to turn memory for deterministic reply interpretation
    // IMPORTANT: Use Clerk userId (from context), not manager.id (database ID)
    // The chat API uses Clerk userId for turn memory lookups
    const threadId = deps.threadId ?? 'chat'; // Thread scoped to chat tab
    const employeeHours = context.hoursIndex?.[employeeId];
    const hoursLabel = employeeHours ? formatHoursSummary(employeeHours) : undefined;

    const optionInputs = candidates.map(candidate => ({
      ...candidate,
      hoursLabel,
    }));

  const options = createShiftOptions(optionInputs);
    
    // Get Clerk userId from context - it's passed in the toolContext
    // We need to extract it from the request context
    // For now, use a workaround: store with both IDs (backward compatible)
    // TODO: Pass clerkUserId explicitly in HandlerDependencies
    
    // Store with manager.id for now (will fix in chat API)
    await saveTurnMemory(deps.userId, storeId, weekId, threadId, {
      mode: 'shift_assignment',
      scope: {
        empId: employeeId,
        day,
        role,
      },
      threadId,
      entities: {
        employeeId,
        employeeName: employee.name,
        day,
        role,
        storeId,
        weekId,
      },
      lastQuestion: {
        id: 'pick_shift',
        text: `Which shift would you like to assign to ${employee.name}?`,
        timestamp: Date.now(),
      },
      lastQuestionId: 'pick_shift',
      options,
      snapshotVersion: context.snapshotVersion,
    });

    console.log(`[Turn Memory] Saved ${options.length} options for ${employee.name} on ${day}:`, {
      userId: deps.userId,
      storeId,
      weekId,
      threadId,
      options: options.map(o => ({ optionId: o.optionId, label: o.label, fits: o.fits })),
    });

    // Format message for user
    const formattedMessage = formatCandidatesMessage(
      candidates,
      employee.name,
      day,
      role
    );

    return {
      ok: true,
      data: {
        candidateCount: candidates.length,
        lockedContext: {
          employeeId,
          employeeName: employee.name,
          day,
          role,
          storeId,
          weekId,
        },
        candidates: candidates.map((c) => ({
          shiftId: c.shiftId,
          templateId: c.templateId,
          label: c.label,
          startTime: c.startTime,
          endTime: c.endTime,
          durationHours: c.durationHours,
          fits: c.fits,
          reason: c.reason,
        })),
        actionRequired: options.length > 0 ? 'pick_shift' : undefined,
        actionData: options.length > 0 ? {
          scope: {
            employeeId,
            day,
            role,
            snapshotVersion: context.snapshotVersion,
          },
          options: options.map((opt) => ({
            optionId: opt.optionId,
            label: opt.label,
            shiftId: opt.shiftId,
            employeeId,
            fits: opt.fits,
            hoursLabel: opt.hoursLabel ?? hoursLabel,
            assignmentId: opt.assignmentId ?? null,
          })),
        } : undefined,
      },
      message: formattedMessage,
    };
  } catch (error) {
    console.error('Error analyzing candidates:', error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      errorCode: 'INTERNAL_ERROR',
      message: 'An error occurred while analyzing shift options. Please try again.',
    };
  }
}

// ============================================================================
// create_preview Tool Handler
// ============================================================================

export interface CreatePreviewArgs {
  operations: LLMOperationInput[];
  explanation: string;
}

export interface CreatePreviewToolContext {
  storeId: string;
  weekId: string;
  managerId?: string;
  snapshotVersion?: string;
  hoursIndex?: EmployeeHoursIndex;
}

export async function handleCreatePreview(
  args: CreatePreviewArgs,
  context: CreatePreviewToolContext,
  deps: HandlerDependencies
): Promise<ToolResult> {
  const { operations, explanation } = args;
  const { storeId, weekId } = context;

  // Validate context
  if (!storeId || !weekId) {
    return {
      ok: false,
      error: 'Store ID and week ID are required',
      errorCode: 'MISSING_CONTEXT',
      message: 'I need store and week information to create a preview. Please ensure a schedule is loaded.',
    };
  }

  // Validate operations
  if (!operations || operations.length === 0) {
    return {
      ok: false,
      error: 'No operations provided',
      errorCode: 'INVALID_INPUT',
      message: 'No schedule changes were specified. What would you like to change?',
    };
  }

  if (operations.length > 10) {
    return {
      ok: false,
      error: 'Maximum 10 operations per preview',
      errorCode: 'INVALID_INPUT',
      message: 'Too many changes at once (max 10). Please break this into smaller previews.',
    };
  }

  // Build typed operations
  const builderContext: OperationBuilderContext = {
    storeId,
    weekId,
    source: 'ai',
  };

  const buildResult = buildOperations(operations, builderContext);

  if (!buildResult.ok || !buildResult.operations) {
    const firstError = buildResult.errors?.[0];
    return buildUnsupportedResult(firstError?.error || "Failed to build operations", {
      details: firstError?.error || "Invalid operation format",
      data: firstError
        ? {
            errorCode: firstError.errorCode,
            index: firstError.index,
          }
        : undefined,
    });
  }

  const builtOperations = buildResult.operations;

  if (builtOperations.length === 1 && builtOperations[0].type === 'assign_shift') {
    const assignOp = builtOperations[0] as AssignShiftOp;
    // Get assignmentId from the original operation if it was passed (for template-based shifts)
    const originalOp = operations[0] as any;
    const assignmentId = originalOp?.assignmentId;
    
    const assignResult = await createAssignPreview({
      prisma: deps.prisma,
      storeId,
      weekId,
      employeeId: assignOp.employeeId,
      shiftId: assignOp.shiftId,
      assignmentId, // Pass template assignment ID if available
      managerId: context.managerId ?? deps.managerId ?? deps.userId,
      userId: deps.userId,
      source: assignOp.source ?? 'ai',
      reason: assignOp.reason ?? explanation,
    });

    if (assignResult.status === 'ok') {
      const summary = generatePreviewSummary(assignResult.preview, explanation);
      return {
        ok: true,
        data: {
          previewId: assignResult.preview.id,
          visualization: assignResult.visualization,
          assignmentId: assignResult.assignmentId,
          snapshotVersion: assignResult.snapshotVersion,
        },
        message: summary,
      };
    }

    if (assignResult.status === 'stale') {
      return {
        ok: false,
        error: 'Shift changed—refresh options.',
        errorCode: 'SHIFT_STALE',
        message: assignResult.message,
      };
    }

    if (assignResult.status === 'blocked') {
      const blockerLine = assignResult.blockers.length
        ? `Issues:\n${assignResult.blockers.map((b) => `• ${b}`).join('\n')}`
        : '';
      return {
        ok: false,
        error: 'Assignment blocked by constraints',
        errorCode: 'CONSTRAINT_VIOLATION',
        message: `${assignResult.message}${blockerLine ? `\n\n${blockerLine}` : ''}`,
      };
    }

    return {
      ok: false,
      error: assignResult.message,
      errorCode: 'PREVIEW_ERROR',
      message: assignResult.message,
    };
  }

  // Create preview using PreviewService
  try {
    // First, get the actual schedule version
    const schedule = await deps.prisma.schedule.findUnique({
      where: {
        storeId_isoWeek: {
          storeId,
          isoWeek: weekId,
        },
      },
      select: {
        version: true,
      },
    });

    const snapshotVersion = schedule?.version?.toString() ?? '1';

    const previewService = new PreviewService(deps.prisma);
    const result = await previewService.createPreview({
      storeId,
      weekId,
      snapshotVersion,
      operations: builtOperations,
    });

    // Extract preview and visualization from result
    const preview = result.preview;
    const visualization = result.visualization;

    // Generate summary for LLM
    const summary = generatePreviewSummary(preview, explanation);

    return {
      ok: true,
      data: {
        previewId: preview.id,
        visualization, // Include visualization in response
        operationCount: preview.operations.length,
        diffs: preview.diffs.length,
        warnings: preview.diffs.flatMap((d: any) => d.constraints.warnings),
        blockers: preview.diffs.flatMap((d: any) => d.constraints.blockers),
        status: preview.status,
        expiresAt: preview.expiresAt,
      },
      message: summary,
    };
  } catch (error) {
    console.error('Create preview failed:', error);
    
    // Handle constraint violation errors specifically
    if (error instanceof Error && error.name === 'ConstraintViolationError') {
      const constraintError = error as any;
      const blockers = constraintError.blockers || [];
      
      return {
        ok: false,
        error: 'Constraint violations prevent this operation',
        errorCode: 'CONSTRAINT_VIOLATION',
        message: `I cannot create this preview due to scheduling conflicts:\n${blockers.map((b: string) => `• ${b}`).join('\n')}\n\nPlease adjust the request to resolve these conflicts.`,
      };
    }
    
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      errorCode: 'PREVIEW_ERROR',
      message: `Failed to create preview: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again.`,
    };
  }
}

// ============================================================================
// apply_preview Tool Handler
// ============================================================================

export interface ApplyPreviewArgs {
  previewId: string;
}

export async function handleApplyPreview(
  args: ApplyPreviewArgs,
  context: CreatePreviewToolContext,
  deps: HandlerDependencies
): Promise<ToolResult> {
  const { previewId } = args;
  const { storeId, weekId } = context;

  if (!previewId) {
    return {
      ok: false,
      error: 'Preview ID is required',
      errorCode: 'MISSING_INPUT',
      message: 'I need a preview ID to apply changes. Please create a preview first.',
    };
  }

  try {
    const previewService = new PreviewService(deps.prisma);
    
    // Get preview to check status
    const preview = await previewService.getPreview(previewId);
    
    if (!preview) {
      return {
        ok: false,
        error: 'Preview not found',
        errorCode: 'NOT_FOUND',
        message: 'That preview no longer exists. It may have expired (30min timeout). Please create a new preview.',
      };
    }

    // Check if already applied
    if (preview.status === 'applied') {
      return {
        ok: false,
        error: 'Preview already applied',
        errorCode: 'ALREADY_APPLIED',
        message: 'These changes were already applied. You can undo them if needed.',
      };
    }

    // Check for blockers
    const blockers = preview.diffs.flatMap((d: any) => d.constraints.blockers);
    if (blockers.length > 0) {
      return {
        ok: false,
        error: `${blockers.length} blocking constraint(s)`,
        errorCode: 'HAS_BLOCKERS',
        message: PREVIEW_RESPONSE_TEMPLATES.hasBlockers(blockers.length) + ` Issues: ${blockers.join(', ')}`,
      };
    }

    // Apply preview (using correct API signature)
    const result = await previewService.applyPreview(
      previewId,
      deps.managerId || deps.userId, // Use managerId for database operations, fallback to userId
      '1' // snapshotVersion - TODO: Get actual version
    );

    return {
      ok: true,
      data: {
        previewId,
        appliedOps: result.appliedOps,
        appliedAt: new Date().toISOString(),
      },
      message: PREVIEW_RESPONSE_TEMPLATES.applySuccess(result.appliedOps),
    };
  } catch (error) {
    console.error('Apply preview failed:', error);
    
    // Check for version conflict
    if (error instanceof Error && error.message.includes('version')) {
      return {
        ok: false,
        error: error.message,
        errorCode: 'VERSION_CONFLICT',
        message: PREVIEW_RESPONSE_TEMPLATES.versionConflict(),
      };
    }

    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      errorCode: 'APPLY_ERROR',
      message: `Failed to apply changes: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again.`,
    };
  }
}

// ============================================================================
// undo_preview Tool Handler
// ============================================================================

export interface UndoPreviewArgs {
  previewId: string;
}

export async function handleUndoPreview(
  args: UndoPreviewArgs,
  context: CreatePreviewToolContext,
  deps: HandlerDependencies
): Promise<ToolResult> {
  const { previewId } = args;

  if (!previewId) {
    return {
      ok: false,
      error: 'Preview ID is required',
      errorCode: 'MISSING_INPUT',
      message: 'I need a preview ID to undo changes. Which preview should I undo?',
    };
  }

  try {
    const previewService = new PreviewService(deps.prisma);
    
    // Get preview to check status
    const preview = await previewService.getPreview(previewId);
    
    if (!preview) {
      return {
        ok: false,
        error: 'Preview not found',
        errorCode: 'NOT_FOUND',
        message: 'That preview no longer exists. It may have expired.',
      };
    }

    // Check if can undo
    if (preview.status !== 'applied') {
      return {
        ok: false,
        error: 'Preview not applied yet',
        errorCode: 'NOT_APPLIED',
        message: 'This preview hasn\'t been applied yet, so there\'s nothing to undo. Would you like to discard it instead?',
      };
    }

    // Undo preview (using correct API signature)
    const result = await previewService.undoPreview(
      previewId,
      deps.managerId || deps.userId // Use managerId for database operations, fallback to userId
    );

    return {
      ok: true,
      data: {
        previewId,
        revertedOps: result.revertedOps,
        revertedAt: new Date().toISOString(),
      },
      message: PREVIEW_RESPONSE_TEMPLATES.undoSuccess(result.revertedOps),
    };
  } catch (error) {
    console.error('Undo preview failed:', error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      errorCode: 'UNDO_ERROR',
      message: `Failed to undo changes: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again.`,
    };
  }
}

// ============================================================================
// get_preview_status Tool Handler
// ============================================================================

export interface GetPreviewStatusArgs {
  previewId: string;
}

export async function handleGetPreviewStatus(
  args: GetPreviewStatusArgs,
  context: CreatePreviewToolContext,
  deps: HandlerDependencies
): Promise<ToolResult> {
  const { previewId } = args;

  if (!previewId) {
    return {
      ok: false,
      error: 'Preview ID is required',
      errorCode: 'MISSING_INPUT',
      message: 'I need a preview ID to check status.',
    };
  }

  try {
    const previewService = new PreviewService(deps.prisma);
    const preview = await previewService.getPreview(previewId);
    
    if (!preview) {
      return {
        ok: false,
        error: 'Preview not found',
        errorCode: 'NOT_FOUND',
        message: 'That preview no longer exists. It may have expired (30min timeout).',
      };
    }

    // Generate status summary
    const warnings = preview.diffs.flatMap((d: any) => d.constraints.warnings);
    const blockers = preview.diffs.flatMap((d: any) => d.constraints.blockers);
    
    const statusMessage = generateStatusSummary(preview, warnings, blockers);

    return {
      ok: true,
      data: {
        previewId: preview.id,
        status: preview.status,
        operationCount: preview.operations.length,
        warnings: warnings.length,
        blockers: blockers.length,
        canApply: blockers.length === 0 && preview.status === 'pending',
        canUndo: preview.status === 'applied',
        expiresAt: preview.expiresAt,
      },
      message: statusMessage,
    };
  } catch (error) {
    console.error('Get preview status failed:', error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      errorCode: 'STATUS_ERROR',
      message: `Failed to get preview status: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

// ============================================================================
// discard_preview Tool Handler
// ============================================================================

export interface DiscardPreviewArgs {
  previewId: string;
}

export async function handleDiscardPreview(
  args: DiscardPreviewArgs,
  context: CreatePreviewToolContext,
  deps: HandlerDependencies
): Promise<ToolResult> {
  const { previewId } = args;

  if (!previewId) {
    return {
      ok: false,
      error: 'Preview ID is required',
      errorCode: 'MISSING_INPUT',
      message: 'I need a preview ID to discard.',
    };
  }

  try {
    const previewService = new PreviewService(deps.prisma);
    await previewService.discardPreview(previewId);

    return {
      ok: true,
      data: { previewId },
      message: PREVIEW_RESPONSE_TEMPLATES.discardSuccess(),
    };
  } catch (error) {
    console.error('Discard preview failed:', error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      errorCode: 'DISCARD_ERROR',
      message: `Failed to discard preview: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

// ============================================================================
// create_shift_template Tool Handler
// ============================================================================

export interface CreateShiftTemplateArgs {
  day: Weekday;
  workTypeName: string;
  startTime: string; // HH:mm format
  endTime: string;   // HH:mm format
}

/**
 * Creates a new shift template with preview and confirmation.
 * User flow: "add cashier shift mon 8-12" → preview → "yes" → applied
 */
export async function handleCreateShiftTemplate(
  args: CreateShiftTemplateArgs,
  context: CreatePreviewToolContext,
  deps: HandlerDependencies
): Promise<ToolResult> {
  const { day, workTypeName, startTime, endTime } = args;
  const { storeId, weekId } = context;

  // Validate context
  if (!storeId || !weekId) {
    return {
      ok: false,
      error: 'Store ID and week ID are required',
      errorCode: 'MISSING_CONTEXT',
      message: 'I need store and week information to create a shift. Please ensure a schedule is loaded.',
    };
  }

  // Validate time format
  const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
  if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
    return {
      ok: false,
      error: 'Invalid time format',
      errorCode: 'INVALID_TIME',
      message: 'Time must be in HH:mm format (e.g., "08:00", "14:30"). Please provide valid times.',
    };
  }

  // Validate start < end
  if (startTime >= endTime) {
    return {
      ok: false,
      error: 'Start time must be before end time',
      errorCode: 'INVALID_TIME_RANGE',
      message: `Start time (${startTime}) must be before end time (${endTime}). Please adjust the times.`,
    };
  }

  try {
    // Find or validate work type
    const workType = await deps.prisma.workType.findFirst({
      where: {
        storeId,
        name: {
          equals: workTypeName,
          mode: 'insensitive',
        },
      },
    });

    if (!workType) {
      // Get all existing work types to suggest alternatives
      const existingWorkTypes = await deps.prisma.workType.findMany({
        where: { storeId },
        select: { name: true },
      });

      const existingNames = existingWorkTypes.map((wt: { name: string }) => wt.name).join(', ');
      
      return buildUnsupportedResult(`Work type "${workTypeName}" not found`, {
        details: `Work type "${workTypeName}" doesn't exist in this store.${existingWorkTypes.length > 0 ? ` Available work types: ${existingNames}.` : ''} Add the role in the UI before trying again.`,
        data: {
          missingWorkType: workTypeName,
          existingWorkTypes: existingWorkTypes.map((wt: { name: string }) => wt.name),
          actionRequired: 'create_work_type',
          actionUrl: '/schedule/work-types',
        },
      });
    }

    // Note: We intentionally allow multiple shifts of the same work type on the same day
    // This is a common requirement (e.g., Morning Cashier 8-12, Afternoon Cashier 12-16)
    // Overlapping times are also allowed since multiple people can work the same role

    // Calculate duration for display
    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);
    const durationHours = (endHour * 60 + endMin - startHour * 60 - startMin) / 60;

    // Create preview with add_shift operation
    const operations: LLMOperationInput[] = [{
      type: 'add_shift',
      day,
      start: startTime,
      end: endTime,
      workTypeName: workType.name,
      capacity: 1, // Default capacity
    }];

    const explanation = `Create new ${workType.name} shift on ${day} from ${startTime} to ${endTime} (${durationHours.toFixed(1)}h)`;

    // Use existing handleCreatePreview with the add_shift operation
    const previewResult = await handleCreatePreview(
      { operations, explanation },
      context,
      deps
    );

    if (!previewResult.ok) {
      return previewResult;
    }

    // Save to turn memory for confirmation
    const threadId = deps.threadId ?? 'chat';
    await saveTurnMemory(deps.userId, storeId, weekId, threadId, {
      mode: 'shift_creation',
      scope: {
        day,
        role: workType.name,
      },
      threadId,
      entities: {
        day,
        role: workType.name,
        storeId,
        weekId,
      },
      lastQuestion: {
        id: 'confirm_creation',
        text: `Create ${workType.name} shift on ${day} ${startTime}-${endTime}?`,
        timestamp: Date.now(),
      },
      lastQuestionId: 'confirm_creation',
      options: [], // No options needed for creation confirmation
      pendingPreviewId: (previewResult.data as any)?.previewId,
      snapshotVersion: context.snapshotVersion,
    });

    console.log(`[Turn Memory] Saved shift creation confirmation for ${workType.name} ${day}:`, {
      userId: deps.userId,
      storeId,
      weekId,
      threadId,
      previewId: (previewResult.data as any)?.previewId,
    });

    return {
      ok: true,
      data: previewResult.data,
      message: `${previewResult.message}\n\nWould you like to create this shift?`,
    };
  } catch (error) {
    console.error('Error creating shift template:', error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      errorCode: 'INTERNAL_ERROR',
      message: 'An error occurred while creating the shift template. Please try again.',
    };
  }
}

// ============================================================================
// analyze_swap_candidates Tool Handler
// ============================================================================

export interface AnalyzeSwapCandidatesArgs {
  employee1Id: string;
  employee2Id: string;
  day: Weekday;
}

/**
 * Analyzes feasibility of swapping two employees' shifts on a specific day.
 * User flow: "swap alice and bob on tuesday" → preview showing swap → "yes" → applied
 */
export async function handleAnalyzeSwapCandidates(
  args: AnalyzeSwapCandidatesArgs,
  context: AnalyzeCandidatesToolContext,
  deps: HandlerDependencies
): Promise<ToolResult> {
  const { employee1Id, employee2Id, day } = args;
  const { storeId, weekId } = context;

  // Validate context
  if (!storeId || !weekId) {
    return {
      ok: false,
      error: 'Store ID and week ID are required',
      errorCode: 'MISSING_CONTEXT',
      message: 'I need store and week information to swap shifts. Please ensure a schedule is loaded.',
    };
  }

  try {
    // Load both employees
    const [employee1, employee2] = await Promise.all([
      deps.prisma.employee.findUnique({
        where: { id: employee1Id },
        select: { id: true, name: true },
      }),
      deps.prisma.employee.findUnique({
        where: { id: employee2Id },
        select: { id: true, name: true },
      }),
    ]);

    if (!employee1 || !employee2) {
      return {
        ok: false,
        error: 'One or both employees not found',
        errorCode: 'NOT_FOUND',
        message: `I couldn't find ${!employee1 ? 'the first' : 'the second'} employee. Please verify the employee names.`,
      };
    }

    // Find both assignments on the specified day
    const [assignment1, assignment2] = await Promise.all([
      deps.prisma.assignment.findFirst({
        where: {
          employeeId: employee1Id,
          day,
          shiftTemplate: { storeId },
          schedule: {
            storeId,
            isoWeek: weekId,
          },
        },
        select: {
          id: true,
          shiftTemplateId: true,
          shiftTemplate: {
            select: {
              startTime: true,
              endTime: true,
              workType: {
                select: { name: true },
              },
            },
          },
        },
      }),
      deps.prisma.assignment.findFirst({
        where: {
          employeeId: employee2Id,
          day,
          shiftTemplate: { storeId },
          schedule: {
            storeId,
            isoWeek: weekId,
          },
        },
        select: {
          id: true,
          shiftTemplateId: true,
          shiftTemplate: {
            select: {
              startTime: true,
              endTime: true,
              workType: {
                select: { name: true },
              },
            },
          },
        },
      }),
    ]);

    // Check if both are assigned
    if (!assignment1) {
      return buildUnsupportedResult(`${employee1.name} is not assigned on ${day}`, {
        details: `${employee1.name} doesn't have a shift on ${day}. Both employees must be assigned to swap shifts.`,
      });
    }

    if (!assignment2) {
      return buildUnsupportedResult(`${employee2.name} is not assigned on ${day}`, {
        details: `${employee2.name} doesn't have a shift on ${day}. Both employees must be assigned to swap shifts.`,
      });
    }

    // Get availability for both employees to check if swapped shifts fit
    const [availability1, availability2] = await Promise.all([
      deps.prisma.availability.findFirst({
        where: { employeeId: employee1Id, day },
        select: { isOff: true, startTime: true, endTime: true },
      }),
      deps.prisma.availability.findFirst({
        where: { employeeId: employee2Id, day },
        select: { isOff: true, startTime: true, endTime: true },
      }),
    ]);

    // Format times
    const shift1Start = formatTime(assignment1.shiftTemplate.startTime);
    const shift1End = formatTime(assignment1.shiftTemplate.endTime);
    const shift2Start = formatTime(assignment2.shiftTemplate.startTime);
    const shift2End = formatTime(assignment2.shiftTemplate.endTime);

    // Check if swapped shifts fit availability
    const conflicts: string[] = [];

    if (availability1) {
      const avail1Start = formatTime(availability1.startTime);
      const avail1End = formatTime(availability1.endTime);
      
      // After swap, employee1 gets shift2's times
      if (shift2Start < avail1Start || shift2End > avail1End) {
        conflicts.push(`${employee1.name}: ${employee2.name}'s shift (${shift2Start}-${shift2End}) doesn't fit availability (${avail1Start}-${avail1End})`);
      }
    }

    if (availability2) {
      const avail2Start = formatTime(availability2.startTime);
      const avail2End = formatTime(availability2.endTime);
      
      // After swap, employee2 gets shift1's times
      if (shift1Start < avail2Start || shift1End > avail2End) {
        conflicts.push(`${employee2.name}: ${employee1.name}'s shift (${shift1Start}-${shift1End}) doesn't fit availability (${avail2Start}-${avail2End})`);
      }
    }

    if (conflicts.length > 0) {
      return {
        ok: false,
        error: 'Swap creates availability conflicts',
        errorCode: 'AVAILABILITY_CONFLICT',
        message: `Cannot swap shifts due to availability conflicts:\n${conflicts.map(c => `• ${c}`).join('\n')}`,
      };
    }

    // Create preview with swap_shifts operation
    const operations: LLMOperationInput[] = [{
      type: 'swap_shifts',
      employeeId: employee1Id, // First employee
      employeeId2: employee2Id, // Second employee
      assignment1Id: assignment1.id,
      assignment2Id: assignment2.id,
      reason: `Swapping ${employee1.name} (${shift1Start}-${shift1End}) with ${employee2.name} (${shift2Start}-${shift2End}) on ${day}`,
    }];

    const explanation = `Swap ${employee1.name} (${assignment1.shiftTemplate.workType.name} ${shift1Start}-${shift1End}) ↔ ${employee2.name} (${assignment2.shiftTemplate.workType.name} ${shift2Start}-${shift2End}) on ${day}`;

    // Create preview
    const previewResult = await handleCreatePreview(
      { operations, explanation },
      { storeId, weekId },
      deps
    );

    if (!previewResult.ok) {
      return previewResult;
    }

    // Save to turn memory for confirmation
    const threadId = deps.threadId ?? 'chat';
    await saveTurnMemory(deps.userId, storeId, weekId, threadId, {
      mode: 'shift_swap',
      scope: {
        empId: employee1Id,
        day,
        role: assignment1.shiftTemplate.workType.name,
      },
      threadId,
      entities: {
        employeeId: employee1Id,
        employeeName: employee1.name,
        employee2Id,
        employee2Name: employee2.name,
        day,
        storeId,
        weekId,
      },
      lastQuestion: {
        id: 'confirm_swap',
        text: `Swap ${employee1.name} and ${employee2.name} on ${day}?`,
        timestamp: Date.now(),
      },
      lastQuestionId: 'confirm_swap',
      options: [], // No options needed for swap confirmation
      pendingPreviewId: (previewResult.data as any)?.previewId,
      snapshotVersion: context.snapshotVersion,
    });

    console.log(`[Turn Memory] Saved swap confirmation for ${employee1.name} ↔ ${employee2.name}:`, {
      userId: deps.userId,
      storeId,
      weekId,
      threadId,
      previewId: (previewResult.data as any)?.previewId,
    });

    return {
      ok: true,
      data: {
        ...(previewResult.data as any),
        swap: {
          employee1: { id: employee1.id, name: employee1.name, shift: `${shift1Start}-${shift1End}` },
          employee2: { id: employee2.id, name: employee2.name, shift: `${shift2Start}-${shift2End}` },
        },
      },
      message: `${previewResult.message}\n\nWould you like to swap these shifts?`,
    };
  } catch (error) {
    console.error('Error analyzing swap candidates:', error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      errorCode: 'INTERNAL_ERROR',
      message: 'An error occurred while analyzing the swap. Please try again.',
    };
  }
}

/**
 * Handler: check_eligible_candidates
 * 
 * Check which employees are eligible for a specific shift.
 * Filters by work type, then checks availability and conflicts.
 */
export async function handleCheckEligibleCandidates(
  args: { day: Weekday; workTypeName: string; startTime: string; endTime: string },
  context: { storeId: string; weekId: string },
  deps: HandlerDependencies
): Promise<ToolResult> {
  try {
    const { day, workTypeName, startTime, endTime } = args;
    const { storeId, weekId } = context;

    // Fetch all employees for this store
    const employees = await deps.prisma.employee.findMany({
      where: { storeId },
      include: {
        roles: {
          include: {
            workType: true, // Include the actual WorkType to get name
          },
        },
        availability: true,
      },
    });

    // Fetch the schedule for this week
    const schedule = await deps.prisma.schedule.findUnique({
      where: {
        storeId_isoWeek: {
          storeId,
          isoWeek: weekId,
        },
      },
    });

    if (!schedule) {
      return {
        ok: false,
        error: `No schedule found for week ${weekId}`,
        errorCode: 'SCHEDULE_NOT_FOUND',
        message: `No schedule exists for this week. Please create a schedule first.`,
      };
    }

    // Fetch ALL assignments for this week (for calculating total hours)
    const allWeekAssignments = await deps.prisma.assignment.findMany({
      where: {
        scheduleId: schedule.id,
      },
      include: {
        employee: {
          include: {
            roles: {
              include: {
                workType: true,
              },
            },
          },
        },
        workType: true,
        sourceTemplate: true,
      },
    });

    // Filter assignments for the specific day (for overlap checking)
    const dayAssignments = allWeekAssignments.filter((a: { day: string }) => a.day === day);

    // Helper: parse time to minutes
    const timeToMinutes = (time: string): number => {
      const [hours, mins] = time.split(':').map(Number);
      return hours * 60 + mins;
    };

    const shiftStart = timeToMinutes(startTime);
    const shiftEnd = timeToMinutes(endTime);
    const shiftDuration = shiftEnd - shiftStart;
    const normalizedRole = workTypeName.toLowerCase().trim();

    const matchingOpenAssignment = dayAssignments.find((assignment: any) => {
      if (assignment.employeeId) return false;
      const assignmentRole = assignment.workType?.name?.toLowerCase().trim();
      if (assignmentRole !== normalizedRole) return false;

      const assignStart = formatTime(assignment.startTime);
      const assignEnd = formatTime(assignment.endTime);

      return assignStart === startTime && assignEnd === endTime;
    });

    let resolvedTemplateId: string | null = matchingOpenAssignment?.sourceTemplateId ?? null;

    const hoursIndex = context.hoursIndex ?? {};

    const eligible: Array<{
      employeeId: string;
      employeeName: string;
      currentHours: number;
      targetHours: number;
      reason: string;
    }> = [];

    const ineligible: Array<{
      employeeId: string;
      employeeName: string;
      reasons: string[];
    }> = [];

    for (const employee of employees) {
      const reasons: string[] = [];
      const hoursInfo = hoursIndex[employee.id];

      // 1. Check work type match
      const hasRole = employee.roles.some((role: { workType: { name: string } }) => 
        role.workType?.name?.toLowerCase().trim() === normalizedRole
      );
      
      if (!hasRole) {
        reasons.push(`missing_role: Does not have "${workTypeName}" role`);
      }

      // 2. Check availability
      const dayAvail = employee.availability.find((a: { day: string; isOff?: boolean }) => a.day === day);
      if (dayAvail?.isOff) {
        reasons.push(`not_available: Marked as off on ${day}`);
      } else if (dayAvail && dayAvail.startTime && dayAvail.endTime) {
        const availStart = timeToMinutes(formatTime(dayAvail.startTime));
        const availEnd = timeToMinutes(formatTime(dayAvail.endTime));
        const toleranceMinutes = 5;

        const startsTooEarly = shiftStart < availStart - toleranceMinutes;
        const endsTooLate = shiftEnd > availEnd + toleranceMinutes;

        if (startsTooEarly || endsTooLate) {
          const window = `${formatTime(dayAvail.startTime)}-${formatTime(dayAvail.endTime)}`;
          reasons.push(`not_available: Shift ${startTime}-${endTime} outside availability ${window}`);
        }
      }

      // 3. Check for overlapping assignments on this specific day
      const employeeDayAssignments = dayAssignments.filter((a: { employeeId: string }) => a.employeeId === employee.id);
      for (const assignment of employeeDayAssignments) {
        const assignStart = timeToMinutes(formatTime(assignment.startTime));
        const assignEnd = timeToMinutes(formatTime(assignment.endTime));
        
        // Check overlap
        if (!(shiftEnd <= assignStart || shiftStart >= assignEnd)) {
          reasons.push(`overlap: Already assigned to ${formatTime(assignment.startTime)}-${formatTime(assignment.endTime)}`);
        }
      }

      // 4. Calculate current WEEKLY hours (all assignments for the week)
      let currentMinutes: number;
      let currentHours: number;
      let targetHours: number;

      if (hoursInfo) {
        currentMinutes = hoursInfo.minutes;
        currentHours = hoursInfo.hours;
        targetHours = hoursInfo.targetHours || (employee.weeklyMinutesTarget ? Math.round(employee.weeklyMinutesTarget / 60 * 10) / 10 : 40);
      } else {
        const employeeWeekAssignments = allWeekAssignments.filter((a: { employeeId: string }) => a.employeeId === employee.id);
        currentMinutes = employeeWeekAssignments.reduce((sum: number, a: { startTime: Date | string; endTime: Date | string }) => {
          const start = timeToMinutes(formatTime(a.startTime));
          const end = timeToMinutes(formatTime(a.endTime));
          return sum + (end - start);
        }, 0);
        currentHours = Math.round(currentMinutes / 60 * 10) / 10;
        targetHours = employee.weeklyMinutesTarget ? Math.round(employee.weeklyMinutesTarget / 60 * 10) / 10 : 40;
      }

      // Check if adding this shift would exceed limits (optional warning, not blocker)
      const newTotalHours = currentHours + (shiftDuration / 60);
      if (newTotalHours > targetHours * 1.25) {
        // Don't block, but note it
        reasons.push(`hour_warning: Would be ${Math.round(newTotalHours)}h (${Math.round((newTotalHours/targetHours)*100)}% of ${targetHours}h target)`);
      }

      // Classify as eligible or ineligible
      const hasBlockers = reasons.some(r => 
        r.startsWith('missing_role') || 
        r.startsWith('not_available') || 
        r.startsWith('overlap')
      );

      if (hasBlockers) {
        ineligible.push({
          employeeId: employee.id,
          employeeName: employee.name,
          reasons,
        });
      } else {
        const reason = reasons.length > 0
          ? reasons[0]
          : hoursInfo
            ? `Available (${formatHoursSummary(hoursInfo)})`
            : `Available (${currentHours}h/${targetHours}h)`;

        eligible.push({
          employeeId: employee.id,
          employeeName: employee.name,
          currentHours,
          targetHours,
          reason,
        });
      }
    }

    // Sort eligible by underworked first
    eligible.sort((a, b) => {
      const aUtilization = a.currentHours / a.targetHours;
      const bUtilization = b.currentHours / b.targetHours;
      return aUtilization - bUtilization;
    });

    if (eligible.length > 0) {
      const primaryCandidate = eligible[0]; // Most underworked eligible employee

      if (!resolvedTemplateId) {
        const candidateTemplates = await deps.prisma.shiftTemplate.findMany({
          where: {
            storeId,
            workType: {
              name: {
                equals: workTypeName,
                mode: 'insensitive',
              },
            },
          },
          include: {
            workType: true,
          },
        });

        const templateMatch = candidateTemplates.find((template: any) => {
          const templateStart = formatTime(template.startTime);
          const templateEnd = formatTime(template.endTime);
          const daysField = template.days as any;

          let includesDay = false;
          if (Array.isArray(daysField)) {
            includesDay = daysField.includes(day);
          } else if (daysField && typeof daysField === 'object') {
            const dayValue = (daysField as Record<string, unknown>)[day];
            includesDay =
              dayValue === true ||
              dayValue === 1 ||
              dayValue === '1' ||
              (typeof dayValue === 'string' && dayValue.toLowerCase() === 'true');
          }

          return includesDay && templateStart === startTime && templateEnd === endTime;
        });

        if (templateMatch) {
          resolvedTemplateId = templateMatch.id;
        }
      }

      const resolvedShiftId = resolvedTemplateId ? `${resolvedTemplateId}-${day}` : null;

      if (resolvedShiftId) {
        const threadId = deps.threadId ?? 'chat';
        const candidateOptionInputs = eligible.map(candidate => {
          const candidateHours = hoursIndex[candidate.employeeId];
          const formattedHours = candidateHours
            ? formatHoursSummary(candidateHours)
            : `${Math.round(candidate.currentHours * 10) / 10}h/${Math.round(candidate.targetHours * 10) / 10}h`;
          const buttonLabel = `${candidate.employeeName} (${formattedHours})`;
          return {
            shiftId: resolvedShiftId,
            templateId: resolvedTemplateId!,
            label: buttonLabel,
            startTime,
            endTime,
            durationHours: Math.round(shiftDuration / 60 * 10) / 10,
            fits: true,
            reason: candidate.reason,
            employeeId: candidate.employeeId,
            employeeName: candidate.employeeName,
            hoursLabel: formattedHours,
            assignmentId: matchingOpenAssignment?.id ?? null,
          };
        });

        const options = createShiftOptions(candidateOptionInputs);
        const questionText = eligible.length === 1
          ? `Assign ${primaryCandidate.employeeName} to ${workTypeName} shift on ${day} ${startTime}-${endTime}?`
          : `Which employee should take the ${workTypeName} shift on ${day} ${startTime}-${endTime}?`;

        await saveTurnMemory(deps.userId, storeId, weekId, threadId, {
          mode: 'shift_assignment',
          scope: {
            empId: primaryCandidate.employeeId,
            day,
            role: workTypeName,
          },
          threadId,
          entities: {
            employeeId: primaryCandidate.employeeId,
            employeeName: primaryCandidate.employeeName,
            day,
            role: workTypeName,
            storeId,
            weekId,
          },
          lastQuestion: {
            id: 'confirm_selection',
            text: questionText,
            timestamp: Date.now(),
          },
          lastQuestionId: 'confirm_selection',
          options,
          snapshotVersion: context.snapshotVersion,
        });

        console.log(`[Turn Memory] Saved eligibility context for ${workTypeName} shift:`, {
          userId: deps.userId,
          storeId,
          weekId,
          threadId,
          primaryCandidate: primaryCandidate.employeeName,
          shift: `${day} ${startTime}-${endTime}`,
          shiftId: resolvedShiftId,
          optionCount: options.length,
          sourceAssignmentId: matchingOpenAssignment?.id,
        });
      } else {
        console.log(`[Turn Memory] Skipped saving context (shift template unresolved):`, {
          userId: deps.userId,
          storeId,
          weekId,
          workTypeName,
          day,
          startTime,
          endTime,
        });
      }
    }

    return {
      ok: true,
      data: {
        shift: {
          day,
          workTypeName,
          startTime,
          endTime,
          duration: `${Math.round(shiftDuration / 60 * 10) / 10}h`,
        },
        eligible,
        ineligible,
        summary: {
          totalEmployees: employees.length,
          eligibleCount: eligible.length,
          ineligibleCount: ineligible.length,
        },
      },
      message: eligible.length > 0
        ? `Found ${eligible.length} eligible employee(s) for ${workTypeName} shift on ${day} ${startTime}-${endTime}`
        : `No employees are eligible for ${workTypeName} shift on ${day}. ${ineligible.length} employee(s) checked.`,
    };
  } catch (error) {
    console.error('Error checking eligible candidates:', error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      errorCode: 'INTERNAL_ERROR',
      message: 'An error occurred while checking eligibility. Please try again.',
    };
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate human-readable preview summary for LLM
 */
function generatePreviewSummary(preview: Preview, explanation: string): string {
  const warnings = preview.diffs.flatMap(d => d.constraints.warnings);
  const blockers = preview.diffs.flatMap(d => d.constraints.blockers);
  
  const hasWarnings = warnings.length > 0;
  const hasBlockers = blockers.length > 0;

  let summary = PREVIEW_RESPONSE_TEMPLATES.previewCreated(
    preview.operations.length,
    hasWarnings,
    hasBlockers
  );

  summary += `\n\n${explanation}`;

  if (warnings.length > 0) {
    summary += `\n\n⚠️ Warnings:\n${warnings.map(w => `• ${w}`).join('\n')}`;
  }

  if (blockers.length > 0) {
    summary += `\n\n❌ Blockers (must resolve before applying):\n${blockers.map(b => `• ${b}`).join('\n')}`;
  }

  if (!hasBlockers) {
    summary += `\n\nApply these changes?`;
  }

  return summary;
}

/**
 * Generate status summary message
 */
function generateStatusSummary(
  preview: Preview,
  warnings: string[],
  blockers: string[]
): string {
  let summary = `Preview ${preview.id.substring(0, 8)}...\n`;
  summary += `Status: ${preview.status}\n`;
  summary += `Operations: ${preview.operations.length}\n`;

  if (preview.status === 'applied') {
    summary += `\n✓ Applied at ${preview.appliedAt}`;
    summary += `\nCan undo: Yes`;
  } else if (preview.status === 'pending') {
    if (blockers.length > 0) {
      summary += `\n❌ Cannot apply: ${blockers.length} blocker(s)`;
      summary += `\n${blockers.map(b => `• ${b}`).join('\n')}`;
    } else {
      summary += `\n✓ Ready to apply`;
    }
  }

  if (warnings.length > 0) {
    summary += `\n\n⚠️ ${warnings.length} warning(s):`;
    summary += `\n${warnings.map(w => `• ${w}`).join('\n')}`;
  }

  return summary;
}

