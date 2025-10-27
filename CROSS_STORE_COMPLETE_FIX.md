# Complete Cross-Store Employee Hours Fix

## Problem
The LLM was not including hours from other stores for employees who can work across multiple locations, leading to inaccurate weekly target analysis.

## Root Cause
1. The system only calculated hours from the current store scope
2. Cross-store employees' hours from other stores were not included
3. The LLM was making incorrect assumptions about cross-store data

## Complete Solution

### 1. Enhanced Data Fetching
**File**: `src/server/copilot/data/answer-pack.ts`

Added automatic cross-store assignment fetching:
```typescript
// For employees who can work across stores, fetch their assignments from ALL manager's stores
const crossStoreEmployees = employees.filter(emp => emp.canWorkAcrossStores);
let crossStoreAssignmentsIncluded = 0;

if (crossStoreEmployees.length > 0 && !params.includeOtherStores) {
  // Get all schedules from all manager's stores for this week
  const allStoreSchedules = await prisma.schedule.findMany({
    where: {
      isoWeek: params.isoWeek,
      storeId: { in: allStoreIds }, // All manager's stores
    },
  });
  
  // Get assignments for cross-store employees from all stores
  const crossStoreAssignments = await prisma.assignment.findMany({
    where: {
      scheduleId: { in: allStoreSchedules.map(s => s.id) },
      employeeId: { in: crossStoreEmployees.map(emp => emp.id) },
    },
  });
  
  // Add cross-store hours (avoid double-counting)
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
```

### 2. Added Cross-Store Metadata
**File**: `src/server/copilot/data/answer-pack.ts`

Enhanced AnswerPack interface with cross-store information:
```typescript
export interface AnswerPack {
  // ... existing fields
  crossStoreInfo: {
    crossStoreEmployeesCount: number;
    crossStoreAssignmentsIncluded: number;
    note: string;
  };
  // ... rest of fields
}
```

The crossStoreInfo provides:
- Count of employees who can work across stores
- Number of additional assignments included from other stores
- Descriptive note for the LLM

### 3. Enhanced LLM Instructions
**File**: `src/server/copilot/answer-pack-llm.ts`

Added explicit cross-store handling instructions:
```
CROSS-STORE EMPLOYEE HANDLING:
- Check the crossStoreInfo field in the data - it tells you exactly how many cross-store employees are included
- The hoursThisWeek data AUTOMATICALLY includes hours from ALL stores for cross-store employees
- NEVER assume cross-store employees only have hours from one store - the data is pre-calculated to include all their hours
- When crossStoreInfo shows cross-store employees, mention this in your assumptions section
- Cross-store employees' weekly totals are ALWAYS complete regardless of the includeOtherStores setting
- If crossStoreInfo.crossStoreAssignmentsIncluded > 0, state that cross-store hours are included in the analysis
```

### 4. Updated Assumptions Section Requirement
**File**: `src/server/copilot/answer-pack-llm.ts`

Modified the grounding rules:
```
- **Assumptions**: Interpretations applied - MUST check crossStoreInfo and mention if cross-store hours are included
```

### 5. Enhanced Logging
**File**: `src/server/copilot/data/answer-pack.ts`

Added comprehensive logging:
```typescript
console.log(`🔄 [ANSWERPACK] ${crossStoreCount} employees can work across stores`);
console.log(`🔄 [ANSWERPACK] Fetching cross-store assignments for ${crossStoreEmployees.length} employees...`);
console.log(`🔄 [ANSWERPACK] Found ${crossStoreAssignments.length} cross-store assignments`);
console.log(`   - Cross-store employees: ${crossStoreEmployees.length}`);
console.log(`   - Cross-store assignments included: ${crossStoreAssignmentsIncluded}`);
```

## How It Works Now

1. **Data Collection**: System identifies employees with `canWorkAcrossStores: true`
2. **Cross-Store Fetch**: Automatically fetches their assignments from ALL manager's stores
3. **Hour Calculation**: Includes all hours in weekly totals (avoiding double-counting)
4. **Metadata Provision**: Provides crossStoreInfo to the LLM with exact counts
5. **LLM Processing**: LLM checks crossStoreInfo and mentions cross-store inclusion in assumptions

## Expected Behavior

When asking "Who is under their weekly target?", the system should now:

✅ **Correct Assumptions**: "Cross-store hours are included for X employees who work across multiple stores"
✅ **Complete Hours**: Show total weekly hours from ALL stores for cross-store employees  
✅ **Accurate Deficits**: Calculate deficits based on complete weekly picture
✅ **Clear Metadata**: Include crossStoreInfo in the data sent to LLM

## Before vs After

**Before:**
```
Assumptions: Cross-store setting is disabled, so only hours worked at this store are considered.
Alice Johnson: Scheduled 24.0 hours, target 40.0 hours, deficit 16.0 hours
```

**After:**
```
Assumptions: Cross-store hours are included for 3 employees who work across multiple stores (12 additional assignments included).
Alice Johnson: Scheduled 32.0 hours, target 40.0 hours, deficit 8.0 hours
```

## Testing

Use the debug script to verify:
```bash
node test-cross-store-debug.js
```

Look for:
- ✅ Mentions of cross-store functionality in assumptions
- ✅ Complete hours for cross-store employees
- ✅ Accurate deficit calculations
- ✅ crossStoreInfo metadata in logs