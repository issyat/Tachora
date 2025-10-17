import { PrismaClient } from '../src/generated/prisma';

const prisma = new PrismaClient();

async function main() {
  // Find Bob Smith
  const bob = await prisma.employee.findFirst({
    where: {
      name: {
        contains: 'Bob',
        mode: 'insensitive',
      },
    },
    include: {
      availability: true,
    },
  });

  if (!bob) {
    console.log('Bob Smith not found');
    return;
  }

  console.log('\n=== Bob Smith ===');
  console.log('ID:', bob.id);
  console.log('Name:', bob.name);
  console.log('\nAvailability:');
  
  if (bob.availability.length === 0) {
    console.log('  No availability set');
  } else {
    bob.availability.forEach((avail: any) => {
      console.log(`  ${avail.day}:`, {
        isOff: avail.isOff,
        startTime: avail.startTime,
        endTime: avail.endTime,
      });
    });
  }

  // Check shift templates for Wednesday Sales Associate
  console.log('\n=== Wednesday Sales Associate Shifts ===');
  const templates = await prisma.shiftTemplate.findMany({
    where: {
      storeId: bob.storeId,
      workType: {
        name: 'Sales Associate',
      },
    },
    include: {
      workType: true,
    },
  });

  templates.forEach((template: any) => {
    const days = template.days as any;
    if (Array.isArray(days) ? days.includes('WED') : days?.WED) {
      console.log('Template:', template.id);
      console.log('  Start:', template.startTime);
      console.log('  End:', template.endTime);
    }
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
