#!/usr/bin/env tsx

/**
 * Simple logic test to verify overlap detection works correctly
 */

interface Assignment {
  employeeId: string;
  employeeName: string;
  day: string;
  startMinute: number;
  endMinute: number;
  role: string;
}

function checkForOverlaps(assignments: Assignment[]): boolean {
  console.log('🔍 Checking for overlapping assignments...\n');
  
  // Group by employee and day
  const employeeDayGroups = new Map<string, Assignment[]>();
  
  assignments.forEach(assignment => {
    const key = `${assignment.employeeId}-${assignment.day}`;
    if (!employeeDayGroups.has(key)) {
      employeeDayGroups.set(key, []);
    }
    employeeDayGroups.get(key)!.push(assignment);
  });

  let overlapFound = false;

  employeeDayGroups.forEach((dayAssignments, key) => {
    if (dayAssignments.length > 1) {
      const [employeeId, day] = key.split('-');
      const employeeName = dayAssignments[0].employeeName;
      
      // Sort by start time
      dayAssignments.sort((a, b) => a.startMinute - b.startMinute);
      
      console.log(`👤 ${employeeName} on ${day}:`);
      dayAssignments.forEach(assignment => {
        const startTime = `${Math.floor(assignment.startMinute / 60).toString().padStart(2, '0')}:${(assignment.startMinute % 60).toString().padStart(2, '0')}`;
        const endTime = `${Math.floor(assignment.endMinute / 60).toString().padStart(2, '0')}:${(assignment.endMinute % 60).toString().padStart(2, '0')}`;
        console.log(`   ${startTime}-${endTime} (${assignment.role})`);
      });
      
      // Check for overlaps
      for (let i = 0; i < dayAssignments.length - 1; i++) {
        const current = dayAssignments[i];
        const next = dayAssignments[i + 1];
        
        if (current.endMinute > next.startMinute) {
          overlapFound = true;
          console.log(`   ❌ OVERLAP: ${current.endMinute - next.startMinute} minutes overlap between shifts`);
        }
      }
      console.log('');
    }
  });

  return overlapFound;
}

// Test case: Alice with overlapping shifts (the problem scenario)
const problematicAssignments: Assignment[] = [
  {
    employeeId: 'alice-123',
    employeeName: 'Alice Johnson',
    day: 'MON',
    startMinute: 8 * 60,  // 8:00
    endMinute: 16 * 60,   // 16:00
    role: 'Cashier'
  },
  {
    employeeId: 'alice-123',
    employeeName: 'Alice Johnson', 
    day: 'MON',
    startMinute: 9 * 60,  // 9:00 (overlaps!)
    endMinute: 17 * 60,   // 17:00
    role: 'Manager'
  }
];

// Test case: Alice with non-overlapping shifts (what we want)
const goodAssignments: Assignment[] = [
  {
    employeeId: 'alice-123',
    employeeName: 'Alice Johnson',
    day: 'MON', 
    startMinute: 8 * 60,  // 8:00
    endMinute: 16 * 60,   // 16:00
    role: 'Cashier'
  },
  {
    employeeId: 'david-456',
    employeeName: 'David Smith',
    day: 'MON',
    startMinute: 9 * 60,  // 9:00 (different employee)
    endMinute: 17 * 60,   // 17:00
    role: 'Manager'
  }
];

console.log('🧪 Testing overlap detection logic...\n');

console.log('📋 Test 1: Problematic assignments (should detect overlap)');
const hasOverlap1 = checkForOverlaps(problematicAssignments);
if (hasOverlap1) {
  console.log('✅ Correctly detected overlap in problematic case\n');
} else {
  console.log('❌ Failed to detect overlap in problematic case\n');
}

console.log('📋 Test 2: Good assignments (should not detect overlap)');
const hasOverlap2 = checkForOverlaps(goodAssignments);
if (!hasOverlap2) {
  console.log('✅ Correctly found no overlap in good case\n');
} else {
  console.log('❌ Incorrectly detected overlap in good case\n');
}

console.log('🎯 Summary:');
console.log('The CP-SAT solver fix should prevent the first scenario (overlapping shifts for same employee)');
console.log('and allow the second scenario (different employees can work overlapping shifts).');
console.log('\nIf you\'re still seeing Alice assigned to overlapping shifts, the CP-SAT solver');
console.log('constraints are not being properly enforced.');