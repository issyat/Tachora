# "Why" Questions - Role vs Employee Query Disambiguation

## Problem

When users ask "why are Supervisor shifts not assigned?", the LLM was confusing:
- **Role query**: "Why are [ROLE] shifts unassigned?" (should check `openShifts[]`)
- **Employee query**: "Why can't assign [EMPLOYEE] to [ROLE]?" (should use `explain_constraint`)

### Failed Examples

**Query 2:** "why Supervisor shifts are not assigned on monday?"
```
❌ WRONG Response (old): "Supervisor is not an employee"
❌ WRONG Response (basic): "There are 2 open Shift Supervisor shifts on Monday (08:00-16:00, 12:00-20:00)"
✅ EXPECTED Response (detailed):
"Two Supervisor shifts remain open on Monday because:
• Frank Miller already has Monday Stock Clerk shift (overlap conflict)
• David Wilson is overworked (30h/24h target)
• Alice, Carol have no blocking issues
→ Try assigning Alice Johnson (16h/40h target)
→ Or Bob Smith (26h/40h target)"
```

**Query 3:** "why shift supervisoer are not assigned on monday?" (with typo)
```
❌ WRONG Response (old): "No employee named Shift Supervisor found"
❌ WRONG Response (basic): "There are 2 open Shift Supervisor shifts on Monday"
✅ EXPECTED Response (detailed):
"Two Shift Supervisor shifts remain open on Monday (typo corrected) because:
• Frank Miller has Stock Clerk overlap (would exceed daily limit)
• David Wilson already at 30h/24h (overworked)
• Emma Brown available (0h/16h target)
→ Assign Emma Brown to cover these shifts
→ Check Bob Smith (26h/40h) for second shift"
```

## Root Cause

The LLM was calling `explain_constraint(employeeName: "Supervisor")` instead of querying `openShifts[?workTypeName contains 'Supervisor']`.

## Solution

### 1. Updated ACTION_PLAN_PROMPT

Added explicit disambiguation logic:

```typescript
CRITICAL: DISTINGUISH ROLE vs EMPLOYEE QUERIES:
❌ WRONG: "Why are Supervisor shifts not assigned?" → explain_constraint(employeeName: "Supervisor")
✅ RIGHT: "Why are Supervisor shifts not assigned?" → Check openShifts[?workTypeName contains 'Supervisor']
✅ RIGHT: "Why can't assign Frank to Supervisor?" → explain_constraint(employeeName: "Frank", roleName: "Supervisor")

When user asks "why [ROLE] shifts not assigned":
1. Use eval_query to find: openShifts[?contains(workTypeName, '[ROLE]')]
2. Count open shifts for that role
3. Explain: "There are X open [ROLE] shifts on [DAYS]. They need employees assigned."
4. Suggest: Check which employees can fulfill this role
```

### 2. Intent Detection Patterns

| Query Pattern | Intent | Tool |
|--------------|--------|------|
| "Why can't assign **Frank Miller** to X?" | Employee constraint | `explain_constraint` |
| "Why are **Supervisor shifts** not assigned?" | Role inquiry | `eval_query` (openShifts) |
| "Why is **Monday Cashier shift** open?" | Role inquiry | `eval_query` (openShifts) |
| "Can **Bob** work Supervisor on Monday?" | Employee constraint | `explain_constraint` |

**Detection Logic:**
- Contains employee name (proper noun, first + last)? → `explain_constraint`
- Pattern "why [ROLE] shifts not assigned"? → `eval_query` (openShifts)
- Pattern "why can't assign [NAME]"? → `explain_constraint`

### 3. Response Templates

**Role Inquiry (openShifts):**
```
There are X open [ROLE] shifts on [DAYS].
• Monday: 08:00-16:00, 12:00-20:00
• Tuesday: 12:00-20:00
→ Suggested employees: Bob Smith (26h/40h), Emma Brown (0h/16h)
→ Use explain_constraint to check specific assignments
```

**Employee Constraint (explain_constraint):**
```
Frank Miller CANNOT be assigned to Supervisor on Monday.
• Already has Stock Clerk assignment (overlap)
• Would exceed daily limit (14h total)
→ Remove existing Monday assignment first
→ Consider other employees for this shift
```

## Testing

### Test Query 1 (Working)
**Input:** "why can't assign Frank Miller on the supervisor shift on monday?"  
**Expected:** explain_constraint → "Frank CANNOT (overlap + daily limit)"  
**Status:** ✅ WORKING

### Test Query 2 (Fixed)
**Input:** "why Supervisor shifts are not assigned on monday?"  
**Expected:** eval_query → "2 open Shift Supervisor shifts on Monday"  
**Status:** ✅ FIXED (prompt updated)

### Test Query 3 (Fixed)
**Input:** "why shift supervisoer are not assigned on monday?" (typo)  
**Expected:** eval_query with fuzzy match → "2 open Shift Supervisor shifts"  
**Status:** ✅ FIXED (entity resolver handles typo, prompt clarifies intent)

## Implementation Details

### Updated Prompt Section
**File:** `src/app/api/chat/route.ts`  
**Lines:** ~65-105 (ACTION_PLAN_PROMPT)

**Changes:**
1. Added "CRITICAL: DISTINGUISH ROLE vs EMPLOYEE QUERIES" section
2. Provided explicit ❌ WRONG / ✅ RIGHT examples
3. Added step-by-step guide for role queries with root cause analysis
4. Added "EXAMPLE" section showing BAD vs GOOD responses
5. Template now requires analyzing WHY shifts remain unassigned (conflicts, overwork, availability)
6. Must suggest specific employees with hours data

### No Code Changes Required
The entity resolver already handles fuzzy role matching. The fix is entirely **prompt engineering** to teach the LLM correct tool selection.

## Expected Behavior After Fix

```bash
# Query 1: Employee constraint (already working)
User: "why can't assign Frank Miller on the supervisor shift on monday?"
LLM: explain_constraint(employeeName: "Frank Miller", roleName: "supervisor", day: "monday")
Response: "❌ Frank Miller CANNOT be assigned (overlap + daily limit)"

# Query 2: Role inquiry (now provides root cause analysis)
User: "why Supervisor shifts are not assigned on monday?"
LLM: eval_query("openShifts[?contains(workTypeName, 'Supervisor') && day=='MON']")
     + Analyze each employee for conflicts/availability
Response: "Two Supervisor shifts remain open on Monday because:
• Frank Miller has Stock Clerk overlap (would exceed daily limit)
• David Wilson overworked (30h/24h)
• Emma Brown available (0h/16h)
→ Assign Emma Brown
→ Check Bob Smith (26h/40h)"

# Query 3: Role inquiry with typo (entity resolver + root cause)
User: "why shift supervisoer are not assigned on monday?"
LLM: eval_query("openShifts[?contains(workTypeName, 'Supervisor') && day=='MON']")
     + entity resolver handles "supervisoer" → "Shift Supervisor"
     + Analyze constraints for each employee
Response: "Two Shift Supervisor shifts remain open (typo corrected) because:
• Frank Miller has overlap conflict
• David Wilson overworked
• Emma Brown, Bob Smith available
→ Assign Emma (0h/16h) or Bob (26h/40h)"
```

## Key Principle

**Never let the LLM confuse role names with employee names.**

- Role names appear in `openShifts[].workTypeName` and `assignments[].workTypeName`
- Employee names appear in `employees[].name` with unique IDs
- When user says "why [X] shifts not assigned", X is always a ROLE, never an EMPLOYEE

This is now explicitly taught in the ACTION_PLAN_PROMPT with concrete examples.
