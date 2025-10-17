import { prisma } from "../src/lib/prisma";

async function main() {
  const storeId = "cmgo4mnx100027kdwdsqz7xyl";
  
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

  console.log(`Found work type: ${securityWorkType.name}`);

  // Create new Security shift template for Monday afternoon
  const newTemplate = await prisma.shiftTemplate.create({
    data: {
      storeId,
      workTypeId: securityWorkType.id,
      days: {
        MON: true,
        TUE: false,
        WED: false,
        THU: false,
        FRI: false,
        SAT: false,
        SUN: false,
      },
      startTime: new Date('1970-01-01T14:00:00Z'), // 2pm
      endTime: new Date('1970-01-01T18:00:00Z'),   // 6pm
    },
  });

  console.log(`\nCreated new Security shift template:`);
  console.log(`  ID: ${newTemplate.id}`);
  console.log(`  Days: ${JSON.stringify(newTemplate.days)}`);
  console.log(`  Time: 14:00-18:00`);

  console.log(`\nNow you need to regenerate the schedule for this week to create the assignment.`);
  console.log(`Or use the UI to manually create the Monday afternoon Security shift.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
