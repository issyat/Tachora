import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";

import { prisma } from "@/lib/prisma";
import { timeDateToString } from "@/lib/time";
import { ensureManager } from "@/server/manager";
import {
  serializeEmployees,
  serializeShiftTemplates,
  serializeWorkTypes,
} from "@/server/setup-serialization";

const DEFAULT_OPENING = "09:00";
const DEFAULT_CLOSING = "22:00";

export async function GET(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clerkUser = await currentUser();
  const primaryEmail =
    clerkUser?.primaryEmailAddress?.emailAddress ?? clerkUser?.emailAddresses?.[0]?.emailAddress ?? undefined;

  const manager = await ensureManager({ clerkId: userId, email: primaryEmail });

  // Get storeId from query params
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');

  // Get all stores for this manager
  const allStores = await prisma.store.findMany({
    where: { managerId: manager.id },
    orderBy: { createdAt: "asc" },
  });

  if (allStores.length === 0) {
    return NextResponse.json({
      stores: [],
      store: null,
      employees: [],
      shiftTemplates: [],
      workTypes: [],
      onboardingStep: manager.onboardingStep,
    });
  }

  // Determine which store to show details for
  let targetStore = null;
  if (storeId) {
    targetStore = allStores.find(s => s.id === storeId);
  }
  if (!targetStore) {
    targetStore = allStores[0]; // Default to first store
  }

  // Get detailed data for the target store
  const storeWithDetails = await prisma.store.findUnique({
    where: { id: targetStore.id },
    include: {
      employees: {
        include: {
          availability: true,
          roles: {
            include: { workType: true },
          },
        },
        orderBy: { createdAt: "asc" },
      },
      shiftTemplates: {
        include: { workType: true },
        orderBy: { createdAt: "asc" },
      },
      workTypes: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!storeWithDetails) {
    return NextResponse.json({ error: "Store not found" }, { status: 404 });
  }

  // Get cross-store employees (employees that can work at this store)
  const crossStoreEmployees = await prisma.employee.findMany({
    where: {
      canWorkAcrossStores: true,
      storeId: { not: targetStore.id },
      store: { managerId: manager.id }, // Only from manager's other stores
    },
    include: {
      availability: true,
      roles: {
        include: { workType: true },
      },
      store: true,
    },
    orderBy: { createdAt: "asc" },
  });

  // Combine store employees with cross-store employees
  const allEmployees = [
    ...storeWithDetails.employees,
    ...crossStoreEmployees,
  ];

  const employees = serializeEmployees(allEmployees);
  const shiftTemplates = serializeShiftTemplates(storeWithDetails.shiftTemplates);
  const workTypes = serializeWorkTypes(storeWithDetails.workTypes ?? []);

  // Serialize all stores for store selector
  const stores = allStores.map(store => ({
    id: store.id,
    name: store.name,
    address: store.address ?? "",
    city: store.city,
    country: store.country,
    openingTime: timeDateToString(store.openingTime, DEFAULT_OPENING),
    closingTime: timeDateToString(store.closingTime, DEFAULT_CLOSING),
  }));

  return NextResponse.json({
    stores,
    store: {
      id: storeWithDetails.id,
      name: storeWithDetails.name,
      address: storeWithDetails.address ?? "",
      city: storeWithDetails.city,
      country: storeWithDetails.country,
      openingTime: timeDateToString(storeWithDetails.openingTime, DEFAULT_OPENING),
      closingTime: timeDateToString(storeWithDetails.closingTime, DEFAULT_CLOSING),
    },
    employees,
    shiftTemplates,
    workTypes,
    onboardingStep: manager.onboardingStep,
  });
}
