# Cross-Store Employee Hours Fix

## Problem

When an employee can work across stores (e.g., Jasper with `canWorkAcrossStores: true`):
- Jasper is assigned 20h in Store 1
- When viewing Store 2, Jasper shows 0h/20h instead of 20h/20h
- The hours should reflect the TOTAL across ALL stores, not just the current store

## Root Causes

### 1. Backend: Schedule Facts Builder
**File:** `src/server/schedule/facts-builder.ts`

The `loadContext` function only loaded assignments from the current store's schedule:

```typescript
const schedule = await prisma.schedule.findUnique({
  where: {
    storeId_isoWeek: {
      storeId: params.storeId,  // ❌ Only this store
      isoWeek,
    },
  },
  // ...
});
```

This meant that when building facts for Store 2, it wouldn't include Jasper's assignments from Store 1.

### 2. Frontend: useEmployeeHours Hook
**File:** `src/app/(protected)/schedule/hooks/useEmployeeHours.ts`

The hook was incorrectly zeroing out cross-store employees:

```typescript
// ❌ Old logic
Object.keys(serverHours).forEach((employeeId) => {
  if (!(employeeId in localHours)) {
    merged[employeeId] = 0;  // This zeroed out cross-store hours!
  }
});
```

When viewing Store 2, Jasper had no local assignments, so the hook set his hours to 0, overriding the server's cross-store total of 20h.

## Solutions Implemented

### 1. Backend Fix: Load Cross-Store Assignments

**File:** `src/server/schedule/facts-builder.ts` (line ~260)

Added logic to fetch assignments from other stores for cross-store employees:

```typescript
// Identify all cross-store employees
const crossStoreEmployeeIds = [
  ...store.employees.filter(e => e.canWorkAcrossStores).map(e => e.id),
  ...crossStoreEmployees.map(e => e.id), // already filtered for canWorkAcrossStores
];

if (crossStoreEmployeeIds.length > 0) {
  // Fetch assignments from other stores for cross-store employees
  const otherStoreAssignments = await prisma.assignment.findMany({
    where: {
      schedule: {
        isoWeek,
        storeId: { not: params.storeId },  // ✅ OTHER stores
        store: { managerId: params.managerId },
      },
      employeeId: { in: crossStoreEmployeeIds },  // ✅ Only cross-store employees
    },
    include: {
      employee: { select: { id: true, name: true, store: { select: { name: true }}}},
      workType: true,
    },
  });

  // Merge with current store's assignments
  assignments = [...assignments, ...crossStoreNormalized];
}
```

**Impact:** 
- AI assistant now sees Jasper's full 20h in Store 2
- Schedule facts include all cross-store assignments
- Queries like "jasper hours" return correct totals

### 2. Frontend Fix: Preserve Cross-Store Hours

**File:** `src/app/(protected)/schedule/hooks/useEmployeeHours.ts` (line ~77)

Fixed the merge logic to preserve server hours for cross-store employees:

```typescript
// ✅ New logic
Object.entries(localHours).forEach(([employeeId, localMinutes]) => {
  if (localMinutes > 0) {
    // If there are local assignments, show those for instant feedback
    merged[employeeId] = localMinutes;
  } else if (!(employeeId in serverHours)) {
    // Only set to 0 if server also doesn't have data
    merged[employeeId] = 0;
  }
  // If localMinutes is 0 but server has hours, keep server hours (cross-store) ✅
});
```

**Impact:**
- UI now shows correct hours for cross-store employees in all stores
- Jasper shows 20h/20h in Store 2 even though he has 0 assignments there
- Server cross-store totals are preserved

### 3. Updated useEffect Dependency

**File:** `src/app/(protected)/schedule/hooks/useEmployeeHours.ts` (line ~68)

Changed to refetch when week changes:

```typescript
// ✅ Now refetches when week changes
useEffect(() => {
  // ...
}, [fetchServerHours]); // Includes both storeId and weekId
```

