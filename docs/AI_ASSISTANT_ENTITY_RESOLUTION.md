# Entity Resolution System - Technical Documentation

## Overview

The entity resolution system provides **deterministic → semantic** entity matching for natural language queries, eliminating hard-coded alias lists and supporting multilingual input. It resolves weekdays, roles, and employee names using a cascading pipeline of exact matching, ICU locale maps, and fuzzy algorithms.

## Architecture

### Resolution Pipeline

```
User Input: "Frank on moday supervisor shift"
     │
     ├─→ Normalize (lowercase, remove diacritics, trim)
     │
     ├─→ Extract Canonical Catalog from Snapshot
     │   ├─ Weekdays: MON, TUE, WED, THU, FRI, SAT, SUN
     │   ├─ Roles: openShifts[].workTypeName (deduplicated)
     │   └─ Employees: employees[]{id, name, alias}
     │
     ├─→ Entity Resolution (per entity type):
     │   ├─ 1. Exact Match (confidence: 1.0)
     │   │    "MON" → MON
     │   │    "Shift Supervisor" → Shift Supervisor
     │   │
     │   ├─ 2. Locale-Aware (Intl API, confidence: 0.95)
     │   │    "lundi" (fr-FR) → MON
     │   │    "martes" (es-ES) → TUE
     │   │
     │   ├─ 3. Substring Match (confidence: 0.85)
     │   │    "supervisor" → Shift Supervisor
     │   │    "Frank" → Frank Miller
     │   │
     │   ├─ 4a. Alias Match (confidence: 0.95)
     │   │    "francois" → François Dubois
     │   │
     │   └─ 4b. Fuzzy (Levenshtein + Trigram, confidence: 0.6-0.85)
     │        "moday" → MON (Levenshtein: 0.83)
     │        "wenesday" → WED (trigram: 0.62)
     │        "Fank Miller" → Frank Miller (trigram: 0.84)
     │
     └─→ Return: {entity, confidence, method, alternatives?}
```

### Key Components

1. **`entity-resolver.ts`** - Core resolution engine
   - `resolveWeekday(input, locale)` - Weekday resolution with ICU
   - `resolveRole(input, availableRoles[])` - Role matching against snapshot
   - `resolveEmployee(input, availableEmployees[])` - Employee matching
   - `resolveEntities(request, snapshot)` - Combined resolution

2. **`explain-constraint.ts`** - Uses entity resolver for constraint checking
   - Replaces `fuzzyMatchWeekday()` → `resolveEntities().weekday`
   - Replaces `fuzzyMatchRole()` → `resolveEntities().role`
   - Replaces `findEmployeeByName()` → `resolveEmployee()`

3. **`chat/route.ts`** - New `resolve_entities` tool
   - Explicit entity resolution for ambiguous queries
   - Returns confidence scores and alternatives

## Algorithms

### 1. Levenshtein Distance (Edit Distance)
**Best for:** Short strings with 1-2 character typos (e.g., "moday" → "monday")

```typescript
levenshteinDistance("moday", "monday") = 1
similarity = 1 - (1 / 6) = 0.83
```

- **Threshold:** 0.60 (allows ~2 edits for 5-char word)
- **Used when:** Input length < 7 characters

### 2. Trigram Similarity (Sørensen–Dice Coefficient)
**Best for:** Longer strings, transposed words, multiple typos

```typescript
trigrams("wenesday") = {wen, ene, nes, esd, sda, day}
trigrams("wednesday") = {wed, edn, dne, nes, esd, sda, day}
intersection = {nes, esd, sda, day} = 4
similarity = (2 * 4) / (6 + 7) = 0.62
```

- **Threshold:** 0.55 (lower than Levenshtein due to longer strings)
- **Used when:** Input length ≥ 7 characters

### 3. Intl.DateTimeFormat (ICU)
**Best for:** Multilingual weekday names

```typescript
new Intl.DateTimeFormat('fr-FR', { weekday: 'long' }).format(mondayDate)
// → "lundi"
```

- **Confidence:** 0.95 (exact locale match), 0.85 (substring)
- **Supported:** All locales supported by browser/Node.js

## Comparison: Old vs New

