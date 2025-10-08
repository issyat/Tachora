import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { timeStringToDate } from "@/lib/time";
import { advanceOnboardingStep, ensureManager } from "@/server/manager";
import { serializeShiftTemplates } from "@/server/setup-serialization";

const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

const daysSchema = z.object({
  MON: z.boolean(),
  TUE: z.boolean(),
  WED: z.boolean(),
  THU: z.boolean(),
  FRI: z.boolean(),
  SAT: z.boolean(),
  SUN: z.boolean(),
});

const templateSchema = z
  .object({
    workTypeId: z.string().min(1),
    days: daysSchema,
    startTime: z.string().regex(timeRegex),
    endTime: z.string().regex(timeRegex),
  })
  .refine((value) => value.startTime < value.endTime, {
    message: "End time must be after start time",
    path: ["endTime"],
  })
  .refine((value) => Object.values(value.days).some(Boolean), {
    message: "Select at least one day",
    path: ["days"],
  });

const bodySchema = z.object({
  storeId: z.string().min(1),
  templates: z.array(templateSchema),
});

export async function DELETE(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const templateId = url.searchParams.get('id');
  const storeId = url.searchParams.get('storeId');

  if (!templateId || !storeId) {
    return NextResponse.json({ error: "Template ID and Store ID are required" }, { status: 400 });
  }

  const clerkUser = await currentUser();
  const primaryEmail =
    clerkUser?.primaryEmailAddress?.emailAddress ?? clerkUser?.emailAddresses?.[0]?.emailAddress ?? undefined;

  const manager = await ensureManager({ clerkId: userId, email: primaryEmail });

  // Verify store ownership
  const store = await prisma.store.findUnique({
    where: { id: storeId },
  });

  if (!store || store.managerId !== manager.id) {
    return NextResponse.json({ error: "Store not found" }, { status: 404 });
  }

  try {
    // Delete the specific template
    const deletedTemplate = await prisma.shiftTemplate.delete({
      where: {
        id: templateId,
        storeId: storeId, // Additional security check
      },
    });

    return NextResponse.json({
      success: true,
      deletedId: deletedTemplate.id
    });
  } catch (error) {
    console.error("Failed to delete shift template:", error);

    if (error instanceof Error && error.message.includes('Record to delete does not exist')) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    return NextResponse.json({ error: "Unable to delete shift template" }, { status: 500 });
  }
}

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

  const { storeId, templates } = parsed.data;

  const clerkUser = await currentUser();
  const primaryEmail =
    clerkUser?.primaryEmailAddress?.emailAddress ?? clerkUser?.emailAddresses?.[0]?.emailAddress ?? undefined;

  let manager = await ensureManager({ clerkId: userId, email: primaryEmail });

  const store = await prisma.store.findUnique({
    where: { id: storeId },
    include: { workTypes: true },
  });

  if (!store || store.managerId !== manager.id) {
    return NextResponse.json({ error: "Store not found" }, { status: 404 });
  }

  const workTypeMap = new Map(store.workTypes.map((type) => [type.id, type]));

  // Validate work types exist
  for (const template of templates) {
    if (!workTypeMap.has(template.workTypeId)) {
      return NextResponse.json({ error: "One or more selected roles no longer exist" }, { status: 400 });
    }
  }

  // Validate shift times are within store hours
  if (store.openingTime && store.closingTime) {
    const storeOpenMinutes = store.openingTime.getUTCHours() * 60 + store.openingTime.getUTCMinutes();
    const storeCloseMinutes = store.closingTime.getUTCHours() * 60 + store.closingTime.getUTCMinutes();

    for (const template of templates) {
      const [startHour, startMin] = template.startTime.split(':').map(Number);
      const [endHour, endMin] = template.endTime.split(':').map(Number);
      const shiftStartMinutes = startHour * 60 + startMin;
      const shiftEndMinutes = endHour * 60 + endMin;

      if (shiftStartMinutes < storeOpenMinutes) {
        return NextResponse.json({ 
          error: `Shift cannot start before store opens. Store opens at ${String(Math.floor(storeOpenMinutes / 60)).padStart(2, '0')}:${String(storeOpenMinutes % 60).padStart(2, '0')}` 
        }, { status: 400 });
      }

      if (shiftEndMinutes > storeCloseMinutes) {
        return NextResponse.json({ 
          error: `Shift cannot end after store closes. Store closes at ${String(Math.floor(storeCloseMinutes / 60)).padStart(2, '0')}:${String(storeCloseMinutes % 60).padStart(2, '0')}` 
        }, { status: 400 });
      }
    }
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Delete all existing templates for this store
      await tx.shiftTemplate.deleteMany({ where: { storeId } });

      // Create new templates
      const createdTemplates = [];
      for (const template of templates) {
        const workType = workTypeMap.get(template.workTypeId)!;

        const created = await tx.shiftTemplate.create({
          data: {
            storeId,
            role: workType.name,
            workTypeId: workType.id,
            days: template.days,
            startTime: timeStringToDate(template.startTime),
            endTime: timeStringToDate(template.endTime),
          },
        });
        createdTemplates.push(created);
      }

      return createdTemplates;
    }, {
      timeout: 10000, // 10 second timeout
    });

    // Update onboarding step outside of transaction (non-critical operation)
    try {
      manager = await advanceOnboardingStep(manager, "DONE");
    } catch (onboardingError) {
      console.warn("Failed to advance onboarding step:", onboardingError);
      // Don't fail the entire operation if onboarding update fails
    }

    return NextResponse.json({
      templates: serializeShiftTemplates(result),
      onboardingStep: manager.onboardingStep,
    });
  } catch (error) {
    console.error("Failed to upsert shift templates:", error);

    // Provide more specific error messages
    if (error instanceof Error) {
      if (error.message.includes('Transaction')) {
        return NextResponse.json({ error: "Database transaction failed. Please try again." }, { status: 500 });
      }
      if (error.message.includes('timeout')) {
        return NextResponse.json({ error: "Operation timed out. Please try again." }, { status: 500 });
      }
    }

    return NextResponse.json({ error: "Unable to save shift templates" }, { status: 500 });
  }
}
