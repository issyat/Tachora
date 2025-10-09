import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { timeDateToString, timeStringToDate } from "@/lib/time";
import { ensureManager } from "@/server/manager";
import type { 
  StoreResponse, 
  CreateStoreRequest, 
  ApiResponse 
} from "@/types";

const timeStringSchema = z
  .string()
  .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Time must be in HH:mm format");

const bodySchema = z
  .object({
    name: z.string().min(2).max(120),
    address: z.string().optional(),
    city: z.string().min(2).max(120),
    openingTime: timeStringSchema.optional(),
    closingTime: timeStringSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.openingTime && value.closingTime) {
      const opening = timeStringToDate(value.openingTime);
      const closing = timeStringToDate(value.closingTime);
      if (closing <= opening) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Closing time must be after opening time",
          path: ["closingTime"],
        });
      }
    }
  });

const DEFAULT_OPENING = "09:00";
const DEFAULT_CLOSING = "22:00";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const clerk = await currentUser();
  const email = clerk?.primaryEmailAddress?.emailAddress ?? clerk?.emailAddresses?.[0]?.emailAddress ?? undefined;
  const manager = await ensureManager({ clerkId: userId, email });

  const stores = await prisma.store.findMany({
    where: { managerId: manager.id },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({
    stores: stores.map((s) => ({
      id: s.id,
      name: s.name,
      address: s.address ?? "",
      city: s.city,
      country: s.country,
      openingTime: timeDateToString(s.openingTime, DEFAULT_OPENING),
      closingTime: timeDateToString(s.closingTime, DEFAULT_CLOSING),
    })),
  });
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const clerk = await currentUser();
  const email = clerk?.primaryEmailAddress?.emailAddress ?? clerk?.emailAddresses?.[0]?.emailAddress ?? undefined;
  const manager = await ensureManager({ clerkId: userId, email });

  const payload = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return NextResponse.json({ error: first?.message ?? "Invalid request" }, { status: 400 });
  }
  const { name, address, city, openingTime, closingTime } = parsed.data;

  // Enforce single-city per manager: if manager already has stores, city must match first store city
  const firstStore = await prisma.store.findFirst({ where: { managerId: manager.id }, orderBy: { createdAt: "asc" } });
  if (firstStore && firstStore.city.toLowerCase() !== city.trim().toLowerCase()) {
    return NextResponse.json({ error: `All stores must be in ${firstStore.city}` }, { status: 400 });
  }

  const openingDate = timeStringToDate(openingTime ?? DEFAULT_OPENING);
  const closingDate = timeStringToDate(closingTime ?? DEFAULT_CLOSING);
  if (closingDate <= openingDate) {
    return NextResponse.json({ error: "Closing time must be after opening time" }, { status: 400 });
  }

  const store = await prisma.store.create({
    data: {
      managerId: manager.id,
      name: name.trim(),
      address: address?.trim() ?? null,
      city: city.trim(),
      country: "BE",
      openingTime: openingDate,
      closingTime: closingDate,
    },
  });

  return NextResponse.json({
    store: {
      id: store.id,
      name: store.name,
      address: store.address ?? "",
      city: store.city,
      country: store.country,
      openingTime: timeDateToString(store.openingTime, DEFAULT_OPENING),
      closingTime: timeDateToString(store.closingTime, DEFAULT_CLOSING),
    },
  });
}

export async function DELETE(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const storeId = url.searchParams.get('id');

  if (!storeId) {
    return NextResponse.json({ error: "Store ID is required" }, { status: 400 });
  }

  const clerk = await currentUser();
  const email = clerk?.primaryEmailAddress?.emailAddress ?? clerk?.emailAddresses?.[0]?.emailAddress ?? undefined;
  const manager = await ensureManager({ clerkId: userId, email });

  try {
    // Verify store ownership
    const store = await prisma.store.findUnique({
      where: { id: storeId },
      include: {
        employees: true,
        schedules: true,
        shiftTemplates: true,
        workTypes: true,
      },
    });

    if (!store || store.managerId !== manager.id) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 });
    }

    // Check if store has data that would be lost
    const hasData = store.employees.length > 0 || 
                   store.schedules.length > 0 || 
                   store.shiftTemplates.length > 0 || 
                   store.workTypes.length > 0;

    if (hasData) {
      return NextResponse.json({
        error: "Cannot delete store with existing data",
        details: {
          employees: store.employees.length,
          schedules: store.schedules.length,
          shiftTemplates: store.shiftTemplates.length,
          workTypes: store.workTypes.length,
        },
        suggestion: "Please remove all employees, schedules, shift templates, and work types before deleting the store."
      }, { status: 409 });
    }

    // Delete the store (cascade will handle related data)
    await prisma.store.delete({
      where: { id: storeId },
    });

    return NextResponse.json({
      success: true,
      message: `Store "${store.name}" has been deleted successfully.`,
    });

  } catch (error) {
    console.error("Failed to delete store:", error);

    if (error instanceof Error && error.message.includes('Record to delete does not exist')) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 });
    }

    return NextResponse.json({ 
      error: "Failed to delete store",
      details: "An unexpected error occurred while deleting the store."
    }, { status: 500 });
  }
}