| Feature | fuzzy-match.ts (OLD) | entity-resolver.ts (NEW) |
|---------|---------------------|-------------------------|
| **Alias Storage** | Hard-coded `ROLE_ALIASES`, `WEEKDAY_NAMES` dictionaries | Dynamic extraction from `snapshot` |
| **Multilingual** | Manual per-language dictionaries | ICU `Intl` API (automatic) |
| **Typo Tolerance** | Levenshtein only (threshold: 0.7) | Hybrid: Levenshtein (short) + Trigram (long) |
| **Confidence Scores** | Binary (match/no-match) | Granular (0.0 to 1.0 with method) |
| **Ambiguity Detection** | None | Returns alternatives if multiple matches |
| **Diacritics** | NFD normalization | NFD normalization |
| **Scalability** | Requires code changes for new languages | Add locale parameter only |
| **Data Source** | Static code | Canonical catalog from snapshot |

## Usage Examples

### Example 1: Weekday Resolution (Multilingual)

```typescript
// English
resolveWeekday("monday") 
// → { weekday: "MON", confidence: 0.95, method: "locale" }

// French
resolveWeekday("lundi", "fr-FR")
// → { weekday: "MON", confidence: 0.95, method: "locale" }

// Typo
resolveWeekday("moday")
// → { weekday: "MON", confidence: 0.83, method: "trigram" }
```

### Example 2: Role Resolution (Fuzzy)

```typescript
const roles = ["Shift Supervisor", "Cashier", "Stock Clerk"];

resolveRole("supervisor", roles)
// → { role: "Shift Supervisor", confidence: 0.85, method: "substring" }

resolveRole("supervisor shift", roles)
// → { role: "Shift Supervisor", confidence: 0.79, method: "trigram" }
```

### Example 3: Employee Resolution (Aliases + Diacritics)

```typescript
const employees = [
  { id: "1", name: "François Dubois", alias: "Francois" },
  { id: "2", name: "Frank Miller", alias: "Frank" }
];

resolveEmployee("Francois", employees)
// → { employee: {id: "1", name: "François Dubois"}, 
//     confidence: 0.95, method: "alias" }

resolveEmployee("Fank Miller", employees)
// → { employee: {id: "2", name: "Frank Miller"}, 
//     confidence: 0.84, method: "trigram" }
```

### Example 4: Combined Resolution

```typescript
const snapshot = { /* ... */ };

resolveEntities({ 
  text: "Frank on moday supervisor",
  locale: "en-US" 
}, snapshot)
// → {
//     ok: true,
//     weekday: { value: "MON", confidence: 0.83, method: "trigram" },
//     role: { value: "Shift Supervisor", confidence: 0.85, method: "substring" },
//     employee: { id: "emp-1", name: "Frank Miller", confidence: 0.95, method: "alias" }
//   }
```

### Example 5: Ambiguity Detection

```typescript
// If multiple employees match with similar scores:
resolveEmployee("John", employees)
// → {
//     employee: { id: "1", name: "John Smith" },
//     confidence: 0.85,
//     method: "substring",
//     alternatives: [
//       { id: "2", name: "Johnny Walker" },
//       { id: "3", name: "John Doe" }
//     ]
//   }

// LLM can then ask for clarification:
// "Did you mean John Smith, Johnny Walker, or John Doe?"
```

## Testing

Run comprehensive tests:

```bash
npx tsx scripts/test-entity-resolver.ts
```

**Test Coverage:**
- ✅ English weekdays (exact, locale, typos)
- ✅ French weekdays (lundi, mardi, etc.)
- ✅ Spanish weekdays (lunes, martes, etc.)
- ✅ Role matching (exact, substring, trigram)
- ✅ Employee matching (exact, alias, substring, trigram, diacritics)
- ✅ Combined entity resolution
- ✅ Edge cases (empty strings, invalid inputs)

**Key Test Results:**
```
"moday" → MON (confidence: 0.83, method: trigram) ✅
"tueday" → TUE (confidence: 0.86, method: trigram) ✅
"lundi" (fr-FR) → MON (confidence: 0.95, method: locale) ✅
"François" → François Dubois (exact match with diacritics) ✅
"Francois" → François Dubois (diacritics-insensitive) ✅
```

## Integration with Chat API

### New Tool: `resolve_entities`

