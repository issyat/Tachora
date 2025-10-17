/**
 * LLM Tool Definitions for Preview Operations
 * 
 * Defines OpenAI function calling schemas for AI chat assistant to:
 * - Create previews from natural language
 * - Apply/undo previews
 * - Check preview status
 */

import type OpenAI from 'openai';

/**
 * Tool: analyze_shift_candidates
 * 
 * Analyzes available shifts for an employee on a specific day/role.
 * Returns deterministic list of candidates with availability checking.
 * MUST be called before create_preview when request is ambiguous.
 */
export const ANALYZE_CANDIDATES_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'analyze_shift_candidates',
    description: `Analyze available shift options for an employee. Returns list of shifts with feasibility check based on availability. Use this BEFORE create_preview when user request is ambiguous (e.g., "assign bob on wed sales" without specifying which shift).

WHEN TO USE:
- User request matches multiple shifts (e.g., "wed sales associate" → 2 shifts)
- Need to check which shifts fit employee availability
- User says time-of-day but no exact time ("afternoon", "morning")

RETURNS:
- List of shift candidates with shiftId, times, and fits:true/false
- Availability window for context
- Let user pick ONE specific shift

AFTER THIS TOOL:
- Present options to user with numbers
- Wait for selection
- Then call create_preview with selected shiftId`,
    parameters: {
      type: 'object',
      properties: {
        employeeId: {
          type: 'string',
          description: 'Employee ID (resolved via find_employee)',
        },
        day: {
          type: 'string',
          enum: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'],
          description: 'Day of week',
        },
        role: {
          type: 'string',
          description: 'Work type / role name (e.g., "Sales Associate", "Cashier")',
        },
      },
      required: ['employeeId', 'day', 'role'],
    },
  },
};

/**
 * Tool: create_shift_template
 * 
 * Creates a new shift template with preview and confirmation.
 * User can create recurring shifts like "add cashier shift mon 8-12".
 */
export const CREATE_SHIFT_TEMPLATE_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'create_shift_template',
    description: `Create a new shift template (recurring shift) with preview. Use when user wants to add a new shift to the schedule.

WHEN TO USE:
- User says: "add [role] shift on [day] [time]"
- User says: "create new [role] shift [day] from [start] to [end]"
- User says: "I need a cashier shift monday 9-15"

EXAMPLES:
- "add cashier shift on mon from 8 to 12"
- "create sales associate shift tue 14:00-20:00"
- "I need a supervisor shift friday morning"

WORKFLOW:
1. Parse day, work type name, start time, end time
2. Validate work type exists (or suggest creating it)
3. Create preview showing new shift template
4. Present: "Preview: New [Role] shift [DAY] [START]-[END]. Apply?"
5. User confirms → apply preview → shift created

TIME PARSING:
- Support formats: "8-12", "08:00-12:00", "8am-12pm", "from 8 to 12"
- Convert to 24-hour HH:mm format
- Default minutes to :00 if omitted

VALIDATION:
- Start time < End time
- No overlap with existing templates (same role, same day, overlapping times)
- Work type must exist or be created first`,
    parameters: {
      type: 'object',
      properties: {
        day: {
          type: 'string',
          enum: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'],
          description: 'Day of week for the shift',
        },
        workTypeName: {
          type: 'string',
          description: 'Work type / role name (e.g., "Cashier", "Sales Associate", "Supervisor")',
        },
        startTime: {
          type: 'string',
          description: 'Start time in HH:mm format (e.g., "08:00", "14:30")',
        },
        endTime: {
          type: 'string',
          description: 'End time in HH:mm format (e.g., "12:00", "20:00")',
        },
      },
      required: ['day', 'workTypeName', 'startTime', 'endTime'],
    },
  },
};

/**
 * Tool: analyze_swap_candidates
 * 
 * Analyzes feasibility of swapping two employees' shifts on a specific day.
 * Returns detailed preview of swap with conflict checking.
 */
