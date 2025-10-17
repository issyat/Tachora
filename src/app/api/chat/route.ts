import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import OpenAI from "openai";

import { ensureManager } from "@/server/manager";
import { buildScheduleFacts } from "@/server/schedule/facts-builder";
import { runEvalQuery } from "@/server/schedule/eval-query";
import { findEmployee } from "@/server/schedule/find-employee";
import { expandContext } from "@/server/schedule/expand-context";
import { explainConstraint } from "@/server/schedule/explain-constraint";
import { resolveEntities } from "@/server/schedule/entity-resolver";
import { classifyIntent, shouldRefuseRequest, getRefusalResponse, createUnsupportedIntent } from "@/server/schedule/intent-guard";
import { createMetrics, recordMetrics } from "@/server/schedule/metrics";
import type { ClientAssignmentInput } from "@/types";
import { PREVIEW_TOOLS, PREVIEW_SYSTEM_PROMPT } from "@/server/preview/llm-tools";
import { saveConversationTurn, loadConversationHistory } from "@/server/chat/kv-store";
import {
  handleAnalyzeCandidates,
  handleCreateShiftTemplate,
  handleAnalyzeSwapCandidates,
  handleCheckEligibleCandidates,
  handleCreatePreview,
  handleApplyPreview,
  handleUndoPreview,
  handleGetPreviewStatus,
  handleDiscardPreview,
  type HandlerDependencies,
} from "@/server/preview/llm-handlers";
import { prisma } from "@/lib/prisma";
import { loadTurnMemory, updateTurnMemory, clearTurnMemory, saveTurnMemory, createShiftOptions } from "@/server/preview/turn-memory";
import { interpretReply } from "@/server/preview/reply-interpreter";
import type { ScheduleFactsSnapshotAssignment } from "@/types/schedule-facts";
import type { Weekday } from "@/types";

const cleanEndpoint = process.env.AZURE_OPENAI_ENDPOINT?.replace(/^https?:\/\//, "").replace(/\/$/, "");

const openai = new OpenAI({
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  baseURL: `https://${cleanEndpoint}/openai/deployments/${process.env.AZURE_OPENAI_DEPLOYMENT_NAME}`,
  defaultQuery: { "api-version": process.env.AZURE_OPENAI_API_VERSION || "2024-02-15-preview" },
  defaultHeaders: {
    "api-key": process.env.AZURE_OPENAI_API_KEY,
  },
});

const BASE_PROMPT = `You are a friendly scheduling expert who helps store managers reason about schedules.

IMPORTANT RULES:
- You are scoped to ONE store and ONE ISO week only (provided in context)
- Keep ALL replies under 8 lines total: 1 headline + 2-4 bullets + 1-2 action suggestions
- Prefer direct counting/math when obvious; use tools only when necessary
- Never expose PII (emails, phones) or cross-store data
- find_employee is for SEARCHING/VERIFYING names, NOT for listing data you already have
- ALWAYS provide a clear answer even if a tool fails - use available data to give your best response

WHEN TO USE find_employee vs eval_query:
âœ… Use find_employee: "Is there someone named Frankk?" (typo verification), "Who is emp_123?" (ID lookup)
âŒ DON'T use find_employee: "List employees working Monday" (use eval_query on assignments/employees)
âŒ DON'T use find_employee: When you already have employee data from a previous query or snapshot

DATA AVAILABLE:
- employees[]: {id, name, alias, weeklyMinutes, weeklyMinutesTarget}
- assignments[]: {id, day, durationMins, employeeId, employeeName, workTypeName}  
- openShifts[]: {id, day, start, end, workTypeName}

DATA SOURCES (CRITICAL - NEVER CONFUSE THESE):
- openShifts[] = UNASSIGNED shifts (no employee assigned yet)
- assignments[] where employeeId exists = ASSIGNED shifts (already have employee)
- assignments[] where employeeId is undefined = also UNASSIGNED
- NEVER guess or hallucinate data - only use what's in the snapshot

WHEN NO OPEN SHIFTS EXIST FOR A ROLE:
- Check if that role has ANY assignments (open or filled) in assignments[]
- If role has filled assignments: Suggest swapping with current employee OR creating new shift
- If role has NO assignments at all: Suggest creating a new shift template
- Always check who currently has similar shifts before suggesting creation

ASSIGNMENT REQUEST HANDLING:
When user says "assign [EMPLOYEE] to [ROLE] on [DAY]":
1. Check openShifts for that role/day combination
2. If NO open shifts but role EXISTS in assignments[]:
   - Find who currently has that shift: assignments[?day=='[DAY]' && workTypeName=='[ROLE]']
   - Response: "[ROLE] on [DAY] is already assigned to [CURRENT_EMPLOYEE]. Would you like to swap them or create a new [ROLE] shift?"
3. If role doesn't exist at all:
   - Response: "No [ROLE] shifts exist on [DAY]. Would you like to create one?"
4. If open shifts exist:
   - Proceed with analyze_candidates or create_preview

KEY COMPARISONS:
- Underworked: weeklyMinutes < weeklyMinutesTarget
- Overworked: weeklyMinutes > weeklyMinutesTarget
- On target: weeklyMinutes == weeklyMinutesTarget
- Always convert minutes to hours when displaying to users (divide by 60)

RESPONSE FORMAT (â‰¤8 lines):
[Headline summarizing the answer]
â€¢ Bullet point 1
â€¢ Bullet point 2
â€¢ [Optional bullet 3-4]
â†’ Suggested next action 1
â†’ [Optional action 2]`;

const ACTION_PLAN_PROMPT = `Action plan:
1. If answer is obvious from the snapshot summary, calculate directly
2. For complex queries, call eval_query with JMESPath expression (max 300 chars)
3. To verify employee names, call find_employee (never guess)
4. For "why" questions, distinguish between:
   a) "Why can't assign [EMPLOYEE] to [ROLE]?" â†’ Use explain_constraint
   b) "Why are [ROLE] shifts not assigned?" â†’ Check openShifts for that role, analyze why
5. If a tool fails, provide the best answer you can with available data
6. Keep response â‰¤8 lines (headline + bullets + actions)

IMPORTANT: DISTINGUISH ROLE vs EMPLOYEE QUERIES:
âŒ WRONG: "Why are Supervisor shifts not assigned?" â†’ explain_constraint(employeeName: "Supervisor")
âœ… RIGHT: "Why are Supervisor shifts not assigned?" â†’ Check openShifts[?workTypeName contains 'Supervisor']
âœ… RIGHT: "Why can't assign Frank to Supervisor?" â†’ explain_constraint(employeeName: "Frank", roleName: "Supervisor")

When user asks "why [ROLE] shifts not assigned":
1. Use eval_query to find: openShifts[?contains(workTypeName, '[ROLE]')]
2. Count open shifts for that role
3. IMPORTANT: Analyze WHY they're unassigned:
   a) Find employees who could work this role (check weeklyMinutes vs target)
   b) For each potential employee, briefly check if they have conflicts on that day
   c) Identify the blocker: "Everyone already assigned", "Scheduling conflicts", "Need more staff"
4. Provide actionable solution with specific employee names

RESPONSE TEMPLATE for "why [ROLE] shifts not assigned":
[X open [ROLE] shifts on [DAY] remain unassigned because...]
â€¢ Reason 1: Alice has conflict (detail)
â€¢ Reason 2: Bob already scheduled (detail)
â€¢ Reason 3: Carol overworked (hours)
â†’ Suggested: Try [SPECIFIC EMPLOYEE] who has [HOURS] available
â†’ Or: Use explain_constraint to check each employee individually

EXAMPLE: "Why are Supervisor shifts not assigned on Monday?"
BAD: "Two Supervisor shifts are unassigned on Monday: 8:00-4:00, 12:00-8:00"
GOOD: "Two Supervisor shifts remain open on Monday because:
â€¢ Frank Miller already has Monday Stock Clerk shift (overlap conflict)
â€¢ David Wilson is overworked (30h/24h target)
â€¢ Alice, Carol have no blocking issues
â†’ Try assigning Alice Johnson (16h/40h target)
â†’ Or Bob Smith (26h/40h target)"

WHEN TO USE EXPLAIN_CONSTRAINT:
- User asks "why can't assign [EMPLOYEE NAME] to [ROLE]?"
- User asks "can we assign [EMPLOYEE NAME] to [SHIFT]?"
- Query has a SPECIFIC EMPLOYEE NAME (not a role name)
- Tool automatically handles: typos in days ("moday" â†’ Monday), role variations ("Supervisor" â†’ "Shift Supervisor")

EXPLANATION TEMPLATE (when using explain_constraint):
[Clear verdict: CAN or CANNOT assign, with reason]
â€¢ Evidence bullet 1 (specific constraint with numbers)
â€¢ Evidence bullet 2 (hours, availability, etc.)
â€¢ [Optional bullet 3 if needed]
â†’ Actionable suggestion based on constraints

COMMON QUERY PATTERNS (JMESPath syntax):
- Employee hours: employees[?name=='Bob Smith'] | [0].weeklyMinutes
- Underworked employees: employees[?weeklyMinutes < weeklyMinutesTarget]
- Overworked employees: employees[?weeklyMinutes > weeklyMinutesTarget]
- List with details: employees[?weeklyMinutes < weeklyMinutesTarget].{name: name, current: weeklyMinutes, target: weeklyMinutesTarget}
- Count underworked: length(employees[?weeklyMinutes < weeklyMinutesTarget])
- Sort by hours (asc): sort_by(employees, &weeklyMinutes)
- Employee assignments: assignments[?employeeId=='<id>']
- Calculate total mins: sum(assignments[?employeeId=='<id>'].durationMins)
- Count open shifts: length(openShifts)
- Find by day: assignments[?day=='MON']
- Multiple fields: employees[*].{name: name, hours: weeklyMinutes, target: weeklyMinutesTarget}

REFUSAL POLICY:
- Refuse non-scheduling requests politely with: "I can only help with scheduling. Try: [example]"
- Refuse requests about other stores/weeks
- Refuse requests for PII or sensitive data

ERROR HANDLING:
- If eval_query fails, try a simpler query or answer from what you know
- If find_employee fails, suggest the user check the employee name spelling
- Never tell users to "contact support" - always provide the best answer possible`;

const DATA_DICTIONARY_PROMPT = `Data dictionary notes:
- openShifts[].workTypeName is the role label for each unassigned shift.
- assignments[].workTypeName mirrors the role name for scheduled shifts.
- templates[].workTypeName exposes the role associated with each template so you can confirm spelling.
Role names are case-sensitive; match the exact casing (e.g. "Cashier"). If you need flexible matching, compare against both common variants.

TIME CONVERSIONS:
- weeklyMinutes and durationMins are in MINUTES - always convert to hours for user display
- To convert: hours = minutes / 60 (e.g., 1560 minutes = 26 hours)
- When displaying hours, use format like "26 hours" or "26.0 hours", not "1560 minutes"

EMPLOYEE HOURS:
- Use weeklyMinutes from employees[] array for current scheduled hours
- Use weeklyMinutesTarget for their target/contracted hours
- Calculate delta: weeklyMinutes - weeklyMinutesTarget to show if under/over target`;

export async function POST(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const requestStartTime = Date.now();
  let chatMetrics = createMetrics(userId);

  try {
    const body = (await request.json()) as {
      message?: string;
      storeId?: string;
      weekId?: string | null;
      assignments?: unknown;
      threadId?: string;
    };
    const { message, storeId, weekId } = body;

    const rawThreadId = typeof body.threadId === "string" ? body.threadId.trim() : "";
    const sanitizedThreadId = rawThreadId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
    const threadId = sanitizedThreadId || "chat";

    chatMetrics.messageLength = message?.length || 0;
    chatMetrics.storeId = storeId;
    chatMetrics.weekId = weekId || undefined;

    if (!message?.trim()) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    if (!process.env.AZURE_OPENAI_API_KEY || !process.env.AZURE_OPENAI_ENDPOINT || !process.env.AZURE_OPENAI_DEPLOYMENT_NAME) {
      console.error("Missing Azure OpenAI configuration:", {
        hasApiKey: !!process.env.AZURE_OPENAI_API_KEY,
        hasEndpoint: !!process.env.AZURE_OPENAI_ENDPOINT,
        hasDeployment: !!process.env.AZURE_OPENAI_DEPLOYMENT_NAME,
      });
      return NextResponse.json({ error: "Azure OpenAI not configured properly" }, { status: 500 });
    }

    console.log("Azure OpenAI Configuration:", {
      endpoint: cleanEndpoint,
      deployment: process.env.AZURE_OPENAI_DEPLOYMENT_NAME,
      apiVersion: process.env.AZURE_OPENAI_API_VERSION,
      baseURL: `https://${cleanEndpoint}/openai/deployments/${process.env.AZURE_OPENAI_DEPLOYMENT_NAME}`,
    });

    const clerkUser = await currentUser();
    const primaryEmail = clerkUser?.primaryEmailAddress?.emailAddress ??
      clerkUser?.emailAddresses?.[0]?.emailAddress ?? undefined;

  const manager = await ensureManager({ clerkId: userId, email: primaryEmail });

  // Declare variables for preview tracking (needed for early return paths too)
  let createdPreviewId: string | null = null;
  let createdPreview: any = null;
  let createdVisualization: any = null; // Track visualization for preview

  // ============================================================================
  // TURN MEMORY INTERCEPTION - Check for short replies first
  // ============================================================================
  
  // Try to load turn memory for this user/store/week
  const turnMemory = storeId && weekId 
    ? await loadTurnMemory(userId, storeId, weekId, threadId)
    : null;
  
  console.log('[Turn Memory Check]', {
    userId,
    storeId,
    weekId,
    threadId,
    hasStoreId: !!storeId,
    hasWeekId: !!weekId,
    turnMemoryFound: !!turnMemory,
    messageLength: message.length,
    message: message.substring(0, 50),
    expectedKey: storeId && weekId ? `turn:${userId}:${storeId}:${weekId}:${threadId}` : 'N/A',
  });
  
  if (turnMemory) {
    console.log('[Turn Memory Details]', {
      mode: turnMemory.mode,
      scope: JSON.stringify(turnMemory.scope),
      hasOptions: !!turnMemory.options,
      optionsCount: turnMemory.options?.length || 0,
      optionIds: turnMemory.options?.map(o => o.optionId) || [],
      lastQuestionId: turnMemory.lastQuestion?.id,
      lastQuestionText: turnMemory.lastQuestion?.text?.substring(0, 100),
    });
  } else {
    console.log('[Turn Memory] NO MEMORY FOUND - will not interpret reply');
  }
  
  // If turn memory exists, try to interpret the reply deterministically
  if (turnMemory && message.trim().length < 50) { // Only interpret short replies
    console.log('[DEBUG interpretReply] BEFORE calling interpretReply:', {
      message,
      messageLength: message.trim().length,
      hasTurnMemory: !!turnMemory,
      turnMemoryMode: turnMemory?.mode,
      turnMemoryScope: turnMemory?.scope,
      hasOptions: !!turnMemory?.options,
      optionsCount: turnMemory?.options?.length || 0,
      options: turnMemory?.options?.map(o => ({ optionId: o.optionId, label: o.label, index: o.index })),
      lastQuestionId: turnMemory?.lastQuestion?.id,
    });
    
    const interpretation = interpretReply(message, turnMemory);
    
    console.log('[Turn Interpreter]', {
      input: message,
      intent: interpretation.intent,
      confidence: interpretation.confidence,
      reasoning: interpretation.reasoning,
      optionId: interpretation.optionId,
      autoApply: interpretation.autoApply,
      selectedOption: interpretation.selectedOption ? {
        optionId: interpretation.selectedOption.optionId,
        label: interpretation.selectedOption.label,
        index: interpretation.selectedOption.index,
      } : undefined,
    });
    
    // Handle SELECT intent (user chose a specific option)
    if (interpretation.intent === 'select' && interpretation.selectedOption) {
      const option = interpretation.selectedOption;
      const isUnassign = turnMemory.scope === 'shift_unassign';
      const autoApplyEnabled = !!interpretation.autoApply && option.fits;

      const selectedEmployeeId = option.employeeId ?? turnMemory.entities.employeeId;
      const selectedEmployeeName = option.employeeName ?? turnMemory.entities.employeeName;

      console.log('[DEBUG SELECT] Employee resolution:', {
        optionEmployeeId: option.employeeId,
        optionEmployeeName: option.employeeName,
        entitiesEmployeeId: turnMemory.entities.employeeId,
        entitiesEmployeeName: turnMemory.entities.employeeName,
        selectedEmployeeId,
        selectedEmployeeName,
        willCreatePreview: !!(selectedEmployeeId && selectedEmployeeName),
      });

      if (!selectedEmployeeId || !selectedEmployeeName) {
        console.warn('[Turn Interpreter] Missing employee context for selection', {
          option,
          entities: turnMemory.entities,
        });
      } else {
        const shiftDay = turnMemory.entities.day ?? (option.shiftId.split('-').pop() as Weekday | undefined);
        const roleLabel = turnMemory.entities.role ?? 'shift';
        const shiftWindow = `${option.startTime}-${option.endTime}`;

        const confirmPrompt = isUnassign
          ? `Create preview to unassign ${selectedEmployeeName} from ${roleLabel} on ${shiftDay ?? 'this day'} ${shiftWindow}?`
          : `Create preview for ${selectedEmployeeName} on ${shiftDay ?? 'this day'} as ${roleLabel} ${shiftWindow}?`;

        const ensureConfirmState = () => {
          updateTurnMemory(userId, storeId!, weekId!, threadId, {
            lastQuestion: {
              id: 'confirm_selection',
              text: confirmPrompt,
              timestamp: Date.now(),
            },
          });
        };

        if (!autoApplyEnabled) {
          ensureConfirmState();
        }

        updateTurnMemory(userId, storeId!, weekId!, threadId, {
          entities: {
            ...turnMemory.entities,
            employeeId: selectedEmployeeId,
            employeeName: selectedEmployeeName,
            day: shiftDay ?? turnMemory.entities.day,
          },
        });
        
        // Create preview immediately
        try {
          const handlerDeps: HandlerDependencies = { 
            prisma, 
            userId, // Clerk user ID for turn memory
            managerId: manager.id, // Database ID for queries
            threadId,
          };
          const toolContext = { storeId: storeId!, weekId: weekId! };
          
          const operations = isUnassign
            ? [{
                type: 'unassign_shift',
                assignmentId: option.assignmentId || option.shiftId,
              }]
            : [{
                type: 'assign_shift',
                employeeId: selectedEmployeeId,
                shiftId: option.shiftId,
                assignmentId: option.assignmentId, // Pass template assignment ID for validation
              }];

          if (isUnassign && !operations[0].assignmentId) {
            throw new Error('Missing assignment ID for unassign operation');
          }

          const explanation = isUnassign
            ? `Unassign ${selectedEmployeeName} from ${roleLabel} on ${shiftDay ?? 'this day'}`
            : `Assign ${selectedEmployeeName} to ${shiftDay ?? 'this day'} ${roleLabel} (${shiftWindow})`;

          const result = await handleCreatePreview(
            {
              operations: operations as any,
              explanation,
            },
            toolContext,
            handlerDeps
          );
          
          console.log('[DEBUG] handleCreatePreview result:', {
            ok: result.ok,
            hasData: !!result.data,
            error: result.error,
            errorCode: result.errorCode,
            message: result.message,
          });
          
          if (result.ok && result.data) {
            const data = result.data as any;
            createdPreviewId = data.previewId;
            
            if (autoApplyEnabled) {
              const applyResult = await handleApplyPreview(
                { previewId: data.previewId },
                toolContext,
                handlerDeps
              );

              if (applyResult.ok) {
                clearTurnMemory(userId, storeId!, weekId!, threadId);

                chatMetrics.replyLength = 160;
                chatMetrics.totalLatencyMs = Date.now() - requestStartTime;
                chatMetrics.toolCallCount = 2;
                chatMetrics.toolsUsed.push('create_preview', 'apply_preview');
                recordMetrics(chatMetrics);

                const appliedMessage = isUnassign
                  ? `?? **Applied!** ${selectedEmployeeName} is no longer scheduled for ${shiftDay ?? 'this day'} ${roleLabel} (${shiftWindow}).`
                  : `?? **Applied!** ${selectedEmployeeName} is now on ${shiftDay ?? 'this day'} ${roleLabel} (${shiftWindow}).`;

                // Save conversation for context
                await saveConversationTurn(threadId, message, appliedMessage);

                return NextResponse.json({
                  reply: appliedMessage,
                  metrics: {
                    latencyMs: chatMetrics.totalLatencyMs,
                    toolCalls: 2,
                    interpretedReply: true,
                  },
                });
              }

              console.warn('[Turn Interpreter] Auto-apply failed, falling back to manual confirmation', {
                previewId: data.previewId,
                error: applyResult.error,
              });
            }

            if (autoApplyEnabled) {
              ensureConfirmState();
            }

            // Update turn memory with preview ID
            updateTurnMemory(userId, storeId!, weekId!, threadId, {
              pendingPreviewId: data.previewId,
            });
            
            // Fetch full preview for instant display
            const previewService = new (await import('@/server/preview/preview-service')).PreviewService(prisma);
            const fullPreview = await previewService.getPreview(data.previewId);
            if (fullPreview) {
              createdPreview = fullPreview;
            }
            
            // Record metrics for short reply handling
            chatMetrics.replyLength = 200;
            chatMetrics.totalLatencyMs = Date.now() - requestStartTime;
            chatMetrics.toolCallCount = autoApplyEnabled ? 2 : 1;
            chatMetrics.toolsUsed.push('create_preview');
            recordMetrics(chatMetrics);

            const reasonLine = option.reason ? `\n\n?? ${option.reason}` : '';
            const previewMessage = isUnassign
              ? `?? Created preview: **Unassign ${selectedEmployeeName}** from **${roleLabel}** on **${shiftDay ?? 'this day'} (${shiftWindow})**${reasonLine}\n\nSay "apply" to confirm or "cancel" to discard.`
              : `?? Created preview: **Assign ${selectedEmployeeName}** to **${shiftDay ?? 'this day'} ${roleLabel} (${shiftWindow})**${reasonLine}\n\nSay "apply" to confirm or "cancel" to discard.`;
            
            // Save conversation for context
            await saveConversationTurn(threadId, message, previewMessage);

            return NextResponse.json({
              reply: previewMessage,
              previewId: createdPreviewId,
              preview: createdPreview,
              metrics: {
                latencyMs: chatMetrics.totalLatencyMs,
                toolCalls: autoApplyEnabled ? 2 : 1,
                interpretedReply: true,
              },
            });
          }
        } catch (error) {
          console.error('[Turn Interpreter] Failed to create preview:', error);
          // Fall through to LLM if preview creation fails
        }
      }
    }

    // Handle CONFIRM intent (user said yes/ok to pending preview)
    else if (interpretation.intent === 'confirm' && turnMemory.pendingPreviewId) {
      try {
        const handlerDeps: HandlerDependencies = { 
          prisma, 
          userId, // Clerk user ID
          managerId: manager.id, // Database ID
          threadId,
        };
        const toolContext = { storeId: storeId!, weekId: weekId! };
        
        const result = await handleApplyPreview(
          { previewId: turnMemory.pendingPreviewId },
          toolContext,
          handlerDeps
        );
        
        if (result.ok) {
          // Clear turn memory after successful application
          clearTurnMemory(userId, storeId!, weekId!, threadId);
          
          chatMetrics.replyLength = 100;
          chatMetrics.totalLatencyMs = Date.now() - requestStartTime;
          chatMetrics.toolCallCount = 1;
          chatMetrics.toolsUsed.push('apply_preview');
          recordMetrics(chatMetrics);
          
          const confirmMessage = `âœ… **Applied!** ${turnMemory.entities.employeeName} is now assigned to ${turnMemory.entities.day}.`;
          
          // Save conversation for context
          await saveConversationTurn(threadId, message, confirmMessage);

          return NextResponse.json({
            reply: confirmMessage,
            metrics: {
              latencyMs: chatMetrics.totalLatencyMs,
              toolCalls: 1,
              interpretedReply: true,
            },
          });
        }
      } catch (error) {
        console.error('[Turn Interpreter] Failed to apply preview:', error);
        // Fall through to LLM
      }
    }
    
    // Handle REJECT intent (user said no/cancel)
    else if (interpretation.intent === 'reject') {
      // Discard pending preview if exists
      if (turnMemory.pendingPreviewId) {
        try {
          const handlerDeps: HandlerDependencies = { 
            prisma, 
            userId, // Clerk user ID
            managerId: manager.id, // Database ID
            threadId,
          };
          const toolContext = { storeId: storeId!, weekId: weekId! };
          
          await handleDiscardPreview(
            { previewId: turnMemory.pendingPreviewId },
            toolContext,
            handlerDeps
          );
        } catch (error) {
          console.error('[Turn Interpreter] Failed to discard preview:', error);
        }
      }
      
      // Clear turn memory
      clearTurnMemory(userId, storeId!, weekId!, threadId);
      
      chatMetrics.replyLength = 50;
      chatMetrics.totalLatencyMs = Date.now() - requestStartTime;
      recordMetrics(chatMetrics);
      
      return NextResponse.json({
        reply: `âŒ Cancelled. What else can I help you with?`,
        metrics: {
          latencyMs: chatMetrics.totalLatencyMs,
          toolCalls: 0,
          interpretedReply: true,
        },
      });
    }
    
    // If confidence is high but no action taken, provide feedback
    if (interpretation.confidence > 0.5) {
      console.log('[Turn Interpreter] High confidence but no action:', interpretation);
    }
  }
  
  // ============================================================================
  // END TURN MEMORY INTERCEPTION
  // ============================================================================

  // Classify intent early for refusal policy
  const intentClassification = classifyIntent(message, { storeId, weekId: weekId || undefined });
  chatMetrics.intent = intentClassification.intent;
  
  if (shouldRefuseRequest(intentClassification)) {
    const refusalMessage = getRefusalResponse(intentClassification);
    chatMetrics.refused = true;
    chatMetrics.replyLength = refusalMessage.length;
    chatMetrics.totalLatencyMs = Date.now() - requestStartTime;
    recordMetrics(chatMetrics);
    
    return NextResponse.json({
      reply: refusalMessage,
      intent: intentClassification.intent,
      refused: true,
    });
  }

  let facts: Awaited<ReturnType<typeof buildScheduleFacts>> | null = null;

    if (storeId) {
      const snapshotStartTime = Date.now();
      try {
        facts = await buildScheduleFacts({
          managerId: manager.id,
          storeId,
          weekId,
          assignmentsOverride: Array.isArray(body.assignments)
            ? (body.assignments as ClientAssignmentInput[])
            : undefined,
        });
        chatMetrics.snapshotBuildMs = Date.now() - snapshotStartTime;
      } catch (factsError) {
        console.error("Failed to build schedule facts for chat", factsError);
      }
    }

    // Use minimal snapshot for LLM
    const minimalSnapshot = facts?.minimalSnapshot;

    if (minimalSnapshot) {
      chatMetrics.snapshotSizeBytes = minimalSnapshot.sizeBytes;
      chatMetrics.truncated = minimalSnapshot.truncated;
      chatMetrics.version = minimalSnapshot.version;
    }

    const scheduleSummary = minimalSnapshot
      ? {
          store: {
            id: minimalSnapshot.storeId,
            name: minimalSnapshot.storeName,
            isoWeek: minimalSnapshot.isoWeek,
            tz: minimalSnapshot.tz,
          },
          totals: {
            employees: minimalSnapshot.employees.length,
            assignments: minimalSnapshot.assignments.length,
            openShifts: minimalSnapshot.openShifts.length,
          },
          sizeBytes: minimalSnapshot.sizeBytes,
          truncated: minimalSnapshot.truncated,
          version: minimalSnapshot.version,
        }
      : null;

    if (storeId && weekId && facts) {
      maybePrepareUnassignTurnMemory({
        message,
        userId,
        storeId,
        weekId,
        threadId,
        facts,
        existingMemory: turnMemory,
      });
    }

    // Load recent conversation history for context (last 3 turns)
    const conversationHistory = await loadConversationHistory(threadId);

    const baseMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: BASE_PROMPT },
      { role: "system", content: ACTION_PLAN_PROMPT },
      { role: "system", content: DATA_DICTIONARY_PROMPT },
      { role: "system", content: PREVIEW_SYSTEM_PROMPT },
    ];

    if (scheduleSummary) {
      baseMessages.push({
        role: "system",
        content: `Schedule summary: ${JSON.stringify(scheduleSummary)}`,
      });
    }

    // Add recent conversation context intelligently
    // Only include if current message is short and looks like a follow-up
    if (conversationHistory.length > 0 && message.trim().length < 100) {
      const lastTurn = conversationHistory[conversationHistory.length - 1];
      const timeSinceLastTurn = Date.now() - lastTurn.timestamp;
      
      // Only add context if last turn was within 2 minutes
      if (timeSinceLastTurn < 2 * 60 * 1000) {
        baseMessages.push({
          role: "system",
          content: `Recent context (user asked "${lastTurn.user}", you replied: "${lastTurn.assistant}"). Use this context to understand pronouns like "them", "their", "those".`,
        });
      }
    }

    baseMessages.push({ role: "user", content: message });

    const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = facts
      ? [
          {
            type: "function",
            function: {
              name: "eval_query",
              description: "Execute a deterministic JMESPath query against the schedule snapshot. Use for filtering, projections, aggregations. Max 300 chars, <50ms timeout. Returns {ok, result, error}.",
              parameters: {
                type: "object",
                properties: {
                  expr: {
                    type: "string",
                    description: "JMESPath expression (max 300 chars). Examples: 'employees[?name==`Alice`]', 'sum(assignments[*].durationMins)', 'length(openShifts)'",
                  },
                },
                required: ["expr"],
              },
            },
          },
          {
            type: "function",
            function: {
              name: "find_employee",
              description: "Search for employees by name, alias, or ID with diacritics-insensitive matching. Use this instead of guessing employee names.",
              parameters: {
                type: "object",
                properties: {
                  query: {
                    type: "string",
                    description: "Employee name, partial name, alias, or ID to search for.",
                  },
                },
                required: ["query"],
              },
            },
          },
          {
            type: "function",
            function: {
              name: "expand_context",
              description: "Expand snapshot with additional data (history, availability). Only use when explicitly asked. Returns expanded snapshot â‰¤50KB.",
              parameters: {
                type: "object",
                properties: {
                  historyWeeks: {
                    type: "number",
                    description: "Number of previous weeks to include in history (0-8).",
                  },
                  availability: {
                    type: "boolean",
                    description: "Include detailed employee availability data.",
                  },
                },
                required: [],
              },
            },
          },
          {
            type: "function",
            function: {
              name: "explain_constraint",
              description: "Systematically check ALL constraints for assigning an employee to a shift. Returns structured reason tree with evidence. Use for 'why' questions about assignments. Handles typos and role variations.",
              parameters: {
                type: "object",
                properties: {
                  employeeName: {
                    type: "string",
                    description: "Employee name (fuzzy matching supported for typos).",
                  },
                  roleName: {
                    type: "string",
                    description: "Role/workType name (fuzzy matching: 'Supervisor' matches 'Shift Supervisor').",
                  },
                  day: {
                    type: "string",
                    description: "Day name (fuzzy matching: 'moday' â†’ Monday, 'tueday' â†’ Tuesday).",
                  },
                },
                required: ["employeeName"],
              },
            },
          },
          {
            type: "function",
            function: {
              name: "resolve_entities",
              description: "Resolve natural language entities (weekdays, roles, employees) to canonical forms. Handles multilingual input, typos, and ambiguous names. Returns confidence scores and alternatives if ambiguous.",
              parameters: {
                type: "object",
                properties: {
                  text: {
                    type: "string",
                    description: "Natural language text containing entities to resolve (e.g., 'moday supervisor', 'lundi', 'Frank').",
                  },
                  locale: {
                    type: "string",
                    description: "Locale for weekday parsing (e.g., 'fr-FR', 'es-ES', 'en-US'). Defaults to 'en-US'.",
                  },
                },
                required: ["text"],
              },
            },
          },
          ...PREVIEW_TOOLS,
        ]
      : [];

    const conversation: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [...baseMessages];
    let finalMessage: OpenAI.Chat.Completions.ChatCompletionMessageParam | null = null;
    let toolUsed = false;
    let attempts = 0;
    const MAX_ATTEMPTS = 3; // Enforce max 3 tool calls per turn
    let toolCallCount = 0;
    const UNSUPPORTED_ACTION_CODE = "UNSUPPORTED_ACTION";
    let unsupportedToolResponse: string | null = null;

    const markUnsupported = (result: { ok?: boolean; errorCode?: string; message?: string } | null | undefined): boolean => {
      if (result?.ok === false && result.errorCode === UNSUPPORTED_ACTION_CODE) {
        const fallbackIntent = createUnsupportedIntent();
        const fallbackMessage = result.message ?? getRefusalResponse(fallbackIntent);
        unsupportedToolResponse = fallbackMessage;
        return true;
      }
      return false;
    };
    
    // Track action data from tool results
    let actionRequired: string | undefined;
    let actionUrl: string | undefined;
    let actionData: any | undefined;

    while (!finalMessage) {
      if (toolCallCount >= MAX_ATTEMPTS) {
        // Max tool calls reached - force final answer
        conversation.push({
          role: "system",
          content: "Tool limit reached. Provide your best answer based on available information.",
        });
      }

      let response;
      try {
        response = await openai.chat.completions.create({
          model: process.env.AZURE_OPENAI_DEPLOYMENT_NAME,
          messages: conversation,
          tools: toolCallCount >= MAX_ATTEMPTS ? undefined : tools,
          temperature: 0,
        });
      } catch (contentFilterError: any) {
        // Log the conversation that triggered the content filter for debugging
        if (contentFilterError.code === 'content_filter') {
          console.error('[Content Filter] Conversation that triggered filter:', {
            conversationLength: conversation.length,
            lastUserMessage: conversation.filter(m => m.role === 'user').slice(-1)[0],
            systemMessages: conversation.filter(m => m.role === 'system').map(m => ({
              role: m.role,
              contentPreview: typeof m.content === 'string' ? m.content.substring(0, 100) : '[complex]'
            })),
          });
        }
        throw contentFilterError;
      }

      const choice = response.choices[0];
      const { message: assistantMessage } = choice;

      if (assistantMessage.tool_calls?.length && toolCallCount < MAX_ATTEMPTS) {
        conversation.push({
          role: "assistant",
          content: assistantMessage.content ?? "",
          tool_calls: assistantMessage.tool_calls,
        });

        toolUsed = true;

        for (const toolCall of assistantMessage.tool_calls) {
          if (toolCall.type !== "function" || !toolCall.function) {
            continue;
          }

          toolCallCount++;

          // Handle eval_query
          if (toolCall.function.name === "eval_query") {
            chatMetrics.evalQueryCount++;
            chatMetrics.toolsUsed.push("eval_query");
            
            if (!minimalSnapshot) {
              conversation.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: JSON.stringify({ 
                  ok: false, 
                  error: "No schedule snapshot available. Use the summary totals from context instead.",
                }),
              });
              continue;
            }

            let expr = "";
            try {
              const args = JSON.parse(toolCall.function.arguments ?? "{}") as { expr?: string };
              expr = args.expr ?? "";
              chatMetrics.exprLengths.push(expr.length);
            } catch {
              conversation.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: JSON.stringify({ 
                  ok: false, 
                  error: "Invalid query arguments. Provide a valid JMESPath expression.",
                }),
              });
              continue;
            }

            const queryStartTime = Date.now();
            const result = runEvalQuery({
              version: minimalSnapshot.version,
              snapshot: minimalSnapshot,
              expr,
            });
            const queryTime = Date.now() - queryStartTime;
            chatMetrics.evalQueryTotalMs = (chatMetrics.evalQueryTotalMs || 0) + queryTime;

            // Enhance error messages to guide the LLM
            if (!result.ok && result.error) {
              const enhancedError = {
                ...result,
                error: result.error,
                hint: "Try a simpler query or answer from available summary data. Don't tell users about technical errors.",
              };
              conversation.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: JSON.stringify(enhancedError),
              });
            } else {
              conversation.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: JSON.stringify(result),
              });
            }
          }

          // Handle find_employee
          else if (toolCall.function.name === "find_employee") {
            chatMetrics.toolsUsed.push("find_employee");
            let query = "";
            try {
              const args = JSON.parse(toolCall.function.arguments ?? "{}") as { query?: string };
              query = args.query ?? "";
            } catch {
              conversation.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: JSON.stringify({ 
                  ok: false, 
                  error: "Invalid arguments. Provide an employee name or ID to search.",
                }),
              });
              continue;
            }

            try {
              const result = await findEmployee(
                { query },
                { storeId, managerId: manager.id, limit: 5 }
              );
              
              // Enhance empty results with helpful message
              if (result.ok && (!result.employees || result.employees.length === 0)) {
                conversation.push({
                  role: "tool",
                  tool_call_id: toolCall.id,
                  content: JSON.stringify({
                    ...result,
                    hint: `No employees found matching "${query}". Check spelling or try a different name.`,
                  }),
                });
              } else {
                conversation.push({
                  role: "tool",
                  tool_call_id: toolCall.id,
                  content: JSON.stringify(result),
                });
              }
            } catch (error) {
              conversation.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: JSON.stringify({
                  ok: false,
                  error: error instanceof Error ? error.message : "Search failed",
                  hint: "Employee search unavailable. Try using exact names from the employees list.",
                }),
              });
            }
          }

          // Handle expand_context
          else if (toolCall.function.name === "expand_context") {
            chatMetrics.toolsUsed.push("expand_context");
            
            if (!storeId || !weekId) {
              conversation.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: JSON.stringify({ ok: false, error: "Store and week context required" }),
              });
              continue;
            }

            let historyWeeks = 0;
            let availability = false;
            try {
              const args = JSON.parse(toolCall.function.arguments ?? "{}") as {
                historyWeeks?: number;
                availability?: boolean;
              };
              historyWeeks = args.historyWeeks ?? 0;
              availability = args.availability ?? false;
            } catch {
              conversation.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: JSON.stringify({ ok: false, error: "Invalid arguments" }),
              });
              continue;
            }

            try {
              const result = await expandContext(
                { historyWeeks, availability },
                { managerId: manager.id, storeId, weekId }
              );
              conversation.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: JSON.stringify({ ok: true, ...result }),
              });
            } catch (error) {
              conversation.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: JSON.stringify({
                  ok: false,
                  error: error instanceof Error ? error.message : "Expansion failed",
                }),
              });
            }
          }

          // Handle explain_constraint
          else if (toolCall.function.name === "explain_constraint") {
            chatMetrics.toolsUsed.push("explain_constraint");
            
            if (!minimalSnapshot) {
              conversation.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: JSON.stringify({ 
                  ok: false, 
                  error: "No schedule snapshot available",
                }),
              });
              continue;
            }

            let employeeName = "";
            let roleName: string | undefined;
            let day: string | undefined;
            try {
              const args = JSON.parse(toolCall.function.arguments ?? "{}") as {
                employeeName?: string;
                roleName?: string;
                day?: string;
              };
              employeeName = args.employeeName ?? "";
              roleName = args.roleName;
              day = args.day;
            } catch {
              conversation.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: JSON.stringify({ 
                  ok: false, 
                  error: "Invalid arguments. Provide at least employeeName.",
                }),
              });
              continue;
            }

            try {
              const result = explainConstraint(
                { employeeName, roleName, day },
                minimalSnapshot
              );
              conversation.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: JSON.stringify(result),
              });
            } catch (error) {
              conversation.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: JSON.stringify({
                  ok: false,
                  error: error instanceof Error ? error.message : "Constraint check failed",
                }),
              });
            }
          }
          // Handle resolve_entities
          else if (toolCall.function.name === "resolve_entities") {
            chatMetrics.toolsUsed.push("resolve_entities");
            toolUsed = true;

            let text: string;
            let locale: string | undefined;

            try {
              const args = JSON.parse(toolCall.function.arguments ?? "{}") as {
                text?: string;
                locale?: string;
              };
              text = args.text ?? "";
              locale = args.locale;
            } catch {
              conversation.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: JSON.stringify({ 
                  ok: false, 
                  error: "Invalid arguments. Provide text to resolve.",
                }),
              });
              continue;
            }

            try {
              const result = resolveEntities(
                { text, locale },
                minimalSnapshot!
              );
              conversation.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: JSON.stringify(result),
              });
            } catch (error) {
              conversation.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: JSON.stringify({
                  ok: false,
                  error: error instanceof Error ? error.message : "Entity resolution failed",
                }),
              });
            }
          }

          // Handle analyze_shift_candidates
          else if (toolCall.function.name === "analyze_shift_candidates") {
            chatMetrics.toolsUsed.push("analyze_shift_candidates");
            toolUsed = true;

            if (!storeId || !weekId) {
              conversation.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: JSON.stringify({
                  ok: false,
                  error: "Store and week context required for candidate analysis",
                }),
              });
              continue;
            }

            try {
              const args = JSON.parse(toolCall.function.arguments ?? "{}");
              const handlerDeps: HandlerDependencies = { 
                prisma, 
                userId, // Clerk user ID for turn memory
                managerId: manager.id, // Database ID for queries
                threadId,
              };
              const toolContext = { storeId: storeId!, weekId: weekId! };

              const result = await handleAnalyzeCandidates(args, toolContext, handlerDeps);

              const unsupported = markUnsupported(result);

              conversation.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: JSON.stringify(result),
              });

              if (unsupported) {
                break;
              }
            } catch (error) {
              conversation.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: JSON.stringify({
                  ok: false,
                  error: error instanceof Error ? error.message : "Failed to analyze candidates",
                }),
              });
            }
          }

          // Handle create_shift_template
          else if (toolCall.function.name === "create_shift_template") {
            chatMetrics.toolsUsed.push("create_shift_template");
            toolUsed = true;

            if (!storeId || !weekId) {
              conversation.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: JSON.stringify({
                  ok: false,
                  error: "Store and week context required for shift creation",
                }),
              });
              continue;
            }

            try {
              const args = JSON.parse(toolCall.function.arguments ?? "{}");
              const handlerDeps: HandlerDependencies = { 
                prisma, 
                userId, // Clerk user ID for turn memory
                managerId: manager.id, // Database ID for queries
                threadId,
              };
              const toolContext = { storeId: storeId!, weekId: weekId! };

              const result = await handleCreateShiftTemplate(args, toolContext, handlerDeps);

              // Capture action data if present
              if (!result.ok && result.data) {
                const resultData = result.data as any;
                if (resultData.actionRequired) {
                  actionRequired = resultData.actionRequired;
                  actionUrl = resultData.actionUrl;
                  actionData = resultData.actionData;
                }
              }

              // Capture preview ID if created
              if (result.ok && result.data) {
                const data = result.data as any;
                if (data.previewId) {
                  createdPreviewId = data.previewId;
                  
                  // Capture visualization if provided
                  if (data.visualization) {
                    createdVisualization = data.visualization;
                  }
                  
                  // Fetch full preview for instant display
                  try {
                    const previewService = new (await import('@/server/preview/preview-service')).PreviewService(prisma);
                    const fullPreview = await previewService.getPreview(data.previewId);
                    if (fullPreview) {
                      createdPreview = fullPreview;
                    }
                  } catch (err) {
                    console.error('Failed to fetch preview for shift creation:', err);
                  }
                }
              }

              const unsupported = markUnsupported(result);

              conversation.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: JSON.stringify(result),
              });

              if (unsupported) {
                break;
              }
            } catch (error) {
              conversation.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: JSON.stringify({
                  ok: false,
                  error: error instanceof Error ? error.message : "Failed to create shift template",
                }),
              });
            }
          }

          // Handle analyze_swap_candidates
          else if (toolCall.function.name === "analyze_swap_candidates") {
            chatMetrics.toolsUsed.push("analyze_swap_candidates");
            toolUsed = true;

            if (!storeId || !weekId) {
              conversation.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: JSON.stringify({
                  ok: false,
                  error: "Store and week context required for swap analysis",
                }),
              });
              continue;
            }

            try {
              const args = JSON.parse(toolCall.function.arguments ?? "{}");
              const handlerDeps: HandlerDependencies = { 
                prisma, 
                userId, // Clerk user ID for turn memory
                managerId: manager.id, // Database ID for queries
                threadId,
              };
              const toolContext = { storeId: storeId!, weekId: weekId! };

              const result = await handleAnalyzeSwapCandidates(args, toolContext, handlerDeps);

              // Capture preview ID if created
              if (result.ok && result.data) {
                const data = result.data as any;
                if (data.previewId) {
                  createdPreviewId = data.previewId;
                  
                  // Fetch full preview for instant display
                  try {
                    const previewService = new (await import('@/server/preview/preview-service')).PreviewService(prisma);
                    const fullPreview = await previewService.getPreview(data.previewId);
                    if (fullPreview) {
                      createdPreview = fullPreview;
                    }
                  } catch (err) {
                    console.error('Failed to fetch preview for employee swap:', err);
                  }
                }
              }

              const unsupported = markUnsupported(result);

              conversation.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: JSON.stringify(result),
              });

              if (unsupported) {
                break;
              }
            } catch (error) {
              conversation.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: JSON.stringify({
                  ok: false,
                  error: error instanceof Error ? error.message : "Failed to analyze swap",
                }),
              });
            }
          }

          // Handle check_eligible_candidates
          else if (toolCall.function.name === "check_eligible_candidates") {
            chatMetrics.toolsUsed.push("check_eligible_candidates");
            toolUsed = true;

            if (!storeId || !weekId) {
              conversation.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: JSON.stringify({
                  ok: false,
                  error: "Store and week context required for eligibility check",
                }),
              });
              continue;
            }

            try {
              const args = JSON.parse(toolCall.function.arguments ?? "{}");
              const handlerDeps: HandlerDependencies = { 
                prisma, 
                userId,
                managerId: manager.id,
                threadId,
              };
              const toolContext = { storeId: storeId!, weekId: weekId! };

              const result = await handleCheckEligibleCandidates(args, toolContext, handlerDeps);

              const unsupported = markUnsupported(result);

              conversation.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: JSON.stringify(result),
              });

              if (unsupported) {
                break;
              }
            } catch (error) {
              conversation.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: JSON.stringify({
                  ok: false,
                  error: error instanceof Error ? error.message : "Failed to check eligibility",
                }),
              });
            }
          }

          // Handle create_preview
          else if (toolCall.function.name === "create_preview") {
            chatMetrics.toolsUsed.push("create_preview");
            toolUsed = true;

            if (!storeId || !weekId) {
              conversation.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: JSON.stringify({ 
                  ok: false, 
                  error: "Store and week context required for preview operations",
                }),
              });
              continue;
            }

            try {
              const args = JSON.parse(toolCall.function.arguments ?? "{}");
              const handlerDeps: HandlerDependencies = { 
                prisma, 
                userId, // Clerk user ID
                managerId: manager.id, // Database ID
                threadId,
              };
              const toolContext = { storeId: storeId!, weekId: weekId! };
              
              const result = await handleCreatePreview(args, toolContext, handlerDeps);
              
              // Capture preview ID and fetch full preview for frontend
              if (result.ok && result.data) {
                const data = result.data as any;
                if (data.previewId) {
                  createdPreviewId = data.previewId;
                  
                  // Fetch full preview immediately for instant display
                  try {
                    const previewService = new (await import('@/server/preview/preview-service')).PreviewService(prisma);
                    const fullPreview = await previewService.getPreview(data.previewId);
                    if (fullPreview) {
                      createdPreview = fullPreview;
                    }
                  } catch (err) {
                    console.error('Failed to fetch preview for instant display:', err);
                  }
                }
              }
              
              const unsupported = markUnsupported(result);

              conversation.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: JSON.stringify(result),
              });

              if (unsupported) {
                break;
              }
            } catch (error) {
              conversation.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: JSON.stringify({
                  ok: false,
                  error: error instanceof Error ? error.message : "Preview creation failed",
                }),
              });
            }
          }

          // Handle apply_preview
          else if (toolCall.function.name === "apply_preview") {
            chatMetrics.toolsUsed.push("apply_preview");
            toolUsed = true;

            try {
              const args = JSON.parse(toolCall.function.arguments ?? "{}");
              const handlerDeps: HandlerDependencies = { 
                prisma, 
                userId, // Clerk user ID
                managerId: manager.id, // Database ID
                threadId,
              };
              const toolContext = { storeId: storeId!, weekId: weekId! };
              
              const result = await handleApplyPreview(args, toolContext, handlerDeps);
              conversation.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: JSON.stringify(result),
              });
            } catch (error) {
              conversation.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: JSON.stringify({
                  ok: false,
                  error: error instanceof Error ? error.message : "Preview application failed",
                }),
              });
            }
          }

          // Handle undo_preview
          else if (toolCall.function.name === "undo_preview") {
            chatMetrics.toolsUsed.push("undo_preview");
            toolUsed = true;

            try {
              const args = JSON.parse(toolCall.function.arguments ?? "{}");
              const handlerDeps: HandlerDependencies = { 
                prisma, 
                userId, // Clerk user ID
                managerId: manager.id, // Database ID
                threadId,
              };
              const toolContext = { storeId: storeId!, weekId: weekId! };
              
              const result = await handleUndoPreview(args, toolContext, handlerDeps);
              conversation.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: JSON.stringify(result),
              });
            } catch (error) {
              conversation.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: JSON.stringify({
                  ok: false,
                  error: error instanceof Error ? error.message : "Preview undo failed",
                }),
              });
            }
          }

          // Handle get_preview_status
          else if (toolCall.function.name === "get_preview_status") {
            chatMetrics.toolsUsed.push("get_preview_status");
            toolUsed = true;

            try {
              const args = JSON.parse(toolCall.function.arguments ?? "{}");
              const handlerDeps: HandlerDependencies = { 
                prisma, 
                userId, // Clerk user ID
                managerId: manager.id, // Database ID
                threadId,
              };
              const toolContext = { storeId: storeId!, weekId: weekId! };
              
              const result = await handleGetPreviewStatus(args, toolContext, handlerDeps);
              conversation.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: JSON.stringify(result),
              });
            } catch (error) {
              conversation.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: JSON.stringify({
                  ok: false,
                  error: error instanceof Error ? error.message : "Preview status check failed",
                }),
              });
            }
          }

          // Handle discard_preview
          else if (toolCall.function.name === "discard_preview") {
            chatMetrics.toolsUsed.push("discard_preview");
            toolUsed = true;

            try {
              const args = JSON.parse(toolCall.function.arguments ?? "{}");
              const handlerDeps: HandlerDependencies = { 
                prisma, 
                userId, // Clerk user ID
                managerId: manager.id, // Database ID
                threadId,
              };
              const toolContext = { storeId: storeId!, weekId: weekId! };
              
              const result = await handleDiscardPreview(args, toolContext, handlerDeps);
              conversation.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: JSON.stringify(result),
              });
            } catch (error) {
              conversation.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: JSON.stringify({
                  ok: false,
                  error: error instanceof Error ? error.message : "Preview discard failed",
                }),
              });
            }
          }
        }

        if (unsupportedToolResponse) {
          finalMessage = {
            role: "assistant",
            content: unsupportedToolResponse,
          };
          break;
        }

        continue;
      }

      if (facts && !toolUsed && attempts < MAX_ATTEMPTS && toolCallCount === 0) {
        attempts += 1;
        conversation.push({ role: "assistant", content: assistantMessage.content ?? "" });
        conversation.push({
          role: "system",
          content:
            "Reminder: You can call tools if needed (eval_query, find_employee). For employee hours questions, use: employees[?name=='Full Name'] | [0].weeklyMinutes. For simple questions, answer directly. Keep response â‰¤8 lines.",
        });
        continue;
      }

      finalMessage = assistantMessage;
    }

    const aiReply = finalMessage.content || "I'm here to help with your scheduling questions.";

    chatMetrics.replyLength = aiReply.length;
    chatMetrics.toolCallCount = toolCallCount;
    chatMetrics.totalLatencyMs = Date.now() - requestStartTime;
    chatMetrics.llmLatencyMs = chatMetrics.totalLatencyMs - (chatMetrics.snapshotBuildMs || 0) - (chatMetrics.evalQueryTotalMs || 0);
    
    recordMetrics(chatMetrics);

    // Save conversation turn for context in follow-up questions
    if (typeof aiReply === 'string') {
      await saveConversationTurn(threadId, message, aiReply);
    }

    const responsePayload: any = {
      reply: aiReply,
      facts,
      previewId: createdPreviewId, // Include preview ID for frontend
      preview: createdPreview, // Include full preview object for instant display
      visualization: createdVisualization, // Include visualization for calendar display
      metrics: {
        latencyMs: chatMetrics.totalLatencyMs,
        toolCalls: chatMetrics.toolCallCount,
        snapshotSizeKB: chatMetrics.snapshotSizeBytes ? (chatMetrics.snapshotSizeBytes / 1024).toFixed(1) : undefined,
        truncated: chatMetrics.truncated,
      },
    };
    
    // Include action data if present
    if (actionRequired) {
      responsePayload.actionRequired = actionRequired;
      responsePayload.actionUrl = actionUrl;
      responsePayload.actionData = actionData;
    }

    return NextResponse.json(responsePayload);
  } catch (error) {
    console.error("Chat API error:", error);

    // Record error metrics if chatMetrics exists
    if (typeof chatMetrics !== 'undefined') {
      chatMetrics.error = error instanceof Error ? error.message : "Unknown error";
      chatMetrics.totalLatencyMs = Date.now() - requestStartTime;
      recordMetrics(chatMetrics);
    }

    if (error instanceof Error) {
      if (error.message.includes("ENOTFOUND")) {
        return NextResponse.json(
          {
            error: "Cannot connect to Azure OpenAI",
            details: "Please check your AZURE_OPENAI_ENDPOINT configuration",
            endpoint: cleanEndpoint,
          },
          { status: 500 },
        );
      }
      if (error.message.includes("401") || error.message.includes("Unauthorized")) {
        return NextResponse.json(
          {
            error: "Azure OpenAI authentication failed",
            details: "Please check your AZURE_OPENAI_API_KEY",
          },
          { status: 500 },
        );
      }
      if (error.message.includes("404")) {
        return NextResponse.json(
          {
            error: "Azure OpenAI deployment not found",
            details: "Please check your AZURE_OPENAI_DEPLOYMENT_NAME",
            deployment: process.env.AZURE_OPENAI_DEPLOYMENT_NAME,
          },
          { status: 500 },
        );
      }
    }

    return NextResponse.json(
      {
        error: "Failed to process request",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}


const DAY_KEYWORDS: Record<string, Weekday> = {
  monday: "MON",
  mon: "MON",
  tuesday: "TUE",
  tue: "TUE",
  wednesday: "WED",
  wed: "WED",
  thursday: "THU",
  thu: "THU",
  friday: "FRI",
  fri: "FRI",
  saturday: "SAT",
  sat: "SAT",
  sunday: "SUN",
  sun: "SUN",
};

function normalizeText(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

function findEmployeeMatch(message: string, assignments: ScheduleFactsSnapshotAssignment[], employeeNames: Map<string, string>) {
  const normalizedMessage = normalizeText(message);

  let bestMatch: { employeeId: string; name: string; score: number } | null = null;

  for (const [employeeId, name] of employeeNames.entries()) {
    const normalizedName = normalizeText(name);
    if (!normalizedMessage.includes(normalizedName)) {
      const firstName = normalizedName.split(" ")[0];
      if (!firstName || !normalizedMessage.includes(firstName)) {
        continue;
      }
      // Match on first name only - lower confidence
      if (!bestMatch || bestMatch.score < 1) {
        bestMatch = { employeeId, name, score: 1 };
      }
      continue;
    }

    // Full name match
    if (!bestMatch || bestMatch.score < 2) {
      bestMatch = { employeeId, name, score: 2 };
    }
  }

  if (bestMatch) {
    return { employeeId: bestMatch.employeeId, employeeName: bestMatch.name };
  }

  // Fallback: if only one employee has assignments mentioned in message
  const uniqueEmployees = new Set(
    assignments
      .filter((assignment) => assignment.employeeId)
      .map((assignment) => assignment.employeeId!)
  );

  if (uniqueEmployees.size === 1) {
    const employeeId = uniqueEmployees.values().next().value as string;
    const name = employeeNames.get(employeeId);
    if (name) {
      return { employeeId, employeeName: name };
    }
  }

  return null;
}

function detectDay(message: string): Weekday | null {
  const normalizedMessage = normalizeText(message);
  for (const [keyword, day] of Object.entries(DAY_KEYWORDS)) {
    if (normalizedMessage.includes(keyword)) {
      return day;
    }
  }
  return null;
}

function detectRole(message: string, assignments: ScheduleFactsSnapshotAssignment[]): string | null {
  const normalizedMessage = normalizeText(message);
  const workTypes = Array.from(
    new Set(assignments.map((assignment) => assignment.workTypeName).filter(Boolean))
  ) as string[];

  let bestMatch: string | null = null;
  let bestLength = 0;

  for (const workType of workTypes) {
    const normalizedWorkType = normalizeText(workType);
    if (normalizedWorkType && normalizedMessage.includes(normalizedWorkType)) {
      if (normalizedWorkType.length > bestLength) {
        bestMatch = workType;
        bestLength = normalizedWorkType.length;
      }
    }
  }

  return bestMatch;
}

function calculateDurationHours(start?: string, end?: string): number {
  if (!start || !end) return 0;
  const [startHour, startMinute] = start.split(":").map(Number);
  const [endHour, endMinute] = end.split(":").map(Number);
  const diff = (endHour * 60 + endMinute) - (startHour * 60 + startMinute);
  return Math.max(0, Math.round((diff / 60) * 10) / 10);
}

function maybePrepareUnassignTurnMemory(params: {
  message: string;
  userId: string;
  storeId: string;
  weekId: string;
  threadId: string;
  facts: Awaited<ReturnType<typeof buildScheduleFacts>>;
  existingMemory: ReturnType<typeof loadTurnMemory> | null;
}) {
  const { message, userId, storeId, weekId, threadId, facts, existingMemory } = params;
  if (!message || !message.toLowerCase().includes("unassign")) return;

  if (!facts?.snapshot?.assignments?.length) return;
  if (existingMemory?.pendingPreviewId) return;

  const assignments = facts.snapshot.assignments.filter((assignment) => assignment.employeeId);
  if (assignments.length === 0) return;

  const employeeNames = new Map<string, string>();
  facts.snapshot.employees.forEach((employee) => {
    employeeNames.set(employee.id, employee.name);
  });

  const matchedEmployee = findEmployeeMatch(message, assignments, employeeNames);
  if (!matchedEmployee) return;

  const matchedDay = detectDay(message);
  const matchedRole = detectRole(message, assignments);

  const filtered = assignments.filter((assignment) => {
    if (assignment.employeeId !== matchedEmployee.employeeId) return false;
    if (matchedDay && assignment.day !== matchedDay) return false;
    if (matchedRole && normalizeText(assignment.workTypeName || "") !== normalizeText(matchedRole)) return false;
    return true;
  });

  if (filtered.length === 0) return;

  const candidates = filtered.filter((assignment) => assignment.start && assignment.end).map((assignment) => {
    const start = assignment.start!;
    const end = assignment.end!;
    const label = `${assignment.workTypeName || "Shift"} (${start}-${end})`;
    const shiftId = assignment.sourceTemplateId
      ? `${assignment.sourceTemplateId}-${assignment.day}`
      : assignment.id;

    return {
      shiftId,
      templateId: assignment.sourceTemplateId || "assignment",
      label,
      startTime: start,
      endTime: end,
      durationHours: calculateDurationHours(assignment.start, assignment.end),
      fits: true,
      reason: "Currently scheduled shift",
      assignmentId: assignment.id,
    };
  });

  if (candidates.length === 0) {
    return;
  }

  const options = createShiftOptions(candidates);
  const primary = assignments.find((assignment) => assignment.employeeId === matchedEmployee.employeeId);

  const entities = {
    employeeId: matchedEmployee.employeeId,
    employeeName: matchedEmployee.employeeName,
    day: (matchedDay || primary?.day || "MON") as Weekday,
    role: matchedRole || primary?.workTypeName || "Shift",
    storeId,
    weekId,
  };

  const questionText = options.length === 1
    ? `Unassign ${matchedEmployee.employeeName} from ${options[0].label} on ${entities.day}?`
    : `Which shift should I unassign ${matchedEmployee.employeeName} from?`;

  saveTurnMemory(userId, storeId, weekId, threadId, {
    scope: 'shift_unassign',
    threadId,
    entities,
    lastQuestion: {
      id: 'confirm_selection',
      text: questionText,
      timestamp: Date.now(),
    },
    options,
  });

  console.log('[Turn Memory] Prepared unassign context:', {
    userId,
    storeId,
    weekId,
    employee: matchedEmployee.employeeName,
    candidateCount: options.length,
  });
}




