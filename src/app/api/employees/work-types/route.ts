import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: { employeeId: string; workTypeIds: string[] } = await request.json();
    const { employeeId, workTypeIds } = body;

    if (!employeeId || !Array.isArray(workTypeIds)) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    // Verify user owns the employee's store
    const employee = await prisma.employee.findFirst({
      where: { 
        id: employeeId,
        store: { managerId: userId }
      },
      include: { store: true }
    });

    if (!employee) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    }

    // Verify all work types belong to the same store
    const workTypes = await prisma.workType.findMany({
      where: { 
        id: { in: workTypeIds },
        storeId: employee.storeId
      }
    });

    if (workTypes.length !== workTypeIds.length) {
      return NextResponse.json({ error: "Invalid work type IDs" }, { status: 400 });
    }

    // Delete existing assignments
    await prisma.employeeWorkType.deleteMany({
      where: { employeeId }
    });

    // Create new assignments
    if (workTypeIds.length > 0) {
      await prisma.employeeWorkType.createMany({
        data: workTypeIds.map(workTypeId => ({
          employeeId,
          workTypeId
        }))
      });
    }

    // Return updated employee with work types
    const updatedEmployee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: {
        roles: {
          include: { workType: true }
        }
      }
    });

    return NextResponse.json({ 
      success: true,
      workTypes: updatedEmployee?.roles.map(r => ({
        id: r.workType.id,
        name: r.workType.name,
        color: r.workType.color
      })) || []
    });
  } catch (error) {
    console.error("Error updating employee work types:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}