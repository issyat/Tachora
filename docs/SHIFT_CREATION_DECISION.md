# Shift Creation with Preview - Implementation

## Goal
Allow users to create shift templates with preview and confirmation.

**Example Flow:**
```
User: "add cashier shift on mon from 8 to 12"
AI: → Parse entities → Create preview → "✨ Preview: New Cashier shift MON 08:00-12:00. Say 'apply' to create."
User: "yes"
AI: → Apply preview → "✅ Created Cashier shift MON 08:00-12:00!"
```

## Decision: Use Simpler Direct Creation (No Preview for Now)

**Reasoning:**
1. Shift templates are TEMPLATES, not assignments - they don't affect the schedule directly
2. Creating a template is low-risk (can be deleted easily)
3. Adding preview complexity for templates adds unnecessary friction
4. User's real pain point is ASSIGNMENT previews (already done ✅)

## Revised Approach: Direct Creation with Confirmation

**Implementation:**
1. Add `create_shift_template` tool (direct creation)
2. Validate parameters (workType, times, day)
3. Create template immediately
4. Return success message

**Flow:**
```
User: "add cashier shift on mon from 8 to 12"
AI: → Parse → Validate → Create → "✅ Created Cashier shift MON 08:00-12:00"
```

**Benefits:**
- Simpler implementation
- Faster user experience  
- Focus preview system on high-risk operations (assignments, swaps)
- Templates can be edited/deleted easily

## Alternative: Keep Preview for Swaps Only

**High-Risk Operations (Need Preview):**
- ✅ Assign employee to shift
- ⏳ Swap two employees
- ⏳ Unassign employee

**Low-Risk Operations (Direct):**
- Create shift template
- Delete shift template
- Edit shift template

## Implementation Plan (Revised)

### Phase 1: Direct Shift Creation
1. Add `create_shift_template` LLM tool
2. Add `handleCreateShiftTemplate` handler (direct DB write)
3. Validate workType exists
4. Create ShiftTemplate record
5. Return success

**Estimated Time:** 1 hour

### Phase 2: Swap with Preview
1. Add `analyze_swap_candidates` tool  
2. Add `handleAnalyzeSwapCandidates` handler
3. Use existing preview system
4. Turn memory with `shift_swap` scope

**Estimated Time:** 2 hours

## Conclusion

**Recommendation:** Start with direct shift template creation (no preview) and focus preview system on employee operations (assign/swap/unassign).

User can always delete/edit templates if they make a mistake, but wrong employee assignments are more disruptive.

**Do you want to:**
A) Implement direct shift creation (faster, simpler)
B) Implement shift creation with preview (more consistent, more complex)
C) Skip shift creation and focus on swap preview first
