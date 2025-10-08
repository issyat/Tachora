import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { timeDateToString, timeStringToDate } from "@/lib/time";
import { advanceOnboardingStep, ensureManager } from "@/server/manager";

const timeStringSchema = z
  .string()
  .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Time must be in HH:mm format");

const bodySchema = z
  .object({
    storeId: z.string().optional(), // Add storeId for updates
    name: z.string().min(2).max(120),
    address: z.string().optional(),
    city: z.string().min(2).max(120).optional(),
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

export async function POST(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(payload);

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return NextResponse.json({ error: firstIssue?.message ?? "Invalid request" }, { status: 400 });
  }

  const { storeId, name, address, city, openingTime, closingTime } = parsed.data;
  const trimmedName = name.trim();
  const trimmedAddress = address?.trim() ?? null;
  const openingDate = openingTime ? timeStringToDate(openingTime) : undefined;
  const closingDate = closingTime ? timeStringToDate(closingTime) : undefined;

  const clerkUser = await currentUser();
  const primaryEmail =
    clerkUser?.primaryEmailAddress?.emailAddress ?? clerkUser?.emailAddresses?.[0]?.emailAddress ?? undefined;

  let manager = await ensureManager({ clerkId: userId, email: primaryEmail });

  try {
    const store = await prisma.$transaction(async (tx) => {
      // If storeId is provided, we're updating a specific store
      const existing = storeId 
        ? await tx.store.findFirst({ where: { id: storeId, managerId: manager.id } })
        : await tx.store.findFirst({ where: { managerId: manager.id } });

      if (existing) {
        // Check if the new name conflicts with other stores (not this one)
        if (trimmedName !== existing.name) {
          const nameConflict = await tx.store.findFirst({
            where: {
              managerId: manager.id,
              name: trimmedName,
              id: { not: existing.id }, // Exclude the current store
            },
          });
          
          if (nameConflict) {
            throw new Error("DUPLICATE_STORE_NAME");
          }
        }

        const nextOpening = openingDate ?? existing.openingTime ?? timeStringToDate(DEFAULT_OPENING);
        const nextClosing = closingDate ?? existing.closingTime ?? timeStringToDate(DEFAULT_CLOSING);
        if (nextClosing <= nextOpening) {
          throw new Error("INVALID_OPERATING_HOURS");
        }
        return tx.store.update({
          where: { id: existing.id },
          data: {
            name: trimmedName,
            address: trimmedAddress,
            ...(city ? { city: city.trim() } : {}),
            ...(openingDate ? { openingTime: openingDate } : {}),
            ...(closingDate ? { closingTime: closingDate } : {}),
          },
        });
      }

      const nextOpening = openingDate ?? timeStringToDate(DEFAULT_OPENING);
      const nextClosing = closingDate ?? timeStringToDate(DEFAULT_CLOSING);
      if (nextClosing <= nextOpening) {
        throw new Error("INVALID_OPERATING_HOURS");
      }
      return tx.store.create({
        data: {
          name: trimmedName,
          address: trimmedAddress,
          country: "BE",
          city: (city ?? "").trim(),
          managerId: manager.id,
          openingTime: nextOpening,
          closingTime: nextClosing,
        },
      });
    });

    manager = await advanceOnboardingStep(manager, "EMPLOYEES");

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
      onboardingStep: manager.onboardingStep,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "INVALID_OPERATING_HOURS") {
        return NextResponse.json({ error: "Closing time must be after opening time" }, { status: 400 });
      }
      if (error.message === "DUPLICATE_STORE_NAME") {
        return NextResponse.json({ error: "A store with this name already exists" }, { status: 400 });
      }
    }
    console.error("Failed to upsert store", error);
    return NextResponse.json({ error: "Unable to save store" }, { status: 500 });
  }
}





