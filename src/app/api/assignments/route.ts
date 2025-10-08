import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { prisma } from "@/lib/prisma";
import type { Weekday } from "@/generated/prisma";
import { timeStringToDate } from "@/lib/time";

type DayKey = "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";

const dayToEnum: Record<DayKey, Weekday> = {
  MON: "MON",
  TUE: "TUE",
  WED: "WED",
  THU: "THU",
  FRI: "FRI",
  SAT: "SAT",
  SUN: "SUN",
};

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get("storeId");
  const isoWeek = searchParams.get("isoWeek");
  if (!storeId || !isoWeek) return NextResponse.json({ assignments: [] });

  const schedule = await prisma.schedule.findUnique({
    where: { storeId_isoWeek: { storeId, isoWeek } },
  });

  if (!schedule) return NextResponse.json({ assignments: [] });

  const assignments = await prisma.assignment.findMany({
    where: { scheduleId: schedule.id },
    include: { employee: { select: { id: true, name: true, color: true } }, sourceTemplate: { select: { workTypeId: true } } },
    orderBy: { startTime: "asc" },
  });

  return NextResponse.json({
    assignments: assignments.map((a) => ({
      day: a.day,
      startTime: a.startTime ? a.startTime.toISOString().slice(11, 16) : "",
      endTime: a.endTime ? a.endTime.toISOString().slice(11, 16) : "",
      role: a.role,
      employee: a.employee
        ? { id: a.employee.id, name: a.employee.name, color: a.employee.color }
        : null,
      workTypeId: a.sourceTemplate?.workTypeId ?? null,
    })),
  });
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const { storeId, isoWeek, day, startTime, endTime, role, employeeId, workTypeId } = body as {
    storeId: string; isoWeek: string; day: DayKey; startTime: string; endTime: string; role: string; employeeId: string; workTypeId?: string | null;
  };
  if (!storeId || !isoWeek || !day || !startTime || !endTime || !role || !employeeId) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  // Ensure schedule exists
  let schedule = await prisma.schedule.findUnique({ where: { storeId_isoWeek: { storeId, isoWeek } } });
  if (!schedule) {
    schedule = await prisma.schedule.create({ data: { storeId, isoWeek, state: "Draft" } });
  }

  const dayEnum = dayToEnum[day] as string;

  let roleName = role;
  if (workTypeId) {
    const workType = await prisma.workType.findUnique({ where: { id: workTypeId } });
    if (workType && workType.storeId === storeId) {
      roleName = workType.name;
    }
  }

  // Find existing assignment by time window + role
  const existing = await prisma.assignment.findFirst({
    where: {
      scheduleId: schedule.id,
      day: dayEnum,
      role: roleName,
      startTime: timeStringToDate(startTime),
      endTime: timeStringToDate(endTime),
    },
  });

  const assignment = existing
    ? await prisma.assignment.update({ where: { id: existing.id }, data: { employeeId } })
    : await prisma.assignment.create({
        data: {
          scheduleId: schedule.id,
          day: dayEnum,
          role: roleName,
          startTime: timeStringToDate(startTime),
          endTime: timeStringToDate(endTime),
          employeeId,
        },
      });

  return NextResponse.json({ ok: true, id: assignment.id });
}

export async function DELETE(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const { storeId, isoWeek, day, startTime, endTime, role, workTypeId } = body as {
    storeId: string;
    isoWeek: string;
    day: DayKey;
    startTime: string;
    endTime: string;
    role: string;
    employeeId: string;
    workTypeId?: string | null;
  };

  if (!storeId || !isoWeek || !day || !startTime || !endTime || !role) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const schedule = await prisma.schedule.findUnique({ where: { storeId_isoWeek: { storeId, isoWeek } } });
  if (!schedule) return NextResponse.json({ ok: true });

  const dayEnum = dayToEnum[day] as string;

  let roleName = role;
  if (workTypeId) {
    const workType = await prisma.workType.findUnique({ where: { id: workTypeId } });
    if (workType && workType.storeId === storeId) {
      roleName = workType.name;
    }
  }

  const assignment = await prisma.assignment.findFirst({
    where: {
      scheduleId: schedule.id,
      day: dayEnum,
      role: roleName,
      startTime: timeStringToDate(startTime),
      endTime: timeStringToDate(endTime),
    },
  });

  if (!assignment) return NextResponse.json({ ok: true });

  await prisma.assignment.delete({ where: { id: assignment.id } });

  return NextResponse.json({ ok: true });
}



