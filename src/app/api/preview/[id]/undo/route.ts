/**
 * POST /api/preview/[id]/undo
 * 
 * Reverts an applied preview using inverse operations.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { PreviewService } from '@/server/preview/preview-service';
import type { UndoPreviewResponse } from '@/types/preview';

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

    // 2. Undo preview
    const previewService = new PreviewService(prisma);
    const result = await previewService.undoPreview(id, userId);

    // 3. Return result
    const response: UndoPreviewResponse = {
      success: result.success,
      revertedOps: result.revertedOps,
      newSnapshotVersion: result.newVersion,
    };

    return NextResponse.json(response, { status: 200 });

  } catch (error: any) {
    console.error(`[POST /api/preview/undo] Error:`, error);

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

    // Generic error
    return NextResponse.json(
      {
        error: 'Failed to undo preview',
        message: error.message || 'Unknown error',
      },
      { status: 500 }
    );
  }
}
