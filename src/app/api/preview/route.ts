/**
 * POST /api/preview
 * 
 * Creates a preview of scheduling operations without modifying the database.
 * Returns preview ID and visualization data for UI rendering.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { PreviewService } from '@/server/preview/preview-service';
import type {
  CreatePreviewRequest,
  CreatePreviewResponse,
} from '@/types/preview';

export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate user
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // 2. Parse request body
    const body = await req.json() as CreatePreviewRequest;
    
    // 3. Validate request
    if (!body.storeId || !body.weekId || !body.operations || !body.snapshotVersion) {
      return NextResponse.json(
        { error: 'Missing required fields: storeId, weekId, operations, snapshotVersion' },
        { status: 400 }
      );
    }

    // 4. Verify user has access to store
    const store = await prisma.store.findUnique({
      where: { id: body.storeId },
      select: { managerId: true },
    });

    if (!store || store.managerId !== userId) {
      return NextResponse.json(
        { error: 'Store not found or access denied' },
        { status: 403 }
      );
    }

    // 5. Create preview
    const previewService = new PreviewService(prisma);
    const result = await previewService.createPreview(body);

    // 6. Return preview and visualization
    const response: CreatePreviewResponse = {
      preview: result.preview,
      visualization: result.visualization,
    };

    return NextResponse.json(response, { status: 200 });

  } catch (error: any) {
    console.error('[POST /api/preview] Error:', error);

    // Handle specific error types
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

    if (error.name === 'ConstraintViolationError') {
      return NextResponse.json(
        {
          error: 'Constraint violation',
          message: error.message,
          blockers: error.blockers,
          code: 'CONSTRAINT_VIOLATION',
        },
        { status: 422 }
      );
    }

    // Generic error
    return NextResponse.json(
      { 
        error: 'Failed to create preview',
        message: error.message || 'Unknown error',
      },
      { status: 500 }
    );
  }
}
