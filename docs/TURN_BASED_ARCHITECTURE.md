# Turn-Based State Management - Architecture

## Overview
Move from LLM-dependent context to **deterministic server-side turn state** with multilingual support.

## Core Principles
1. **Server owns state** - No relying on LLM memory
2. **Deterministic interpretation** - Short replies mapped server-side
3. **Multilingual by design** - Support affirmatives in all languages
4. **Entity resolution once** - Lock and reuse for the turn
5. **LLM as presenter only** - Shows facts, server interprets responses

## Architecture

### 1. Turn Memory Packet (Redis)
```typescript
interface TurnMemory {
  // Context
  scope: 'shift_assignment' | 'shift_swap' | 'shift_unassign';
  threadId: string;
  
  // Locked entities
  entities: {
    employeeId?: string;
    employeeName?: string;
    day?: Weekday;
    role?: string;
    storeId: string;
    weekId: string;
  };
  
  // Current question state
  lastQuestion: {
    id: string; // "select_shift", "confirm_preview", "apply_changes"
    text: string; // For debugging
    timestamp: number;
  };
  
  // Cached options
  options: ShiftOption[];
  
  // Pending action
  pendingPreviewId?: string;
  
  // Expiration
  expiresAt: number; // 10 min TTL
}

interface ShiftOption {
  optionId: string; // "opt_1", "opt_2", etc.
  shiftId: string; // Template-day composite
  templateId: string;
  label: string; // "Morning (09:00-15:00)"
  startTime: string;
  endTime: string;
  durationHours: number;
  fits: boolean;
  reason?: string; // If doesn't fit
  
  // For matching
  timeOfDay: 'morning' | 'afternoon' | 'evening';
  index: number; // 0-based for "first", "second"
}
```

### 2. Multilingual Reply Interpreter
```typescript
interface InterpretedReply {
  intent: 'confirm' | 'select' | 'reject' | 'unknown';
  confidence: number; // 0-1
  optionId?: string; // If select intent
  reasoning: string; // For debugging
}

function interpretReply(
  text: string,
  turnMemory: TurnMemory,
  locale?: string
): InterpretedReply
```

**Interpretation Strategy (in order):**

1. **Deterministic Option Matching**
   - Numeric: "1", "2", "3" → options[n-1]
   - Ordinal: "first", "premier", "primero" → options[0]
   - Time of day: "morning", "matin", "mañana" → filter by timeOfDay
   - Exact time: "09:00", "9am" → match startTime

2. **Affirmative Detection (Multi-language)**
   ```typescript
   const AFFIRMATIVES = {
     en: ['yes', 'yeah', 'yep', 'yup', 'ok', 'okay', 'sure', 'correct'],
     fr: ['oui', 'd\'accord', 'ok', 'bien', 'exactement'],
     es: ['sí', 'si', 'vale', 'ok', 'claro', 'exacto'],
     de: ['ja', 'ok', 'gut', 'genau'],
     it: ['sì', 'si', 'ok', 'va bene', 'esatto'],
     pt: ['sim', 'ok', 'claro', 'exato'],
     ja: ['はい', 'ええ', 'うん', 'オーケー'],
     zh: ['是', '好', '对', '行'],
     ar: ['نعم', 'حسنا', 'صحيح'],
     ru: ['да', 'хорошо', 'ладно'],
     tr: ['evet', 'tamam', 'olur'],
     nl: ['ja', 'oké', 'goed'],
     sv: ['ja', 'okej', 'bra'],
     no: ['ja', 'ok', 'bra'],
     da: ['ja', 'okay', 'fint'],
   };
   ```

3. **Negative Detection (Multi-language)**
   ```typescript
   const NEGATIVES = {
     en: ['no', 'nope', 'cancel', 'stop', 'nevermind'],
     fr: ['non', 'annuler', 'arrêter'],
     es: ['no', 'cancelar', 'parar'],
     de: ['nein', 'abbrechen', 'stopp'],
     // ... etc
   };
   ```

4. **Embedding Fallback (Unknown Language)**
   - Classify intent using embeddings: confirm / reject / select
   - Only when deterministic methods fail

### 3. Flow Architecture

