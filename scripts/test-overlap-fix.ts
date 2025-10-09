#!/usr/bin/env tsx

/**
 * Test script to verify that the CP-SAT solver prevents overlapping shift assignments
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testOverlapPrevention() {
  console.log('🧪 Testing overlap prevention in CP-SAT solver...\n');

  try {
    // Clear existing assignments
    await prisma.assignment.deleteMany({});
    console.log('✅ Cleared existing assignments');

    // Generate a new schedule
    console.log('🔄 Generating new schedule...');
    const response = await fetch('http://localhost:3000/api/schedule/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storeId: 'downtown-brussels',
        isoWeek: '2024-W02'
      })
    });

    if (!response.ok) {
      throw new Error(`Generate failed: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    console.log('✅ Schedule generated successfully');
    console.log(`📊 Coverage: ${(result.metrics.coverage_ratio * 100).toFixed(1)}%`);
    console.log(`⏱️  Solver time: ${result.metrics.solver_wall_time_ms}ms\n`);

    // Check for overlapping assignments
    const assignments = await prisma.assignment.findMany({
      include: {
        employee: { select: { name: true } },
        shift: { 
          include: { 
            workType: { select: { name: true } } 
          } 
        }
      },
      orderBy: [
        { employee: { name: 'asc' } },
        { day: 'asc' },
        { startMinute: 'asc' }
      ]
    });

    console.log('📋 All assignments:');
    assignments.forEach(assignment => {
      const startHour = Math.floor(assignment.startMinute / 60);
      const startMin = assignment.startMinute % 60;
      const endHour = Math.floor(assignment.endMinute / 60);
      const endMin = assignment.endMinute % 60;
      const startTime = `${startHour.toString().padStart(2, '0')}:${startMin.toString().padStart(2, '0')}`;
      const endTime = `${endHour.toString().padStart(2, '0')}:${endMin.toString().padStart(2, '0')}`;
      console.log(`  ${assignment.employee.name}: ${assignment.day} ${startTime}-${endTime} (${assignment.shift.workType?.name || 'Unknown'})`);
    });

    // Group by employee and day to check for overlaps
    const employeeDayGroups = new Map<string, any[]>();
    
    assignments.forEach(assignment => {
      const key = `${assignment.employeeId}-${assignment.day}`;
      if (!employeeDayGroups.has(key)) {
        employeeDayGroups.set(key, []);
      }
      employeeDayGroups.get(key)!.push(assignment);
    });

    console.log('\n🔍 Checking for overlapping assignments...');
    let overlapFound = false;

    employeeDayGroups.forEach((dayAssignments, key) => {
      if (dayAssignments.length > 1) {
        const [employeeId, day] = key.split('-');
        const employeeName = dayAssignments[0].employee.name;
        
        // Sort by start time
        dayAssignments.sort((a, b) => a.startMinute - b.startMinute);
        
        // Check for overlaps
        for (let i = 0; i < dayAssignments.length - 1; i++) {
          const current = dayAssignments[i];
          const next = dayAssignments[i + 1];
          
          if (current.endMinute > next.startMinute) {
            overlapFound = true;
            const currentStartTime = `${Math.floor(current.startMinute / 60).toString().padStart(2, '0')}:${(current.startMinute % 60).toString().padStart(2, '0')}`;
            const currentEndTime = `${Math.floor(current.endMinute / 60).toString().padStart(2, '0')}:${(current.endMinute % 60).toString().padStart(2, '0')}`;
            const nextStartTime = `${Math.floor(next.startMinute / 60).toString().padStart(2, '0')}:${(next.startMinute % 60).toString().padStart(2, '0')}`;
            const nextEndTime = `${Math.floor(next.endMinute / 60).toString().padStart(2, '0')}:${(next.endMinute % 60).toString().padStart(2, '0')}`;
            
            console.log(`❌ OVERLAP DETECTED: ${employeeName} on ${day}`);
            console.log(`   ${currentStartTime}-${currentEndTime} (${current.shift.workType?.name || 'Unknown'})`);
            console.log(`   ${nextStartTime}-${nextEndTime} (${next.shift.workType?.name || 'Unknown'})`);
            console.log(`   Overlap: ${current.endMinute - next.startMinute} minutes\n`);
          }
        }
      }
    });

    if (!overlapFound) {
      console.log('✅ No overlapping assignments found! Fix is working correctly.');
    } else {
      console.log('❌ Overlapping assignments still exist. Fix needs more work.');
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testOverlapPrevention();