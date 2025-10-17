# Preview System Expansion Plan

## Current State
✅ **Shift Assignment**: User can preview + confirm assigning employee to existing shift
- Flow: "assign bob on wed sales" → analyze candidates → present options → "yes" → create preview → "apply"
- Turn memory: Saves options, interprets short replies deterministically

## Expansion Needed

### 1. **Shift Creation** (User Request)
User wants to create NEW shifts with preview:
```
User: "can you add cashier shift on mon from 8 to 12"
AI: Creates preview → "Preview: New Cashier shift MON 08:00-12:00. Apply?"
User: "yes"
AI: Applies preview → "✅ Created Cashier shift!"
```

**Implementation:**
- Add `create_shift_template` LLM tool
- Handler: `handleCreateShiftTemplate()`
- Preview type: `CREATE_SHIFT_TEMPLATE`
- Parameters: day, workType, startTime, endTime
- Turn memory scope: `shift_creation`

**Steps:**
1. Parse natural language ("mon from 8 to 12")
2. Resolve workType (find or suggest)
3. Create preview with operation type: `create_shift_template`
4. Save turn memory with confirmation question
5. User says "yes" → apply preview
6. Backend creates ShiftTemplate record

### 2. **Employee Swapping** (User Request)
User wants to swap two employees with preview:
```
User: "swap alice and bob on tuesday"
AI: Finds assignments → "Preview: Alice (Morning) ↔ Bob (Afternoon). Apply?"
User: "yes"  
AI: Applies preview → "✅ Swapped Alice and Bob!"
```

**Implementation:**
- Add `analyze_swap_candidates` LLM tool
- Handler: `handleAnalyzeSwapCandidates()`
- Preview type: Already supported (`SWAP_SHIFTS`)
- Parameters: employee1Id, employee2Id, day
- Turn memory scope: `shift_swap`

**Steps:**
1. Find both employees' assignments on specified day
2. Check if swap is feasible (availability, no conflicts)
3. Present swap preview with details
4. Save turn memory with confirmation question
5. User says "yes" → apply preview
6. Backend swaps assignments

### 3. **Shift Deletion** (Future)
User wants to delete shifts with preview:
```
User: "remove the morning cashier shift on friday"
AI: "Preview: Delete Morning Cashier (09:00-15:00) FRI. Apply?"
User: "yes"
AI: "✅ Deleted shift!"
```

**Implementation:**
- Add `delete_shift_template` LLM tool
- Preview type: `DELETE_SHIFT_TEMPLATE`
- Turn memory scope: `shift_deletion`

## Technical Requirements

### A. LLM Tools to Add

1. **create_shift_template**
```typescript
{
  name: 'create_shift_template',
  description: 'Create a new shift template with preview',
  parameters: {
    day: 'MON' | 'TUE' | ...,
    workTypeName: string,
    startTime: 'HH:mm',
    endTime: 'HH:mm',
    storeId: string,
  }
}
```

2. **analyze_swap_candidates**
```typescript
{
  name: 'analyze_swap_candidates',
  description: 'Analyze feasibility of swapping two employees',
  parameters: {
    employee1Id: string,
    employee2Id: string,
    day: 'MON' | 'TUE' | ...,
  }
}
```

### B. Handlers to Add

1. **handleCreateShiftTemplate**
   - Validate workType exists (or suggest creating it)
   - Validate time format and range
   - Check no overlapping templates
   - Create preview with `CREATE_SHIFT_TEMPLATE` operation
   - Return preview details

2. **handleAnalyzeSwapCandidates**
   - Find both employees' assignments on day
   - Check if swap is valid (both assigned, no conflicts)
   - Generate swap preview
   - Return feasibility + locked context

### C. Turn Memory Updates

Add new scopes to `TurnScope`:
```typescript
export type TurnScope = 
  | 'shift_assignment'
  | 'shift_creation'    // NEW
  | 'shift_swap'        // NEW
  | 'shift_deletion'    // NEW (future)
  | 'shift_unassign'
  | 'availability_change';
```

Add new question IDs:
```typescript
export type QuestionId = 
  | 'select_shift'
  | 'confirm_preview'
  | 'confirm_selection'
  | 'confirm_creation'  // NEW
  | 'confirm_swap'      // NEW
  | 'apply_changes'
  | 'select_reason';
```

### D. Operation Builder Updates

Already supports:
- ✅ `assign_shift`
- ✅ `unassign_shift`
- ✅ `swap_shifts`

Need to add:
- ⏳ `create_shift_template` (not in current Operation types)
- ⏳ `delete_shift_template` (future)

**Note:** May need to extend `Operation` types in `@/types/preview` or handle differently.

## Implementation Priority

### Phase 1: Shift Creation (Immediate)
1. Add `create_shift_template` tool definition
2. Add `handleCreateShiftTemplate` handler
3. Update turn memory with `shift_creation` scope
4. Test: "add cashier shift on mon from 8 to 12" → preview → "yes" → applied

### Phase 2: Employee Swapping (Next)
1. Add `analyze_swap_candidates` tool
2. Add `handleAnalyzeSwapCandidates` handler
3. Update turn memory with `shift_swap` scope
4. Test: "swap alice and bob on tuesday" → preview → "yes" → applied

### Phase 3: Polish (Future)
1. Add shift deletion
2. Add shift modification (change times)
3. Add bulk operations (create multiple shifts)

## Testing Strategy

### Manual Tests
1. **Shift Creation**:
   - ✅ "add cashier shift on mon from 8 to 12"
   - ✅ "create sales associate shift tue 14:00-20:00"
   - ✅ Multiple workTypes, different days
   - ✅ Invalid times (reject)
   - ✅ Preview → confirm → applied

2. **Employee Swapping**:
   - ✅ "swap alice and bob on tuesday"
   - ✅ Both employees assigned (valid swap)
   - ✅ One employee not assigned (reject)
   - ✅ Swap creates conflicts (reject with reason)

### Automated Tests
- Create test script: `scripts/test-shift-creation.ts`
- Create test script: `scripts/test-employee-swap.ts`
- Validate turn memory saves/loads correctly
- Validate reply interpretation works

## Success Criteria

✅ User can create shifts with natural language + preview
✅ User can swap employees with preview
✅ Short replies ("yes", "1", "oui") work for all flows
✅ Turn memory persists correctly (Clerk userId)
✅ No LLM calls for simple confirmations
✅ All operations reversible (undo support)

## Timeline

- **Phase 1 (Shift Creation)**: 2-3 hours
- **Phase 2 (Employee Swapping)**: 1-2 hours  
- **Testing & Polish**: 1 hour

**Total**: ~6 hours for full implementation