```
┌─────────────────────────────────────────────────────────┐
│  User: "assign bob on wed sales associate"             │
└────────────────────┬────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────┐
│  1. Resolve Entities (find_employee, validate day/role)│
│     → {employeeId, employeeName, day, role}            │
└────────────────────┬────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────┐
│  2. Generate Candidates (server-side)                   │
│     → [opt_1: Morning ✓, opt_2: Afternoon ✗]          │
└────────────────────┬────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────┐
│  3. Save Turn Memory (Redis)                            │
│     {                                                    │
│       entities: {employeeId, day, role},                │
│       lastQuestion: {id: "select_shift"},               │
│       options: [opt_1, opt_2]                           │
│     }                                                    │
└────────────────────┬────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────┐
│  4. LLM Response (Presenter Only)                       │
│     "Bob Smith has these shifts on Wed:                 │
│      [Button: Morning 09:00-15:00] ✓                   │
│      [Button: Afternoon 15:00-20:00] ✗ Conflict        │
│      Which shift?"                                      │
└────────────────────┬────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────┐
│  User: "morning" (or "matin" or "朝" or "1")           │
└────────────────────┬────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────┐
│  5. Interpret Reply (Server-side, Deterministic)        │
│     interpretReply("morning", turnMemory)               │
│     → {intent: "select", optionId: "opt_1"}            │
└────────────────────┬────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────┐
│  6. Execute Action (Server owns logic)                  │
│     createPreview({                                     │
│       employeeId: turnMemory.entities.employeeId,      │
│       shiftId: options.find(o => o.optionId === "opt_1").shiftId │
│     })                                                   │
└────────────────────┬────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────┐
│  7. Update Turn Memory                                  │
│     {                                                    │
│       lastQuestion: {id: "confirm_preview"},           │
│       pendingPreviewId: "prev_123"                     │
│     }                                                    │
└────────────────────┬────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────┐
│  8. LLM Response (Presenter Only)                       │
│     "✓ Preview: Bob → Wed Morning. Apply?"            │
└────────────────────┬────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────┐
│  User: "oui" (or "yes" or "sí" or "はい")              │
└────────────────────┬────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────┐
│  9. Interpret Reply                                     │
│     interpretReply("oui", turnMemory)                   │
│     → {intent: "confirm"}                               │
└────────────────────┬────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────┐
│  10. Execute Action                                     │
│      applyPreview(turnMemory.pendingPreviewId)         │
└────────────────────┬────────────────────────────────────┘
                     ↓
                   SUCCESS ✓
```

## Implementation Plan

### Phase 1: Turn Memory System
- [ ] Create `turn-memory.ts` with TurnMemory interface
- [ ] Implement save/load/clear functions with Redis
- [ ] Add TTL and cleanup

### Phase 2: Reply Interpreter
- [ ] Create `reply-interpreter.ts`
- [ ] Implement deterministic matching (numbers, ordinals, times)
- [ ] Add multilingual affirmative/negative libraries
- [ ] Add embedding fallback (optional, for unknown languages)

### Phase 3: Integration
- [ ] Update chat API to use turn memory
- [ ] Modify analyze_candidates to save turn memory
- [ ] Add interpret_reply step before tool calls
- [ ] Update LLM prompt to be presenter-only

### Phase 4: Testing
- [ ] Test multilingual confirmations
- [ ] Test short reply interpretation
- [ ] Test turn expiration
- [ ] Test edge cases (ambiguous replies)

## Benefits

✅ **Deterministic**: Same input → same output
✅ **Multilingual**: Works in any language
✅ **Robust**: No LLM memory issues
✅ **Testable**: Pure functions, easy to unit test
✅ **Scalable**: Server owns state, can handle any flow
✅ **Fast**: No LLM call for simple confirmations

## Migration Path

1. Keep existing conversation-state.ts (for backward compat)
2. Add turn-memory.ts alongside it
3. Gradually migrate to turn-based system
4. Deprecate old system once stable

## Future Extensions

- **Button support**: Return button IDs for UI to render
- **Voice support**: Interpret voice transcriptions
- **Undo/redo**: Keep turn history for undo
- **Analytics**: Track which reply patterns are used most
- **Auto-locale**: Detect language from user's first message
