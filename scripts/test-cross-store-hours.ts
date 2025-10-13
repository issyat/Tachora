/**
 * Test script to verify cross-store employee hours are calculated correctly
 */

import { buildScheduleFacts } from "@/server/schedule/facts-builder";
import { prisma } from "@/lib/prisma";

async function main() {
  console.log("Testing cross-store employee hours calculation...\n");

  // Find Jasper
  const jasper = await prisma.employee.findFirst({
    where: {
      name: { contains: "Jasper", mode: "insensitive" },
    },
    include: {
      store: true,
    },
  });

  if (!jasper) {
    console.error("❌ Jasper not found in database");
    return;
  }

  console.log("=== Jasper Info ===");
  console.log("ID:", jasper.id);
  console.log("Name:", jasper.name);
  console.log("Home Store:", jasper.store.name, `(${jasper.storeId})`);
  console.log("Can Work Across Stores:", jasper.canWorkAcrossStores);
  console.log();

  // Get all stores for this manager
  const stores = await prisma.store.findMany({
    where: {
      managerId: jasper.store.managerId,
    },
    orderBy: {
      name: "asc",
    },
  });

  console.log("=== Available Stores ===");
  stores.forEach((store, idx) => {
    console.log(`${idx + 1}. ${store.name} (${store.id})`);
  });
  console.log();

  // Find a week where Jasper has assignments
  const schedule = await prisma.schedule.findFirst({
    where: {
      assignments: {
        some: {
          employeeId: jasper.id,
        },
      },
    },
    include: {
      assignments: {
        where: {
          employeeId: jasper.id,
        },
        include: {
          workType: true,
        },
      },
      store: true,
    },
  });

  if (!schedule) {
    console.log("⚠️ Jasper has no assignments in any schedule");
    return;
  }

  const weekId = schedule.isoWeek;
  const managerId = jasper.store.managerId;

  console.log(`=== Testing Week ${weekId} ===`);
  console.log(`Found ${schedule.assignments.length} assignments for Jasper in ${schedule.store.name}\n`);

  // Calculate total minutes from assignments
  let totalMinutes = 0;
  schedule.assignments.forEach((assignment) => {
    const startMin = assignment.startTime.getUTCHours() * 60 + assignment.startTime.getUTCMinutes();
    const endMin = assignment.endTime.getUTCHours() * 60 + assignment.endTime.getUTCMinutes();
    const duration = endMin - startMin;
    totalMinutes += duration;
    console.log(`- ${assignment.day}: ${Math.floor(duration / 60)}h ${duration % 60}m (${assignment.workType.name})`);
  });

  const totalHours = Math.round(totalMinutes / 60 * 10) / 10;
  console.log(`\nTotal: ${totalMinutes} minutes = ${totalHours} hours`);
  console.log();

  // Test each store
  for (const store of stores) {
    console.log(`${"=".repeat(70)}`);
    console.log(`Testing Store: ${store.name}`);
    console.log(`${"=".repeat(70)}`);

    const facts = await buildScheduleFacts({
      managerId,
      storeId: store.id,
      weekId,
    });

    const jasperFacts = facts.employees.find(e => e.id === jasper.id);

    if (!jasperFacts) {
      console.log(`❌ Jasper not found in ${store.name}'s employee list`);
      console.log();
      continue;
    }

    const hoursShown = Math.round(jasperFacts.weeklyMinutes / 60 * 10) / 10;
    const targetHours = Math.round(jasperFacts.targetMinutes / 60 * 10) / 10;

    console.log(`Employee: ${jasperFacts.name}`);
    console.log(`Weekly Hours: ${hoursShown}h / ${targetHours}h`);
    console.log(`Weekly Minutes: ${jasperFacts.weeklyMinutes} / ${jasperFacts.targetMinutes}`);
    console.log(`Assignments in this view: ${jasperFacts.assignments.length}`);

    if (jasperFacts.assignments.length > 0) {
      console.log("Assignments:");
      jasperFacts.assignments.forEach(a => {
        console.log(`  - ${a.day}: ${a.start}-${a.end} (${a.workType})`);
      });
    }

    // Check if hours match expected
    if (jasperFacts.weeklyMinutes === totalMinutes) {
      console.log(`✅ Hours are CORRECT (${hoursShown}h matches expected ${totalHours}h)`);
    } else {
      console.log(`❌ Hours are INCORRECT (${hoursShown}h does not match expected ${totalHours}h)`);
      console.log(`   Expected: ${totalMinutes} minutes`);
      console.log(`   Got: ${jasperFacts.weeklyMinutes} minutes`);
      console.log(`   Difference: ${jasperFacts.weeklyMinutes - totalMinutes} minutes`);
    }

    console.log();
  }

  console.log(`${"=".repeat(70)}`);
  console.log("Test Complete");
  console.log(`${"=".repeat(70)}`);
}

main().catch(console.error);
