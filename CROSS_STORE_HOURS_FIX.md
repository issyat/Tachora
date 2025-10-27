# Cross-Store Employee Hours Fix

## Problem
When analyzing weekly targets, the system was only considering hours from the current store, even for employees who can work across multiple stores. This led to inaccurate deficit calculations because employees might have additional hours scheduled at other stores.

## Solution
Modified the `fetchAnswerPack` function to automatically include cross-store assignments when calculating weekly hours for employees who have `canWorkAcrossStores: true`.

## Changes Made

### 1. Enhanced Hours Calculation
**File**: `src/server/copilot/data/answer-pack.ts`

Added logic to fetch assignments from ALL manager's stores for cross-store employees:

```typescript
// For employees who can work across stores, fetch their assignments from ALL manager's stores
const crossStoreEmployees = employees.filter(emp => emp.canWorkAcrossStores);

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
  // ... calculation logic
}
```

### 2. Updated LLM Instructions
**File**: `src/server/copilot/answer-pack-llm.ts`

Added clear instructions about cross-store employee handling:

```
CROSS-STORE EMPLOYEE HANDLING:
- For weekly target analysis, ALWAYS consider employees who can work across stores
- The system automatically includes their hours from ALL stores when calculating weekly totals
- Even if cross-store setting is disabled, cross-store employees' full weekly hours are included
- This ensures accurate deficit/surplus calculations for employees working multiple locations
```

### 3. Added Logging
Enhanced logging to show when cross-store data is being processed:
- Shows count of cross-store employees
- Logs when cross-store assignments are fetched
- Prevents double-counting of assignments

## How It Works Now

1. **Regular Employees**: Hours calculated from current store only (as before)
2. **Cross-Store Employees**: Hours calculated from ALL manager's stores automatically
3. **Accurate Targets**: Weekly deficit/surplus calculations now include complete picture
4. **No Double-Counting**: System ensures assignments aren't counted twice

## Expected Behavior

When asking "Who is under their weekly target?", the system will now:

- ✅ Show hours in decimal format (32.0 hours instead of 1920 minutes)
- ✅ Include complete weekly hours for cross-store employees from ALL stores
- ✅ Provide accurate deficit calculations
- ✅ Work even when `includeOtherStores` is false

## Example Output

**Before Fix:**
```
Alice Johnson: Scheduled 24.0 hours, target 40.0 hours, deficit 16.0 hours
```
(Missing 8 hours she worked at another store)

**After Fix:**
```
Alice Johnson: Scheduled 32.0 hours, target 40.0 hours, deficit 8.0 hours
```
(Includes her 8 hours from the other store)

## Testing

Run the test script to verify the fix:
```bash
node test-cross-store-hours.js
```

The system should now provide accurate weekly hour analysis that includes all hours worked by cross-store employees across all locations.