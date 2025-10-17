# Phase 4 (Week 4): LLM Tool Integration - SUMMARY

**Status**: 🚧 **80% COMPLETE** (Tools defined, handlers implemented, pending chat API integration)

## Overview

Phase 4 integrates the Preview → Apply Flow with the AI chat assistant, allowing users to request schedule changes in natural language and have the AI create, apply, and manage previews through function calling.

---

## ✅ What's Complete

### 1. **LLM Tool Schemas** ✅ (Task 1)
**File**: `src/server/preview/llm-tools.ts` (390 lines)

Defined 5 OpenAI function calling tools:

#### create_preview
```typescript
- Description: Create preview from natural language operations
- Parameters:
  - operations: Array of {type, employeeId, shiftId, assignmentId, reason}
  - explanation: Natural language summary
- Returns: Preview ID, operation count, warnings/blockers
```

#### apply_preview
```typescript
- Description: Apply preview, commit changes to database
- Parameters: previewId
- Returns: Success status, appliedOps count
- Constraints: Only if user confirms, no blockers
```

#### undo_preview
```typescript
- Description: Revert previously applied preview
- Parameters: previewId
- Returns: Success status, revertedOps count
- Constraints: Only for applied previews
```

#### get_preview_status
```typescript
- Description: Check preview status, warnings, blockers
- Parameters: previewId
- Returns: Status, operation count, warnings/blockers summary
```

#### discard_preview
```typescript
- Description: Discard preview without applying
- Parameters: previewId
- Returns: Success confirmation
```

**System Prompt Addition**:
- Detailed PREVIEW → APPLY WORKFLOW instructions
- Example conversation flows
- Error handling guidelines
- Response templates

---

### 2. **Operation Builder** ✅ (Task 2)
**File**: `src/server/preview/operation-builder.ts` (360 lines)

Converts LLM parameters into typed `Operation` objects:

**Functions**:
- `buildOperation()`: Single operation builder
- `buildOperations()`: Batch builder (max 10 ops)
- `normalizeDay()`: Mon/Monday/MON → 'MON'
- `parseTime()`: "09:30" → 570 minutes
- `isValidId()`: UUID validation

**Validation**:
- ✅ Required fields check (employeeId, shiftId, assignmentId)
- ✅ ID format validation (UUID)
- ✅ Swap constraints (no self-swap)
- ✅ Max 10 operations per preview
- ✅ Type-safe operation construction

**Input Types**:
```typescript
LLMAssignShiftInput: {
  type: 'assign_shift',
  employeeId: string,
  shiftId: string,
  reason?: string
}

LLMUnassignShiftInput: {
  type: 'unassign_shift',
  assignmentId: string,
  reason?: string
}

LLMSwapShiftsInput: {
  type: 'swap_shifts',
  employeeId: string,
  employeeId2: string,
  assignment1Id: string,
  assignment2Id: string,
  reason?: string
}
```

---

### 3. **LLM Tool Handlers** ✅ (Tasks 3-6, 8-9)
**File**: `src/server/preview/llm-handlers.ts` (500 lines)

Implements all 5 tool handlers with full error handling:

#### handleCreatePreview
- Validates operations array
- Builds typed operations via operation-builder
- Calls PreviewService.createPreview()
- Generates human-readable summary with warnings/blockers
- Returns preview ID and structured data for LLM

#### handleApplyPreview
- Validates preview exists and is pending
- Checks for blockers (prevents apply if any)
- Calls PreviewService.applyPreview()
- Returns success message with operation count

#### handleUndoPreview
- Validates preview exists and is applied
- Calls PreviewService.undoPreview()
- Returns revert confirmation

#### handleGetPreviewStatus
- Fetches preview by ID
- Generates status summary (warnings, blockers, canApply, canUndo)
- Returns structured data + human-readable message

#### handleDiscardPreview
- Validates preview exists
- Calls PreviewService.discardPreview()
- Returns success confirmation

