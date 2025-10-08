# Schedule Visibility and Drag & Drop Fix

## Problem Analysis

Based on the screenshots provided, the main issues were:

1. **Shift Templates Not Visible**: Many shift templates were defined but not showing in the calendar
2. **Only Assignments Displayed**: The calendar only showed assignments (actual shifts with employees), not templates
3. **Poor User Experience**: Users couldn't see available shifts to assign employees to
4. **Limited Drag & Drop**: Could only drag to existing assignments, not templates

## Root Cause

The previous implementation only displayed **assignments** (concrete shifts) but not **templates** (shift patterns). This meant:
- Templates created in the Shifts page were invisible in the schedule
- Users had to generate a full schedule before seeing any droppable areas
- No way to manually assign employees to template shifts

## Solution Implemented

### 1. Hybrid Display System

**File**: `src/app/(protected)/schedule/page.tsx` - `buildLayouts()` function

The calendar now shows **both** templates and assignments:

```typescript
// Create a map of existing assignments for quick lookup
const assignmentMap = new Map<string, Assignment>();
for (const assignment of assignments) {
  const key = `${assignment.day}|${assignment.role}|${assignment.startTime}|${assignment.endTime}`;
  assignmentMap.set(key, assignment);
}

// First, add all assignments
for (const assignment of assignments) {
  // ... add assignment blocks
}

// Then, add templates that don't have corresponding assignments
for (const template of templates) {
  // Check if there's already an assignment for this template
  const assignmentKey = `${d.key}|${template.role}|${template.startTime}|${template.endTime}`;
  if (assignmentMap.has(assignmentKey)) {
    continue; // Skip - already has assignment
  }
  
  // Add template as droppable block
  dayMap[d.key].push({
    role: template.role,
    startMin: s,
    endMin: e,
    // No assignment property - indicates it's a template
  });
}
```

### 2. Enhanced Drag & Drop Logic

**File**: `src/app/(protected)/schedule/page.tsx` - `assignEmployeeToShift()` function

The drag & drop now handles both scenarios:

#### For Existing Assignments:
- Updates the assignment with the employee
- Uses optimistic updates for immediate feedback
- Reverts on API errors

#### For Templates:
- Creates a new assignment from the template
- Assigns the employee to the new assignment
- Refreshes the data to show the new assignment

```typescript
if (existingAssignment) {
  // Update existing assignment
  // ... optimistic update logic
} else {
  // Create new assignment from template
  const response = await fetch('/api/schedule/assignments', {
    method: 'POST',
    body: JSON.stringify({
      storeId: store.id,
      day, role,
      startTime: minutesToTimeValue(startMin),
      endTime: minutesToTimeValue(endMin),
      employeeId: employee.id,
    }),
  });
}
```

### 3. Improved Availability Validation

Added comprehensive availability checking:
- Validates employee is available on the day
- Checks if shift time fits within availability window
- Provides specific error messages for different scenarios

### 4. Visual State Indicators

Added clear visual distinction between different shift states:

#### Color Coding:
- **Green**: Assigned shifts (employee assigned)
- **Blue**: Unassigned shifts (assignment exists, no employee)
- **Orange**: Templates (dashed border, no assignment yet)

#### Labels:
- **Assigned**: Shows employee name and color
- **Unassigned**: Shows "Unassigned" in blue
- **Template**: Shows "📋 Template" in orange

#### Tooltips:
- **Assigned**: "Role — Time — Assigned to Employee"
- **Unassigned**: "Role — Time — Unassigned shift"
- **Template**: "Role — Time — Template (drag employee to create assignment)"

### 5. User Interface Improvements

#### Legend:
Added a legend at the top of the calendar explaining the color coding:
- Green box: Assigned
- Blue box: Unassigned Shift  
- Orange dashed box: Template (drag to create)

#### Better Error Messages:
- Specific availability conflict messages
- Clear guidance on what actions to take
- Success messages for completed assignments

#### Improved Empty States:
- Different messages for days with/without templates
- Guidance on next steps (create templates, generate schedule)

## Benefits

### 1. Complete Visibility
- **All shifts visible**: Both templates and assignments are shown
- **Clear status**: Easy to distinguish between different shift states
- **No hidden shifts**: Users can see all available work slots

### 2. Flexible Assignment
- **Direct template assignment**: Drag employees to templates to create assignments
- **Existing assignment updates**: Drag to reassign existing shifts
- **Mixed workflow**: Supports both AI generation and manual assignment

### 3. Better User Experience
- **Visual feedback**: Clear color coding and labels
- **Immediate updates**: Optimistic updates for responsive feel
- **Error prevention**: Availability validation prevents invalid assignments
- **Helpful guidance**: Clear messages guide users through the workflow

### 4. Robust Error Handling
- **Availability conflicts**: Prevents assigning unavailable employees
- **API failures**: Graceful error handling with rollback
- **Data validation**: Comprehensive input validation
- **User feedback**: Clear error and success messages

## Workflow Examples

### Scenario 1: Fresh Setup
1. Create shift templates in Shifts page
2. Templates appear as orange dashed blocks in schedule
3. Drag employees to templates to create assignments
4. Templates convert to blue "Unassigned" or green "Assigned" blocks

### Scenario 2: AI Generated Schedule
1. Use "Generate Schedule" to create assignments from templates
2. Assignments appear as blue "Unassigned" blocks
3. Drag employees to assign them to shifts
4. Blocks turn green when assigned

### Scenario 3: Mixed Approach
1. Some shifts created via AI generation
2. Some shifts created by manual template assignment
3. All shifts visible and manageable in the same interface
4. Consistent behavior regardless of creation method

## Technical Implementation

### Key Functions Modified:
- `buildLayouts()`: Hybrid template/assignment display
- `assignEmployeeToShift()`: Enhanced assignment logic
- Drag & drop handlers: Simplified with better error handling
- Visual styling: State-based color coding

### API Integration:
- `POST /api/schedule/assignments`: Create new assignments
- `POST /api/schedule/assignments/unassign`: Update existing assignments
- Proper error handling and rollback on failures

### Performance Optimizations:
- Assignment lookup map for O(1) template checking
- Optimistic updates for immediate UI feedback
- Efficient re-rendering with proper React patterns

This solution provides a complete, user-friendly scheduling interface that handles both automated and manual assignment workflows while maintaining data integrity and providing excellent user feedback.