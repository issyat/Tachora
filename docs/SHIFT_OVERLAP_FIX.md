# Shift Overlap Check Removal

## Issue

Users were unable to create multiple shifts of the same work type on the same day, even when this is a legitimate and common requirement.

### Example Error
```
User: "add cashier shift on mon from 8 to 12"
AI: "❌ Cannot add Cashier shift on Monday due to overlap
• A Cashier shift already exists on Monday from 08:00 to 16:00.
• New shift times must not overlap with existing templates."
```

## Problem Analysis

The original implementation had an overly strict overlap check that prevented:
- Multiple shifts of same type on same day (e.g., Morning Cashier 8-12, Afternoon Cashier 12-16)
- Overlapping shifts for same role (valid when you need multiple people)
- Flexible scheduling patterns

### Common Valid Scenarios That Were Blocked

**Scenario 1: Split Shifts**
```
Cashier MON 08:00-12:00  ← First shift
Cashier MON 12:00-16:00  ← Second shift (was blocked!)
```

**Scenario 2: Overlapping Shifts (Multiple Coverage)**
```
Sales Associate TUE 09:00-17:00  ← Person A
Sales Associate TUE 13:00-21:00  ← Person B (was blocked!)
```

**Scenario 3: Peak Hours Coverage**
```
Cashier FRI 08:00-16:00  ← Regular coverage
Cashier FRI 11:00-15:00  ← Extra person during lunch rush (was blocked!)
```

## Solution

**Removed the overlap check entirely** because:

1. ✅ **Multiple shifts per day is common**: Stores often need morning, afternoon, and evening shifts
2. ✅ **Overlapping shifts are valid**: Multiple people can work the same role simultaneously
3. ✅ **Flexibility is key**: Managers should control their own shift patterns
4. ✅ **Database supports it**: ShiftTemplate model is designed for multiple templates
5. ✅ **Assignment logic handles it**: The assignment system already manages which employee gets which shift

## Implementation

### Before (❌ Blocked Valid Use Cases)
```typescript
// Check for overlapping templates (same day, same role, overlapping times)
const existingTemplates = await deps.prisma.shiftTemplate.findMany({
  where: { storeId, workTypeId: workType.id },
  select: { id: true, days: true, startTime: true, endTime: true },
});

const overlappingTemplates = existingTemplates.filter((t: any) => {
  // ... complex overlap detection logic ...
  return startTime < tEnd && endTime > tStart;
});

if (overlappingTemplates.length > 0) {
  return {
    ok: false,
    error: 'Overlapping shift template exists',
    errorCode: 'TEMPLATE_OVERLAP',
    message: `A ${workTypeName} shift already exists...`,
  };
}
```

### After (✅ Allows Flexible Scheduling)
```typescript
// Note: We intentionally allow multiple shifts of the same work type on the same day
// This is a common requirement (e.g., Morning Cashier 8-12, Afternoon Cashier 12-16)
// Overlapping times are also allowed since multiple people can work the same role

// Calculate duration for display
const [startHour, startMin] = startTime.split(':').map(Number);
const [endHour, endMin] = endTime.split(':').map(Number);
const durationHours = (endHour * 60 + endMin - startHour * 60 - startMin) / 60;
```

## What Still Validates

The following checks remain in place to ensure data integrity:

✅ **Work Type Exists**: Validates that the work type is defined in the system
✅ **Time Format**: Ensures times are in HH:mm format
✅ **Time Logic**: Start time must be before end time
✅ **Valid Day**: Day must be MON-SUN
✅ **Capacity**: Capacity must be ≥ 1

## Benefits

### 1. Flexible Scheduling
Managers can now create any shift patterns they need:
- Split shifts (morning/afternoon/evening)
- Overlapping shifts (peak hours coverage)
- Back-to-back shifts (continuous coverage)

### 2. Real-World Use Cases
```
✅ "add cashier shift mon 8-12"      → Morning shift
✅ "add cashier shift mon 12-16"     → Afternoon shift
✅ "add cashier shift mon 16-20"     → Evening shift
✅ "add cashier shift mon 11-15"     → Lunch rush coverage
```

