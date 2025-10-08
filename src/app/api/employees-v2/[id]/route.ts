import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { timeStringToDate } from "@/lib/time";
import { serializeEmployees } from "@/server/setup-serialization";
import { ensureManager } from "@/server/manager";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  console.log("PUT /api/employees-v2/[id] called");
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const clerkUser = await currentUser();
    const primaryEmail =
      clerkUser?.primaryEmailAddress?.emailAddress ?? clerkUser?.emailAddresses?.[0]?.emailAddress ?? undefined;

    const manager = await ensureManager({ clerkId: userId, email: primaryEmail });

    const { id: employeeId } = await params;
    console.log("Employee ID:", employeeId);
    
    const body = await request.json();
    const { employee } = body;

    if (!employee) {
      return NextResponse.json({ error: "Employee data is required" }, { status: 400 });
    }

    // First check if employee exists at all
    const existingEmployee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: { store: true }
    });

    if (!existingEmployee) {
      console.log(`Employee not found: ${employeeId}`);
      return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    }

    // Then check if user owns the store
    if (existingEmployee.store.managerId !== manager.id) {
      console.log(`User ${manager.id} does not own store ${existingEmployee.store.id} for employee ${employeeId}`);
      return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    }

    console.log("Employee found, updating...");

    // Update employee with availability and roles
    const updatedEmployee = await prisma.employee.update({
      where: { id: employeeId },
      data: {
        name: employee.name,
        email: employee.email,
        phone: employee.phone,
        color: employee.color,
        canWorkAcrossStores: employee.canWorkAcrossStores,
        contractType: employee.contractType || "FULL_TIME",
        weeklyMinutesTarget: employee.weeklyMinutesTarget,
        availability: {
          deleteMany: {},
          create: employee.availability?.map((avail: any) => ({
            day: avail.day,
            isOff: avail.isOff,
            startTime: avail.isOff ? null : timeStringToDate(avail.startTime),
            endTime: avail.isOff ? null : timeStringToDate(avail.endTime),
          })) || [],
        },
        roles: {
          deleteMany: {},
          create: employee.roleIds?.map((roleId: string) => ({
            workTypeId: roleId,
          })) || [],
        },
      },
      include: {
        availability: true,
        roles: {
          include: {
            workType: true,
          },
        },
      },
    });

    const serializedEmployee = serializeEmployees([updatedEmployee])[0];
    return NextResponse.json({ employee: serializedEmployee });
  } catch (error) {
    console.error("Error updating employee:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  console.log("DELETE /api/employees-v2/[id] called");
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const clerkUser = await currentUser();
    const primaryEmail =
      clerkUser?.primaryEmailAddress?.emailAddress ?? clerkUser?.emailAddresses?.[0]?.emailAddress ?? undefined;

    const manager = await ensureManager({ clerkId: userId, email: primaryEmail });

    const { id: employeeId } = await params;
    console.log("Employee ID for deletion:", employeeId);

    // First check if employee exists at all
    const existingEmployee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: { store: true }
    });

    if (!existingEmployee) {
      console.log(`Employee not found for deletion: ${employeeId}`);
      return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    }

    // Then check if user owns the store
    if (existingEmployee.store.managerId !== manager.id) {
      console.log(`User ${manager.id} does not own store ${existingEmployee.store.id} for employee ${employeeId}`);
      return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    }

    console.log("Employee found, deleting...");

    // Delete employee (cascade will handle availability and roles)
    await prisma.employee.delete({
      where: { id: employeeId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting employee:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}