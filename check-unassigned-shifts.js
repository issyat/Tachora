/**
 * Database verification script to check for unassigned shifts
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkUnassignedShifts() {
  console.log('🔍 Checking database for unassigned shifts...\n');
  
  try {
    // 1. Check all schedules for week 2025-W43
    console.log('📋 SCHEDULES for week 2025-W43:');
    const schedules = await prisma.schedule.findMany({
      where: {
        isoWeek: '2025-W43',
      },
      include: {
        store: { select: { name: true } },
      },
    });
    
    schedules.forEach(s => {
      console.log(`   - ${s.id}: ${s.store.name}, state: ${s.state}, week: ${s.isoWeek}`);
    });
    
    if (schedules.length === 0) {
      console.log('   No schedules found for week 2025-W43');
      return;
    }
    
    // 2. Check all assignments in these schedules
    console.log('\n📝 ASSIGNMENTS:');
    const assignments = await prisma.assignment.findMany({
      where: {
        scheduleId: { in: schedules.map(s => s.id) },
      },
      include: {
        employee: { select: { name: true } },
        workType: { select: { name: true } },
        schedule: { select: { storeId: true } },
      },
      orderBy: [
        { day: 'asc' },
        { startTime: 'asc' },
      ],
    });
    
    console.log(`Total assignments: ${assignments.length}`);
    
    // Group by day
    const assignmentsByDay = assignments.reduce((acc, a) => {
      if (!acc[a.day]) acc[a.day] = [];
      acc[a.day].push(a);
      return acc;
    }, {});
    
    // 3. Show assignments by day and check for unassigned ones
    Object.entries(assignmentsByDay).forEach(([day, dayAssignments]) => {
      console.log(`\n   ${day} (${dayAssignments.length} assignments):`);
      
      dayAssignments.forEach(a => {
        const employeeInfo = a.employeeId 
          ? `assigned to ${a.employee?.name || 'Unknown'}` 
          : '🔴 UNASSIGNED';
        
        console.log(`     - ${a.startTime.toISOString().substring(11, 16)}-${a.endTime.toISOString().substring(11, 16)} ${a.workType?.name || 'Unknown'}: ${employeeInfo}`);
      });
    });
    
    // 4. Count unassigned assignments
    const unassignedAssignments = assignments.filter(a => !a.employeeId);
    console.log(`\n🎯 SUMMARY:`);
    console.log(`   Total assignments: ${assignments.length}`);
    console.log(`   Assigned: ${assignments.length - unassignedAssignments.length}`);
    console.log(`   🔴 UNASSIGNED: ${unassignedAssignments.length}`);
    
    if (unassignedAssignments.length > 0) {
      console.log('\n🔴 UNASSIGNED SHIFTS:');
      unassignedAssignments.forEach(a => {
        console.log(`   - ${a.day} ${a.startTime.toISOString().substring(11, 16)}-${a.endTime.toISOString().substring(11, 16)} ${a.workType?.name || 'Unknown'} (ID: ${a.id})`);
      });
    }
    
    // 5. Also check if there are any Templates that might define required shifts
    console.log('\n📋 CHECKING FOR SHIFT TEMPLATES:');
    try {
      // Try to find templates table (might have different name)
      const tableNames = ['Template', 'ShiftTemplate', 'template', 'shiftTemplate'];
      let templatesFound = false;
      
      for (const tableName of tableNames) {
        try {
          const templates = await prisma[tableName].findMany({
            where: {
              storeId: schedules[0]?.storeId,
            },
            include: {
              workType: { select: { name: true } },
            },
          });
          
          if (templates.length > 0) {
            console.log(`   Found ${templates.length} ${tableName}s:`);
            templates.forEach(t => {
              const days = t.days ? Object.entries(t.days).filter(([_, active]) => active).map(([day]) => day) : ['unknown'];
              console.log(`     - ${t.workType?.name || 'Unknown'} ${t.startTime}-${t.endTime} on ${days.join(', ')} (capacity: ${t.capacity || 1})`);
            });
            templatesFound = true;
            break;
          }
        } catch (e) {
          // Table doesn't exist, continue
        }
      }
      
      if (!templatesFound) {
        console.log('   No template tables found');
      }
      
    } catch (error) {
      console.log('   Error checking templates:', error.message);
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkUnassignedShifts();