import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import OpenAI from "openai";

import { ensureManager } from "@/server/manager";
import { buildScheduleFacts } from "@/server/schedule/facts-builder";
import { runEvalQuery } from "@/server/schedule/eval-query";
import { findEmployee } from "@/server/schedule/find-employee";
import { expandContext } from "@/server/schedule/expand-context";
import { classifyIntent, shouldRefuseRequest, getRefusalResponse } from "@/server/schedule/intent-guard";
import { createMetrics, recordMetrics } from "@/server/schedule/metrics";
import type { ClientAssignmentInput } from "@/types";

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

CRITICAL CONSTRAINTS:
- You are scoped to ONE store and ONE ISO week only (provided in context)
- Keep ALL replies under 8 lines total: 1 headline + 2-4 bullets + 1-2 action suggestions
- Prefer direct counting/math when obvious; use tools only when necessary
- Never expose PII (emails, phones) or cross-store data
- Never guess employee names - use find_employee tool to verify
- ALWAYS provide a clear answer even if a tool fails - use available data to give your best response

DATA AVAILABLE:
- employees[]: {id, name, alias, weeklyMinutes, weeklyMinutesTarget}
- assignments[]: {id, day, durationMins, employeeId, workTypeName}  
- openShifts[]: {id, day, start, end, workTypeName}

RESPONSE FORMAT (≤8 lines):
[Headline summarizing the answer]
• Bullet point 1
• Bullet point 2
• [Optional bullet 3-4]
→ Suggested next action 1
→ [Optional action 2]`;

const ACTION_PLAN_PROMPT = `Action plan:
1. If answer is obvious from the snapshot summary, calculate directly
2. For complex queries, call eval_query with JMESPath expression (max 300 chars)
3. To verify employee names, call find_employee (never guess)
4. If a tool fails, provide the best answer you can with available data
5. Keep response ≤8 lines (headline + bullets + actions)

COMMON QUERY PATTERNS (JMESPath syntax):
- Employee hours: employees[?name=='Bob Smith'] | [0].weeklyMinutes
- Employee assignments: assignments[?employeeId=='<id>']
- Calculate hours from assignments: sum(assignments[?employeeId=='<id>'].durationMins)
- Count open shifts: length(openShifts)
- Find by day: assignments[?day=='MON']
- Group by employee: assignments[*].{emp: employeeId, mins: durationMins}

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
    };
    const { message, storeId, weekId } = body;

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

    const baseMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: BASE_PROMPT },
      { role: "system", content: ACTION_PLAN_PROMPT },
      { role: "system", content: DATA_DICTIONARY_PROMPT },
    ];

    if (scheduleSummary) {
      baseMessages.push({
        role: "system",
        content: `Schedule summary: ${JSON.stringify(scheduleSummary)}`,
      });
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
              description: "Expand snapshot with additional data (history, availability). Only use when explicitly asked. Returns expanded snapshot ≤50KB.",
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
        ]
      : [];

    const conversation: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [...baseMessages];
    let finalMessage: OpenAI.Chat.Completions.ChatCompletionMessageParam | null = null;
    let toolUsed = false;
    let attempts = 0;
    const MAX_ATTEMPTS = 3; // Enforce max 3 tool calls per turn
    let toolCallCount = 0;

    while (!finalMessage) {
      if (toolCallCount >= MAX_ATTEMPTS) {
        // Max tool calls reached - force final answer
        conversation.push({
          role: "system",
          content: "Tool limit reached. Provide your best answer based on available information.",
        });
      }

      const response = await openai.chat.completions.create({
        model: process.env.AZURE_OPENAI_DEPLOYMENT_NAME,
        messages: conversation,
        tools: toolCallCount >= MAX_ATTEMPTS ? undefined : tools,
        temperature: 0,
      });

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
        }

        continue;
      }

      if (facts && !toolUsed && attempts < MAX_ATTEMPTS && toolCallCount === 0) {
        attempts += 1;
        conversation.push({ role: "assistant", content: assistantMessage.content ?? "" });
        conversation.push({
          role: "system",
          content:
            "Reminder: You can call tools if needed (eval_query, find_employee). For employee hours questions, use: employees[?name=='Full Name'] | [0].weeklyMinutes. For simple questions, answer directly. Keep response ≤8 lines.",
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

    return NextResponse.json({
      reply: aiReply,
      facts,
      metrics: {
        latencyMs: chatMetrics.totalLatencyMs,
        toolCalls: chatMetrics.toolCallCount,
        snapshotSizeKB: chatMetrics.snapshotSizeBytes ? (chatMetrics.snapshotSizeBytes / 1024).toFixed(1) : undefined,
        truncated: chatMetrics.truncated,
      },
    });
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

