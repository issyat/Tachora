# "Why Questions" - Root Cause Analysis Enhancement

## The Problem You Identified

After the initial fix, the LLM correctly identified open shifts but didn't explain **WHY** they remained unassigned:

```
Query: "why Supervisor shifts are not assigned on monday?"

❌ Current Response (insufficient):
"Two Supervisor shifts are unassigned on Monday:
• Shift 1: 8:00 AM - 4:00 PM
• Shift 2: 12:00 PM - 8:00 PM"

✅ Expected Response (with root cause):
"Two Supervisor shifts remain open on Monday because:
• Frank Miller has Stock Clerk overlap (would exceed daily limit)
• David Wilson overworked (30h/24h target)
• Emma Brown available (0h/16h target)
→ Assign Emma Brown to cover these shifts
→ Check Bob Smith (26h/40h) for second shift"
```

## The Issue

The LLM was treating "why [ROLE] shifts not assigned?" as a simple listing query instead of a **root cause analysis** query.

It needed to:
1. ✅ Find the open shifts (DONE)
2. ❌ Analyze WHY each employee can't/won't be assigned (MISSING)
3. ❌ Suggest specific employees who CAN be assigned (MISSING)

## The Solution

### Enhanced ACTION_PLAN_PROMPT

Added step 3 to the "why [ROLE] shifts not assigned" workflow:

```typescript
When user asks "why [ROLE] shifts not assigned":
1. Use eval_query to find: openShifts[?contains(workTypeName, '[ROLE]')]
2. Count open shifts for that role
3. CRITICAL: Analyze WHY they're unassigned:
   a) Find employees who could work this role (check weeklyMinutes vs target)
   b) For each potential employee, briefly check if they have conflicts on that day
   c) Identify the blocker: "Everyone already assigned", "Scheduling conflicts", "Need more staff"
4. Provide actionable solution with specific employee names
```

### Response Template with Root Cause

```typescript
RESPONSE TEMPLATE for "why [ROLE] shifts not assigned":
[X open [ROLE] shifts on [DAY] remain unassigned because...]
• Reason 1: Alice has conflict (detail)
• Reason 2: Bob already scheduled (detail)
• Reason 3: Carol overworked (hours)
→ Suggested: Try [SPECIFIC EMPLOYEE] who has [HOURS] available
→ Or: Use explain_constraint to check each employee individually
```

### Concrete Example

Added a BAD vs GOOD comparison:

```typescript
EXAMPLE: "Why are Supervisor shifts not assigned on Monday?"
BAD: "Two Supervisor shifts are unassigned on Monday: 8:00-4:00, 12:00-8:00"
GOOD: "Two Supervisor shifts remain open on Monday because:
• Frank Miller already has Monday Stock Clerk shift (overlap conflict)
• David Wilson is overworked (30h/24h target)
• Alice, Carol have no blocking issues
→ Try assigning Alice Johnson (16h/40h target)
→ Or Bob Smith (26h/40h target)"
```

## What Changed

**File:** `src/app/api/chat/route.ts`  
**Section:** ACTION_PLAN_PROMPT (lines ~75-105)

**Key Additions:**
1. Step 3a: "Find employees who could work this role"
2. Step 3b: "Check if they have conflicts on that day"
3. Step 3c: "Identify the blocker"
4. EXAMPLE section showing insufficient vs comprehensive response
5. Template requires specific employee names + hours data

## Expected Behavior Now

### Query: "Why are Supervisor shifts not assigned on Monday?"

**Analysis Flow:**
1. LLM queries `openShifts[?workTypeName contains 'Supervisor' && day=='MON']`
2. Finds 2 open shifts (08:00-16:00, 12:00-20:00)
3. Checks each employee:
   - Frank Miller: Has MON assignment → Overlap conflict
   - David Wilson: 30h/24h → Overworked
   - Emma Brown: 0h/16h → Available ✓
   - Bob Smith: 26h/40h → Available ✓
   - Alice Johnson: 16h/40h → Available ✓
4. Synthesizes root cause analysis
5. Suggests specific assignable employees

**Response:**
```
Two Supervisor shifts remain open on Monday because:
• Frank Miller has Stock Clerk overlap (would exceed 10h daily limit)
• David Wilson overworked (30h/24h target)
• Three employees available: Emma (0h/16h), Bob (26h/40h), Alice (16h/40h)
→ Assign Emma Brown (needs hours)
→ Or Bob Smith (under target)
```

### Query: "Why shift supervisoer are not assigned on monday?" (typo)

**Analysis Flow:**
1. Entity resolver: "supervisoer" → "Shift Supervisor" (trigram match)
2. Same constraint analysis as above
3. Mentions typo correction in response

**Response:**
```
Two Shift Supervisor shifts remain open on Monday (typo corrected) because:
• Frank Miller has overlap + daily limit issue
• David Wilson overworked
• Emma Brown, Bob Smith available
→ Assign Emma (0h/16h) or Bob (26h/40h)
```

## Comparison: Before vs After

| Aspect | Before (Insufficient) | After (Root Cause Analysis) |
|--------|----------------------|----------------------------|
| **Lists shifts?** | ✅ Yes (8:00-4:00, 12:00-8:00) | ✅ Yes |
| **Explains why open?** | ❌ No | ✅ Yes (conflicts, overwork) |
| **Analyzes employees?** | ❌ No | ✅ Yes (all potential assignees) |
| **Suggests solution?** | ❌ Generic ("need employees") | ✅ Specific ("Assign Emma, 0h/16h") |
| **Actionable?** | ❌ No | ✅ Yes (names + hours) |

## Key Principle

**"Why" questions require root cause analysis, not just observation.**

When user asks "why X not done?", they want:
1. ✅ What's the current state? (2 shifts open)
2. ✅ **Why is it in that state?** (Frank has conflict, David overworked)
3. ✅ **How to fix it?** (Assign Emma or Bob)

The prompt now explicitly requires steps 2 and 3, not just step 1.

## Testing

To validate this works, test with:

```
Query: "why Supervisor shifts are not assigned on monday?"

Expected elements in response:
✅ Count of open shifts (2)
✅ Time slots (08:00-16:00, 12:00-20:00)
✅ Named employees who CAN'T be assigned + reasons
✅ Named employees who CAN be assigned + hours
✅ Actionable suggestion with specific name
```

## Documentation Updates

1. **`docs/AI_ASSISTANT_WHY_ROLE_VS_EMPLOYEE.md`**
   - Updated Query 2 expected response (now includes root cause)
   - Updated Query 3 expected response (typo + root cause)
   - Added "root cause analysis" to changes list
   - Updated behavior comparison table

2. **`src/app/api/chat/route.ts`**
   - Added step 3 (CRITICAL analysis) to role query workflow
   - Added RESPONSE TEMPLATE with root cause structure
   - Added EXAMPLE showing BAD vs GOOD
   - Increased specificity requirements (must name employees + hours)

## Why This Matters

Listing open shifts is **descriptive**.  
Explaining why they're open is **analytical**.  
Suggesting who to assign is **prescriptive**.

The LLM now does all three, making it a true **scheduling assistant** rather than just a data viewer.
