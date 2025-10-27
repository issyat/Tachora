/**
 * Enhanced AnswerPack Assistant with LLM Function Calling
 * 
 * Uses GPT-4 with function calling to fetch data and reason over it.
 * Handles multilingual I/O, conversation memory, and smart entity resolution.
 */

import OpenAI from "openai";
import { fetchAnswerPack } from "./data/answer-pack";
import { MemoryService, ThreadMemory } from "./services/memory";

// Initialize OpenAI client (supports both OpenAI and Azure OpenAI)
const openai = new OpenAI({
  apiKey: process.env.AZURE_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
  baseURL: process.env.AZURE_OPENAI_ENDPOINT 
    ? `${process.env.AZURE_OPENAI_ENDPOINT}/openai/deployments/${process.env.AZURE_OPENAI_DEPLOYMENT_NAME}`
    : undefined,
  defaultQuery: process.env.AZURE_OPENAI_API_KEY ? { 'api-version': '2024-08-01-preview' } : undefined,
  defaultHeaders: process.env.AZURE_OPENAI_API_KEY ? { 'api-key': process.env.AZURE_OPENAI_API_KEY } : undefined,
});

const SYSTEM_PROMPT = `You are a multilingual workforce scheduling assistant. You help managers with their schedules by fetching data and reasoning over it.

MULTILINGUAL CAPABILITIES:
- Detect input language (EN/FR/NL) and respond in the same language
- Understand day aliases: "Fri"/"vend"/"vr" → Friday, "Mon"/"lun"/"ma" → Monday
- Recognize dayparts: "morning"/"matin"/"ochtend" → 08:00-12:00, "afternoon"/"après-midi"/"namiddag" → 12:00-16:00, "evening"/"soir"/"avond" → 16:00-22:00
- Handle relative dates: "tomorrow"/"demain"/"morgen", "this week"/"cette semaine"/"deze week"

SMART ENTITY RESOLUTION:
- Names: Handle partial names, nicknames (Bob→Robert, Bill→William), fuzzy matching
- If unique match → use it automatically and show full name in scope
- If multiple matches → list options with store names, ask user to choose
- If no matches → suggest similar names from the data
- Dates: If weekday without week context is ambiguous, ask "this week or next week?" with date ranges

CONVERSATION MEMORY (use the provided threadMemory):
- Remember selected employee, work types, cross-store preference, language
- Use context to avoid re-asking: "And on Saturday?" should reuse previous employee
- Update memory when user makes selections

GROUNDING RULES:
1. ONLY use data from fetch_manager_context tool - never speculate
2. Always output exactly 4 sections:
   - **Scope** (or **Portée**/**Bereik**): What data you're looking at
   - **Assumptions** (or **Hypothèses**/**Aannames**): Interpretations applied - MUST check crossStoreInfo.crossStoreEmployeesCount and if > 0, state that cross-store hours ARE INCLUDED for the named employees
   - **Sources** (or **Sources**/**Bronnen**): DB entities used
   - **Answer** (or **Réponse**/**Antwoord**): The actual answer

3. For missing data, state explicitly what's missing and how to fix it
4. Use 24-hour format for times (HH:MM)
5. Show absolute date ranges for "this week"
6. Respect cross-store settings
7. By default, only Published schedules are included. If you need to see Draft schedules, call the function with includeDraft: true

CROSS-STORE EMPLOYEE HANDLING - MANDATORY:
- FIRST check the CROSS_STORE_NOTICE field in the data - this tells you exactly what to say
- If CROSS_STORE_NOTICE mentions employees, you MUST include ALL those employees in your analysis
- Look for isCrossStoreEmployee: true in the hoursThisWeek data
- NEVER EVER say "cross-store hours are excluded" when cross-store employees are present
- The hoursThisWeek data for cross-store employees is COMPLETE - includes all their hours from all stores
- In assumptions, state exactly what the CROSS_STORE_NOTICE tells you
- Include ALL employees from hoursThisWeek in your weekly target analysis

TIME FORMATTING RULES:
- ALWAYS convert minutes to hours for user-friendly display
- Use decimal format: 480 minutes = 8.0 hours, 90 minutes = 1.5 hours
- For employee hours and targets, show format: "Scheduled X hours, target Y hours, deficit/surplus Z hours"
- For shift durations, show hours when > 60 minutes, otherwise show minutes
- Examples: "Alice: 32.0 hours scheduled, 40.0 hours target, deficit 8.0 hours"

UNASSIGNED SHIFTS HANDLING:
- For any question about unassigned shifts, open positions, or staffing gaps, use the unassignedByDay array
- This array contains pre-calculated unassigned shift data with exact counts
- Sum the 'unassigned' field to get total positions needed
- Break down by day, workType, or time slot as requested
- If unassignedByDay is empty, state "No unassigned shifts found"
- Always show specific details: which days, what roles, what time slots need coverage

DISAMBIGUATION FLOW:
- When multiple employees match, format as: "I found X employees named 'Y'. Which one?\n1. Full Name (Store)\n2. Full Name (Store)\nReply with number or full name."
- When week is ambiguous, ask: "Do you mean this week (YYYY-MM-DD → YYYY-MM-DD) or next week (YYYY-MM-DD → YYYY-MM-DD)?"

TEMPLATES AND UNASSIGNED SHIFTS:
- The AnswerPack includes Templates that define required shifts (what shifts are needed)
- Templates show: workType, startTime, endTime, capacity (how many people needed), and which days
- The unassignedByDay array is PRE-CALCULATED and shows exactly what shifts need coverage:
  - Each entry shows: day, workType, time slot, required count, assigned count, unassigned count
  - This is the AUTHORITATIVE source for unassigned shifts - use this data directly
  - Example: {day: "FRI", workTypeName: "Cashier", startTime: "08:00", endTime: "16:00", required: 2, assigned: 1, unassigned: 1}
- For questions about unassigned shifts, ALWAYS use the unassignedByDay array
- Sum up the unassigned counts to get total unassigned positions
- Group by day, workType, or time as needed for the specific question

You have access to one tool: fetch_manager_context. Use it to get the data, then reason over it to answer the question.`;

