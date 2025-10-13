import { prisma } from "../src/lib/prisma";
import { buildScheduleFacts } from "../src/server/schedule/facts-builder";
import { runEvalQuery } from "../src/server/schedule/eval-query";

async function main() {
  try {
    const store = await prisma.store.findFirst({
      where: {
        name: {
          contains: "Grand Place",
        },
      },
    });

    if (!store) {
      throw new Error("Store containing 'Grand Place' not found");
    }

    const facts = await buildScheduleFacts({
      managerId: store.managerId,
      storeId: store.id,
      weekId: null,
    });

    const mondayCashier = facts.openShifts.filter(
      (shift) => shift.day === "MON" && shift.workTypeName === "Cashier",
    );

    console.log("Total open shifts:", facts.openShifts.length);
    console.log(
      "Monday cashier open shifts:",
      mondayCashier.map((shift) => ({
        id: shift.id,
        start: shift.start,
        end: shift.end,
        role: shift.workTypeName,
        reasons: shift.reasons,
        candidates: shift.candidates.map((c) => ({ id: c.id, name: c.name, remainingWeeklyMinutes: c.remainingWeeklyMinutes })),
      })),
    );

    const evalResult = runEvalQuery({
      version: facts.snapshot.version,
      snapshot: facts,
      expr: "openShifts[?day=='MON' && workTypeName=='Cashier'] | length(@)",
    });

    console.log("JMESPath count (case-sensitive match):", evalResult);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
