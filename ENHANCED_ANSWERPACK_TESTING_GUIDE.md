# Enhanced AnswerPack Assistant - Multilingual Testing Guide

## Overview

The enhanced AnswerPackAssistant now includes:
- **Multilingual I/O**: Understands and responds in EN/FR/NL
- **Smart aliases**: "Bob" → Bob Smith, "Fri" → Friday/Vendredi
- **Conversation memory**: Remembers selected entities per thread
- **Disambiguation**: Asks clarifying questions when needed
- **Entity resolution**: Fuzzy name matching with nicknames

## How to Enable

1. Set up your Azure OpenAI credentials in `.env.local`:
   ```bash
   AZURE_OPENAI_API_KEY=your_key
   AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
   AZURE_OPENAI_DEPLOYMENT_NAME=your-deployment-name
   ```

2. Enable the enhanced assistant:
   ```bash
   NEXT_PUBLIC_ANSWERPACK_ASSISTANT=true
   ```

3. Restart the dev server:
   ```powershell
   npm run dev
   ```

## Test Scenarios

### 1. Multilingual Input/Output

**English Query:**
```
Who can work Cashier on Friday?
```
Expected: Response in English with standard section headers.

**French Query:**
```
Qui peut travailler Caissier vendredi?
```
Expected: Response in French with localized section headers (Portée, Hypothèses, Sources, Réponse).

**Dutch Query:**
```
Wie kan Kassier werken op vrijdag?
```
Expected: Response in Dutch with localized section headers (Bereik, Aannames, Bronnen, Antwoord).

### 2. Smart Day Aliases

**English abbreviations:**
```
Who's available Fri evening?
```

**French abbreviations:**
```
Qui est disponible vend soir?
```

**Dutch abbreviations:**
```
Wie is beschikbaar vr avond?
```

Expected: All should recognize the day and time period correctly.

### 3. Employee Name Resolution & Disambiguation

**Unique match:**
```
Is Bob available Monday?
```
Expected: If only one "Bob" exists, auto-resolves and shows full name in scope.

**Multiple matches:**
```
Is Bob available Monday?
```
Expected: If multiple "Bob"s exist, shows disambiguation question:
```
I found 3 employees named 'Bob'. Which one do you mean?
1. Bob Smith (Brussels Center)
2. Robert Dubois (Antwerp North)  
3. Bob Martins (Ghent West)

Reply with the number or full name.
```

**Nickname resolution:**
```
Is Bill working Friday?
```
Expected: Should find "William" if that's the full name in database.

### 4. Conversation Memory

**First question:**
```
Is Bob available Monday?
```
*[Select Bob Smith from disambiguation]*

**Follow-up question:**
```
And on Tuesday?
```
Expected: Should remember Bob Smith and check his Tuesday availability without re-asking.

**Another follow-up:**
```
What about Alice on Tuesday?
```
Expected: Should switch context to Alice, remember for future questions.

### 5. Date Context & Ambiguity

**Ambiguous week context:**
```
Who's available Friday?
```
Expected: If no week context and both current/next weeks have schedules:
```
Do you mean this week (2025-10-20 → 2025-10-26) or next week (2025-10-27 → 2025-11-02)?
```

**Explicit week context:**
```
Who's available next Friday?
```
Expected: Should resolve to next week's Friday without asking.

### 6. Time Window Recognition

**Explicit times:**
```
Who can work 14:00-18:00 on Friday?
```

**Daypart recognition:**
```
Who's free Friday morning?
```
Expected: Should interpret as 08:00-12:00 time window.

**Multilingual dayparts:**
```
Qui est libre vendredi matin?  (French)
Wie is vrij vrijdag ochtend?   (Dutch)
```

### 7. Cross-Store Logic

**Single store (default):**
```
Who can work Security on Monday?
```
Expected: Only shows employees from current store.

**Cross-store enabled:**
*Toggle "Include other stores" checkbox*
```
Who can work Security on Monday?
```
Expected: Shows employees from all manager's stores, indicates store names.

### 8. Work Type Resolution

**Exact match:**
```
Who can work Cashier on Friday?
```

