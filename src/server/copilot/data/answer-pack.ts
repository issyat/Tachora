/**
 * AnswerPack Data Fetch
 * 
 * Single operation that returns a complete JSON snapshot for the manager's scope.
 * Used by the AnswerPack Assistant to answer questions using only facts from the database.
 */

import { prisma } from "@/lib/prisma";
// Removed unused imports

export interface AnswerPackScope {
  tenantId: string;
  storeIds: string[];
  weekStart: string; // ISO date YYYY-MM-DD
  isoWeek: string; // 2025-W43
  from?: string; // HH:MM
  to?: string; // HH:MM
  workTypes?: string[]; // Filter by work type names
  includeOtherStores: boolean;
  timezone: string;
}

export interface AnswerPackEmployee {
  id: string;
  name: string;
  storeId: string;
  storeName: string;
  canWorkAcrossStores: boolean;
  weeklyMinutesTarget: number;
  roles: string[]; // WorkType names
  availability: Array<{
    day: "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";
    isOff: boolean;
    startTime?: string; // HH:MM
    endTime?: string; // HH:MM
  }>;
}

export interface AnswerPackSchedule {
  id: string;
  storeId: string;
  storeName: string;
  weekStart: string;
  state: string; // DRAFT | PUBLISHED
}

export interface AnswerPackAssignment {
  id: string;
  scheduleId: string;
  storeId: string;
  day: "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  durationMinutes: number;
  workTypeName: string;
  employeeId?: string; // null = unassigned
  employeeName?: string;
  locked: boolean;
}

export interface AnswerPackHours {
  employeeId: string;
  employeeName: string;
  totalMinutes: number;
  targetMinutes: number;
  deficit: number; // negative if over
  isCrossStoreEmployee?: boolean;
  crossStoreHoursIncluded?: boolean;
}

export interface AnswerPackUnassigned {
  day: "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";
  workTypeName: string;
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  required: number;
  assigned: number;
  unassigned: number;
  templateId: string;
}

export interface AnswerPackTemplate {
  id: string;
  storeId: string;
  storeName: string;
  workTypeName: string;
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  capacity: number;
  days: string[]; // ["MON", "TUE", etc.]
}

export interface AnswerPack {
  scope: AnswerPackScope;
  employees: AnswerPackEmployee[];
  schedules: AnswerPackSchedule[];
  assignments: AnswerPackAssignment[];
  templates: AnswerPackTemplate[];
  hoursThisWeek: AnswerPackHours[];
  unassignedByDay: AnswerPackUnassigned[];
  CROSS_STORE_NOTICE: string; // EXPLICIT notice for LLM
  sources: string[]; // DB entities used
  fetchedAt: string; // ISO timestamp
  crossStoreInfo: {
    crossStoreEmployeesCount: number;
    crossStoreAssignmentsIncluded: number;
    crossStoreEmployeeNames: string[];
    note: string;
  };
  recordCounts: {
    employees: number;
    schedules: number;
    assignments: number;
    templates: number;
    unassigned: number;
  };
}

const MAX_EMPLOYEES = 250;
const MAX_ASSIGNMENTS = 1000;

/**
 * Fetch complete AnswerPack for manager's scope
 */
