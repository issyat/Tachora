import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { ensureManager } from "@/server/manager";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const clerkUser = await currentUser();
    const primaryEmail =
      clerkUser?.primaryEmailAddress?.emailAddress ?? clerkUser?.emailAddresses?.[0]?.emailAddress ?? undefined;

    const manager = await ensureManager({ clerkId: userId, email: primaryEmail });

    // Get store info
    const store = await prisma.store.findFirst({
      where: { managerId: manager.id },
    });

    // Get work types
    const workTypes = await prisma.workType.findMany({
      where: { storeId: store?.id },
    });

    // Get employees
    const employees = await prisma.employee.findMany({
      where: { storeId: store?.id },
    });

    // Get shift templates
    const shiftTemplates = await prisma.shiftTemplate.findMany({
      where: { storeId: store?.id },
    });

    return NextResponse.json({
      manager: {
        id: manager.id,
        clerkId: manager.clerkId,
        email: manager.email,
        onboardingStep: manager.onboardingStep,
      },
      store: store ? {
        id: store.id,
        name: store.name,
        city: store.city,
      } : null,
      counts: {
        workTypes: workTypes.length,
        employees: employees.length,
        shiftTemplates: shiftTemplates.length,
      },
      workTypes: workTypes.map(wt => ({ id: wt.id, name: wt.name })),
      employees: employees.map(emp => ({ id: emp.id, name: emp.name })),
    });
  } catch (error) {
    console.error("Debug onboarding error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}