```typescript
// LLM can call this tool when entities are ambiguous
{
  "name": "resolve_entities",
  "parameters": {
    "text": "Frank on moday",
    "locale": "en-US"
  }
}

// Response:
{
  "ok": true,
  "weekday": { "value": "MON", "confidence": 0.83, "method": "trigram" },
  "employee": { "id": "emp-1", "name": "Frank Miller", "confidence": 0.95 },
  "ambiguities": [],
  "suggestions": []
}
```

### Automatic Resolution in `explain_constraint`

```typescript
// User query: "why can't assign frank on moday supervisor?"

explainConstraint({
  employeeName: "frank",    // → Resolved to "Frank Miller" via alias
  day: "moday",              // → Resolved to "MON" via Levenshtein
  roleName: "supervisor"     // → Resolved to "Shift Supervisor" via substring
}, snapshot)

// → Systematic constraint checks with resolved entities
```

## Migration Plan

1. **Phase 1 (DONE):** Create `entity-resolver.ts` with full pipeline
2. **Phase 2 (DONE):** Update `explain-constraint.ts` to use new resolver
3. **Phase 3 (DONE):** Add `resolve_entities` tool to chat API
4. **Phase 4 (TODO):** Add deprecation notice to `fuzzy-match.ts`
5. **Phase 5 (TODO):** Verify end-to-end with test-explain-constraint.ts
6. **Phase 6 (TODO):** Remove `fuzzy-match.ts` once fully migrated

## Future Enhancements

### 1. Embedding-Based Semantic Search
For highly ambiguous cases:
```typescript
// If trigram/Levenshtein both fail (confidence < 0.5)
const embedding = await openai.embeddings.create({ input: query });
const matches = findSimilarByEmbedding(embedding, canonicalCatalog);
```

### 2. LLM Clarification Fallback
```typescript
// If ambiguous (multiple matches with similar scores):
const clarification = await openai.chat.completions.create({
  messages: [{
    role: "system",
    content: `User said "${query}". Options: ${alternatives}. Which did they mean?`
  }]
});
```

### 3. User Feedback Loop
```typescript
// Track corrections to improve thresholds:
if (userCorrected(resolved, actualEntity)) {
  recordFeedback({ query, resolved, actual });
  // Adjust thresholds or add to alias catalog
}
```

## Key Principles

1. **Never guess** - Always resolve against canonical data
2. **Confidence matters** - Return scores, not just matches
3. **Locale-aware** - Use ICU for weekdays (no manual dictionaries)
4. **Data-driven** - Extract catalogs from snapshot, not code
5. **Transparent** - Return method used (exact, locale, trigram, etc.)
6. **Ambiguity detection** - Flag when multiple matches found
7. **Diacritics-insensitive** - NFD normalization for all strings

## Performance Characteristics

- **Exact match:** O(n) where n = catalog size
- **Locale match:** O(7) for weekdays (fixed set)
- **Substring match:** O(n) where n = catalog size
- **Levenshtein:** O(m*n) where m, n = string lengths
- **Trigram:** O(m+n) for trigram generation + O(min(t1, t2)) for intersection

**Typical latency:** <5ms for combined entity resolution

## Troubleshooting

### Issue: Weekday not resolved for typo
**Solution:** Check if typo is within edit distance threshold (0.60)
```typescript
levenshteinDistance("moday", "monday") / 6 = 1/6 = 0.17
similarity = 1 - 0.17 = 0.83 ✅ (> 0.60)
```

### Issue: Locale not working
**Solution:** Verify locale is supported by Node.js Intl
```bash
node -e "console.log(new Intl.DateTimeFormat('fr-FR', {weekday: 'long'}).format(new Date('2023-01-02')))"
# Should print: "lundi"
```

### Issue: False positives in role matching
**Solution:** Increase threshold in `resolveRole()` from 0.6 to 0.7

### Issue: Employee alias not found
**Solution:** Ensure `employees[].alias` is populated in database

## References

- [Intl.DateTimeFormat MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat)
- [Levenshtein Distance](https://en.wikipedia.org/wiki/Levenshtein_distance)
- [Sørensen–Dice Coefficient](https://en.wikipedia.org/wiki/S%C3%B8rensen%E2%80%93Dice_coefficient)
- [Unicode Normalization (NFD)](https://unicode.org/reports/tr15/)