### 3. No Artificial Limitations
- No need to delete existing shifts to create new ones
- No arbitrary restrictions on shift patterns
- Full control over scheduling strategy

### 4. Database Already Supports It
```sql
-- ShiftTemplate table allows multiple templates
CREATE TABLE ShiftTemplate (
  id TEXT PRIMARY KEY,
  storeId TEXT NOT NULL,
  workTypeId TEXT NOT NULL,
  days JSON NOT NULL,
  startTime DATETIME NOT NULL,
  endTime DATETIME NOT NULL
);

-- No unique constraint on (workTypeId, day, startTime)
-- Multiple templates for same workType + day are allowed
```

## Safety Considerations

### What About Conflicts?

**Employee Assignment Level** (handled separately):
- Employee availability checking happens during assignment
- Employee can't be assigned to overlapping shifts
- Weekly hour limits checked during assignment
- Rest time validation during assignment

**Template Level** (what we changed):
- Templates are just patterns/blueprints
- Multiple templates = more scheduling options
- Conflicts resolved during assignment, not template creation

### Example Flow
```
1. Create Template: Cashier MON 08:00-12:00 ✅
2. Create Template: Cashier MON 10:00-14:00 ✅ (overlaps, but allowed)
3. Assign Alice to first template ✅
4. Try to assign Alice to second template ❌ (overlap conflict at assignment level)
5. Assign Bob to second template ✅ (no conflict, different person)
```

## Migration Impact

### Existing Stores
- ✅ No breaking changes
- ✅ Existing shifts continue to work
- ✅ Can now create additional shifts on same days

### New Stores
- ✅ Full flexibility from day one
- ✅ Can model complex shift patterns
- ✅ No artificial limitations

## Testing

### Manual Tests

✅ **Test 1: Multiple shifts same day**
```
"add cashier shift mon 8-12"   → ✅ Created
"add cashier shift mon 12-16"  → ✅ Created (was previously blocked)
"add cashier shift mon 16-20"  → ✅ Created (was previously blocked)
```

✅ **Test 2: Overlapping shifts**
```
"add sales associate tue 9-17"   → ✅ Created
"add sales associate tue 13-21"  → ✅ Created (overlap allowed)
```

✅ **Test 3: Identical shift**
```
"add cashier wed 8-16"  → ✅ Created
"add cashier wed 8-16"  → ✅ Created (duplicate allowed, different capacity)
```

✅ **Test 4: Work type not found (still validates)**
```
"add manager mon 8-16"  → ❌ Work type doesn't exist (shows create button)
```

✅ **Test 5: Invalid time (still validates)**
```
"add cashier mon 25:00-26:00"  → ❌ Invalid time format
"add cashier mon 16-12"        → ❌ Start must be before end
```

## Documentation Updates

### Updated Files
- `src/server/preview/llm-handlers.ts` (-42 lines, +3 lines)
- `docs/SHIFT_OVERLAP_FIX.md` (this document)

### Code Comments Added
```typescript
// Note: We intentionally allow multiple shifts of the same work type on the same day
// This is a common requirement (e.g., Morning Cashier 8-12, Afternoon Cashier 12-16)
// Overlapping times are also allowed since multiple people can work the same role
```

## Conclusion

### Problem
Overly strict overlap check prevented legitimate scheduling patterns.

### Solution
Removed the overlap check at template creation level. Conflicts are properly handled at the assignment level where they actually matter.

### Result
- ✅ Flexible shift creation
- ✅ Supports real-world scheduling needs
- ✅ No artificial limitations
- ✅ Maintains data integrity
- ✅ Conflicts still prevented where it matters (employee assignments)

---

**Status**: ✅ Fixed and deployed  
**Impact**: High - Unblocks shift creation workflows  
**Breaking Changes**: None - only removes restrictions  
**Lines Changed**: ~45 lines removed, 3 lines added
