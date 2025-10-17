import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { CreateWorkTypeRequest, WorkTypeResponse } from "@/types/api";
import { ensureManager } from "@/server/manager";

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get manager record
    const manager = await ensureManager({ clerkId: userId });

    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get("storeId");

    if (!storeId) {
      return NextResponse.json({ error: "Store ID is required" }, { status: 400 });
    }

    // Verify user owns the store
    const store = await prisma.store.findFirst({
      where: { id: storeId, managerId: manager.id },
    });

    if (!store) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 });
    }

    const workTypes = await prisma.workType.findMany({
      where: { storeId },
      orderBy: { name: "asc" },
    });

    const response: WorkTypeResponse[] = workTypes.map((wt) => ({
      id: wt.id,
      name: wt.name,
      color: wt.color || "#1D4ED8",
    }));

    return NextResponse.json({ workTypes: response });
  } catch (error) {
    console.error("Error fetching work types:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get manager record
    const manager = await ensureManager({ clerkId: userId });

    const body: { storeId: string; workTypes: CreateWorkTypeRequest[]; forceDelete?: boolean } = await request.json();
    const { storeId, workTypes, forceDelete } = body;

    if (!storeId || !Array.isArray(workTypes)) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    // Verify user owns the store
    const store = await prisma.store.findFirst({
      where: { id: storeId, managerId: manager.id },
    });

    if (!store) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 });
    }

    // Get existing work types
    const existingWorkTypes = await prisma.workType.findMany({
      where: { storeId },
    });

    const existingIds = new Set(existingWorkTypes.map(wt => wt.id));
    const incomingIds = new Set(workTypes.filter(wt => wt.id).map(wt => wt.id!));

    // Determine which to delete (only those not in incoming list)
    const idsToDelete = existingWorkTypes
      .filter(wt => !incomingIds.has(wt.id))
      .map(wt => wt.id);

    // Check what will be affected by deletion
    if (idsToDelete.length > 0) {
      const affectedShiftTemplates = await prisma.shiftTemplate.findMany({
        where: { workTypeId: { in: idsToDelete } },
        select: { id: true, workTypeId: true, workType: { select: { name: true } } },
      });

      const affectedAssignments = await prisma.assignment.findMany({
        where: { 
          sourceTemplate: {
            workTypeId: { in: idsToDelete }
          }
        },
        select: { id: true },
      });

      if (affectedShiftTemplates.length > 0 || affectedAssignments.length > 0) {
        const workTypeNames = existingWorkTypes
          .filter(wt => idsToDelete.includes(wt.id))
          .map(wt => wt.name);

        // If not forcing delete, return warning
        if (!forceDelete) {
          return NextResponse.json({ 
            error: `Work type(s) "${workTypeNames.join(', ')}" are in use by ${affectedShiftTemplates.length} shift template(s) and ${affectedAssignments.length} assignment(s). Deleting will remove all associated shifts and assignments.`,
            needsConfirmation: true,
            details: {
              workTypes: workTypeNames,
              affectedShiftTemplates: affectedShiftTemplates.length,
              affectedAssignments: affectedAssignments.length,
            }
          }, { status: 409 }); // 409 Conflict
        }

        // Force delete: cascade delete related data
        // Delete assignments first
        await prisma.assignment.deleteMany({
          where: { 
            sourceTemplate: {
              workTypeId: { in: idsToDelete }
            }
          }
        });

        // Delete shift templates
        await prisma.shiftTemplate.deleteMany({
          where: { workTypeId: { in: idsToDelete } }
        });
      }

      // Delete work types
      await prisma.workType.deleteMany({
        where: { 
          id: { in: idsToDelete },
          storeId 
        },
      });
    }

    // Update or create work types
    const savedWorkTypes = await Promise.all(
      workTypes.map(async (wt) => {
        if (wt.id && existingIds.has(wt.id)) {
          // Update existing
          return prisma.workType.update({
            where: { id: wt.id },
            data: {
              name: wt.name,
              color: wt.color,
            },
          });
        } else {
          // Create new
          return prisma.workType.create({
            data: {
              storeId,
              name: wt.name,
              color: wt.color,
            },
          });
        }
      })
    );

    const response: WorkTypeResponse[] = savedWorkTypes.map((wt) => ({
      id: wt.id,
      name: wt.name,
      color: wt.color || "#1D4ED8",
    }));

    return NextResponse.json({ workTypes: response });
  } catch (error) {
    console.error("Error saving work types:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}