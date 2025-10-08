import type { OnboardingStep, User } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";

const STEP_ORDER: Record<OnboardingStep, number> = {
  STORE: 0,
  EMPLOYEES: 1,
  SHIFTS: 2,
  DONE: 3,
};

type EnsureManagerArgs = {
  clerkId: string;
  email?: string | null;
};

export async function ensureManager({ clerkId, email }: EnsureManagerArgs): Promise<User> {
  const sanitizedEmail = email ?? undefined;

  return prisma.user.upsert({
    where: { clerkId },
    update: sanitizedEmail ? { email: sanitizedEmail } : {},
    create: {
      clerkId,
      email: sanitizedEmail,
    },
  });
}

export async function advanceOnboardingStep(user: User, target: OnboardingStep): Promise<User> {
  if (STEP_ORDER[target] <= STEP_ORDER[user.onboardingStep]) {
    return user;
  }

  return prisma.user.update({
    where: { id: user.id },
    data: { onboardingStep: target },
  });
}