import { Weekday } from "../src/generated/prisma";
import { prisma } from "../src/lib/prisma";
import { timeStringToDate } from "../src/lib/time";

type AvailabilityInput = {
  employeeId: string;
  day: Weekday;
  isOff: boolean;
  startTime: string | null;
  endTime: string | null;
};

const WEEKDAY_ORDER: Weekday[] = [
  Weekday.MON,
  Weekday.TUE,
  Weekday.WED,
  Weekday.THU,
  Weekday.FRI,
  Weekday.SAT,
  Weekday.SUN,
];

async function main() {
  const managerId = "seed-manager";
  const store = await prisma.store.upsert({
    where: { managerId_name: { managerId, name: "Central Store" } },
    update: {},
    create: {
      manager: {
        connectOrCreate: {
          where: { clerkId: managerId },
          create: {
            clerkId: managerId,
            email: "seed@example.com",
          },
        },
      },
      name: "Central Store",
      city: "Brussels",
      country: "BE",
    },
  });

  const employees = await Promise.all(
    [
      { id: "emp-alice", name: "Alice", label: "Seller", color: "#0284c7", target: 32 * 60 },
      { id: "emp-bob", name: "Bob", label: "Cashier", color: "#10b981", target: 30 * 60 },
      { id: "emp-claire", name: "Claire", label: "Security", color: "#f97316", target: 20 * 60 },
    ].map((employee) =>
      prisma.employee.upsert({
        where: { id: employee.id },
        update: {
          name: employee.name,
          color: employee.color,
          weeklyMinutesTarget: employee.target,
        },
        create: {
          id: employee.id,
          storeId: store.id,
          name: employee.name,
          color: employee.color,
          weeklyMinutesTarget: employee.target,
        },
      }),
    ),
  );

  const availability: AvailabilityInput[] = [];
  const addAvailability = (
    employeeId: string,
    day: Weekday,
    start: string | null,
    end: string | null,
  ) => {
    availability.push({
      employeeId,
      day,
      isOff: !start || !end,
      startTime: start,
      endTime: end,
    });
  };

  employees.forEach((employee) => {
    WEEKDAY_ORDER.forEach((day) => addAvailability(employee.id, day, null, null));
  });

  addAvailability("emp-alice", Weekday.MON, "09:00", "17:00");
  addAvailability("emp-alice", Weekday.TUE, "09:00", "17:00");
  addAvailability("emp-alice", Weekday.FRI, "10:00", "18:00");

  addAvailability("emp-bob", Weekday.MON, "09:00", "12:00");
  addAvailability("emp-bob", Weekday.TUE, "12:00", "18:00");
  addAvailability("emp-bob", Weekday.WED, "10:00", "16:00");
  addAvailability("emp-bob", Weekday.SAT, "09:00", "13:00");

  addAvailability("emp-claire", Weekday.MON, "12:00", "17:00");
  addAvailability("emp-claire", Weekday.THU, "09:00", "15:00");
  addAvailability("emp-claire", Weekday.FRI, "15:00", "21:00");

  await prisma.availability.deleteMany({ where: { employeeId: { in: employees.map((emp) => emp.id) } } });
  await prisma.$transaction(
    availability.map((slot) =>
      prisma.availability.create({
        data: {
          employeeId: slot.employeeId,
          day: slot.day,
          isOff: slot.isOff,
          startTime: slot.startTime ? timeStringToDate(slot.startTime) : null,
          endTime: slot.endTime ? timeStringToDate(slot.endTime) : null,
        },
      }),
    ),
  );

  await prisma.shiftTemplate.deleteMany({ where: { storeId: store.id } });
  await prisma.shiftTemplate.createMany({
    data: [
      {
        id: "shift-seller",
        storeId: store.id,
        role: "Seller",
        days: { MON: true, TUE: true, WED: false, THU: true, FRI: true, SAT: true, SUN: false },
        startTime: timeStringToDate("09:00"),
        endTime: timeStringToDate("17:00"),
      },
      {
        id: "shift-cashier",
        storeId: store.id,
        role: "Cashier",
        days: { MON: true, TUE: true, WED: true, THU: true, FRI: true, SAT: true, SUN: false },
        startTime: timeStringToDate("10:00"),
        endTime: timeStringToDate("16:00"),
      },
      {
        id: "shift-security",
        storeId: store.id,
        role: "Security",
        days: { MON: true, TUE: false, WED: true, THU: false, FRI: true, SAT: true, SUN: false },
        startTime: timeStringToDate("12:00"),
        endTime: timeStringToDate("20:00"),
      },
    ],
  });

  console.log("Seed complete", { store: store.id, employees: employees.length });
}

main() 
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
