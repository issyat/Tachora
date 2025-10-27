/**
 * Test script to debug unassigned shifts issue
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function testUnassignedShifts() {
  console.log("🔍 Testing unassigned shifts calculation...");
  
  const managerId = 'user_3329TDaGk7PRFLRGGcebxRgCqey';
  const isoWeek = '2025-W43';
  
  try {
    // 1. Get user and stores
    const user = await prisma.user.findUnique({
      where: { clerkId: managerId },
      select: { id: true, clerkId: true },
    });
    
    if (!user) {
      console.log("❌ User not found");
      return;
    }
    
    const stores = await prisma.store.findMany({
      where: { managerId: user.id },
      select: { id: true, name: true },
    });
    
    console.log(`📍 Found ${stores.length} stores:`, stores.map(s => `${s.name} (${s.id})`));
    
    const storeIds = stores.map(s => s.id);
    
    // 2. Get schedules
    const schedules = await prisma.schedule.findMany({
      where: {
        isoWeek: isoWeek,
        storeId: { in: storeIds },
      },
      select: {
        id: true,
        storeId: true,
        isoWeek: true,
        state: true,
      },
    });
    
    console.log(`📋 Found ${schedules.length} schedules for week ${isoWeek}:`);
    schedules.forEach(s => {
      const store = stores.find(st => st.id === s.storeId);
      console.log(`   - ${s.id}: ${store?.name}, state: ${s.state}`);
    });
    
    // 3. Get assignments
    const scheduleIds = schedules.map(s => s.id);
    const assignments = scheduleIds.length > 0 ? await prisma.assignment.findMany({
      where: {
        scheduleId: { in: scheduleIds },
      },
      include: {
        employee: { select: { name: true } },
        workType: { select: { name: true } },
        schedule: { select: { storeId: true } },
      },
    }) : [];
    
    console.log(`📝 Found ${assignments.length} assignments:`);
    
    const assignmentsByDay = assignments.reduce((acc, a) => {
      if (!acc[a.day]) acc[a.day] = [];
      acc[a.day].push(a);
      return acc;
    }, {});
    
    Object.entries(assignmentsByDay).forEach(([day, dayAssignments]) => {
      console.log(`   ${day}: ${dayAssignments.length} assignments`);
      dayAssignments.forEach(a => {
        const status = a.employeeId ? `assigned to ${a.employee?.name}` : 'UNASSIGNED';
        const startTime = a.startTime.toISOString().substring(11, 16);
        const endTime = a.endTime.toISOString().substring(11, 16);
        console.log(`     - ${startTime}-${endTime} ${a.workType.name}: ${status}`);
      });
    });
    
    const unassignedAssignments = assignments.filter(a => !a.employeeId);
    console.log(`🔍 Total unassigned assignments: ${unassignedAssignments.length}`);
    
    // 4. Check templates
    let templates = [];
    try {
      templates = await prisma.template.findMany({
        where: {
          storeId: { in: storeIds },
        },
        include: {
          workType: { select: { name: true } },
        },
      });
      console.log(`📋 Found ${templates.length} templates`);
      
      templates.forEach(template => {
        const days = template.days ? Object.entries(template.days).filter(([_, active]) => active).map(([day]) => day) : [];
        const startTime = template.startTime.substring(11, 16);
        const endTime = template.endTime.substring(11, 16);
        console.log(`   Template ${template.id}: ${template.workType?.name} ${startTime}-${endTime}, capacity: ${template.capacity}, days: ${days.join(',')}`);
      });
      
    } catch (error) {
      console.log(`📋 No template table found: ${error.message}`);
    }
    
    // 5. Calculate unassigned shifts using template method
    const unassignedByDay = [];
    
    if (templates.length > 0) {
      console.log(`🔍 Calculating unassigned shifts from templates...`);
      
      templates.forEach(template => {
        const days = template.days ? Object.entries(template.days).filter(([_, active]) => active).map(([day]) => day) : [];
        
        days.forEach(day => {
          const templateStartTime = template.startTime.substring(11, 16);
          const templateEndTime = template.endTime.substring(11, 16);
          
          const matchingAssignments = assignments.filter(a =>
            a.day === day &&
            a.startTime.toISOString().substring(11, 16) === templateStartTime &&
            a.endTime.toISOString().substring(11, 16) === templateEndTime &&
            a.workType.name === template.workType?.name
          );
          
          const required = template.capacity || 1;
          const assigned = matchingAssignments.length;
          const unassigned = Math.max(0, required - assigned);
          
          console.log(`   ${day} ${templateStartTime}-${templateEndTime} ${template.workType?.name}: Required ${required}, Assigned ${assigned}, Unassigned ${unassigned}`);
          
          if (unassigned > 0) {
            unassignedByDay.push({
              day,
              workTypeName: template.workType?.name || 'Unknown',
              startTime: templateStartTime,
              endTime: templateEndTime,
              required,
              assigned,
              unassigned,
              templateId: template.id,
            });
          }
        });
      });
    }
    
    console.log(`\n📊 SUMMARY:`);
    console.log(`   Total assignments: ${assignments.length}`);
    console.log(`   Unassigned assignments: ${unassignedAssignments.length}`);
    console.log(`   Templates: ${templates.length}`);
    console.log(`   Calculated unassigned shifts: ${unassignedByDay.length}`);
    console.log(`   Total unassigned positions: ${unassignedByDay.reduce((sum, u) => sum + u.unassigned, 0)}`);
    
    if (unassignedByDay.length > 0) {
      console.log(`\n🔍 UNASSIGNED SHIFTS BREAKDOWN:`);
      unassignedByDay.forEach(u => {
        console.log(`   ${u.day} ${u.startTime}-${u.endTime} ${u.workTypeName}: ${u.unassigned} positions needed`);
      });
    }
    
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

testUnassignedShifts();