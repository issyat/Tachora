import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { ensureManager } from "@/server/manager";

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const clerkUser = await currentUser();
    const primaryEmail =
      clerkUser?.primaryEmailAddress?.emailAddress ?? clerkUser?.emailAddresses?.[0]?.emailAddress ?? undefined;

    const manager = await ensureManager({ clerkId: userId, email: primaryEmail });

    const body = await request.json();
    const { workTypes } = body;

    if (!Array.isArray(workTypes)) {
      return NextResponse.json({ error: "Work types array is required" }, { status: 400 });
    }

    // Get the user's store (assuming they have one store for setup)
    const store = await prisma.store.findFirst({
      where: { managerId: manager.id },
    });

    if (!store) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 });
    }

    // Get existing work types for this store
    const existingWorkTypes = await prisma.workType.findMany({
      where: { storeId: store.id },
    });

    const existingByName = new Map(existingWorkTypes.map(wt => [wt.name.toLowerCase(), wt]));

    // Create or update work types
    const resultWorkTypes = await Promise.all(
      workTypes.map(async (wt: any) => {
        const existingWorkType = existingByName.get(wt.name.toLowerCase());
        
        if (existingWorkType) {
          // Update existing work type
          return prisma.workType.update({
            where: { id: existingWorkType.id },
            data: {
              color: wt.color || existingWorkType.color || "#1D4ED8",
            },
          });
        } else {
          // Create new work type
          return prisma.workType.create({
            data: {
              storeId: store.id,
              name: wt.name,
              color: wt.color || "#1D4ED8",
            },
          });
        }
      })
    );

    const response = resultWorkTypes.map((wt) => ({
      id: wt.id,
      name: wt.name,
      color: wt.color || "#1D4ED8",
    }));

    return NextResponse.json({ workTypes: response });
  } catch (error) {
    console.error("Error creating work types:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}