# Phase 4: Quick Integration Guide

## 🎯 Goal
Enable AI chat assistant to create, apply, and undo schedule previews through natural language.

## ✅ What's Ready
- ✅ 5 LLM tools defined (`llm-tools.ts`)
- ✅ 5 tool handlers implemented (`llm-handlers.ts`)
- ✅ Operation builder (`operation-builder.ts`)
- ✅ Error handling + response templates

## 🔧 What's Left: Register Tools in Chat API

### Step 1: Import Dependencies
**File**: `src/app/api/chat/route.ts`

Add imports at top of file:
```typescript
import { PREVIEW_TOOLS, PREVIEW_SYSTEM_PROMPT } from '@/server/preview/llm-tools';
import {
  handleCreatePreview,
  handleApplyPreview,
  handleUndoPreview,
  handleGetPreviewStatus,
  handleDiscardPreview,
  type HandlerDependencies,
} from '@/server/preview/llm-handlers';
```

### Step 2: Add Preview Tools to Tools Array
Find the `tools` array (around line 250) and add PREVIEW_TOOLS:

```typescript
const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = facts
  ? [
      // ... existing tools (eval_query, find_employee, etc.)
      ...PREVIEW_TOOLS, // ← ADD THIS
    ]
  : [];
```

### Step 3: Add Preview System Prompt
Add PREVIEW_SYSTEM_PROMPT to base messages (around line 220):

```typescript
const baseMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
  { role: "system", content: BASE_PROMPT },
  { role: "system", content: ACTION_PLAN_PROMPT },
  { role: "system", content: DATA_DICTIONARY_PROMPT },
  { role: "system", content: PREVIEW_SYSTEM_PROMPT }, // ← ADD THIS
];
```

### Step 4: Handle Preview Tool Calls
In the tool call handling section (around line 350), add preview handlers:

