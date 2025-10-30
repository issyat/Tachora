import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const FALLBACK_LIMIT = 3;

const DEFAULT_FALLBACKS = [
  "Who is still unassigned for this week?",
  "Are any employees under their weekly target hours?",
  "Which shifts still need coverage this weekend?",
];

const DAY_LABEL: Record<string, string> = {
  MON: "Monday",
  TUE: "Tuesday",
  WED: "Wednesday",
  THU: "Thursday",
  FRI: "Friday",
  SAT: "Saturday",
  SUN: "Sunday",
};

const COVERAGE_TEMPLATES = [
  (role: string, day: string, window: string) => `Who can cover ${role} on ${day} (${window})?`,
  (role: string, day: string, window: string) => `Do we already have coverage for ${role} on ${day} ${window}?`,
  (role: string, day: string, window: string) => `Which teammate could take the ${role} shift on ${day} ${window}?`,
];

export async function GET(req: NextRequest) {
  try {
    const authResult = await auth();
    const { userId } = authResult;

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const storeId = searchParams.get("storeId") ?? undefined;

    const assignments = await prisma.assignment.findMany({
      where: {
        employeeId: { not: null },
        schedule: {
          storeId,
        },
      },
      select: {
        day: true,
        startTime: true,
        endTime: true,
        workType: { select: { name: true } },
      },
      orderBy: {
        schedule: { updatedAt: "desc" },
      },
      take: 20,
    });

    const coveragePrompts = assignments
      .map((assignment, index) => {
        const dayLabel = DAY_LABEL[assignment.day] ?? assignment.day;
        const start = assignment.startTime.toISOString().substring(11, 16);
        const end = assignment.endTime.toISOString().substring(11, 16);
        const role = assignment.workType?.name ?? "a role";
        const window = `${start}–${end}`;
        const template = COVERAGE_TEMPLATES[index % COVERAGE_TEMPLATES.length];
        return template(role, dayLabel, window);
      })
      .filter(Boolean);

    const allPrompts = coveragePrompts.length > 0 ? coveragePrompts : DEFAULT_FALLBACKS;
    const unique: string[] = [];
    const seen = new Set<string>();

    for (const prompt of allPrompts) {
      const key = prompt.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(prompt);
      if (unique.length >= FALLBACK_LIMIT) break;
    }

    return NextResponse.json({ suggestions: unique });
  } catch (error) {
    console.error("Failed to fetch assistant suggestions", error);
    return NextResponse.json({ suggestions: DEFAULT_FALLBACKS.slice(0, FALLBACK_LIMIT) });
  }
}
