import { PreviewService } from './preview-service';
import type { PrismaClient } from '@prisma/client';
import type { Preview, PreviewVisualization } from '@/types/preview';
import { ConstraintViolationError } from '@/types/preview';

interface CreateAssignPreviewParams {
  prisma: PrismaClient;
  storeId: string;
  weekId: string;
  employeeId: string;
  shiftId: string;
  assignmentId?: string;
  managerId: string;
  userId: string;
  source?: 'ai' | 'user';
  reason?: string;
}

interface PreviewSuccess {
  status: 'ok';
  preview: Preview;
  visualization: PreviewVisualization;
  snapshotVersion: string;
  assignmentId: string;
}

interface PreviewStale {
  status: 'stale';
  message: string;
  blockers?: string[];
}

interface PreviewBlocked {
  status: 'blocked';
  message: string;
  blockers: string[];
}

interface PreviewError {
  status: 'error';
  message: string;
  error: unknown;
}

export type CreateAssignPreviewResult =
  | PreviewSuccess
  | PreviewStale
  | PreviewBlocked
  | PreviewError;

export async function createAssignPreview(params: CreateAssignPreviewParams): Promise<CreateAssignPreviewResult> {
  const {
    prisma,
    storeId,
    weekId,
    employeeId,
    shiftId,
    assignmentId,
    managerId: _managerId,
    userId: _userId,
    source = 'ai',
    reason,
  } = params;

  const assignment = await findOpenAssignment(prisma, {
    storeId,
    weekId,
    shiftId,
    assignmentId,
  });

  console.log('[createAssignPreview] findOpenAssignment result:', {
    found: !!assignment,
    shiftId,
    assignmentId,
    isTemplate: assignmentId?.startsWith('template-'),
  });

  if (!assignment) {
    // Check if this is a template-based shift that needs to be created
    if (assignmentId?.startsWith('template-')) {
      const parsed = parseShiftId(shiftId);
      if (parsed?.templateId && parsed.day) {
        // Try to create the assignment from the template
        const template = await prisma.shiftTemplate.findUnique({
          where: { id: parsed.templateId },
        });

        if (template) {
          // Get or create the schedule
          const schedule = await prisma.schedule.upsert({
            where: {
              storeId_isoWeek: {
                storeId,
                isoWeek: weekId,
              },
            },
            create: {
              storeId,
              isoWeek: weekId,
              state: 'Draft',
              version: 1,
            },
            update: {},
          });

          // Create the assignment from the template
          const newAssignment = await prisma.assignment.create({
            data: {
              scheduleId: schedule.id,
              day: parsed.day as any,
              startTime: template.startTime,
              endTime: template.endTime,
              workTypeId: template.workTypeId,
              sourceTemplateId: template.id,
              employeeId: null,
              locked: false,
            },
            include: {
              schedule: true,
            },
          });

          console.log('[createAssignPreview] Created assignment from template:', {
            templateId: template.id,
            assignmentId: newAssignment.id,
            day: parsed.day,
          });

          // Now proceed with the preview using this new assignment
          const previewService = new PreviewService(prisma);
          const snapshotVersion = (newAssignment.schedule.version ?? 1).toString();
          const isoTimestamp = new Date().toISOString();

          try {
            const { preview, visualization } = await previewService.createPreview({
              storeId,
              weekId,
              snapshotVersion,
              operations: [
                {
                  type: 'assign_shift',
                  storeId,
                  weekId,
                  shiftId,
                  employeeId,
                  timestamp: isoTimestamp,
                  source,
                  reason,
                },
              ],
            });

            return {
              status: 'ok',
              preview,
              visualization,
              snapshotVersion,
              assignmentId: newAssignment.id,
            };
          } catch (error: unknown) {
            if (isConstraintViolation(error)) {
              return {
                status: 'blocked',
                message: error.message || 'Assignment blocked by constraints.',
                blockers: error.blockers ?? [],
              };
            }

            if (isShiftStale(error)) {
              return {
                status: 'stale',
                message: 'Shift changed—refresh options.',
                blockers: error.blockers,
              };
            }

            return {
              status: 'error',
              message: 'Unable to create preview.',
              error,
            };
          }
        }
      }
    }

    // Not a template or couldn't create it
    return {
      status: 'stale',
      message: 'Shift changed—refresh options.',
    };
  }

  const previewService = new PreviewService(prisma);
  const snapshotVersion = (assignment.schedule.version ?? 1).toString();

  const isoTimestamp = new Date().toISOString();

  try {
    const { preview, visualization } = await previewService.createPreview({
      storeId,
      weekId,
      snapshotVersion,
      operations: [
        {
          type: 'assign_shift',
          storeId,
          weekId,
          shiftId,
          employeeId,
          timestamp: isoTimestamp,
          source,
          reason,
        },
      ],
    });

    return {
      status: 'ok',
      preview,
      visualization,
      snapshotVersion,
      assignmentId: assignment.id,
    };
  } catch (error: unknown) {
    if (isConstraintViolation(error)) {
      return {
        status: 'blocked',
        message: error.message || 'Assignment blocked by constraints.',
        blockers: error.blockers ?? [],
      };
    }

    if (isShiftStale(error)) {
      return {
        status: 'stale',
        message: 'Shift changed—refresh options.',
        blockers: error.blockers,
      };
    }

    return {
      status: 'error',
      message: 'Unable to create preview.',
      error,
    };
  }
}

function isConstraintViolation(error: unknown): error is ConstraintViolationError {
  return Boolean(error && typeof error === 'object' && (error as ConstraintViolationError).name === 'ConstraintViolationError');
}

function isShiftStale(error: unknown): error is { name: string; blockers?: string[] } {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const name = (error as { name?: string }).name;
  return name === 'ShiftValidationError' || name === 'VersionMismatchError';
}

interface FindAssignmentParams {
  storeId: string;
  weekId: string;
  shiftId: string;
  assignmentId?: string;
}

async function findOpenAssignment(
  prisma: PrismaClient,
  params: FindAssignmentParams,
) {
  const { storeId, weekId, shiftId, assignmentId } = params;

  if (assignmentId) {
    const existing = await prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: {
        schedule: true,
      },
    });

    if (existing && existing.schedule.storeId === storeId && existing.schedule.isoWeek === weekId && !existing.employeeId) {
      return existing;
    }
  }

  const parsed = parseShiftId(shiftId);
  if (!parsed) {
    return null;
  }

  const template = parsed.templateId
    ? await prisma.shiftTemplate.findUnique({ where: { id: parsed.templateId } })
    : null;

  const assignment = await prisma.assignment.findFirst({
    where: {
      schedule: {
        storeId,
        isoWeek: weekId,
      },
      day: parsed.day,
      employeeId: null,
      ...(parsed.templateId ? { sourceTemplateId: parsed.templateId } : {}),
      ...(template
        ? {
            startTime: template.startTime,
            endTime: template.endTime,
          }
        : {}),
    },
    include: {
      schedule: true,
    },
    orderBy: {
      startTime: 'asc',
    },
  });

  if (!assignment) {
    return null;
  }

  if (assignment.schedule.storeId !== storeId || assignment.schedule.isoWeek !== weekId) {
    return null;
  }

  return assignment;
}

function parseShiftId(shiftId: string): { templateId: string | null; day: string } | null {
  if (!shiftId || typeof shiftId !== 'string') {
    return null;
  }

  const segments = shiftId.split('-');
  if (segments.length < 2) {
    return null;
  }

  const day = segments.pop();
  if (!day) {
    return null;
  }

  const templateId = segments.join('-') || null;
  return { templateId, day };
}