export const ANALYZE_SWAP_CANDIDATES_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'analyze_swap_candidates',
    description: `Analyze feasibility of swapping two employees' shifts with preview. Use when user wants to swap employees.

WHEN TO USE:
- User says: "swap [employee1] and [employee2] on [day]"
- User says: "switch [employee1] with [employee2] [day]"
- User says: "can we swap alice and bob tuesday"

EXAMPLES:
- "swap alice and bob on tuesday"
- "switch john with mary friday"
- "can we swap frank and sarah's shifts wednesday"

WORKFLOW:
1. Resolve both employee IDs (use find_employee)
2. Find both assignments on specified day
3. Check if swap is feasible:
   - Both must be assigned on that day
   - Swapped shifts must fit each employee's availability
   - No overlaps with other shifts after swap
4. Create preview showing swap
5. Present: "Preview: Alice (Morning 9-15) ↔ Bob (Afternoon 15-20). Apply?"
6. User confirms → apply preview → assignments swapped

VALIDATION:
- Both employees must be assigned on that day (can't swap if one is not working)
- After swap, each employee's new shift must fit their availability
- Check for conflicts: overlaps, daily limits, rest time
- If infeasible, explain why and suggest alternatives (same day if possible)

LOCKED CONTEXT:
- Stores both employee IDs, names, day
- Saves swap details in turn memory for confirmation
- User can say "yes" to confirm swap`,
    parameters: {
      type: 'object',
      properties: {
        employee1Id: {
          type: 'string',
          description: 'First employee ID (use find_employee to resolve from name)',
        },
        employee2Id: {
          type: 'string',
          description: 'Second employee ID (use find_employee to resolve from name)',
        },
        day: {
          type: 'string',
          enum: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'],
          description: 'Day of week to swap shifts',
        },
      },
      required: ['employee1Id', 'employee2Id', 'day'],
    },
  },
};

/**
 * Tool: create_preview
 * 
 * Creates a preview of schedule changes based on natural language operations.
 * The LLM extracts structured operations from user requests like:
 * - "Assign John to Monday morning cashier shift"
 * - "Swap Alice and Bob on Tuesday"
 * - "Remove Frank from Wednesday evening"
 */
export const CREATE_PREVIEW_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'create_preview',
    description: `Create a preview of schedule changes ONLY after user has made a specific selection. DO NOT call this speculatively.

IMPORTANT RULES:
1. Only call after user specifies EXACT shift (e.g., "morning shift", "9-15 shift", "first one")
2. If ambiguous (multiple shifts match), list options and wait for user to choose
3. Only include operations that have NO blockers
4. One operation per shift assignment (don't batch unless user requests multiple)

WHEN TO USE:
- User specifies exact shift: "assign bob to wed morning sales associate"
- User picks from options: "the first one" or "morning shift"
- User confirms after seeing options: "yes, the 9-15 one"

WHEN NOT TO USE:
- Request is ambiguous: "assign bob on wed sales" (multiple shifts exist)
- Constraints violated: You know shift ends after availability
- Just exploring: User asks "can we...?" without committing
- Preview already pending: User must apply/discard first

BEFORE CALLING:
1. Resolve employee ID with find_employee
2. Identify SPECIFIC shift template ID (not just role name)
3. Verify no blockers (availability, overlaps, etc.)
4. Ensure user made explicit selection

OPERATION TYPES:
1. assign_shift: Assign employee to ONE specific shift (use exact shiftId)
2. unassign_shift: Remove employee from assigned shift
3. swap_shifts: Swap two employees between their shifts`,
    parameters: {
      type: 'object',
      properties: {
        operations: {
          type: 'array',
          description: 'Array of operations to preview (max 10 operations per preview)',
          items: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['assign_shift', 'unassign_shift', 'swap_shifts'],
                description: 'Type of operation',
              },
              employeeId: {
                type: 'string',
                description: 'Employee ID (use find_employee to resolve from name)',
              },
              employeeId2: {
                type: 'string',
                description: 'Second employee ID (only for swap_shifts)',
              },
              shiftId: {
                type: 'string',
                description: 'Template ID or open shift ID to assign (for assign_shift)',
              },
              assignmentId: {
                type: 'string',
                description: 'Existing assignment ID to unassign (for unassign_shift)',
              },
              assignment1Id: {
                type: 'string',
                description: 'First assignment ID (for swap_shifts)',
              },
              assignment2Id: {
                type: 'string',
                description: 'Second assignment ID (for swap_shifts)',
              },
              reason: {
                type: 'string',
                description: 'Why this operation is suggested (shown to user)',
              },
            },
            required: ['type'],
          },
        },
        explanation: {
          type: 'string',
          description: 'Natural language summary of what these operations will do (1-2 sentences)',
        },
      },
      required: ['operations', 'explanation'],
    },
  },
};

