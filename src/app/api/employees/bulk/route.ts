import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { ensureManager } from "@/server/manager";
import { serializeEmployees } from "@/server/setup-serialization";

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
    const { employees } = body;

    if (!Array.isArray(employees)) {
      return NextResponse.json({ error: "Employees array is required" }, { status: 400 });
    }

    // Get the user's store (assuming they have one store for setup)
    const store = await prisma.store.findFirst({
      where: { managerId: manager.id },
    });

    if (!store) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 });
    }

    // Get existing employees to avoid duplicates
    const existingEmployees = await prisma.employee.findMany({
      where: { storeId: store.id },
    });

    const existingByEmail = new Map(existingEmployees.map(emp => [emp.email?.toLowerCase(), emp]));
    const existingByName = new Map(existingEmployees.map(emp => [emp.name.toLowerCase(), emp]));

    // Create employees (skip duplicates)
    const createdEmployees = [];
    
    for (const emp of employees) {
      // Skip if employee already exists (by email or name)
      const existsByEmail = emp.email && existingByEmail.has(emp.email.toLowerCase());
      const existsByName = existingByName.has(emp.name.toLowerCase());
      
      if (existsByEmail || existsByName) {
        console.log(`Skipping duplicate employee: ${emp.name}`);
        continue;
      }

      try {
        const createdEmployee = await prisma.employee.create({
          data: {
            storeId: store.id,
            name: emp.name,
            email: emp.email || null,
            phone: emp.phone || null,
            color: emp.color,
            contractType: emp.contractType,
            canWorkAcrossStores: false,
            weeklyMinutesTarget: emp.contractType === 'FULL_TIME' ? 2400 : 1200, // 40h or 20h
            availability: {
              create: [
                { day: 'MON', isOff: false, startTime: new Date('2000-01-01T09:00:00'), endTime: new Date('2000-01-01T17:00:00') },
                { day: 'TUE', isOff: false, startTime: new Date('2000-01-01T09:00:00'), endTime: new Date('2000-01-01T17:00:00') },
                { day: 'WED', isOff: false, startTime: new Date('2000-01-01T09:00:00'), endTime: new Date('2000-01-01T17:00:00') },
                { day: 'THU', isOff: false, startTime: new Date('2000-01-01T09:00:00'), endTime: new Date('2000-01-01T17:00:00') },
                { day: 'FRI', isOff: false, startTime: new Date('2000-01-01T09:00:00'), endTime: new Date('2000-01-01T17:00:00') },
                { day: 'SAT', isOff: true, startTime: null, endTime: null },
                { day: 'SUN', isOff: true, startTime: null, endTime: null },
              ],
            },
            roles: {
              create: emp.workTypeIds?.map((workTypeId: string) => ({
                workTypeId,
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
        
        createdEmployees.push(createdEmployee);
      } catch (createError) {
        console.warn(`Failed to create employee ${emp.name}:`, createError);
        // Continue with other employees
      }
    }

    const serializedEmployees = serializeEmployees(createdEmployees);
    return NextResponse.json({ employees: serializedEmployees });
  } catch (error) {
    console.error("Error creating employees:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}