/**
 * POST /api/preview/[id]/apply
 * 
 * Applies a pending preview to the database in a single transaction.
 * Uses optimistic locking to prevent conflicts.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { PreviewService } from '@/server/preview/preview-service';
import { mapErrorToUserMessage, reportError } from '@/lib/error-map';
import type {
  ApplyPreviewRequest,
  ApplyPreviewResponse,
} from '@/types/preview';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // 0. Await params (Next.js 15 requirement)
    const { id } = await Promise.resolve(params);
    
    // 1. Authenticate user
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // 2. Parse request body
    const body = await req.json() as ApplyPreviewRequest;
    
    // 3. Validate request
    if (!body.snapshotVersion) {
      return NextResponse.json(
        { error: 'Missing required field: snapshotVersion' },
        { status: 400 }
      );
    }

    // 4. Apply preview
    const previewService = new PreviewService(prisma);
    const result = await previewService.applyPreview(
      id,
      userId,
      body.snapshotVersion
    );

    // 5. Return result
    const response: ApplyPreviewResponse = {
      success: result.success,
      appliedOps: result.appliedOps,
      newSnapshotVersion: result.newVersion,
    };

    return NextResponse.json(response, { status: 200 });

  } catch (error: any) {
    // Await params again for error logging (Next.js 15)
    const { id } = await Promise.resolve(params);
    console.error(`[POST /api/preview/${id}/apply] Error:`, error);
    reportError(error, {
      area: 'preview_apply',
      previewId: id,
      userId,
    });

    // Handle specific error types
    if (error.name === 'PreviewNotFoundError') {
      return NextResponse.json(
        {
          error: 'Preview not found',
          message: error.message,
          code: 'PREVIEW_NOT_FOUND',
        },
        { status: 404 }
      );
    }

    if (error.name === 'PreviewExpiredError') {
      return NextResponse.json(
        {
          error: 'Preview expired',
          message: error.message,
          code: 'PREVIEW_EXPIRED',
        },
        { status: 410 }
      );
    }

    if (error.name === 'VersionMismatchError') {
      return NextResponse.json(
        {
          error: 'Version mismatch',
          message: error.message,
          code: 'VERSION_MISMATCH',
        },
        { status: 409 }
      );
    }

    if (error.name === 'ShiftValidationError') {
      const mapped = mapErrorToUserMessage(error);
      return NextResponse.json(
        {
          error: 'Shift unavailable',
          message: mapped.message,
          code: 'SHIFT_STALE',
          blockers: mapped.blockers ?? [],
          actionRequired: mapped.actionRequired,
        },
        { status: 409 }
      );
    }

    const mapped = mapErrorToUserMessage(error);
    return NextResponse.json(
      {
        error: mapped.message,
        blockers: mapped.blockers,
        actionRequired: mapped.actionRequired,
      },
      { status: 500 }
    );
  }
}
