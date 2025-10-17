# Context Drift Fix - Final Solution

## Problem
After implementing the state machine, the AI was still losing context:

```
User: "assign bob on wed sales associate"
AI: Lists 2 shifts (morning ✓, afternoon ✗)
User: "morning"
AI: "Morning is a time frame, but I need more details..." ❌
```

## Root Cause
The conversation state was locked on the **backend** but the **AI didn't have access to it**. The AI couldn't see:
- Which employee was locked
- Which day/role was locked  
- What shiftIds were available for each candidate

## Solution

### 1. Return Locked Context in Tool Result
Modified `handleAnalyzeCandidates` to include the locked context in the response:

```typescript
return {
  ok: true,
  data: {
    candidateCount: 2,
    lockedContext: {           // ← NEW: AI can see locked context
      employeeId: "cmgo4...",
      employeeName: "Bob Smith",
      day: "WED",
      role: "Sales Associate",
      storeId: "...",
      weekId: "..."
    },
    candidates: [
      {
        shiftId: "template-123-WED",  // ← Specific ID for morning
        templateId: "template-123",
        label: "Morning (09:00-15:00)",
        startTime: "09:00",
        endTime: "15:00",
        durationHours: 6,
        fits: true,
        reason: undefined
      },
      {
        shiftId: "template-456-WED",  // ← Specific ID for afternoon
        templateId: "template-456",
        label: "Afternoon (15:00-20:00)",
        startTime: "15:00",
        endTime: "20:00",
        durationHours: 5,
        fits: false,
        reason: "Shift ends at 20:00 but availability ends at 19:00"
      }
    ]
  },
  message: "I found 2 Sales Associate shifts on Wednesday for Bob Smith:\n\n..."
}
```

### 2. Updated System Prompt
Added explicit workflow instructions in `PREVIEW_SYSTEM_PROMPT`:

```
Step 3: User selects (e.g., "morning" or "1" or "first")
- The locked context is in the tool result from analyze_shift_candidates
- The result.data.lockedContext contains: {employeeId, employeeName, day, role, storeId, weekId}
- The result.data.candidates contains the shiftIds for each option
- Map user's selection to the specific candidate:
  * "morning" → Find candidate where label contains "Morning"
  * "1" or "first" → Use candidates[0]
  * "afternoon" → Find candidate where label contains "Afternoon"
- Get the shiftId from the selected candidate

Step 4: Call create_preview with the specific shiftId
- Use the employeeId from lockedContext
- Use the shiftId from the selected candidate
```

### 3. Clear Instructions for AI
```
CRITICAL: When user responds with "morning"/"afternoon"/"1"/"first" after you listed options:
- DO NOT ask for clarification
- DO NOT ask for employee/day/role again
- The context is LOCKED from analyze_shift_candidates
- Map their selection to the shiftId
- Call create_preview immediately
```

## Expected Flow After Fix

```
User: "assign bob on wed sales associate"
  ↓
AI: Calls analyze_shift_candidates({employeeId, day: "WED", role: "Sales Associate"})
  ↓
Tool Returns:
  {
    data: {
      lockedContext: {employeeId: "...", employeeName: "Bob Smith", day: "WED", role: "Sales Associate"},
      candidates: [
        {shiftId: "template-123-WED", label: "Morning (09:00-15:00)", fits: true},
        {shiftId: "template-456-WED", label: "Afternoon (15:00-20:00)", fits: false, reason: "..."}
      ]
    }
  }
  ↓
AI: "I found 2 Sales Associate shifts on Wednesday for Bob Smith:
     1. Morning (09:00-15:00) ✓ Fits availability
     2. Afternoon (15:00-20:00) ✗ Ends at 20:00, Bob ends at 19:00
     Which shift would you like to assign?"
  ↓
User: "morning"
  ↓
AI: (Looks at previous tool result)
    - lockedContext.employeeId = "cmgo4..."
    - candidates[0].shiftId = "template-123-WED"
    - candidates[0].label contains "Morning"
  ↓
AI: Calls create_preview({
      operations: [{
        type: "assign_shift",
        employeeId: "cmgo4...",           // From lockedContext
        shiftId: "template-123-WED",      // From selected candidate
        reason: "Fits availability"
      }],
      explanation: "Assigning Bob Smith to Wednesday Morning Sales Associate shift"
    })
  ↓
Success: Preview created ✅
```

## Files Modified

1. **src/server/preview/llm-handlers.ts**
   - Added `lockedContext`, `templateId`, `durationHours` to analyze_candidates result
   - AI now has full context and candidate details

2. **src/server/preview/llm-tools.ts**
   - Updated DETERMINISTIC SELECTION PROCESS section
   - Added explicit mapping instructions (morning → label match, 1 → index 0)
   - Added CRITICAL warning to not ask for clarification

## Testing

Try this conversation:
```
User: "assign bob on wed sales associate"
Expected: AI lists 2 shifts with status

User: "morning"
Expected: AI creates preview with morning shift (NO clarification request)

User: "apply"
Expected: Changes committed to database
```

Alternative selections that should work:
- "1" → First candidate
- "first" → First candidate
- "afternoon" → Candidate with "Afternoon" in label
- "the 9-15 one" → Fuzzy match on time

## Why This Works

**Before**: AI had no way to know what context was locked. Backend stored it, but AI couldn't see it.

**After**: AI receives the locked context and candidates in the tool result, so it can:
1. See which employee/day/role is locked
2. Map user's selection to the specific shiftId
3. Call create_preview with the correct IDs
4. Never ask for clarification on already-locked context

The conversation state on the backend is still used for:
- Resolving fuzzy matches ("morning" → specific shiftId)
- Preventing expired contexts (10min TTL)
- Tracking pending previews

But the AI now has **immediate access** to the locked context in the tool response, so it can make decisions without guessing.