/**
 * Tool: apply_preview
 * 
 * Applies a preview, committing changes to the database.
 * Only call when user explicitly confirms (e.g., "yes", "apply", "do it").
 */
export const APPLY_PREVIEW_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'apply_preview',
    description: `Apply a preview, committing schedule changes to the database. Only call when user explicitly confirms.

WHEN TO USE:
- User says: "yes", "apply it", "go ahead", "do it", "confirm"
- User says: "make those changes"
- A preview was just created and user confirms

WHEN NOT TO USE:
- User is still asking questions
- User says "no", "cancel", "wait"
- No preview exists in conversation

IMPORTANT: Always check if there's an active preview ID in conversation history!`,
    parameters: {
      type: 'object',
      properties: {
        previewId: {
          type: 'string',
          description: 'Preview ID to apply (from create_preview result)',
        },
      },
      required: ['previewId'],
    },
  },
};

/**
 * Tool: undo_preview
 * 
 * Reverts a previously applied preview.
 * Only call when user explicitly requests undo.
 */
export const UNDO_PREVIEW_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'undo_preview',
    description: `Undo a previously applied preview, reverting schedule changes. Only call when user explicitly requests undo.

WHEN TO USE:
- User says: "undo", "revert", "go back", "cancel that"
- User says: "I changed my mind"
- A preview was applied and user wants to undo it

WHEN NOT TO USE:
- No preview was applied yet
- User is asking about consequences (use get_preview_status instead)

IMPORTANT: Can only undo the most recently applied preview!`,
    parameters: {
      type: 'object',
      properties: {
        previewId: {
          type: 'string',
          description: 'Preview ID to undo (from apply_preview result)',
        },
      },
      required: ['previewId'],
    },
  },
};

/**
 * Tool: get_preview_status
 * 
 * Gets current status of a preview (pending/applied/expired).
 * Use to check warnings/blockers or show user what will happen.
 */
export const GET_PREVIEW_STATUS_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'get_preview_status',
    description: `Get detailed status of a preview including warnings, blockers, and impact summary. Use when user asks about a preview or before applying.

WHEN TO USE:
- User asks: "what will happen if...?"
- User asks: "show me the preview"
- User asks: "any conflicts?"
- Before calling apply_preview to check for blockers

RETURNS:
- Preview status (pending/applied/expired)
- Operation count
- Warnings (allowed but cautionary)
- Blockers (prevent apply)
- Employee impact summary`,
    parameters: {
      type: 'object',
      properties: {
        previewId: {
          type: 'string',
          description: 'Preview ID to check (from create_preview result)',
        },
      },
      required: ['previewId'],
    },
  },
};

/**
 * Tool: discard_preview
 * 
 * Discards a preview without applying it.
 * Use when user cancels or doesn't want the changes.
 */
export const DISCARD_PREVIEW_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'discard_preview',
    description: `Discard a preview without applying changes. Use when user cancels or wants to start over.

WHEN TO USE:
- User says: "cancel", "no", "never mind", "discard"
- User wants to try different changes
- Preview has blockers and user wants to cancel

WHEN NOT TO USE:
- Preview was already applied (use undo_preview instead)`,
    parameters: {
      type: 'object',
      properties: {
        previewId: {
          type: 'string',
          description: 'Preview ID to discard (from create_preview result)',
        },
      },
      required: ['previewId'],
    },
  },
};

