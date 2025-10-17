import { prisma } from "../src/lib/prisma";

async function main() {
  const storeId = "cmgo4mnx100027kdwdsqz7xyl";
  const weekId = "2025-W42";

  // Find the schedule
  const schedule = await prisma.schedule.findUnique({
    where: {
      storeId_isoWeek: { storeId, isoWeek: weekId },
    },
  });

  if (!schedule) {
    console.log("Schedule not found!");
    return;
  }

  // Find Security work type
  const securityWorkType = await prisma.workType.findFirst({
    where: {
      storeId,
      name: { contains: 'Security', mode: 'insensitive' },
    },
  });

  if (!securityWorkType) {
    console.log("Security work type not found!");
    return;
  }

  // Get the missing template (14:00-19:00)
  const templateId = "cmgr8wf8u004l7kqs8djbmvga";

  const template = await prisma.shiftTemplate.findUnique({
    where: { id: templateId },
  });

  if (!template) {
    console.log("Template not found!");
    return;
  }

  console.log("Creating missing Security assignment...");
  console.log(`Template: ${template.startTime.toISOString().substr(11, 5)}-${template.endTime.toISOString().substr(11, 5)}`);

  // Create the assignment
  const assignment = await prisma.assignment.create({
    data: {
      scheduleId: schedule.id,
      day: 'MON',
      startTime: template.startTime,
      endTime: template.endTime,
      workTypeId: securityWorkType.id,
      sourceTemplateId: templateId,
      employeeId: null, // OPEN shift - no employee assigned
    },
  });

  console.log("\n✅ Created open Security assignment!");
  console.log(`  ID: ${assignment.id}`);
  console.log(`  Day: ${assignment.day}`);
  console.log(`  Time: 14:00-19:00`);
  console.log(`  Status: OPEN (no employee assigned)`);
  console.log("\nNow Ismail can be assigned to this shift!");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