**Fuzzy match:**
```
Who can work Cash on Friday?
```
Expected: Should suggest "Did you mean: Cashier?"

**Unknown work type:**
```
Who can work Guard on Friday?
```
Expected: "No work type named 'Guard'. Available types: Security, Cashier, ..."

### 9. Missing Data Handling

**No schedule:**
```
What's scheduled for next week?
```
Expected: "No Published schedule for weekStart=YYYY-MM-DD. Generate or publish a schedule first."

**No employees with role:**
```
Who can work Manager on Friday?
```
Expected: Clear message about no employees with that role.

## Validation Checklist

For each test, verify:

- [ ] **Language detection**: Response language matches input language
- [ ] **Section headers**: Localized (Scope/Portée/Bereik, etc.)
- [ ] **Entity resolution**: Names, days, times correctly parsed
- [ ] **Memory persistence**: Follow-up questions use previous context
- [ ] **Disambiguation flow**: Clear options, processes responses correctly
- [ ] **Cross-store respect**: Honors toggle setting
- [ ] **Performance**: < 3 seconds total response time
- [ ] **Metadata**: Shows language, threadId, disambiguation status

## UI Indicators

Check for these visual indicators:

- **Language badge**: Shows detected language (EN/FR/NL)
- **Disambiguation badge**: Yellow "Needs Clarification" when asking for clarification
- **Thread ID**: Partial thread ID shown in metadata
- **Conversation history**: Recent questions shown above current response
- **Multilingual examples**: Example buttons in multiple languages

## Performance Expectations

- **Language detection**: < 10ms (local processing)
- **Entity resolution**: 50-200ms (database queries)
- **Fetch time**: 200-500ms (same as before)
- **LLM time**: 1000-2500ms (slightly higher due to multilingual prompt)
- **Total time**: < 3 seconds

## Troubleshooting

**Language not detected correctly:**
- Check if input has enough language indicators
- Try more explicit language-specific words

**Disambiguation not working:**
- Verify multiple employees with similar names exist
- Check console logs for resolution process

**Memory not persisting:**
- Verify threadId is being generated and passed
- Check that follow-up questions use same thread

**Cross-store not working:**
- Verify manager has multiple stores
- Check that toggle state is being passed to API

## Advanced Test Cases

### Mixed Language Conversation
```
Q1: "Who can work Friday?" (English)
Q2: "Et samedi?" (French - "And Saturday?")
```
Expected: Should maintain context but respond in French for Q2.

### Complex Entity Resolution
```
"Is Bob from Brussels available Friday morning for Security?"
```
Expected: Should resolve store context, employee, day, time, and work type.

### Relative Date Handling
```
"Who's working tomorrow?" (asked on Thursday)
```
Expected: Should resolve to Friday of current week.

### Nickname + Store Context
```
"Is Bill from the downtown store available?"
```
Expected: Should find William in the specified store.

## Comparison with Basic Version

| Feature | Basic AnswerPack | Enhanced AnswerPack |
|---------|------------------|---------------------|
| Languages | English only | EN/FR/NL |
| Name resolution | Exact match | Fuzzy + nicknames |
| Disambiguation | None | Interactive |
| Memory | None | Per-thread |
| Date parsing | Limited | Smart aliases |
| Time parsing | Basic | Multilingual dayparts |
| Entity context | None | Persistent |

## Success Criteria

✅ **Multilingual**: Correctly detects and responds in user's language
✅ **Smart aliases**: Recognizes common abbreviations and nicknames  
✅ **Memory**: Maintains context across conversation
✅ **Disambiguation**: Asks clarifying questions when needed
✅ **Performance**: Maintains < 3 second response times
✅ **Accuracy**: Same data accuracy as basic version
✅ **UX**: Clear indicators for language, disambiguation, memory state

## Next Steps After Testing

1. **Tune language detection** based on real usage patterns
2. **Expand nickname database** with company-specific names
3. **Add more daypart variations** (lunch, night shift, etc.)
4. **Implement caching** for frequently accessed entities
5. **Add conversation export** functionality
6. **Integrate with company directory** for better name resolution
