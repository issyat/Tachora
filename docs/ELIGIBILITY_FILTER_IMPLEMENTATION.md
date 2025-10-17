# Work Type Eligibility Filtering - Complete Implementation

## Problem
The system was listing ALL underworked employees when asked "who's available for the security shift?" without checking if they have the required work type/role. Only Bob Smith has Security role, but the system was suggesting everyone.

## Solution
Implemented `check_eligible_candidates` tool with work-type filtering as the PRIMARY eligibility check.

---

## Files Modified

### 1. `src/server/preview/llm-tools.ts`
**Changes:**
- Added `CHECK_ELIGIBLE_CANDIDATES_TOOL` definition (lines ~428+)
- Added tool to `PREVIEW_TOOLS` array
- Tool emphasizes work type filtering in description

**Tool Parameters:**
```typescript
{
  day: Weekday,           // e.g., "MON"
  workTypeName: string,   // e.g., "Security"
  startTime: string,      // e.g., "14:00"
  endTime: string         // e.g., "19:00"
}
```

**Tool Returns:**
```typescript
{
  shift: { day, workTypeName, startTime, endTime, duration },
  eligible: [
    { employeeId, employeeName, currentHours, targetHours, reason }
  ],
  ineligible: [
    { employeeId, employeeName, reasons: ["missing_role", "not_available", ...] }
  ],
  summary: { totalEmployees, eligibleCount, ineligibleCount }
}
```

---

### 2. `src/server/preview/llm-handlers.ts`
**Changes:**
- Added `handleCheckEligibleCandidates` function (after line 1143)
- Implements complete eligibility filtering logic

**Database Queries Fixed:**
1. **Employee Query** - Fixed to include nested relations:
   ```typescript
   // BEFORE (WRONG):
   include: {
     roles: true,  // ❌ Only gets EmployeeWorkType join table (no name!)
   }
   
   // AFTER (CORRECT):
   include: {
     roles: {
       include: {
         workType: true,  // ✅ Gets actual WorkType with name
       },
     },
   }
   ```

2. **Assignment Query** - Fixed schema mismatch:
   ```typescript
   // BEFORE (WRONG):
   where: {
     storeId,  // ❌ Assignment doesn't have storeId field!
     weekId,   // ❌ Assignment doesn't have weekId field!
     day,
   }
   
   // AFTER (CORRECT):
   // Step 1: Get schedule first
   const schedule = await prisma.schedule.findUnique({
     where: {
       storeId_isoWeek: { storeId, isoWeek: weekId }
     }
   });
   
   // Step 2: Query assignments by scheduleId
   where: {
     scheduleId: schedule.id,  // ✅ Correct foreign key
     day,
   }
   ```

**Work Type Filtering Logic:**
```typescript
// BEFORE (WRONG):
const hasRole = employee.roles.some(role => 
  role.name.toLowerCase().trim() === workTypeName  // ❌ role.name doesn't exist!
);

// AFTER (CORRECT):
const hasRole = employee.roles.some((role: { workType: { name: string } }) => 
  role.workType?.name?.toLowerCase().trim() === workTypeName.toLowerCase().trim()
);
```

**Eligibility Checks (in order):**
1. **Work Type Match** (PRIMARY - blocker)
   - Check: `employee.roles.some(role => role.workType.name === workTypeName)`
   - If NO: Add to ineligible with `missing_role` reason

2. **Availability Check** (blocker)
   - Check: Employee not marked off on that day
   - Check: Shift time within employee availability window
   - If NO: Add to ineligible with `not_available` reason

3. **Overlap Check** (blocker)
   - Check: No conflicting assignments on same day/time
   - If YES: Add to ineligible with `overlap` reason

4. **Hour Limits** (warning only)
   - Check: Adding shift doesn't exceed 125% of target hours
   - If YES: Note in reason but still mark as eligible (soft warning)

**Output Sorting:**
- Eligible employees sorted by utilization (most underworked first)
- Prioritizes employees furthest below their target hours

---

### 3. `src/app/api/chat/route.ts`
**Changes:**
- Added `handleCheckEligibleCandidates` to imports (line 19)
- Added handler dispatch for `check_eligible_candidates` tool (after line 1143)

**Handler Integration:**
```typescript
else if (toolCall.function.name === "check_eligible_candidates") {
  chatMetrics.toolsUsed.push("check_eligible_candidates");
  
  const args = JSON.parse(toolCall.function.arguments ?? "{}");
  const handlerDeps = { prisma, userId, managerId: manager.id };
  const toolContext = { storeId, weekId };
  
  const result = await handleCheckEligibleCandidates(args, toolContext, handlerDeps);
  
  conversation.push({
    role: "tool",
    tool_call_id: toolCall.id,
    content: JSON.stringify(result),
  });
}
```