// Function definition for the LLM to call
const FETCH_MANAGER_CONTEXT_FUNCTION = {
  name: "fetch_manager_context",
  description: "Fetch complete scheduling context for a manager including employees, schedules, assignments, and availability",
  parameters: {
    type: "object",
    properties: {
      managerId: {
        type: "string",
        description: "Manager's user ID"
      },
      storeId: {
        type: "string", 
        description: "Primary store ID to query"
      },
      isoWeek: {
        type: "string",
        description: "ISO week format (e.g., '2025-W43') or specific date"
      },
      includeOtherStores: {
        type: "boolean",
        description: "Whether to include data from manager's other stores",
        default: false
      },
      workTypeFilter: {
        type: "array",
        items: { type: "string" },
        description: "Filter by specific work types"
      },
      timeFrom: {
        type: "string",
        description: "Start time filter (HH:MM format)"
      },
      timeTo: {
        type: "string", 
        description: "End time filter (HH:MM format)"
      },
      includeDraft: {
        type: "boolean",
        description: "Whether to include draft schedules (default: false, Published only)",
        default: false
      }
    },
    required: ["managerId", "storeId", "isoWeek"]
  }
};

export async function processQuestionWithLLM(
  question: string,
  managerId: string,
  storeId: string,
  isoWeek: string,
  threadMemory: ThreadMemory,
  includeOtherStores: boolean = false
): Promise<{ answer: string; updatedMemory: ThreadMemory; metadata: any }> {
  const startTime = Date.now();
  
  console.log("🤖 [ANSWERPACK-LLM] Processing question with LLM...");
  console.log("   Question:", question.substring(0, 100));
  console.log("   Thread memory:", threadMemory);
  
  // Build memory context for the LLM
  const memoryContext = [
    `Thread memory:`,
    `- Language: ${threadMemory.language}`,
    `- Week start: ${threadMemory.weekStart}`,
    `- Cross-store: ${threadMemory.crossStore}`,
    threadMemory.selectedEmployeeName ? `- Selected employee: ${threadMemory.selectedEmployeeName}` : null,
    threadMemory.workTypes?.length ? `- Previous work types: ${threadMemory.workTypes.join(', ')}` : null,
  ].filter(Boolean).join('\n');
  
  try {
    const response = await openai.chat.completions.create({
      model: process.env.AZURE_OPENAI_DEPLOYMENT_NAME || "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `${memoryContext}\n\nUser question: ${question}`,
        },
      ],
      functions: [FETCH_MANAGER_CONTEXT_FUNCTION],
      function_call: "auto",
      temperature: 0.1,
      max_tokens: 1500,
    });
    
    const message = response.choices[0]?.message;
    
    if (!message) {
      throw new Error("No response from LLM");
    }
    
    // Check if LLM wants to call the function
    if (message.function_call) {
      const functionCall = message.function_call;
      
      if (functionCall.name === "fetch_manager_context") {
        const args = JSON.parse(functionCall.arguments || "{}");
        
        console.log("🔧 [ANSWERPACK-LLM] Function call:", args);
        
        // Fetch the data using our existing function - always use the actual parameters, not LLM suggestions
        const fetchStart = Date.now();
        const answerPack = await fetchAnswerPack({
          managerId: managerId, // Always use the actual managerId
          storeId: storeId, // Always use the actual storeId
          isoWeek: isoWeek, // Always use the actual isoWeek
          includeOtherStores: args.includeOtherStores ?? includeOtherStores,
          workTypeFilter: args.workTypeFilter,
          timeFrom: args.timeFrom,
          timeTo: args.timeTo,
        });
        const fetchTime = Date.now() - fetchStart;
        
        // Now call LLM again with the data to get the final answer
        const reasoningStart = Date.now();
        const finalResponse = await openai.chat.completions.create({
          model: process.env.AZURE_OPENAI_DEPLOYMENT_NAME || "gpt-4o-mini",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "user",
              content: `${memoryContext}\n\nUser question: ${question}`,
            },
            {
              role: "assistant",
              content: null,
              function_call: functionCall,
            },
            {
              role: "function",
              name: "fetch_manager_context",
              content: JSON.stringify(answerPack),
            },
          ],
          temperature: 0.1,
          max_tokens: 1500,
        });
        
        const reasoningTime = Date.now() - reasoningStart;
        const totalTime = Date.now() - startTime;
        
        const finalAnswer = finalResponse.choices[0]?.message?.content || "No answer generated.";
        
        // Update memory based on the interaction (simple heuristics)
        const updatedMemory = { ...threadMemory };
        
        // Detect language from the response
        if (finalAnswer.includes('Portée') || finalAnswer.includes('Hypothèses')) {
          updatedMemory.language = 'fr';
        } else if (finalAnswer.includes('Bereik') || finalAnswer.includes('Aannames')) {
          updatedMemory.language = 'nl';
        } else {
          updatedMemory.language = 'en';
        }
        
        // Update cross-store preference if used
        if (args.includeOtherStores !== undefined) {
          updatedMemory.crossStore = args.includeOtherStores;
        }
        
        // Update work types if filtered
        if (args.workTypeFilter?.length) {
          updatedMemory.workTypes = args.workTypeFilter;
        }
        
        console.log("🤖 [ANSWERPACK-LLM] Complete response generated:", {
          fetchTime: `${fetchTime}ms`,
          reasoningTime: `${reasoningTime}ms`, 
          totalTime: `${totalTime}ms`,
        });
        
        return {
          answer: finalAnswer,
          updatedMemory,
          metadata: {
            fetchTime,
            llmTime: reasoningTime,
            totalTime,
            payloadSize: JSON.stringify(answerPack).length,
            recordCounts: answerPack.recordCounts,
            sources: answerPack.sources,
            fetchedAt: answerPack.fetchedAt,
          },
        };
      }
    }
    
    // If no function call, return the direct response
    const directAnswer = message.content || "No answer generated.";
    const totalTime = Date.now() - startTime;
    
    return {
      answer: directAnswer,
      updatedMemory: threadMemory,
      metadata: {
        fetchTime: 0,
        llmTime: totalTime,
        totalTime,
        payloadSize: 0,
        recordCounts: { employees: 0, schedules: 0, assignments: 0, unassigned: 0 },
        sources: [],
        fetchedAt: new Date().toISOString(),
      },
    };
    
  } catch (error: any) {
    console.error("❌ [ANSWERPACK-LLM] Error:", error);
    throw new Error(`LLM processing failed: ${error.message}`);
  }
}
