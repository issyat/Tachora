# LLM-Based AnswerPack Assistant - Testing Guide

## Overview

The new AnswerPackAssistant uses a clean LLM-based architecture:
- **One tool**: `fetch_manager_context` - LLM calls this to get data
- **Smart LLM**: Handles language detection, entity resolution, disambiguation, and reasoning
- **Simple memory**: Stores language, selected employee, cross-store preference, week context
- **Grounded answers**: Only uses fetched data, never hallucinates

## Architecture

```
User Question (any language)
    ↓
LLM with System Prompt
    ├─ Detects language (EN/FR/NL)
    ├─ Parses entities (names, dates, work types)
    ├─ Handles disambiguation ("Which Bob?")
    └─ Calls fetch_manager_context tool
    ↓
AnswerPack Data Fetched
    ↓
LLM Reasons Over Data
    ↓
4-Section Localized Response
    ↓
Memory Updated & Response Returned
```

## How to Enable

1. Set up Azure OpenAI credentials in `.env.local`:
   ```bash
   AZURE_OPENAI_API_KEY=your_key
   AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
   AZURE_OPENAI_DEPLOYMENT_NAME=your-deployment-name
   ```

2. Enable the assistant:
   ```bash
   NEXT_PUBLIC_ANSWERPACK_ASSISTANT=true
   ```

3. Restart dev server:
   ```powershell
   npm run dev
   ```

## Test Scenarios

### 1. Multilingual Detection & Response

**English:**
```
Who can work Cashier on Friday?
```
Expected: Response in English with "Scope/Assumptions/Sources/Answer" headers.

**French:**
```
Qui peut travailler Caissier vendredi?
```
Expected: Response in French with "Portée/Hypothèses/Sources/Réponse" headers.

**Dutch:**
```
Wie kan Kassier werken op vrijdag?
```
Expected: Response in Dutch with "Bereik/Aannames/Bronnen/Antwoord" headers.

### 2. Smart Day/Time Aliases

**Day abbreviations:**
```
Who's available Fri evening?
Qui est disponible vend soir?
Wie is beschikbaar vr avond?
```
Expected: LLM recognizes "Fri"/"vend"/"vr" as Friday and "evening"/"soir"/"avond" as 16:00-22:00.

**Relative dates:**
```
Who's working tomorrow?
Qui travaille demain?
Wie werkt morgen?
```

### 3. Employee Name Resolution

**Unique name:**
```
Is Bob available Monday?
```
Expected: If only one Bob, auto-resolves and shows full name in scope.

**Multiple matches:**
```
Is Bob available Monday?
```
Expected: LLM asks: "I found 3 employees named 'Bob'. Which one? 1. Bob Smith (Store A) 2. Robert Jones (Store B)..."

**Nicknames:**
```
Is Bill working Friday?
```
Expected: LLM finds "William" if that's the database name.

**No matches:**
```
Is Xyz available?
```
Expected: "No employee named 'Xyz'. Did you mean: Alice, Bob, Carol?"

### 4. Conversation Memory

**First question:**
```
Is Bob available Monday?
```
*[LLM disambiguates, user selects Bob Smith]*

**Follow-up:**
```
And on Tuesday?
```
Expected: LLM remembers Bob Smith, checks his Tuesday availability.

**Context switch:**
```
What about Alice on Tuesday?
```
Expected: LLM switches to Alice, updates memory.

### 5. Date Ambiguity Handling

**Ambiguous week:**
```
Who's available Friday?
```
Expected: If both current/next weeks have schedules, LLM asks: "Do you mean this week (2025-10-20 → 2025-10-26) or next week (2025-10-27 → 2025-11-02)?"

**Clear context:**
```
Who's available next Friday?
```
Expected: LLM resolves to next week without asking.

### 6. Work Type & Time Windows

**Exact work type:**
```
Who can work Security on Monday?
```

**Fuzzy work type:**
```
Who can work Sec on Monday?
```
Expected: LLM suggests "Did you mean: Security?"

**Time windows:**
```
Who's free 14:00-18:00 on Friday?
Who's available Friday afternoon?
```
Expected: LLM handles both explicit times and daypart mapping.