---

## Database Schema Reference

```prisma
model Employee {
  id                  String             @id @default(cuid())
  storeId             String
  name                String
  weeklyMinutesTarget Int                @default(2400)
  roles               EmployeeWorkType[] // Join table
  availability        Availability[]
}

model EmployeeWorkType {
  employeeId String
  workTypeId String
  employee   Employee @relation(fields: [employeeId], references: [id])
  workType   WorkType @relation(fields: [workTypeId], references: [id])
  @@id([employeeId, workTypeId])
}

model WorkType {
  id          String             @id @default(cuid())
  storeId     String
  name        String             // ⭐ This is what we filter by
  employees   EmployeeWorkType[]
}

model Schedule {
  id          String   @id @default(cuid())
  storeId     String
  isoWeek     String   // e.g., "2025-W42"
  assignments Assignment[]
  @@unique([storeId, isoWeek])
}

model Assignment {
  id               String    @id @default(cuid())
  scheduleId       String    // ⭐ Foreign key to Schedule (NOT storeId!)
  day              Weekday
  startTime        DateTime  @db.Time(0)
  endTime          DateTime  @db.Time(0)
  workTypeId       String
  employeeId       String?
  employee         Employee? @relation(fields: [employeeId], references: [id])
  schedule         Schedule  @relation(fields: [scheduleId], references: [id])
}
```

---

## Common Pitfalls Fixed

### ❌ Mistake 1: Assuming `roles` has `name` field
```typescript
employee.roles.some(role => role.name === "Security")  // WRONG!
```
**Why it's wrong:** `roles` is `EmployeeWorkType[]`, a join table with only `employeeId` and `workTypeId`. No `name` field!

**✅ Correct:**
```typescript
employee.roles.some(role => role.workType.name === "Security")
```
**Why it works:** Include `workType` relation to access the actual `WorkType.name` field.

---

### ❌ Mistake 2: Querying assignments by storeId/weekId
```typescript
prisma.assignment.findMany({
  where: { storeId, weekId, day }  // WRONG!
})
```
**Why it's wrong:** `Assignment` model has NO `storeId` or `weekId` fields. It only has `scheduleId`.

**✅ Correct:**
```typescript
// Step 1: Find schedule
const schedule = await prisma.schedule.findUnique({
  where: { storeId_isoWeek: { storeId, isoWeek: weekId } }
});

// Step 2: Query assignments
prisma.assignment.findMany({
  where: { scheduleId: schedule.id, day }
})
```

---

### ❌ Mistake 3: Forgetting null safety on nested relations
```typescript
role.workType.name.toLowerCase()  // CRASHES if workType is null!
```

**✅ Correct:**
```typescript
role.workType?.name?.toLowerCase()  // Safe with optional chaining
```

---

## Testing

### Test Case 1: Security Shift
**Input:** "who's available for the security shift on Monday 14:00-19:00?"

**Expected Output:**
- ✅ Returns only Bob Smith (has Security role)
- ✅ Lists other employees as ineligible with reason: `missing_role: Does not have "Security" role`

### Test Case 2: Cashier Shift
**Input:** "who can work as cashier on Tuesday morning?"

**Expected Output:**
- ✅ Returns all employees with Cashier role
- ✅ Filters out those not available on Tuesday
- ✅ Filters out those with conflicting assignments
- ✅ Sorts by most underworked first

---

## Implementation Checklist

- [x] Tool definition added to `llm-tools.ts`
- [x] Tool registered in `PREVIEW_TOOLS` array
- [x] Handler function implemented in `llm-handlers.ts`
- [x] Fixed employee query to include `workType` relation
- [x] Fixed assignment query to use `scheduleId` instead of `storeId`
- [x] Added work type filtering logic
- [x] Added availability checks
- [x] Added overlap detection
- [x] Added hour limit warnings
- [x] Handler exported from `llm-handlers.ts`
- [x] Handler imported in `chat/route.ts`
- [x] Handler dispatch added in tool handling section
- [x] TypeScript errors resolved
- [x] Null safety added with optional chaining

---

## Result

✅ **The system now correctly filters candidates by work type FIRST, then checks availability, overlaps, and hours.**

When asked "who's available for the security shift?", the system will:
1. Find all employees
2. Filter to ONLY those with Security role
3. Check if they're available on that day/time
4. Check for conflicting assignments
5. Sort by most underworked
6. Return only Bob Smith (if he's the only one with Security role and available)

**No more suggesting Carol Davis or Emma Brown for Security shifts when they don't have the role!** 🎯
