# Phase 4 Completion Summary

## ✅ What's Been Implemented

### 1. Core Preview System (Complete)
- **PreviewService**: Full CRUD for previews with Redis storage
- **Constraint Checker**: Validates availability, overlaps, daily/weekly limits, rest time
- **Operation Builder**: Converts natural language → typed operations
- **5 LLM Tools**: create_preview, apply_preview, undo_preview, get_preview_status, discard_preview
- **Frontend UI**: Green preview blocks, apply/discard buttons in chat

### 2. Availability Checking (Complete)
- **Strict Rule**: shiftEnd <= availabilityEnd (no partial overlaps)
- **Constraint violations BLOCK preview creation** (no preview created if blockers exist)
- **Clear error messages** explaining conflicts

### 3. Optimistic Updates (Complete)
- **Instant preview display**: Full preview object returned from chat API
- **Optimistic apply/discard**: UI updates before API completes
- **Version tracking**: Uses actual schedule version for optimistic locking

### 4. State Management (NEW - Just Added)
- **conversation-state.ts**: Locks context (employee, day, role) for 10 minutes
- **candidate-generator.ts**: Generates deterministic shift candidates with availability check
- **analyze_candidates tool**: New LLM tool to list options before creating preview

## 🚧 What Needs to Be Done

### Immediate (To Fix Current Issue):

1. **Implement analyze_candidates handler** in `llm-handlers.ts`:
   ```typescript
   export async function handleAnalyzeCandidates(
     args: { employeeId, day, role },
     context: { storeId, weekId },
     deps: { prisma, userId }
   ): Promise<ToolResult> {
     // 1. Load snapshot (get templates + employee availability)
     // 2. Generate candidates using candidate-generator.ts
     // 3. Lock context using conversation-state.ts
     // 4. Store candidates for later selection
     // 5. Return formatted message with options
   }
   ```

2. **Wire handler in chat/route.ts**:
   ```typescript
   else if (toolCall.function.name === "analyze_shift_candidates") {
     const result = await handleAnalyzeCandidates(args, toolContext, handlerDeps);
     // ...
   }
   ```

3. **Update create_preview handler** to check conversation state:
   ```typescript
   // Before creating preview, check if user selected from candidates
   const state = getState(userId, storeId, weekId);
   if (state?.candidates) {
     const selection = resolveSelection(userId, storeId, weekId, userInput);
     if (selection) {
       // Use selected shiftId
       op.shiftId = selection.shiftId;
     }
   }
   ```

4. **Update system prompt** to use new workflow:
   - Step 1: analyze_shift_candidates (if ambiguous)
   - Step 2: User selects
   - Step 3: create_preview (with specific shiftId)

### Testing:

**Test Case 1**: Ambiguous request
```
User: "assign bob on wed sales associate"
AI: [analyze_candidates] → Shows 2 options
User: "afternoon"  
AI: [resolves to 15:00-20:00] → Detects conflict
AI: "That shift ends at 20:00 but Bob ends at 19:00. Try morning?"
User: "morning"
AI: [create_preview with morning shift] → Success
```

**Test Case 2**: Specific request
```
User: "assign bob to wed morning sales associate"
AI: [create_preview directly] → Success (no need for analyze)
```

**Test Case 3**: Pending preview
```
User: "assign bob on wed sales"
AI: "You have a pending preview. Apply or discard first."
```

## Files Created/Modified This Session

### New Files:
1. `src/server/preview/conversation-state.ts` (210 lines)
2. `src/server/preview/candidate-generator.ts` (180 lines)
3. `scripts/check-bob-availability.ts` (67 lines)

### Modified Files:
1. `src/server/preview/preview-service.ts`: 
   - Added availability to snapshot
   - Added blocker check before creating preview
   - Import ConstraintViolationError as class

2. `src/server/preview/constraint-checker.ts`:
   - Added availability interface
   - Added availability check (step 0)
   - Better error messages

3. `src/server/preview/llm-handlers.ts`:
   - Fetch actual schedule version
   - Handle ConstraintViolationError specifically
   - Better error messages

4. `src/server/preview/llm-tools.ts`:
   - Added ANALYZE_CANDIDATES_TOOL
   - Updated system prompt (deterministic flow)
   - Updated CREATE_PREVIEW_TOOL description

5. `src/hooks/use-preview.ts`:
   - Accept preview object OR ID
   - Optimistic apply/discard
   - Use preview.snapshotVersion

6. `src/app/(protected)/schedule/types.ts`:
   - Added version to ScheduleSummary

7. `src/app/(protected)/schedule/page.tsx`:
   - Use actual schedule.version
   - Better preview assignment construction

8. `src/app/api/schedule/assignments/route.ts`:
   - Return version in schedule summary

9. `src/app/api/chat/route.ts`:
   - Fetch and return full preview object
   - Added createdPreview variable

10. `src/app/(protected)/schedule/components/ScheduleChatAssistant.tsx`:
    - Accept preview object OR ID
    - Preview action buttons in green banner

## Next Steps

1. **Implement handleAnalyzeCandidates** (30 min)
2. **Wire handler in chat API** (10 min)
3. **Update create_preview to use state** (20 min)
4. **Test full flow** (30 min)
5. **Create unit test for availability rule** (20 min)

Total estimated time: 2 hours

## Architecture Summary

```
User Input: "assign bob on wed sales"
     ↓
AI: analyze_shift_candidates({employeeId, day:"WED", role:"Sales Associate"})
     ↓
Handler: Generate candidates + Lock context + Store in conversation-state
     ↓
AI: Present options to user
     ↓
User: "afternoon"
     ↓
AI: create_preview({shiftId: resolved from state})
     ↓
Handler: Resolve selection from state → Build operations → Check constraints
     ↓
If blockers: Throw ConstraintViolationError
If OK: Create preview → Store in Redis → Return to AI
     ↓
AI: "✓ Preview created. Apply?"
     ↓
User: "yes"
     ↓
AI: apply_preview({previewId})
     ↓
Handler: Apply to DB → Increment version → Clear state
     ↓
AI: "✓ Applied!"
```

This ensures:
- **No context drift** (locked to employee/day/role)
- **Deterministic candidates** (shiftId is source of truth)
- **Single availability rule** (shiftEnd <= availEnd)
- **State persistence** (10min TTL for follow-ups)
- **One preview at a time** (must apply/discard first)