/**
 * Tool: check_eligible_candidates
 * 
 * Checks which employees are eligible for a specific shift based on work types and availability.
 * Returns eligible and ineligible employees with detailed reasons.
 */
export const CHECK_ELIGIBLE_CANDIDATES_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'check_eligible_candidates',
    description: `Check which employees are eligible for a specific shift. Returns work-type-filtered candidates with availability and conflict checks.

WHEN TO USE:
- User asks "who can work this shift?" or "who's available for [shift]?"
- User asks "who can work as [role]?" for a specific shift
- Need to show candidates for assignment
- After creating a preview shift, to suggest who can fill it

IMPORTANT - WORK TYPE FILTERING:
- Only returns employees whose work types/roles include the shift's required role
- If shift is "Security", only employees with "Security" role are eligible
- If shift is "Cashier", only employees with "Cashier" role are eligible

ELIGIBILITY CHECKS:
1. Work Type Match: Employee must have the required role assigned
2. Availability: Employee must be available during shift hours
3. No Overlaps: No conflicting assignments on that day
4. Hour Limits: Not exceeding daily/weekly hour caps

RETURNS:
- eligible[]: List of employees who CAN work the shift with their current hours
- ineligible[]: List of employees who CANNOT work with specific reasons
  * "missing_role": Doesn't have required work type
  * "not_available": Off day or shift outside availability window
  * "overlap": Already has conflicting assignment
  * "hour_limit": Would exceed hour limits

USE CASE EXAMPLE:
User: "add security shift mon 14-19"
AI: Creates preview
User: "who's available for the security shift?"
AI: Calls check_eligible_candidates with shift details
Returns: Only Bob Smith (has Security role) as eligible`,
    parameters: {
      type: 'object',
      properties: {
        day: {
          type: 'string',
          enum: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'],
          description: 'Day of the shift',
        },
        workTypeName: {
          type: 'string',
          description: 'Required work type/role name (e.g., "Security", "Cashier", "Sales Associate")',
        },
        startTime: {
          type: 'string',
          description: 'Shift start time in HH:mm format (e.g., "14:00")',
        },
        endTime: {
          type: 'string',
          description: 'Shift end time in HH:mm format (e.g., "19:00")',
        },
      },
      required: ['day', 'workTypeName', 'startTime', 'endTime'],
    },
  },
};

/**
 * All preview tools for registration in chat API
 */
export const PREVIEW_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  ANALYZE_CANDIDATES_TOOL, // Analyze shifts before creating preview
  CREATE_SHIFT_TEMPLATE_TOOL, // NEW: Create shift templates with preview
  ANALYZE_SWAP_CANDIDATES_TOOL, // NEW: Analyze and preview employee swaps
  CHECK_ELIGIBLE_CANDIDATES_TOOL, // NEW: Check who can work a specific shift (work-type filtered)
  CREATE_PREVIEW_TOOL,
  APPLY_PREVIEW_TOOL,
  UNDO_PREVIEW_TOOL,
  GET_PREVIEW_STATUS_TOOL,
  DISCARD_PREVIEW_TOOL,
];

/**
 * System prompt additions for preview functionality
 */
