# AI Assistant Fix: "Bob hours" Query Issue

## Problem
Users were seeing unhelpful error messages when asking simple questions like "bob hours":

```
Unable to calculate Bob's hours directly due to a tool error.
• Bob Smith is confirmed as an employee in this store.
• His scheduled hours need manual review from assignments[] data.
→ Review Bob's assignments manually for accurate hours.
→ Retry query later or contact support for tool assistance.
```

## Root Cause
The LLM was:
1. Not using the right JMESPath queries to retrieve data
2. Not handling tool errors gracefully
3. Exposing technical errors to users instead of providing helpful answers
4. Not converting minutes to hours for display

## Fixes Applied

### 1. Enhanced System Prompts (`BASE_PROMPT`)
- Added explicit instruction: "ALWAYS provide a clear answer even if a tool fails - use available data to give your best response"
- This prevents the LLM from giving up when a tool returns an error

### 2. Improved Action Plan (`ACTION_PLAN_PROMPT`)
Added concrete query patterns with examples:
```typescript
COMMON QUERY PATTERNS (JMESPath syntax):
- Employee hours: employees[?name=='Bob Smith'] | [0].weeklyMinutes
- Employee assignments: assignments[?employeeId=='<id>']
- Calculate hours from assignments: sum(assignments[?employeeId=='<id>'].durationMins)
- Count open shifts: length(openShifts)
- Find by day: assignments[?day=='MON']
```

Added error handling guidance:
```typescript
ERROR HANDLING:
- If eval_query fails, try a simpler query or answer from what you know
- If find_employee fails, suggest the user check the employee name spelling
- Never tell users to "contact support" - always provide the best answer possible
```

### 3. Enhanced Data Dictionary (`DATA_DICTIONARY_PROMPT`)
Added time conversion instructions:
```typescript
TIME CONVERSIONS:
- weeklyMinutes and durationMins are in MINUTES - always convert to hours for user display
- To convert: hours = minutes / 60 (e.g., 1560 minutes = 26 hours)
- When displaying hours, use format like "26 hours" or "26.0 hours", not "1560 minutes"

EMPLOYEE HOURS:
- Use weeklyMinutes from employees[] array for current scheduled hours
- Use weeklyMinutesTarget for their target/contracted hours
- Calculate delta: weeklyMinutes - weeklyMinutesTarget to show if under/over target
```

### 4. Improved Tool Descriptions
Updated `eval_query` tool description:
```typescript
description: "Execute a deterministic JMESPath query against the schedule snapshot. Use for filtering, projections, aggregations. Max 300 chars, <50ms timeout. Returns {ok, result, error}."

parameters.expr.description: "JMESPath expression (max 300 chars). Examples: 'employees[?name==\`Alice\`]', 'sum(assignments[*].durationMins)', 'length(openShifts)'"
```

### 5. Enhanced Error Handling for `eval_query`
```typescript
// Enhance error messages to guide the LLM
if (!result.ok && result.error) {
  const enhancedError = {
    ...result,
    error: result.error,
    hint: "Try a simpler query or answer from available summary data. Don't tell users about technical errors.",
  };
  conversation.push({
    role: "tool",
    tool_call_id: toolCall.id,
    content: JSON.stringify(enhancedError),
  });
}
```

### 6. Enhanced Error Handling for `find_employee`
```typescript
// Enhance empty results with helpful message
if (result.ok && (!result.employees || result.employees.length === 0)) {
  conversation.push({
    role: "tool",
    tool_call_id: toolCall.id,
    content: JSON.stringify({
      ...result,
      hint: `No employees found matching "${query}". Check spelling or try a different name.`,
    }),
  });
}
```

Added catch block enhancement:
```typescript
catch (error) {
  conversation.push({
    role: "tool",
    tool_call_id: toolCall.id,
    content: JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : "Search failed",
      hint: "Employee search unavailable. Try using exact names from the employees list.",
    }),
  });
}
```

### 7. Improved Retry Logic Reminder
Updated the reminder message when LLM doesn't use tools:
```typescript
"Reminder: You can call tools if needed (eval_query, find_employee). For employee hours questions, use: employees[?name=='Full Name'] | [0].weeklyMinutes. For simple questions, answer directly. Keep response ≤8 lines."
```

## Expected Behavior Now

When a user asks "bob hours", the LLM should:

1. **Call find_employee** with query "bob"
   - Response: `{ok: true, employees: [{id: "...", name: "Bob Smith", ...}]}`

2. **Call eval_query** with expression: `employees[?id=='<bob-id>'] | [0].weeklyMinutes`
   - Response: `{ok: true, result: 1560, metrics: {...}}`

3. **Generate user-friendly response**:
   ```
   Bob Smith is scheduled for 26 hours this week
   • Currently has 1560 minutes (26 hours) of shifts assigned
   • Target: 40 hours (2400 minutes)
   • Needs 14 more hours to reach target
   → Review Bob Smith's schedule in the assignments view
   ```

## Testing

Run the test script to verify:
```bash
npx tsx scripts/test-chat-bob-hours.ts
```

This simulates the full flow:
- Building schedule facts
- Calling find_employee
- Calling eval_query
- Formatting the response

## Key Improvements

1. ✅ **No more "contact support" messages** - LLM always provides best answer
2. ✅ **No more "tool error" exposure** - Technical errors are hidden from users
3. ✅ **Clear query examples** - LLM knows exactly which queries to use
4. ✅ **Automatic hour conversion** - Minutes are always converted to hours
5. ✅ **Graceful error handling** - Fallback strategies when tools fail
6. ✅ **Better context** - Enhanced hints guide LLM to better responses

## Related Files

- `src/app/api/chat/route.ts` - Main chat API route (prompts, tool handling)
- `src/server/schedule/eval-query.ts` - JMESPath query execution
- `src/server/schedule/find-employee.ts` - Employee search
- `src/server/schedule/minimal-snapshot.ts` - Snapshot building
- `scripts/test-chat-bob-hours.ts` - Test script for verification
- `scripts/test-bob-hours.ts` - Low-level query testing

## Monitoring

The chat metrics will now show:
- Successful queries with fast response times
- Proper tool usage (find_employee → eval_query → response)
- No errors exposed to users
- Clean, helpful responses under 8 lines
