import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { ensureManager } from "@/server/manager";

export async function POST() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const clerkUser = await currentUser();
    const primaryEmail =
      clerkUser?.primaryEmailAddress?.emailAddress ?? clerkUser?.emailAddresses?.[0]?.emailAddress ?? undefined;

    const manager = await ensureManager({ clerkId: userId, email: primaryEmail });

    // Get the user's store
    const store = await prisma.store.findFirst({
      where: { managerId: manager.id },
    });

    if (!store) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 });
    }

    // Get all employees for this store
    const employees = await prisma.employee.findMany({
      where: { storeId: store.id },
      include: { availability: true },
    });

    let updatedCount = 0;

    for (const employee of employees) {
      // Delete existing availability
      await prisma.employeeAvailability.deleteMany({
        where: { employeeId: employee.id },
      });

      // Create new availability (Mon-Fri available, Sat-Sun off)
      await prisma.employeeAvailability.createMany({
        data: [
          { employeeId: employee.id, day: 'MON', isOff: false, startTime: new Date('2000-01-01T09:00:00'), endTime: new Date('2000-01-01T17:00:00') },
          { employeeId: employee.id, day: 'TUE', isOff: false, startTime: new Date('2000-01-01T09:00:00'), endTime: new Date('2000-01-01T17:00:00') },
          { employeeId: employee.id, day: 'WED', isOff: false, startTime: new Date('2000-01-01T09:00:00'), endTime: new Date('2000-01-01T17:00:00') },
          { employeeId: employee.id, day: 'THU', isOff: false, startTime: new Date('2000-01-01T09:00:00'), endTime: new Date('2000-01-01T17:00:00') },
          { employeeId: employee.id, day: 'FRI', isOff: false, startTime: new Date('2000-01-01T09:00:00'), endTime: new Date('2000-01-01T17:00:00') },
          { employeeId: employee.id, day: 'SAT', isOff: true, startTime: null, endTime: null },
          { employeeId: employee.id, day: 'SUN', isOff: true, startTime: null, endTime: null },
        ],
      });

      updatedCount++;
    }

    return NextResponse.json({ 
      message: `Fixed availability for ${updatedCount} employees`,
      employees: employees.map(emp => ({ id: emp.id, name: emp.name }))
    });
  } catch (error) {
    console.error("Error fixing availability:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}