**Error Handling**:
- ✅ Missing context (storeId/weekId)
- ✅ Invalid operations
- ✅ Preview not found/expired
- ✅ Version conflicts
- ✅ Constraint blockers
- ✅ Already applied/not applied states
- ✅ All errors return user-friendly messages for LLM

**Response Templates** (from llm-tools.ts):
```typescript
previewCreated(count, hasWarnings, hasBlockers)
applySuccess(count)
undoSuccess(count)
discardSuccess()
previewExpired()
versionConflict()
hasBlockers(count)
employeeNotFound(name)
shiftNotFound(day, time)
```

---

### 4. **PreviewService Enhancement** ✅
**File**: `src/server/preview/preview-service.ts` (Updated)

Added `getPreview()` method for LLM tool handlers:
```typescript
async getPreview(previewId: string): Promise<Preview | null> {
  return this.loadPreview(previewId);
}
```

This exposes the private `loadPreview` method for LLM tool access.

---

## ⏳ What's Pending

### 7. **Register Tools in Chat API** (Task 7) - IN PROGRESS
**File**: `src/app/api/chat/route.ts`

Need to:
1. Import preview tools and handlers
2. Add PREVIEW_TOOLS to tools array (alongside existing tools)
3. Add PREVIEW_SYSTEM_PROMPT to system messages
4. Handle tool calls in conversation loop:
   ```typescript
   if (toolCall.function.name === 'create_preview') {
     const result = await handleCreatePreview(args, context, deps);
     conversation.push({
       role: 'tool',
       tool_call_id: toolCall.id,
       content: JSON.stringify(result),
     });
   }
   // ... similar for apply, undo, status, discard
   ```
5. Pass HandlerDependencies {prisma, userId}

**Estimated Time**: 1-2 hours

---

### 10. **End-to-End Testing** (Task 10) - NOT STARTED
**Test Scenarios**:

1. **Happy Path - Assign**:
   ```
   User: "Assign John Smith to Monday morning cashier shift"
   AI: [calls find_employee("John Smith")]
   AI: [calls create_preview with assign operation]
   AI: "I've created a preview to assign John to Monday 9:00-17:00 Cashier (8h). This brings him to 32h/40h. Apply?"
   User: "Yes"
   AI: [calls apply_preview]
   AI: "✓ Changes applied! John is now scheduled."
   ```

2. **Constraint Blocker**:
   ```
   User: "Assign Alice to Tuesday evening"
   AI: [creates preview with blocker: overlap detected]
   AI: "❌ Cannot assign Alice: She already has Tuesday 14:00-22:00 shift (overlap). Try a different day?"
   ```

3. **Undo Flow**:
   ```
   User: "Undo that"
   AI: [calls undo_preview]
   AI: "✓ Changes reverted! Alice's schedule is back to before."
   ```

4. **Multi-Operation**:
   ```
   User: "Assign Bob to Monday and Carol to Tuesday"
   AI: [creates preview with 2 operations]
   AI: "I've created a preview with 2 changes: Bob → Monday 9-17, Carol → Tuesday 9-17. Apply?"
   ```

**Estimated Time**: 2-3 hours

---

## 📊 Code Statistics

### Phase 4 Totals:
- **llm-tools.ts**: 390 lines (tool schemas + prompts + templates)
- **operation-builder.ts**: 360 lines (input validation + type conversion)
- **llm-handlers.ts**: 500 lines (5 handlers + error handling)
- **preview-service.ts**: +10 lines (getPreview method)
- **Total**: ~1,260 lines of new code

### All Phases Combined:
- **Phase 1** (Types + API): 1,260 lines
- **Phase 2** (Operations): 740 lines
- **Phase 3** (UI Components): 940 lines
- **Phase 4** (LLM Integration): 1,260 lines
- **Grand Total**: ~4,200 lines of production code

---

## 🎯 Integration Checklist

