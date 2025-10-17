/**
 * GET /api/preview/[id]
 * 
 * Fetches a preview by ID (used when AI creates a preview and frontend needs to display it).
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { PreviewService } from '@/server/preview/preview-service';
import type { DiscardPreviewResponse } from '@/types/preview';

export async function GET(
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

    // 2. Fetch preview
    const previewService = new PreviewService(prisma);
    const preview = await previewService.getPreview(id);

    if (!preview) {
      return NextResponse.json(
        { error: 'Preview not found or expired' },
        { status: 404 }
      );
    }

    // 3. Return preview
    return NextResponse.json({ preview }, { status: 200 });

  } catch (error: any) {
    console.error(`[GET /api/preview] Error:`, error);

    return NextResponse.json(
      {
        error: 'Failed to fetch preview',
        message: error.message || 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/preview/[id]
 * 
 * Discards a pending preview without applying it.
 */

export async function DELETE(
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

    // 2. Discard preview
    const previewService = new PreviewService(prisma);
    const result = await previewService.discardPreview(id);

    // 3. Return result
    const response: DiscardPreviewResponse = {
      success: result.success,
    };

    return NextResponse.json(response, { status: 200 });

  } catch (error: any) {
    console.error(`[DELETE /api/preview] Error:`, error);

    // Generic error
    return NextResponse.json(
      {
        error: 'Failed to discard preview',
        message: error.message || 'Unknown error',
      },
      { status: 500 }
    );
  }
}