**Previously:**
```typescript
// ❌ Only refetched on store change
}, [storeId]);
```

## Architecture Overview

### Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│ Database: Employee with canWorkAcrossStores: true           │
│  - Jasper (Store 2)                                         │
│  - 20h of assignments in Store 1 for Week 42                │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ Backend: /api/schedule/employee-hours                       │
│  - Fetches ALL assignments for the week                     │
│  - Aggregates by employeeId across ALL stores               │
│  - Returns: { "jasper-id": 1200 } (20h in minutes)          │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ Backend: buildScheduleFacts (for Store 2)                   │
│  - Loads Store 2's assignments: []                          │
│  - Identifies Jasper as cross-store employee                │
│  - Fetches Jasper's assignments from Store 1: [20h]         │
│  - Includes in facts: weeklyMinutes: 1200                   │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ Frontend: useEmployeeHours                                  │
│  - serverHours: { "jasper-id": 1200 } from API              │
│  - localHours: {} (no assignments in Store 2)               │
│  - mergedHours: { "jasper-id": 1200 } ✅ Preserved!         │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ UI: AvailabilitySidebar                                     │
│  - Shows: Jasper 20h / 20h ✅                               │
│  - Works in both Store 1 and Store 2                        │
└─────────────────────────────────────────────────────────────┘
```

## Testing

### Test Script
Run: `npx tsx scripts/test-cross-store-hours.ts`

This will:
1. Find Jasper in the database
2. Calculate his total hours across all assignments
3. Build schedule facts for each store
4. Verify that each store shows the same total hours

### Manual Testing

1. **Create test scenario:**
   - Employee: Jasper with `canWorkAcrossStores: true`
   - Store 1: Assign Jasper 20h for Week 42
   - Store 2: No assignments for Jasper

2. **Verify Store 1:**
   ```
   - Switch to Store 1
   - Open schedule for Week 42
   - Check sidebar: Jasper should show 20h / 20h ✅
   ```

3. **Verify Store 2:**
   ```
   - Switch to Store 2
   - Open schedule for Week 42  
   - Check sidebar: Jasper should show 20h / 20h ✅ (not 0h!)
   ```

4. **Verify AI Assistant:**
   ```
   - In Store 2, ask: "jasper hours"
   - Response should show: 20 hours ✅
   ```

## Files Modified

1. **`src/server/schedule/facts-builder.ts`**
   - Added cross-store assignment fetching in `loadContext`
   - Lines ~260-340

2. **`src/app/(protected)/schedule/hooks/useEmployeeHours.ts`**
   - Fixed merge logic to preserve server hours
   - Updated useEffect dependencies
   - Lines ~68-95

3. **`docs/AI_ASSISTANT_FIX_BOB_HOURS.md`** (previous fix)
   - Already covered the AI assistant prompt improvements

## Related Endpoints

### Already Working Correctly ✅

- **`/api/schedule/employee-hours`** - Returns cross-store totals
- **`/api/chat`** - Now uses updated facts builder
- **UI Components** - Already designed to use cross-store minutes

## Database Schema

No schema changes needed! The `Employee.canWorkAcrossStores` field already exists:

```prisma
model Employee {
  id                  String   @id @default(cuid())
  name                String
  storeId             String
  canWorkAcrossStores Boolean  @default(false)
  // ...
}
```

## Benefits

1. ✅ **Accurate hours display** - Cross-store employees show correct totals everywhere
2. ✅ **Better scheduling** - Managers can see full workload when assigning shifts
3. ✅ **AI assistant accuracy** - Queries return correct cross-store hours
4. ✅ **No UI confusion** - Hours don't change when switching stores
5. ✅ **Proper conflict detection** - System knows if employee is over weekly limit across all stores

## Future Improvements

Consider:
- Visual indicator when hours are from other stores
- Store breakdown tooltip: "20h total: 15h Store 1, 5h Store 2"
- Warning when assigning cross-store employee who is near weekly limit
