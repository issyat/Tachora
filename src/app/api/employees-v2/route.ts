import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { timeStringToDate } from "@/lib/time";
import { serializeEmployees } from "@/server/setup-serialization";
import { ensureManager } from "@/server/manager";

export async function GET(request: NextRequest) {
  console.log("GET /api/employees-v2 called");
  try {
    const { userId } = await auth();
    console.log("Clerk User ID:", userId);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const clerkUser = await currentUser();
    const primaryEmail =
      clerkUser?.primaryEmailAddress?.emailAddress ?? clerkUser?.emailAddresses?.[0]?.emailAddress ?? undefined;

    const manager = await ensureManager({ clerkId: userId, email: primaryEmail });
    console.log("Database User ID:", manager.id);

    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get("storeId");
    console.log("Store ID:", storeId);

    if (!storeId) {
      return NextResponse.json({ error: "Store ID is required" }, { status: 400 });
    }

    // Verify user owns the store
    const store = await prisma.store.findFirst({
      where: { id: storeId, managerId: manager.id },
    });

    if (!store) {
      console.log("Store not found for user:", manager.id, "storeId:", storeId);
      return NextResponse.json({ error: "Store not found" }, { status: 404 });
    }

    console.log("Store found:", store.name);

    const employees = await prisma.employee.findMany({
      where: { storeId },
      include: {
        availability: true,
        roles: {
          include: {
            workType: true,
          },
        },
      },
      orderBy: { name: "asc" },
    });

    console.log("Found employees:", employees.length);

    const serializedEmployees = serializeEmployees(employees);
    return NextResponse.json({ employees: serializedEmployees });
  } catch (error) {
    console.error("Error fetching employees:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  console.log("POST /api/employees-v2 called");
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
    const { storeId, employee } = body;

    if (!storeId || !employee) {
      return NextResponse.json({ error: "Store ID and employee data are required" }, { status: 400 });
    }

    // Verify user owns the store
    const store = await prisma.store.findFirst({
      where: { id: storeId, managerId: manager.id },
    });

    if (!store) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 });
    }

    // Create employee with availability and roles
    const newEmployee = await prisma.employee.create({
      data: {
        storeId,
        name: employee.name,
        email: employee.email,
        phone: employee.phone,
        color: employee.color,
        canWorkAcrossStores: employee.canWorkAcrossStores || false,
        contractType: employee.contractType || "FULL_TIME",
        weeklyMinutesTarget: employee.weeklyMinutesTarget || 2400,
        availability: {
          create: employee.availability?.map((avail: any) => ({
            day: avail.day,
            isOff: avail.isOff,
            startTime: avail.isOff ? null : timeStringToDate(avail.startTime),
            endTime: avail.isOff ? null : timeStringToDate(avail.endTime),
          })) || [],
        },
        roles: {
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

    const serializedEmployee = serializeEmployees([newEmployee])[0];
    return NextResponse.json({ employee: serializedEmployee });
  } catch (error) {
    console.error("Error creating employee:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}