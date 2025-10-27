import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Weekday } from "@/types";

interface AvailabilitySubmission {
  day: Weekday;
  isOff: boolean;
  startTime?: string;
  endTime?: string;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { token, availability } = body;

    if (!token || !availability || !Array.isArray(availability)) {
      return NextResponse.json({ error: "Invalid request data" }, { status: 400 });
    }

    // Find and validate the token
    const availabilityToken = await prisma.availabilityToken.findUnique({
      where: { token },
      include: {
        employee: {
          include: {
            store: true
          }
        }
      }
    });

    if (!availabilityToken) {
      return NextResponse.json({ error: "Invalid or expired link" }, { status: 400 });
    }

    if (availabilityToken.expiresAt < new Date()) {
      return NextResponse.json({ error: "This link has expired" }, { status: 400 });
    }

    if (availabilityToken.usedAt) {
      return NextResponse.json({ error: "This link has already been used" }, { status: 400 });
    }

    // Validate availability data
    const validDays: Weekday[] = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
    const submittedAvailability: AvailabilitySubmission[] = availability;

    for (const avail of submittedAvailability) {
      if (!validDays.includes(avail.day)) {
        return NextResponse.json({ error: `Invalid day: ${avail.day}` }, { status: 400 });
      }

      if (!avail.isOff) {
        if (!avail.startTime || !avail.endTime) {
          return NextResponse.json({ 
            error: `Start time and end time are required for ${avail.day}` 
          }, { status: 400 });
        }

        // Validate time format (HH:MM)
        const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
        if (!timeRegex.test(avail.startTime) || !timeRegex.test(avail.endTime)) {
          return NextResponse.json({ 
            error: `Invalid time format for ${avail.day}. Use HH:MM format.` 
          }, { status: 400 });
        }

        // Validate that start time is before end time
        const [startHour, startMin] = avail.startTime.split(':').map(Number);
        const [endHour, endMin] = avail.endTime.split(':').map(Number);
        const startMinutes = startHour * 60 + startMin;
        const endMinutes = endHour * 60 + endMin;

        if (startMinutes >= endMinutes) {
          return NextResponse.json({ 
            error: `End time must be after start time for ${avail.day}` 
          }, { status: 400 });
        }
      }
    }

    // Update availability in a transaction
    await prisma.$transaction(async (tx) => {
      // Delete existing availability for this employee
      await tx.availability.deleteMany({
        where: { employeeId: availabilityToken.employeeId }
      });

      // Create new availability records
      for (const avail of submittedAvailability) {
        await tx.availability.create({
          data: {
            employeeId: availabilityToken.employeeId,
            day: avail.day,
            isOff: avail.isOff,
            startTime: avail.isOff ? null : new Date(`1970-01-01T${avail.startTime}:00Z`),
            endTime: avail.isOff ? null : new Date(`1970-01-01T${avail.endTime}:00Z`)
          }
        });
      }

      // Mark token as used
      await tx.availabilityToken.update({
        where: { id: availabilityToken.id },
        data: { usedAt: new Date() }
      });
    });

    return NextResponse.json({
      success: true,
      message: "Availability updated successfully",
      employee: {
        name: availabilityToken.employee.name,
        store: availabilityToken.employee.store.name
      }
    });

  } catch (error) {
    console.error("Failed to submit availability:", error);
    return NextResponse.json(
      { error: "Failed to update availability" },
      { status: 500 }
    );
  }
}