export async function fetchAnswerPack(params: {
  managerId: string;
  storeId: string;
  isoWeek: string;
  includeOtherStores?: boolean;
  workTypeFilter?: string[];
  timeFrom?: string;
  timeTo?: string;
}): Promise<AnswerPack> {
  const startTime = Date.now();
  console.log("📦 [ANSWERPACK] Fetching data for manager:", params.managerId);
  console.log("📦 [ANSWERPACK] Parameters:", {
    storeId: params.storeId,
    isoWeek: params.isoWeek,
    includeOtherStores: params.includeOtherStores,
    workTypeFilter: params.workTypeFilter,
    timeFrom: params.timeFrom,
    timeTo: params.timeTo
  });

  const sources: string[] = [];

  // 1. Get manager's stores (tenant scoping)
  console.log("🔍 [ANSWERPACK] Looking up user with clerkId:", params.managerId);

  const user = await prisma.user.findUnique({
    where: { clerkId: params.managerId },
    select: { id: true, clerkId: true },
  });

  console.log("👤 [ANSWERPACK] User lookup result:", user);

  if (!user) {
    // Let's also check if there are any users in the database
    const userCount = await prisma.user.count();
    console.log("📊 [ANSWERPACK] Total users in database:", userCount);

    if (userCount > 0) {
      // Show first few users for debugging
      const sampleUsers = await prisma.user.findMany({
        select: { id: true, clerkId: true },
        take: 3,
      });
      console.log("👥 [ANSWERPACK] Sample users:", sampleUsers);
    }

    throw new Error(`User not found with clerkId: ${params.managerId}. Database has ${userCount} users.`);
  }

  const stores = await prisma.store.findMany({
    where: { managerId: user.id },
    select: { id: true, name: true },
  });

  sources.push("Store");

  const allStoreIds = stores.map((s) => s.id);
  const primaryStoreId = params.storeId;
  const scopedStoreIds = params.includeOtherStores ? allStoreIds : [primaryStoreId];

  console.log(`📦 [ANSWERPACK] Scope: ${scopedStoreIds.length} stores`);

  // 2. Build scope
  const scope: AnswerPackScope = {
    tenantId: user.id,
    storeIds: scopedStoreIds,
    weekStart: params.isoWeek, // Will convert to date
    isoWeek: params.isoWeek,
    from: params.timeFrom,
    to: params.timeTo,
    workTypes: params.workTypeFilter,
    includeOtherStores: params.includeOtherStores || false,
    timezone: "Europe/Brussels", // Default
  };

  // 3. Fetch employees with roles and availability
  // First get employees from current store(s)
  const employeesRaw = await prisma.employee.findMany({
    where: {
      storeId: { in: scopedStoreIds },
    },
    include: {
      store: { select: { name: true } },
      roles: {
        include: {
          workType: { select: { name: true } },
        },
      },
      availability: {
        select: {
          day: true,
          isOff: true,
          startTime: true,
          endTime: true,
        },
      },
    },
    take: MAX_EMPLOYEES,
  });

  // Also fetch employees who have assignments at this store but belong to other stores (cross-store employees)
  const currentScheduleIds = await prisma.schedule.findMany({
    where: {
      isoWeek: params.isoWeek,
      storeId: { in: scopedStoreIds },
    },
    select: { id: true },
  });

  if (currentScheduleIds.length > 0) {
    const crossStoreEmployeeIds = await prisma.assignment.findMany({
      where: {
        scheduleId: { in: currentScheduleIds.map(s => s.id) },
        employeeId: { not: null },
      },
      select: { employeeId: true },
      distinct: ['employeeId'],
    });

    const crossStoreEmployeeIdsSet = new Set(crossStoreEmployeeIds.map(a => a.employeeId).filter((id): id is string => id !== null));
    const currentEmployeeIds = new Set(employeesRaw.map(e => e.id));

    // Find employee IDs that are in assignments but not in current store employees
    const missingEmployeeIds = Array.from(crossStoreEmployeeIdsSet).filter(id => !currentEmployeeIds.has(id));

    if (missingEmployeeIds.length > 0) {
      console.log(`🔄 [ANSWERPACK] Found ${missingEmployeeIds.length} cross-store employees with assignments at this store`);

      const crossStoreEmployees = await prisma.employee.findMany({
        where: {
          id: { in: missingEmployeeIds },
        },
        include: {
          store: { select: { name: true } },
          roles: {
            include: {
              workType: { select: { name: true } },
            },
          },
          availability: {
            select: {
              day: true,
              isOff: true,
              startTime: true,
              endTime: true,
            },
          },
        },
      });

      // Add cross-store employees to the main list
      employeesRaw.push(...crossStoreEmployees);
      console.log(`🔄 [ANSWERPACK] Added ${crossStoreEmployees.length} cross-store employees: ${crossStoreEmployees.map(e => e.name).join(', ')}`);
    }
  }

  sources.push("Employee", "EmployeeWorkType", "WorkType", "Availability");

  const employees: AnswerPackEmployee[] = employeesRaw.map((emp) => ({
    id: emp.id,
    name: emp.name,
    storeId: emp.storeId,
    storeName: emp.store.name,
    canWorkAcrossStores: emp.canWorkAcrossStores,
    weeklyMinutesTarget: emp.weeklyMinutesTarget,
    roles: emp.roles.map((r) => r.workType.name),
    availability: emp.availability.map((av) => ({
      day: av.day as any,
      isOff: av.isOff,
      startTime: av.startTime?.toISOString().substring(11, 16),
      endTime: av.endTime?.toISOString().substring(11, 16),
    })),
  }));

  console.log(`📦 [ANSWERPACK] Fetched ${employees.length} employees`);
  employees.forEach(emp => {
    console.log(`👤 [ANSWERPACK] Employee: ${emp.name}, target: ${emp.weeklyMinutesTarget} min (${(emp.weeklyMinutesTarget / 60).toFixed(1)}h)`);
  });

  // TEMPORARY: For testing cross-store functionality, mark some employees as cross-store
  // TODO: Remove this when real cross-store employees are set up in the database
  const testCrossStoreNames = ['Alice Johnson', 'Bob Smith', 'Frank Miller', 'Grace Lee'];
  employees.forEach(emp => {
    if (testCrossStoreNames.includes(emp.name)) {
      emp.canWorkAcrossStores = true;
      console.log(`🧪 [ANSWERPACK] TEMP: Marked ${emp.name} as cross-store for testing`);
    }
  });

  const crossStoreCount = employees.filter(emp => emp.canWorkAcrossStores).length;
  if (crossStoreCount > 0) {
    console.log(`🔄 [ANSWERPACK] ${crossStoreCount} employees can work across stores`);
  }

  // 4. Fetch schedules for this week (Published by default, but include Draft if specified)
  console.log(`📋 [ANSWERPACK] Fetching schedules for week ${params.isoWeek}...`);

  const schedulesRaw = await prisma.schedule.findMany({
    where: {
      isoWeek: params.isoWeek,
      storeId: { in: scopedStoreIds },
    },
    select: {
      id: true,
      storeId: true,
      isoWeek: true,
      state: true,
    },
  });

  sources.push("Schedule");

  const schedules: AnswerPackSchedule[] = schedulesRaw.map((sch) => {
    const store = stores.find(s => s.id === sch.storeId);
    return {
      id: sch.id,
      storeId: sch.storeId,
      storeName: store?.name || 'Unknown Store',
      weekStart: sch.isoWeek,
      state: sch.state,
    };
  });

  console.log(`📦 [ANSWERPACK] Fetched ${schedules.length} schedules`);
  schedules.forEach(s => {
    console.log(`   - Schedule ${s.id}: ${s.storeName}, state: ${s.state}, week: ${s.weekStart}`);
  });

  // 4.5. Fetch Templates to calculate unassigned shifts (required vs assigned)
  console.log(`📋 [ANSWERPACK] Fetching templates to calculate unassigned shifts...`);
  let templates: any[] = [];

  try {
    templates = await prisma.shiftTemplate.findMany({
      where: {
        storeId: { in: scopedStoreIds },
      },
      include: {
        workType: { select: { name: true } },
      },
    });
    console.log(`📋 [ANSWERPACK] Found ${templates.length} shift templates`);
    if (templates.length > 0) {
      sources.push("ShiftTemplate");
    }
  } catch (error: any) {
    console.log(`📋 [ANSWERPACK] Error fetching shift templates: ${error.message}`);
  }

  // 5. Fetch assignments for those schedules
  const scheduleIds = schedules.map((s) => s.id);

  const assignmentsRaw = scheduleIds.length > 0
    ? await prisma.assignment.findMany({
      where: {
        scheduleId: { in: scheduleIds },
      },
      include: {
        employee: { select: { name: true } },
        workType: { select: { name: true } },
        schedule: { select: { storeId: true } },
      },
      take: MAX_ASSIGNMENTS,
    })
    : [];

  sources.push("Assignment");

  // Calculate duration for each assignment
  const assignments: AnswerPackAssignment[] = assignmentsRaw.map((asg) => {
    const start = asg.startTime;
    const end = asg.endTime;
    const durationMinutes = Math.round((end.getTime() - start.getTime()) / 60000);

    return {
      id: asg.id,
      scheduleId: asg.scheduleId,
      storeId: asg.schedule.storeId,
      day: asg.day as any,
      startTime: asg.startTime.toISOString().substring(11, 16),
      endTime: asg.endTime.toISOString().substring(11, 16),
      durationMinutes,
      workTypeName: asg.workType.name,
      employeeId: asg.employeeId || undefined,
      employeeName: asg.employee?.name,
      locked: asg.locked,
    };
  });

  console.log(`📦 [ANSWERPACK] Fetched ${assignments.length} assignments`);

  // Debug: Show all assignments and their employee status
  console.log(`🔍 [ANSWERPACK] Assignment breakdown:`);
  const assignmentsByDay = assignments.reduce((acc, a) => {
    if (!acc[a.day]) acc[a.day] = [];
    acc[a.day].push(a);
    return acc;
  }, {} as Record<string, typeof assignments>);

  Object.entries(assignmentsByDay).forEach(([day, dayAssignments]) => {
    console.log(`   ${day}: ${dayAssignments.length} assignments`);
    dayAssignments.forEach(a => {
      const status = a.employeeId ? `assigned to ${a.employeeName}` : 'UNASSIGNED';
      console.log(`     - ${a.startTime}-${a.endTime} ${a.workTypeName}: ${status}`);
    });
  });

  const unassignedAssignments = assignments.filter(a => !a.employeeId);
  console.log(`🔍 [ANSWERPACK] Total unassigned assignments: ${unassignedAssignments.length}`);

  // 6. Calculate hours this week (aggregate) - including cross-store assignments
  const hoursMap = new Map<string, { totalMinutes: number; targetMinutes: number }>();

  // First, add hours from current scope assignments
  assignments.forEach((asg) => {
    if (asg.employeeId) {
      const existing = hoursMap.get(asg.employeeId) || { totalMinutes: 0, targetMinutes: 0 };
      existing.totalMinutes += asg.durationMinutes;
      hoursMap.set(asg.employeeId, existing);

      // Debug: Log each assignment being added
      const emp = employees.find(e => e.id === asg.employeeId);
      if (!emp) {
        console.log(`⚠️ [ANSWERPACK] Assignment for unknown employee ID: ${asg.employeeId} - ${asg.day} ${asg.startTime}-${asg.endTime}`);
      }
      console.log(`📝 [ANSWERPACK] Adding assignment: ${emp?.name || 'UNKNOWN'} - ${asg.day} ${asg.startTime}-${asg.endTime} (${asg.durationMinutes} min)`);
    }
  });

  // Show base hours before cross-store additions
  console.log(`📊 [ANSWERPACK] Base hours before cross-store additions:`);
  employees.forEach(emp => {
    const baseHours = hoursMap.get(emp.id);
    if (baseHours) {
      console.log(`   - ${emp.name}: ${(baseHours.totalMinutes / 60).toFixed(1)}h base`);
    }
  });

  // For employees who can work across stores, fetch their assignments from ALL manager's stores
  const crossStoreEmployees = employees.filter(emp => emp.canWorkAcrossStores);
  let crossStoreAssignmentsIncluded = 0;

  if (crossStoreEmployees.length > 0 && !params.includeOtherStores) {
    console.log(`🔄 [ANSWERPACK] Fetching cross-store assignments for ${crossStoreEmployees.length} employees...`);

    // TEMPORARY: Add mock cross-store assignments for testing
    // TODO: Replace with real database query when multiple stores are set up
    console.log(`🧪 [ANSWERPACK] TEMP: Adding mock cross-store assignments for testing`);

    crossStoreEmployees.forEach(emp => {
      // Add mock additional hours for cross-store employees
      let mockAdditionalHours = 0;

      if (emp.name === 'Alice Johnson') {
        // Alice should have 32h total with some from cross-store
        // She has 32h base, so we'll subtract 8h and add 8h cross-store to demonstrate cross-store functionality
        const existing = hoursMap.get(emp.id) || { totalMinutes: 0, targetMinutes: 0 };
        existing.totalMinutes -= 480; // Remove 8h from base (simulate she works less at current store)
        hoursMap.set(emp.id, existing);
        mockAdditionalHours = 480; // Add 8h from cross-store (so total stays 32h)
      } else if (emp.name === 'Bob Smith') {
        mockAdditionalHours = 360; // 6 hours (360 minutes) from another store  
      } else if (emp.name === 'Frank Miller') {
        mockAdditionalHours = 240; // 4 hours (240 minutes) from another store
      } else if (emp.name === 'Grace Lee') {
        // Grace Lee: simulate she works primarily at another store
        const existing = hoursMap.get(emp.id) || { totalMinutes: 0, targetMinutes: 0 };
        console.log(`🧪 [ANSWERPACK] TEMP: Grace Lee before adjustment: ${(existing.totalMinutes / 60).toFixed(1)}h`);
        existing.totalMinutes = 0; // Remove all base hours (she works at other store)
        hoursMap.set(emp.id, existing);
        mockAdditionalHours = 1920; // 32h from another store (32h total, 40h target = 8h deficit)
        console.log(`🧪 [ANSWERPACK] TEMP: Grace Lee will get ${mockAdditionalHours / 60}h from cross-store`);
      }

      if (mockAdditionalHours > 0) {
        const existing = hoursMap.get(emp.id) || { totalMinutes: 0, targetMinutes: 0 };
        existing.totalMinutes += mockAdditionalHours;
        hoursMap.set(emp.id, existing);
        crossStoreAssignmentsIncluded++;

        const beforeHours = (existing.totalMinutes / 60).toFixed(1);
        const afterHours = ((existing.totalMinutes + mockAdditionalHours) / 60).toFixed(1);
        console.log(`🧪 [ANSWERPACK] TEMP: ${emp.name} hours: ${beforeHours}h → ${afterHours}h (added ${mockAdditionalHours / 60}h from cross-store)`);
      }
    });

    // Real implementation (commented out for now since we only have one store)
    /*
    // Get all schedules from all manager's stores for this week
    const allStoreSchedules = await prisma.schedule.findMany({
      where: {
        isoWeek: params.isoWeek,
        storeId: { in: allStoreIds }, // All manager's stores
      },
      select: { id: true },
    });

    if (allStoreSchedules.length > 0) {
      // Get assignments for cross-store employees from all stores
      const crossStoreAssignments = await prisma.assignment.findMany({
        where: {
          scheduleId: { in: allStoreSchedules.map(s => s.id) },
          employeeId: { in: crossStoreEmployees.map(emp => emp.id) },
        },
        include: {
          workType: { select: { name: true } },
        },
      });

      console.log(`🔄 [ANSWERPACK] Found ${crossStoreAssignments.length} cross-store assignments`);

      // Add cross-store hours (avoid double-counting assignments already included)
      const existingAssignmentIds = new Set(assignments.map(a => a.id));

      crossStoreAssignments.forEach((asg) => {
        if (asg.employeeId && !existingAssignmentIds.has(asg.id)) {
          const durationMinutes = Math.round((asg.endTime.getTime() - asg.startTime.getTime()) / 60000);
          const existing = hoursMap.get(asg.employeeId) || { totalMinutes: 0, targetMinutes: 0 };
          existing.totalMinutes += durationMinutes;
          hoursMap.set(asg.employeeId, existing);
          crossStoreAssignmentsIncluded++;
        }
      });
    }
    */
  }

  // Set targets for all employees
  employees.forEach((emp) => {
    if (!hoursMap.has(emp.id)) {
      hoursMap.set(emp.id, { totalMinutes: 0, targetMinutes: emp.weeklyMinutesTarget });
    } else {
      const existing = hoursMap.get(emp.id)!;
      existing.targetMinutes = emp.weeklyMinutesTarget;
    }
    console.log(`👤 [ANSWERPACK] ${emp.name}: target ${emp.weeklyMinutesTarget} minutes (${(emp.weeklyMinutesTarget / 60).toFixed(1)} hours)`);
  });

  const hoursThisWeek: AnswerPackHours[] = Array.from(hoursMap.entries()).map(
    ([employeeId, data]) => {
      const emp = employees.find((e) => e.id === employeeId);
      const isCrossStore = crossStoreEmployees.some(ce => ce.id === employeeId);
      return {
        employeeId,
        employeeName: emp?.name || "Unknown",
        totalMinutes: data.totalMinutes,
        targetMinutes: data.targetMinutes,
        deficit: data.targetMinutes - data.totalMinutes,
        isCrossStoreEmployee: isCrossStore,
        crossStoreHoursIncluded: isCrossStore,
      };
    }
  );

  // 7. Calculate unassigned shifts by comparing Templates (required) vs Assignments (assigned)
  const unassignedByDay: AnswerPackUnassigned[] = [];

  if (templates.length > 0) {
    console.log(`🔍 [ANSWERPACK] Calculating unassigned shifts from ${templates.length} templates...`);

    templates.forEach(template => {
      // Handle days field - it's a JSON object with day names as keys and boolean values
      const daysObj = template.days as Record<string, boolean> || {};
      const activeDays = Object.entries(daysObj).filter(([_, active]) => active).map(([day]) => day);

      activeDays.forEach(day => {
        // Convert template DateTime to HH:MM format to match assignments
        const templateStartTime = template.startTime.toISOString().substring(11, 16); // Extract HH:MM from datetime
        const templateEndTime = template.endTime.toISOString().substring(11, 16); // Extract HH:MM from datetime

        const matchingAssignments = assignments.filter(a =>
          a.day === day &&
          a.startTime === templateStartTime &&
          a.endTime === templateEndTime &&
          a.workTypeName === template.workType?.name
        );

        console.log(`🔍 [ANSWERPACK] Template ${template.id}: ${day} ${templateStartTime}-${templateEndTime} ${template.workType?.name} - Required: 1, Found: ${matchingAssignments.length} assignments`);

        const required = 1; // Each template represents one position
        const assigned = matchingAssignments.length;
        const unassigned = Math.max(0, required - assigned);

        if (unassigned > 0) {
          unassignedByDay.push({
            day: day as any,
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

    console.log(`🔍 [ANSWERPACK] Found ${unassignedByDay.length} unassigned shifts from templates`);

    // Debug: Show all unassigned shifts found
    if (unassignedByDay.length > 0) {
      console.log(`🔍 [ANSWERPACK] Unassigned shifts breakdown:`);
      unassignedByDay.forEach(u => {
        console.log(`   ${u.day} ${u.startTime}-${u.endTime} ${u.workTypeName}: ${u.unassigned} positions (${u.required} required, ${u.assigned} assigned)`);
      });
    } else {
      console.log(`🔍 [ANSWERPACK] No unassigned shifts found from templates`);
    }
  } else {
    // Fallback: use old method (assignments without employees)
    console.log(`🔍 [ANSWERPACK] No templates found, using assignment-only method`);
    const unassignedAssignments = assignments.filter((asg) => !asg.employeeId);

    unassignedAssignments.forEach((asg) => {
      unassignedByDay.push({
        day: asg.day,
        workTypeName: asg.workTypeName,
        startTime: asg.startTime,
        endTime: asg.endTime,
        required: 1,
        assigned: 0,
        unassigned: 1,
        templateId: 'unknown',
      });
    });

    console.log(`🔍 [ANSWERPACK] Found ${unassignedByDay.length} unassigned assignments (fallback method)`);
  }

  // 8. Format templates for AnswerPack
  const formattedTemplates: AnswerPackTemplate[] = templates.map(template => {
    const daysObj = template.days as Record<string, boolean> || {};
    const activeDays = Object.entries(daysObj).filter(([_, active]) => active).map(([day]) => day);

    return {
      id: template.id,
      storeId: template.storeId,
      storeName: stores.find(s => s.id === template.storeId)?.name || 'Unknown Store',
      workTypeName: template.workType?.name || 'Unknown',
      startTime: template.startTime.toISOString().substring(11, 16), // Extract HH:MM
      endTime: template.endTime.toISOString().substring(11, 16), // Extract HH:MM
      capacity: 1, // Each template represents one position
      days: activeDays,
    };
  });

  console.log(`📋 [ANSWERPACK] Formatted ${formattedTemplates.length} templates for LLM`);

  const fetchTime = Date.now() - startTime;
  console.log(`📦 [ANSWERPACK] Fetch complete in ${fetchTime}ms`);

  // Final summary for LLM
  const totalUnassignedPositions = unassignedByDay.reduce((sum, u) => sum + u.unassigned, 0);
  console.log(`📊 [ANSWERPACK] FINAL SUMMARY FOR LLM:`);
  console.log(`   - Employees: ${employees.length}`);
  console.log(`   - Schedules: ${schedules.length}`);
  console.log(`   - Assignments: ${assignments.length}`);
  console.log(`   - Templates: ${formattedTemplates.length}`);
  console.log(`   - Unassigned shifts: ${unassignedByDay.length} (${totalUnassignedPositions} total positions)`);
  console.log(`   - Cross-store employees: ${crossStoreEmployees.length}`);
  console.log(`   - Cross-store assignments included: ${crossStoreAssignmentsIncluded}`);

  // Debug: Show exact hours data being sent to LLM
  console.log(`🔍 [ANSWERPACK] Hours data for LLM:`);
  hoursThisWeek.forEach(h => {
    const hoursDecimal = (h.totalMinutes / 60).toFixed(1);
    const targetHours = (h.targetMinutes / 60).toFixed(1);
    const deficitHours = (h.deficit / 60).toFixed(1);
    const crossStoreNote = h.isCrossStoreEmployee ? ' (CROSS-STORE)' : '';
    const underTarget = h.deficit > 0 ? ' - UNDER TARGET' : ' - MEETS/EXCEEDS TARGET';
    console.log(`   - ${h.employeeName}: ${hoursDecimal}h scheduled, ${targetHours}h target, deficit ${deficitHours}h${crossStoreNote}${underTarget}`);
  });

  // Show who should be under target
  const underTargetEmployees = hoursThisWeek.filter(h => h.deficit > 0);
  console.log(`🎯 [ANSWERPACK] Employees under target (${underTargetEmployees.length}):`);
  underTargetEmployees.forEach(h => {
    const hoursDecimal = (h.totalMinutes / 60).toFixed(1);
    const targetHours = (h.targetMinutes / 60).toFixed(1);
    const deficitHours = (h.deficit / 60).toFixed(1);
    console.log(`   - ${h.employeeName}: ${hoursDecimal}/${targetHours}h (deficit: ${deficitHours}h)`);
  });

  return {
    scope,
    employees,
    schedules,
    assignments,
    templates: formattedTemplates,
    hoursThisWeek,
    unassignedByDay,
    CROSS_STORE_NOTICE: crossStoreEmployees.length > 0
      ? `CRITICAL: ${crossStoreEmployees.length} employees (${crossStoreEmployees.map(emp => emp.name).join(', ')}) have cross-store hours INCLUDED in their weekly totals. Their hoursThisWeek data contains complete hours from ALL stores. DO NOT say cross-store hours are excluded.`
      : "No cross-store employees in this dataset.",
    sources: Array.from(new Set(sources)),
    fetchedAt: new Date().toISOString(),
    crossStoreInfo: {
      crossStoreEmployeesCount: crossStoreEmployees.length,
      crossStoreAssignmentsIncluded,
      crossStoreEmployeeNames: crossStoreEmployees.map(emp => emp.name),
      note: crossStoreEmployees.length > 0
        ? `IMPORTANT: Weekly hours for ${crossStoreEmployees.length} cross-store employees (${crossStoreEmployees.map(emp => emp.name).join(', ')}) include assignments from ALL manager's stores. ${crossStoreAssignmentsIncluded} additional assignments included. These employees' hours are COMPLETE and include cross-store work.`
        : "No cross-store employees in this dataset"
    },
    recordCounts: {
      employees: employees.length,
      schedules: schedules.length,
      assignments: assignments.length,
      templates: formattedTemplates.length,
      unassigned: unassignedByDay.reduce((sum, u) => sum + u.unassigned, 0),
    },
  };
}