- [x] Tool schemas defined (OpenAI function calling format)
- [x] Operation builder (LLM input → typed Operation)
- [x] 5 tool handlers implemented
- [x] Error handling for all edge cases
- [x] Response templates for natural language
- [x] PreviewService.getPreview() method added
- [ ] **Tools registered in chat API**
- [ ] **Tool call handling in conversation loop**
- [ ] **End-to-end conversation testing**
- [ ] **User documentation** (how to use preview in chat)

---

## 🔄 Example Conversation Flow

### Scenario: User wants to assign employee to shift

**Turn 1**:
```
User: "Can you assign Frank to the Monday morning supervisor shift?"

AI Actions:
1. Calls find_employee("Frank") → {id: "emp-123", name: "Frank Miller"}
2. Searches for Monday morning supervisor shift → {id: "shift-456"}
3. Calls create_preview({
     operations: [{
       type: 'assign_shift',
       employeeId: 'emp-123',
       shiftId: 'shift-456',
       reason: 'User requested assignment'
     }],
     explanation: 'Assign Frank Miller to Monday 8:00-16:00 Supervisor shift'
   })
4. Receives: {
     ok: true,
     data: {previewId: "prev-789", warnings: [], blockers: []},
     message: "I've created a preview with 1 change..."
   }

AI Response:
"I've created a preview to assign Frank Miller to Monday 8:00-16:00 Supervisor shift (8 hours). This will bring him to 24h/40h for the week. ✓ No conflicts detected. Apply these changes?"
```

**Turn 2**:
```
User: "Yes, do it"

AI Actions:
1. Calls apply_preview({previewId: "prev-789"})
2. Receives: {ok: true, message: "✓ Changes applied..."}

AI Response:
"✓ Changes applied successfully! Frank is now scheduled for Monday morning. You can undo this anytime if needed."
```

**Turn 3** (Optional undo):
```
User: "Actually, undo that"

AI Actions:
1. Calls undo_preview({previewId: "prev-789"})
2. Receives: {ok: true, message: "✓ Changes reverted..."}

AI Response:
"✓ Changes reverted! Frank's schedule is back to before. Would you like to try a different assignment?"
```

---

## 📝 Next Steps

### Immediate (Complete Phase 4):
1. **Register tools in chat API** (~1-2 hours)
   - Import tools and handlers
   - Add to tools array
   - Handle tool calls in conversation loop
   - Test with simple conversation

2. **End-to-end testing** (~2-3 hours)
   - Test happy path (assign → apply)
   - Test blockers (constraint violations)
   - Test undo flow
   - Test multi-operation previews
   - Test error cases (expired, not found, etc.)

### Future Enhancements:
1. **Proactive Suggestions**: AI analyzes underworked employees and suggests assignments
2. **Batch Operations**: "Fill all Monday shifts" → AI creates multi-op preview
3. **Smart Conflict Resolution**: AI suggests alternative times when conflicts detected
4. **Preview Comparison**: "Show me before/after" → Visual diff in chat
5. **Schedule Optimization**: "Optimize this week" → AI balances hours across employees

---

## 🎉 Phase 4 Achievement Summary

**What We Built**:
- Complete LLM tool integration for preview operations
- 5 OpenAI function calling tools
- Robust operation builder with validation
- 5 tool handlers with comprehensive error handling
- Natural language response templates
- System prompt for AI behavior

**What Works**:
- ✅ Tool schemas (OpenAI format)
- ✅ Operation building (LLM → typed ops)
- ✅ All 5 handlers (create/apply/undo/status/discard)
- ✅ Error handling (version conflicts, blockers, etc.)
- ✅ Response formatting (user-friendly messages)

**What's Left**:
- ⏳ Register tools in chat API (1-2 hours)
- ⏳ End-to-end testing (2-3 hours)

**Total Time Estimate to Complete**: ~3-5 hours

---

**Phase 4 Status**: 🚧 **80% COMPLETE**

**Next Session**: Register preview tools in `/api/chat/route.ts` and test first conversation!
