import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { timeDateToString } from "@/lib/time";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.json({ error: "Token is required" }, { status: 400 });
    }

    // Find and validate the token
    const availabilityToken = await prisma.availabilityToken.findUnique({
      where: { token },
      include: {
        employee: {
          include: {
            store: true,
            availability: {
              orderBy: { day: 'asc' }
            }
          }
        }
      }
    });

    if (!availabilityToken) {
      return NextResponse.json({ error: "Invalid link" }, { status: 400 });
    }

    if (availabilityToken.expiresAt < new Date()) {
      return NextResponse.json({ error: "This link has expired" }, { status: 400 });
    }

    if (availabilityToken.usedAt) {
      return NextResponse.json({ 
        error: "This link has already been used",
        details: `Availability was submitted on ${availabilityToken.usedAt.toLocaleDateString()}`
      }, { status: 400 });
    }

    // Format current availability
    const currentAvailability = availabilityToken.employee.availability.map(avail => ({
      day: avail.day,
      isOff: avail.isOff,
      startTime: avail.startTime ? timeDateToString(avail.startTime, "09:00") : null,
      endTime: avail.endTime ? timeDateToString(avail.endTime, "17:00") : null
    }));

    return NextResponse.json({
      valid: true,
      employee: {
        id: availabilityToken.employee.id,
        name: availabilityToken.employee.name,
        contractType: availabilityToken.employee.contractType,
        store: {
          name: availabilityToken.employee.store.name,
          city: availabilityToken.employee.store.city
        }
      },
      currentAvailability,
      expiresAt: availabilityToken.expiresAt
    });

  } catch (error) {
    console.error("Failed to validate token:", error);
    return NextResponse.json(
      { error: "Failed to validate link" },
      { status: 500 }
    );
  }
}