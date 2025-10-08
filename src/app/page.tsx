import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

export default async function Home() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  const user = await prisma.user.findUnique({ where: { clerkId: userId } });

  if (user?.onboardingStep === "DONE") {
    redirect("/schedule");
  }

  redirect("/setup");
}