```typescript
// Create handler dependencies once at top of tool handling
const handlerDeps: HandlerDependencies = {
  prisma,
  userId,
};

const toolContext = {
  storeId: storeId || '',
  weekId: weekId || '',
};

// ... existing tool handlers ...

// Handle create_preview
else if (toolCall.function.name === 'create_preview') {
  chatMetrics.toolsUsed.push('create_preview');
  
  let operations = [];
  let explanation = '';
  try {
    const args = JSON.parse(toolCall.function.arguments ?? '{}');
    operations = args.operations ?? [];
    explanation = args.explanation ?? '';
  } catch {
    conversation.push({
      role: 'tool',
      tool_call_id: toolCall.id,
      content: JSON.stringify({ 
        ok: false, 
        error: 'Invalid arguments',
        message: 'I couldn\'t parse the preview parameters. Please try again.',
      }),
    });
    continue;
  }

  try {
    const result = await handleCreatePreview(
      { operations, explanation },
      toolContext,
      handlerDeps
    );
    
    conversation.push({
      role: 'tool',
      tool_call_id: toolCall.id,
      content: JSON.stringify(result),
    });
  } catch (error) {
    conversation.push({
      role: 'tool',
      tool_call_id: toolCall.id,
      content: JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        message: 'Failed to create preview. Please try again.',
      }),
    });
  }
}

// Handle apply_preview
else if (toolCall.function.name === 'apply_preview') {
  chatMetrics.toolsUsed.push('apply_preview');
  
  let previewId = '';
  try {
    const args = JSON.parse(toolCall.function.arguments ?? '{}');
    previewId = args.previewId ?? '';
  } catch {
    conversation.push({
      role: 'tool',
      tool_call_id: toolCall.id,
      content: JSON.stringify({ 
        ok: false, 
        error: 'Invalid arguments',
        message: 'I couldn\'t parse the preview ID. Please try again.',
      }),
    });
    continue;
  }

  try {
    const result = await handleApplyPreview(
      { previewId },
      toolContext,
      handlerDeps
    );
    
    conversation.push({
      role: 'tool',
      tool_call_id: toolCall.id,
      content: JSON.stringify(result),
    });
  } catch (error) {
    conversation.push({
      role: 'tool',
      tool_call_id: toolCall.id,
      content: JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        message: 'Failed to apply preview. Please try again.',
      }),
    });
  }
}

// Handle undo_preview
else if (toolCall.function.name === 'undo_preview') {
  chatMetrics.toolsUsed.push('undo_preview');
  
  let previewId = '';
  try {
    const args = JSON.parse(toolCall.function.arguments ?? '{}');
    previewId = args.previewId ?? '';
  } catch {
    conversation.push({
      role: 'tool',
      tool_call_id: toolCall.id,
      content: JSON.stringify({ 
        ok: false, 
        error: 'Invalid arguments',
        message: 'I couldn\'t parse the preview ID. Please try again.',
      }),
    });
    continue;
  }

  try {
    const result = await handleUndoPreview(
      { previewId },
      toolContext,
      handlerDeps
    );
    
    conversation.push({
      role: 'tool',
      tool_call_id: toolCall.id,
      content: JSON.stringify(result),
    });
  } catch (error) {
    conversation.push({
      role: 'tool',
      tool_call_id: toolCall.id,
      content: JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        message: 'Failed to undo preview. Please try again.',
      }),
    });
  }
}

// Handle get_preview_status
else if (toolCall.function.name === 'get_preview_status') {
  chatMetrics.toolsUsed.push('get_preview_status');
  
  let previewId = '';
  try {
    const args = JSON.parse(toolCall.function.arguments ?? '{}');
    previewId = args.previewId ?? '';
  } catch {
    conversation.push({
      role: 'tool',
      tool_call_id: toolCall.id,
      content: JSON.stringify({ 
        ok: false, 
        error: 'Invalid arguments',
        message: 'I couldn\'t parse the preview ID. Please try again.',
      }),
    });
    continue;
  }

  try {
    const result = await handleGetPreviewStatus(
      { previewId },
      toolContext,
      handlerDeps
    );
    
    conversation.push({
      role: 'tool',
      tool_call_id: toolCall.id,
      content: JSON.stringify(result),
    });
  } catch (error) {
    conversation.push({
      role: 'tool',
      tool_call_id: toolCall.id,
      content: JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        message: 'Failed to get preview status. Please try again.',
      }),
    });
  }
}

// Handle discard_preview
else if (toolCall.function.name === 'discard_preview') {
  chatMetrics.toolsUsed.push('discard_preview');
  
  let previewId = '';
  try {
    const args = JSON.parse(toolCall.function.arguments ?? '{}');
    previewId = args.previewId ?? '';
  } catch {
    conversation.push({
      role: 'tool',
      tool_call_id: toolCall.id,
      content: JSON.stringify({ 
        ok: false, 
        error: 'Invalid arguments',
        message: 'I couldn\'t parse the preview ID. Please try again.',
      }),
    });
    continue;
  }

  try {
    const result = await handleDiscardPreview(
      { previewId },
      toolContext,
      handlerDeps
    );
    
    conversation.push({
      role: 'tool',
      tool_call_id: toolCall.id,
      content: JSON.stringify(result),
    });
  } catch (error) {
    conversation.push({
      role: 'tool',
      tool_call_id: toolCall.id,
      content: JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        message: 'Failed to discard preview. Please try again.',
      }),
    });
  }
}
```

### Step 5: Test
1. Start dev server: `npm run dev`
2. Navigate to schedule page
3. Open chat assistant
4. Try: "Assign [EMPLOYEE_NAME] to [DAY] [SHIFT]"
5. Verify preview is created
6. Try: "Apply it"
7. Verify changes are applied

## 🧪 Test Scenarios

### 1. Simple Assignment
```
User: "Assign John Smith to Monday morning cashier shift"
Expected:
- AI calls find_employee
- AI calls create_preview
- AI asks for confirmation
User: "Yes"
- AI calls apply_preview
- AI confirms success
```

### 2. Constraint Blocker
```
User: "Assign Alice to Tuesday 2pm shift"
Expected:
- AI creates preview
- Preview has blocker (e.g., overlap)
- AI explains blocker and suggests alternative
```

### 3. Undo
```
User: "Undo that"
Expected:
- AI calls undo_preview
- AI confirms revert
```

## ⚠️ Common Issues

1. **Missing prisma import**: Ensure `prisma` is available in chat API scope
2. **Missing userId**: Ensure Clerk `userId` is available for apply/undo
3. **storeId/weekId null**: Preview tools only work when schedule is loaded
4. **Tool not called**: Check tool schema matches function name exactly

## 📚 Reference

- Tool schemas: `src/server/preview/llm-tools.ts`
- Tool handlers: `src/server/preview/llm-handlers.ts`
- Operation builder: `src/server/preview/operation-builder.ts`
- PreviewService: `src/server/preview/preview-service.ts`

---

**Estimated Time**: 1-2 hours to integrate + 1-2 hours to test

**Success Criteria**: User can request schedule change in chat, see preview, and apply it.
