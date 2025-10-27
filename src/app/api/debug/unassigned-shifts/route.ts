import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    console.log('🔍 Checking database for unassigned shifts...');
    
    // 1. Check all schedules for week 2025-W43
    const schedules = await prisma.schedule.findMany({
      where: {
        isoWeek: '2025-W43',
      },
      include: {
        store: { select: { name: true } },
      },
    });
    
    // 1.5. Check for Templates that might define required shifts
    console.log('🔍 Checking for Templates/ShiftTemplates...');
    let templates: any[] = [];
    let templateTableName = '';
    
    // Try different possible table names
    const possibleTableNames = ['template', 'shiftTemplate', 'Template', 'ShiftTemplate'];
    
    for (const tableName of possibleTableNames) {
      try {
        const result = await (prisma as any)[tableName].findMany({
          where: {
            storeId: schedules[0]?.storeId || 'cmh4856yc00017k1gces2wru3',
          },
          include: {
            workType: { select: { name: true } },
          },
        });
        
        if (result && result.length > 0) {
          templates = result;
          templateTableName = tableName;
          console.log(`✅ Found ${templates.length} ${tableName}s`);
          break;
        }
      } catch (e) {
        // Table doesn't exist, continue
        console.log(`❌ Table ${tableName} doesn't exist`);
      }
    }
    
    console.log(`Found ${schedules.length} schedules for week 2025-W43`);
    
    if (schedules.length === 0) {
      return NextResponse.json({
        message: 'No schedules found for week 2025-W43',
        schedules: [],
        assignments: [],
        unassigned: [],
      });
    }
    
    // 2. Check all assignments in these schedules
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
    
    // 3. Group by day and format
    const assignmentsByDay: Record<string, any[]> = {};
    assignments.forEach(a => {
      if (!assignmentsByDay[a.day]) assignmentsByDay[a.day] = [];
      assignmentsByDay[a.day].push({
        id: a.id,
        startTime: a.startTime.toISOString().substring(11, 16),
        endTime: a.endTime.toISOString().substring(11, 16),
        workType: a.workType?.name || 'Unknown',
        employee: a.employee?.name || null,
        employeeId: a.employeeId,
        isUnassigned: !a.employeeId,
      });
    });
    
    // 4. Find unassigned assignments
    const unassignedAssignments = assignments.filter(a => !a.employeeId);
    
    // 5. Analyze templates vs assignments to find "unassigned shifts"
    let templateAnalysis: any = null;
    let calculatedUnassignedShifts: any[] = [];
    
    if (templates.length > 0) {
      console.log('📋 Analyzing templates vs assignments...');
      
      // For each template, check if we have enough assignments
      templates.forEach(template => {
        const days = template.days ? Object.entries(template.days).filter(([_, active]) => active).map(([day]) => day) : [];
        
        days.forEach(day => {
          // Count how many assignments we have for this template's requirements
          const matchingAssignments = assignments.filter(a => 
            a.day === day &&
            a.startTime.toISOString().substring(11, 16) === template.startTime &&
            a.endTime.toISOString().substring(11, 16) === template.endTime &&
            a.workType?.name === template.workType?.name
          );
          
          const required = template.capacity || 1;
          const assigned = matchingAssignments.length;
          const unassigned = Math.max(0, required - assigned);
          
          if (unassigned > 0) {
            calculatedUnassignedShifts.push({
              day,
              startTime: template.startTime,
              endTime: template.endTime,
              workType: template.workType?.name || 'Unknown',
              required,
              assigned,
              unassigned,
              templateId: template.id,
            });
          }
        });
      });
      
      templateAnalysis = {
        templateTableName,
        totalTemplates: templates.length,
        templatesDetail: templates.map(t => ({
          id: t.id,
          workType: t.workType?.name || 'Unknown',
          startTime: t.startTime,
          endTime: t.endTime,
          capacity: t.capacity || 1,
          days: t.days ? Object.entries(t.days).filter(([_, active]) => active).map(([day]) => day) : [],
        })),
        calculatedUnassignedShifts,
      };
    }

    const result = {
      summary: {
        totalSchedules: schedules.length,
        totalAssignments: assignments.length,
        assignedShifts: assignments.length - unassignedAssignments.length,
        unassignedShifts: unassignedAssignments.length,
        calculatedUnassignedFromTemplates: calculatedUnassignedShifts.length,
      },
      schedules: schedules.map(s => ({
        id: s.id,
        storeName: s.store.name,
        state: s.state,
        week: s.isoWeek,
      })),
      assignmentsByDay,
      unassignedAssignments: unassignedAssignments.map(a => ({
        id: a.id,
        day: a.day,
        startTime: a.startTime.toISOString().substring(11, 16),
        endTime: a.endTime.toISOString().substring(11, 16),
        workType: a.workType?.name || 'Unknown',
      })),
      templateAnalysis,
      calculatedUnassignedShifts,
    };
    
    console.log('Database check complete:', result.summary);
    
    return NextResponse.json(result);
    
  } catch (error: any) {
    console.error('❌ Error checking database:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}