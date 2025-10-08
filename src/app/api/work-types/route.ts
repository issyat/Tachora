import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { CreateWorkTypeRequest, WorkTypeResponse } from "@/types/api";

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get("storeId");

    if (!storeId) {
      return NextResponse.json({ error: "Store ID is required" }, { status: 400 });
    }

    // Verify user owns the store
    const store = await prisma.store.findFirst({
      where: { id: storeId, managerId: userId },
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

    const body: { storeId: string; workTypes: CreateWorkTypeRequest[] } = await request.json();
    const { storeId, workTypes } = body;

    if (!storeId || !Array.isArray(workTypes)) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    // Verify user owns the store
    const store = await prisma.store.findFirst({
      where: { id: storeId, managerId: userId },
    });

    if (!store) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 });
    }

    // Delete existing work types for this store
    await prisma.workType.deleteMany({
      where: { storeId },
    });

    // Create new work types
    const createdWorkTypes = await Promise.all(
      workTypes.map((wt) =>
        prisma.workType.create({
          data: {
            storeId,
            name: wt.name,
            color: wt.color,
          },
        })
      )
    );

    const response: WorkTypeResponse[] = createdWorkTypes.map((wt) => ({
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