# Unassigned Shifts Fix Summary

## Problem
The LLM couldn't properly answer questions about unassigned shifts because:

1. **Wrong table name**: The code was trying to access `prisma.template` but the actual table is `ShiftTemplate`
2. **Incorrect data handling**: Template times were being processed as strings instead of DateTime objects
3. **Missing capacity field**: Code assumed templates had a `capacity` field, but they don't
4. **Poor error handling**: Template fetch errors were silently ignored

## Changes Made

### 1. Fixed Table Name
**File**: `src/server/copilot/data/answer-pack.ts`
```typescript
// Before
templates = await (prisma as any).template.findMany({

// After  
templates = await prisma.shiftTemplate.findMany({
```

### 2. Fixed DateTime Handling
**File**: `src/server/copilot/data/answer-pack.ts`
```typescript
// Before
const templateStartTime = template.startTime.substring(11, 16);

// After
const templateStartTime = template.startTime.toISOString().substring(11, 16);
```

### 3. Fixed Days Field Processing
**File**: `src/server/copilot/data/answer-pack.ts`
```typescript
// Before
const days = template.days ? Object.entries(template.days).filter(([_, active]) => active).map(([day]) => day) : [];

// After
const daysObj = template.days as Record<string, boolean> || {};
const activeDays = Object.entries(daysObj).filter(([_, active]) => active).map(([day]) => day);
```

### 4. Fixed Capacity Field
**File**: `src/server/copilot/data/answer-pack.ts`
```typescript
// Before
const required = template.capacity || 1;

// After
const required = 1; // Each template represents one position
```

### 5. Enhanced LLM Instructions
**File**: `src/server/copilot/answer-pack-llm.ts`

Added clearer instructions for handling unassigned shifts:
- Use the `unassignedByDay` array as the authoritative source
- Sum the `unassigned` field for total positions needed
- Always show specific details about which shifts need coverage

### 6. Added Better Logging
**File**: `src/server/copilot/data/answer-pack.ts`

Added detailed logging to help debug unassigned shift calculations:
- Template processing details
- Unassigned shifts breakdown
- Final summary for LLM

## How It Works Now

1. **Template Fetching**: Correctly fetches `ShiftTemplate` records from the database
2. **Data Processing**: Properly handles DateTime fields and JSON days field
3. **Unassigned Calculation**: Compares templates (required) vs assignments (actual) to find gaps
4. **LLM Processing**: Provides clear, structured data to the LLM with explicit instructions

## Testing

Run the test script to verify the fix:
```bash
# Start the development server
npm run dev

# In another terminal, run the test
node test-unassigned-fix.js
```

The LLM should now be able to answer questions like:
- "How many unassigned shifts do we have this week?"
- "What shifts need coverage?"
- "Show me all open positions"
- "Which days have unassigned shifts?"

## Expected Output

The LLM should now provide structured answers with:
- **Scope**: What data it's looking at
- **Assumptions**: Any interpretations applied
- **Sources**: Database entities used (should include "ShiftTemplate")
- **Answer**: Specific details about unassigned shifts, including days, times, and work types