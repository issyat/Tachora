const { PrismaClient } = require('./src/generated/prisma/client.js');

const prisma = new PrismaClient();

async function checkAssignments() {
  console.log('Checking assignments directly from Assignment table...\n');
  
  // Get ALL schedules for week 2025-W43
  const schedules = await prisma.schedule.findMany({
    where: { isoWeek: '2025-W43' },
    select: { id: true, storeId: true, isoWeek: true },
    include: { store: { select: { name: true } } }
  });
  
  if (schedules.length === 0) {
    console.log('No schedules found for 2025-W43');
    return;
  }
  
  console.log(`Found ${schedules.length} schedule(s) for 2025-W43:\n`);
  schedules.forEach((s, i) => {
    console.log(`${i + 1}. Store: ${s.store.name} (ID: ${s.storeId})`);
  });
  console.log('');
  
  // Get all Friday assignments for ALL schedules
  for (const schedule of schedules) {
    console.log(`\n=== ${schedule.store.name} ===`);
    
    const assignments = await prisma.assignment.findMany({
      where: {
        scheduleId: schedule.id,
        day: 'FRI'
      },
      include: {
        employee: { select: { name: true } },
        workType: { select: { name: true } }
      },
      orderBy: { startTime: 'asc' }
    });
    
    console.log(`Found ${assignments.length} Friday assignments:\n`);
    
    assignments.forEach((a, i) => {
      const empName = a.employeeId ? a.employee?.name : '⚠️ UNASSIGNED';
      const workType = a.workType?.name || 'Unknown';
      const start = a.startTime.toISOString().substring(11, 16);
      const end = a.endTime.toISOString().substring(11, 16);
      console.log(`${i + 1}. ${start}-${end}: ${workType} → ${empName}`);
    });
  }
  
  await prisma.$disconnect();
}

checkAssignments().catch(console.error);