export const PREVIEW_SYSTEM_PROMPT = `
PREVIEW → APPLY WORKFLOW:

CONTEXT AWARENESS - IMPORTANT:
You have access to the conversation history. When you ask a question and user responds:
- Review the PREVIOUS assistant message to understand what was asked
- If you asked "Would you like to assign Bob to the morning shift?" and user says "yes"
  → You know: employee=Bob, shift=morning, the context is locked
  → Action: Call create_preview with the morning shift
- If you listed options "1. Morning, 2. Afternoon" and user says "yes"
  → Check if you suggested one (e.g., "only morning fits")
  → Action: Use that shift
- DO NOT ask for clarification if you just presented the information

LOCK INTENT + ENTITIES FOR EACH REQUEST:
When user makes a request, extract and lock these entities:
- Employee name (e.g., "Bob Smith")
- Day (e.g., "Wednesday" / "WED")
- Role/WorkType (e.g., "Sales Associate")

DO NOT DRIFT: Once locked, stay focused on these entities. Don't suggest:
- Different days ("What about Saturday?") unless user asks
- Different roles ("Maybe Cashier instead?") unless user asks
- Different employees unless there's a blocker

SHOW YOUR REASONING (Build Trust):
Before creating a preview, always echo what you checked:
1. "Checking Bob Smith's availability on Wednesday: 09:00-19:00"
2. "Found 2 Sales Associate shifts on Wednesday:"
   - "Morning: 09:00-15:00 (6 hours) ✓ Fits availability"
   - "Afternoon: 15:00-20:00 (5 hours) ✗ Ends at 20:00, Bob ends at 19:00"
3. State the boundary rule: "Shift end time must be ≤ employee availability end time"

CONSTRAINT CHECKING - BE EXPLICIT:
- Availability check: shiftEnd <= availabilityEnd (strict)
- Overlap check: No two shifts for same employee overlap
- Daily limit: Max 10 hours per day
- Weekly limit: Warn if >125% of target hours
- Rest time: Min 11 hours between shifts

DETERMINISTIC SELECTION PROCESS:

WORKFLOW FOR AMBIGUOUS REQUESTS:
Example: User says "assign bob on wed sales associate"

Step 1: Call analyze_shift_candidates tool
- Input: {employeeId: "bob-id", day: "WED", role: "Sales Associate"}
- This locks the context and returns available shifts with IDs
- Tool returns: List of ShiftCandidates with shiftIds, labels, fits status
- IMPORTANT: Store this tool result in your context - you'll need it for Step 3!

Step 2: Present options to user
- Show the candidates with availability status
- Example: "I found 2 Sales Associate shifts on Wednesday for Bob:
  1. Morning (09:00-15:00) ✓ Fits availability (09:00-19:00)
  2. Afternoon (15:00-20:00) ✗ Ends at 20:00, Bob's availability ends at 19:00
  Which shift would you like to assign?"
- If only 1 fits: "Would you like to assign Bob to the morning shift?"

Step 3: User selects (e.g., "morning" or "1" or "first" or "yes")
- LOOK BACK at the tool result from Step 1 (analyze_shift_candidates)
- The result.data.lockedContext contains: {employeeId, employeeName, day, role, storeId, weekId}
- The result.data.candidates contains the shiftIds for each option
- Map user's selection to the specific candidate:
  * "morning" → Find candidate where label contains "Morning" AND fits=true
  * "afternoon" → Find candidate where label contains "Afternoon" AND fits=true
  * "1" or "first" → Use candidates[0]
  * "2" or "second" → Use candidates[1]
  * "yes" / "ok" / "sure" → If you just suggested a specific shift, use that one
  * If only 1 candidate fits → Use that one automatically
- Get the shiftId from the selected candidate

Step 4: Call create_preview with the specific shiftId
- Use the employeeId from lockedContext
- Use the shiftId from the selected candidate
- Input: {
    operations: [{
      type: "assign_shift",
      employeeId: lockedContext.employeeId,
      shiftId: selectedCandidate.shiftId,
      reason: "Fits availability"
    }],
    explanation: "Assigning {employeeName} to {day} {label} {role} shift"
  }

IMPORTANT: When user responds after you listed options:
- "morning"/"afternoon"/"1"/"first" → Map to specific candidate
- "yes"/"ok"/"sure" → Use the shift you just suggested OR the only fitting shift
- DO NOT ask for clarification if context exists
- DO NOT ask for employee/day/role again
- The context is LOCKED from analyze_shift_candidates
- Map their selection to the shiftId and call create_preview immediately

SPECIAL CASE - Single Fitting Shift:
If only ONE shift fits availability (e.g., morning ✓, afternoon ✗):
- Ask: "Would you like to assign {employee} to the {label} shift?"
- When user says "yes": Use that shift automatically (don't ask again)
- You already know which shift (the one that fits)

SINGLE PREVIEW AT A TIME:
- Only one pending preview per conversation
- If preview exists, user must Apply/Discard before creating new one
- Show: "You have a pending preview with X changes. Apply or discard first?"

STEP 1: CREATE PREVIEW
When user requests changes:
1. Lock entities: employee, day, role
2. Show availability window for that employee + day
3. List matching shifts with feasibility
4. If only 1 feasible shift: Create preview automatically
5. If multiple feasible shifts: Ask user to choose
6. If no feasible shifts: Explain why + suggest alternatives (same day/role if possible)
7. Call create_preview only after clear selection
8. Present: "Preview created: [details]. Apply?"

STEP 2: APPLY PREVIEW (only after user confirmation)
When user confirms ("yes", "apply", "do it"):
1. Call apply_preview with preview ID
2. Confirm: "✓ Applied! [Summary]"
3. Clear pending preview state

BLOCKERS = NO PREVIEW:
- If create_preview returns blockers, NO preview is created
- Never show green preview blocks in UI for blocked operations
- Explain conflict and suggest fix within same context (don't drift)

EXAMPLE FLOW:
User: "assign bob on wed sales associate"
Assistant: 
"Let me check Bob Smith's schedule:
• Availability on Wednesday: 09:00-19:00
• Found 2 Sales Associate shifts on Wednesday:
  1. Morning: 09:00-15:00 (6h) ✓ Fits availability
  2. Afternoon: 15:00-20:00 (5h) ✗ Ends at 20:00, Bob ends at 19:00

Which shift would you like? (1 or 2, or say 'morning'/'afternoon')"

User: "morning"
Assistant:
[create_preview with morning shift only]
"✓ Preview created: Assign Bob Smith to Wednesday 09:00-15:00 Sales Associate (6 hours). No conflicts. Apply?"

User: "yes"
Assistant:
[apply_preview]
"✓ Applied! Bob is now scheduled for Wednesday morning."

ERROR HANDLING:
- Employee not found: "I couldn't find [NAME]. Did you mean: [suggestions]?"
- No shifts match: "No [ROLE] shifts on [DAY]. Available shifts: [list]"
- Version conflict: "Schedule changed. Let me create a fresh preview..."
- Constraint violations are caught at preview creation → explain & stay in context
`;


