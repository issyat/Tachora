# Cross-Store Simulation Setup

## Problem Solved
The LLM wasn't including cross-store employees because there were no employees with `canWorkAcrossStores: true` in the dataset.

## Solution Implemented
Added temporary simulation code to the `fetchAnswerPack` function to:

1. **Mark specific employees as cross-store** (Alice Johnson, Bob Smith, Frank Miller)
2. **Add mock cross-store assignments** with additional hours from "other stores"
3. **Test the complete cross-store functionality** without needing multiple stores in the database

## Changes Made

### 1. Simulated Cross-Store Employees
**File**: `src/server/copilot/data/answer-pack.ts`

```typescript
// TEMPORARY: For testing cross-store functionality, mark some employees as cross-store
const testCrossStoreNames = ['Alice Johnson', 'Bob Smith', 'Frank Miller'];
employees.forEach(emp => {
  if (testCrossStoreNames.includes(emp.name)) {
    emp.canWorkAcrossStores = true;
    console.log(`🧪 [ANSWERPACK] TEMP: Marked ${emp.name} as cross-store for testing`);
  }
});
```

### 2. Simulated Cross-Store Hours
**File**: `src/server/copilot/data/answer-pack.ts`

```typescript
// Add mock additional hours for cross-store employees
crossStoreEmployees.forEach(emp => {
  let mockAdditionalHours = 0;
  
  if (emp.name === 'Alice Johnson') {
    mockAdditionalHours = 480; // 8 hours from another store
  } else if (emp.name === 'Bob Smith') {
    mockAdditionalHours = 360; // 6 hours from another store
  } else if (emp.name === 'Frank Miller') {
    mockAdditionalHours = 240; // 4 hours from another store
  }
  
  // Add to their weekly total
  const existing = hoursMap.get(emp.id) || { totalMinutes: 0, targetMinutes: 0 };
  existing.totalMinutes += mockAdditionalHours;
  hoursMap.set(emp.id, existing);
  crossStoreAssignmentsIncluded++;
});
```

## Expected Results

When you ask "Who is under their weekly target?" now, you should see:

### ✅ Cross-Store Employees with Additional Hours:
- **Alice Johnson**: Should show ~8 additional hours from cross-store work
- **Bob Smith**: Should show ~6 additional hours from cross-store work  
- **Frank Miller**: Should show ~4 additional hours from cross-store work

### ✅ LLM Response Should Include:
- **Assumptions**: Mention that cross-store hours are included for X employees
- **Hours Format**: Display in decimal hours (32.0 hours) not minutes (1920 minutes)
- **Cross-Store Info**: Reference the crossStoreInfo metadata showing employees and assignments included

### ✅ Console Logs Should Show:
```
🧪 [ANSWERPACK] TEMP: Marked Alice Johnson as cross-store for testing
🧪 [ANSWERPACK] TEMP: Marked Bob Smith as cross-store for testing
🧪 [ANSWERPACK] TEMP: Marked Frank Miller as cross-store for testing
🔄 [ANSWERPACK] 3 employees can work across stores
🧪 [ANSWERPACK] TEMP: Added 480 minutes (8 hours) for Alice Johnson from other stores
🧪 [ANSWERPACK] TEMP: Added 360 minutes (6 hours) for Bob Smith from other stores
🧪 [ANSWERPACK] TEMP: Added 240 minutes (4 hours) for Frank Miller from other stores
- Cross-store employees: 3
- Cross-store assignments included: 3
```

## Testing

Run the test script to verify:
```bash
node test-cross-store-simulation.js
```

## Cleanup

This is **temporary simulation code** for testing. Once you have:
1. Real cross-store employees in the database (`canWorkAcrossStores: true`)
2. Multiple stores with actual assignments

You can remove the simulation code and uncomment the real database queries.

## Real Implementation Path

To implement this properly in production:

1. **Update employees in database**:
```sql
UPDATE "Employee" 
SET "canWorkAcrossStores" = true 
WHERE name IN ('Alice Johnson', 'Bob Smith', 'Frank Miller');
```

2. **Create additional stores** for the same manager

3. **Create assignments** for cross-store employees at multiple stores

4. **Remove simulation code** and use real database queries