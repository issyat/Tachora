# AnswerPack Assistant - Testing Guide

## Overview
The AnswerPack Assistant is a new Q&A system that:
- Fetches all data in a single operation (employees, schedules, assignments, hours, unassigned counts)
- Uses GPT-4 to reason over the JSON data
- Returns answers in a consistent 4-section format: Scope / Assumptions / Sources / Answer

## How to Enable

1. Your Azure OpenAI credentials should already be set in `.env.local`:
   ```bash
   AZURE_OPENAI_API_KEY=your_key
   AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
   AZURE_OPENAI_DEPLOYMENT_NAME=your-deployment-name
   ```
   (These are the same credentials used by your existing assistant)

2. Enable the AnswerPack Assistant in `.env.local`:
   ```bash
   NEXT_PUBLIC_ANSWERPACK_ASSISTANT=true
   ```

3. Restart the Next.js dev server:
   ```powershell
   npm run dev
   ```

4. Navigate to the Schedule page - you should see the AnswerPack Assistant interface

## Test Queries

### 1. Availability Queries

**Basic availability:**
```
Who can work Cashier on Friday?
```

**Expected answer format:**
```
**Scope**
Looking at Store A for week 2025-10-20 to 2025-10-26. Filtered by work type: Cashier.

**Assumptions**
- Checking employees with Cashier role
- Considering availability windows for Friday

**Sources**
Used: employees (roles, availability), assignments

**Answer**
3 employees can work Cashier on Friday:
1. Alice Johnson - Available 08:00-22:00
2. Bob Smith - Available 10:00-18:00
3. Emma Brown - Available all day
```

**With time window:**
```
Who is available Friday evening for Security?
```

**Cross-store:**
- Toggle "Include other stores" checkbox
- Ask: "Who can work Security on Monday?"

### 2. Hours and Targets

**Under target:**
```
Who is under their weekly target?
```

**Expected answer:**
```
**Scope**
Looking at Store A for week 2025-10-20 to 2025-10-26.

**Assumptions**
- "Under target" means scheduled hours < weekly target
- Counting only Published schedules

**Sources**
Used: employees (weeklyMinutesTarget), assignments (durationMinutes)

**Answer**
3 employees are under target:
1. Alice - 20 hours scheduled / 30 target = 10 hours short
2. Carol - 16 hours scheduled / 20 target = 4 hours short
3. Frank - 0 hours scheduled / 25 target = 25 hours short
```

**Over target:**
```
Who is working more than their target this week?
```

**Specific employee:**
```
How many hours is Alice scheduled this week?
```

### 3. Unassigned Shifts (Coverage Gaps)

**All unassigned:**
```
Show unassigned shifts this week
```

**By work type:**
```
What Shift Supervisor shifts are unassigned?
```

**By day:**
```
What's unassigned on Friday?
```

**Expected answer:**
```
**Scope**
Looking at Store A for week 2025-10-20 to 2025-10-26.

**Assumptions**
- Counting shifts with no employee assigned
- Including all work types

**Sources**
Used: assignments, schedules

**Answer**
4 unassigned shifts:
1. Monday - Security 08:00-16:00 (8 hours)
2. Friday - Cashier 14:00-22:00 (8 hours)
3. Friday - Shift Supervisor 08:00-16:00 (8 hours)
4. Saturday - Stock Clerk 06:00-14:00 (8 hours)

Total: 32 hours unassigned
```

### 4. Schedule State

**No schedule:**
```
What's scheduled for next week?
```

**Expected answer:**
```
**Scope**
Looking at Store A for week 2025-10-27 to 2025-11-02.

**Assumptions**
None - no data available for requested week.

**Sources**
Used: schedules

**Answer**
No schedule found for week 2025-10-27 to 2025-11-02. The schedule may not be published yet.
```

## Validation Checklist

For each test query, verify:

- [ ] **Format**: Answer has all 4 sections (Scope, Assumptions, Sources, Answer)
- [ ] **Accuracy**: Data matches what you see in the UI/database
- [ ] **Scope**: Respects store filtering (single store vs include others)
- [ ] **Time handling**: "this week" shows absolute date range
- [ ] **Work type filtering**: Only shows employees with the correct role
- [ ] **Hours calculation**: Matches sum of assignment durations
- [ ] **Missing data**: Explicitly states when data is missing
- [ ] **Performance**: Check metadata - fetch + LLM time should be < 3 seconds

## Performance Metrics

After each query, expand "Performance & Data Stats" to see:

- **Timing**: Fetch time + LLM time = Total time
- **Data Size**: JSON payload size in KB
- **Records**: Count of employees, schedules, assignments, unassigned
- **Sources**: DB entities used
- **Fetched**: Timestamp of data fetch

Expected performance:
- Fetch: 200-500ms (depending on data size)
- LLM: 1000-2000ms (GPT-4o-mini)
- Total: < 3 seconds

## Known Limitations

1. **Published schedules only**: Only queries Published schedules, not Drafts
2. **Max data limits**: 250 employees, 1000 assignments
3. **Read-only**: Cannot create/modify schedules (by design)
4. **Current week**: Best for current/recent weeks with published schedules
5. **Single week**: Only queries one week at a time

## Troubleshooting

**"Unauthorized" error:**
- Check Clerk authentication is working
- Verify you're logged in

**"Context (storeId, isoWeek) is required" error:**
- Make sure you're on a valid schedule page
- Check that a schedule exists for the current week

**LLM returns invalid format or errors:**
- Verify AZURE_OPENAI_API_KEY is set correctly in .env.local
- Verify AZURE_OPENAI_ENDPOINT is correct
- Verify AZURE_OPENAI_DEPLOYMENT_NAME matches your deployment
- Review console logs for LLM errors
- Check that your Azure OpenAI deployment has sufficient quota

**Data mismatch with UI:**
- Check which schedule state is shown (Published vs Draft)
- Verify cross-store toggle matches your expectation

## Comparison with Old System

| Feature | AnswerPack Assistant | Old ScheduleCopilotAssistant |
|---------|---------------------|------------------------------|
| Data fetches | 1 (all at once) | Multiple (on-demand) |
| Response format | Consistent 4 sections | Varies |
| Reasoning | LLM over JSON | Mix of DB + LLM |
| Performance | Predictable | Varies |
| Scope visibility | Always shown | Not always clear |
| Missing data | Explicit | Sometimes unclear |

## Switching Back

To disable AnswerPack Assistant and use the old system:

1. Edit `.env.local`:
   ```bash
   NEXT_PUBLIC_ANSWERPACK_ASSISTANT=false
   ```

2. Restart dev server

## Feedback

When testing, note:
- Which queries work well
- Which queries produce incorrect/unclear answers
- Performance issues
- UI/UX improvements
- Missing features