### 7. Cross-Store Logic

**Single store (default):**
```
Who can work Monday?
```
Expected: Only current store employees.

**Cross-store request:**
```
Who can work Monday across all stores?
```
*Or toggle "Include other stores" checkbox*
Expected: Shows employees from all manager's stores with store names.

### 8. Missing Data Scenarios

**No schedule:**
```
What's scheduled for next week?
```
Expected: "No Published schedule for week 2025-10-27. Generate or publish a schedule first."

**No employees with role:**
```
Who can work Manager on Friday?
```
Expected: Clear message about no available employees.

## What the LLM Should Handle

### Language Detection
- Automatically detect EN/FR/NL from question
- Respond in same language
- Use appropriate section headers

### Entity Parsing
- Days: "Fri", "vendredi", "vrijdag" → Friday
- Times: "morning", "matin", "ochtend" → 08:00-12:00
- Names: Partial names, nicknames, fuzzy matching
- Work types: Exact and fuzzy matching

### Disambiguation
- Multiple employees → List with numbers
- Ambiguous dates → Ask with date ranges
- Unknown work types → Suggest alternatives

### Memory Usage
- Remember selected employee across questions
- Maintain language preference
- Keep cross-store setting
- Update work type filters

### Grounding
- Only use data from fetch_manager_context
- State missing data explicitly
- Never speculate or hallucinate
- Show absolute date ranges

## Validation Checklist

For each test:

- [ ] **Language**: Response matches input language
- [ ] **Headers**: Correct localized section headers
- [ ] **Entity resolution**: Names/dates/times parsed correctly
- [ ] **Memory**: Context maintained across questions
- [ ] **Disambiguation**: Clear options when needed
- [ ] **Data accuracy**: Matches database/UI
- [ ] **Performance**: < 3 seconds total
- [ ] **Function calling**: LLM calls fetch_manager_context appropriately

## Performance Expectations

- **Language detection**: Instant (LLM handles)
- **Entity parsing**: Instant (LLM handles)
- **Function call**: 200-500ms (data fetch)
- **LLM reasoning**: 1000-2500ms
- **Total**: < 3 seconds

## Console Logs to Watch

```
🎯 [ANSWERPACK-API] Request: { question, threadId, memory }
🤖 [ANSWERPACK-LLM] Processing question with LLM...
🔧 [ANSWERPACK-LLM] Function call: { managerId, storeId, isoWeek, ... }
📦 [ANSWERPACK] Fetching data for manager: ...
✅ [ANSWERPACK-API] Response generated: { fetchTime, llmTime, totalTime }
```

## Troubleshooting

**LLM not calling function:**
- Check system prompt is clear about using the tool
- Verify function definition is correct
- Check if question needs data to answer

**Wrong language detection:**
- LLM should handle this automatically
- Try more language-specific words
- Check response headers match input

**Memory not working:**
- Verify threadId is consistent
- Check memory updates in logs
- Ensure follow-up questions reference context

**Disambiguation not working:**
- LLM should handle this in the reasoning
- Check if multiple employees actually exist
- Verify LLM asks clear questions

## Key Differences from Complex Version

| Aspect | Complex Version | LLM Version |
|--------|----------------|-------------|
| Language detection | Custom service | LLM handles |
| Entity parsing | Custom regex/rules | LLM handles |
| Name resolution | Custom fuzzy logic | LLM handles |
| Disambiguation | Custom flow | LLM handles |
| Date parsing | Custom date logic | LLM handles |
| Architecture | Multiple services | One LLM + one tool |
| Maintenance | High (custom parsers) | Low (prompt tuning) |
| Flexibility | Limited to coded rules | Natural language understanding |

## Success Criteria

✅ **Multilingual**: Detects and responds in user's language
✅ **Smart parsing**: Handles aliases, abbreviations, nicknames
✅ **Disambiguation**: Asks clarifying questions when needed
✅ **Memory**: Maintains context across conversation
✅ **Grounding**: Only uses fetched data, never hallucinates
✅ **Performance**: < 3 seconds response time
✅ **Simplicity**: Single LLM + one tool architecture

The LLM-based approach is much simpler to maintain while being more flexible and capable than custom parsing logic!