/**
 * Natural language response templates for preview operations
 */
export const PREVIEW_RESPONSE_TEMPLATES = {
  // Create preview success
  previewCreated: (operationCount: number, hasWarnings: boolean, hasBlockers: boolean) => {
    const base = `I've created a preview with ${operationCount} change${operationCount > 1 ? 's' : ''}`;
    if (hasBlockers) {
      return `${base}. ❌ However, there are blocking issues that prevent applying these changes.`;
    }
    if (hasWarnings) {
      return `${base}. ⚠️ There are some warnings to be aware of.`;
    }
    return `${base}. ✓ No conflicts detected.`;
  },

  // Apply preview success
  applySuccess: (operationCount: number) =>
    `✓ Changes applied successfully! ${operationCount} operation${operationCount > 1 ? 's' : ''} completed. You can undo anytime if needed.`,

  // Undo success
  undoSuccess: (operationCount: number) =>
    `✓ Changes reverted! ${operationCount} operation${operationCount > 1 ? 's were' : ' was'} undone.`,

  // Discard success
  discardSuccess: () => `✓ Preview discarded. No changes were made to the schedule.`,

  // Errors
  previewExpired: () =>
    `This preview has expired (30min timeout). Please create a new preview with the same changes.`,

  versionConflict: () =>
    `The schedule was modified by someone else since this preview was created. Please create a new preview to ensure accuracy.`,

  hasBlockers: (blockerCount: number) =>
    `Cannot apply: ${blockerCount} blocking issue${blockerCount > 1 ? 's' : ''} must be resolved first.`,

  employeeNotFound: (name: string) =>
    `I couldn't find an employee named "${name}". Please check the spelling or try a different name.`,

  shiftNotFound: (day: string, time: string) =>
    `I couldn't find a shift on ${day} at ${time}. Please check the day and time.`,
};
