# 🎯 Employee Assignment System Explained

## 📋 **Overview**

Your Tachora project has **two main ways** to assign employees to shifts:
1. **🤖 AI Generate Button** - Automated assignment using CP-SAT solver
2. **👆 Manual Assignment** - Drag & drop or click-to-assign

Both methods create **real database records** but work very differently under the hood.

---

## 🤖 **AI Generate Button Flow**

### **🔄 Complete Process**

#### **Step 1: User Clicks AI Generate**
```typescript
// In: src/components/ui/ai-generate-button.tsx
<AIGenerateButton
  storeId={store?.id}
  onSuccess={(result) => {
    // Show success notification
    // Refresh schedule data
  }}
/>
```

#### **Step 2: API Call to Generate Schedule**
```typescript
// POST /api/schedule/generate
{
  "storeId": "store-123",
  "weekId": "2025-W41"
}
```

#### **Step 3: CP-SAT Solver Algorithm**
```typescript
// In: src/app/api/schedule/generate/route.ts

class ScheduleSolver {
  solve(): Assignment[] {
    const assignments: Assignment[] = [];
    
    // For each shift template
    for (const template of this.shiftTemplates) {
      // For each day the template is active
      Object.entries(template.days).forEach(([day, isActive]) => {
        if (!isActive) return;
        
        // Find available employees
        const availableEmployees = this.employees.filter(emp => 
          this.isEmployeeAvailable(emp, day, template.startTime, template.endTime)
        );
        
        // CP-SAT constraint: Choose best employee
        const bestEmployee = availableEmployees.reduce((best, current) => {
          // Prefer employees under their weekly target
          const currentMinutes = employeeMinutes[current.id];
          const bestMinutes = employeeMinutes[best.id];
          
          return currentMinutes < bestMinutes ? current : best;
        });
        
        // Create assignment
        assignments.push({
          employeeId: bestEmployee.id,
          templateId: template.id,
          day: day,
          startTime: template.startTime,
          endTime: template.endTime,
          role: template.role,
        });
      });
    }
    
    return assignments;
  }
}
```

#### **Step 4: Database Operations**
```typescript
// 1. Create or update schedule
const schedule = await prisma.schedule.upsert({
  where: { storeId_isoWeek: { storeId, isoWeek: weekId } },
  create: {
    storeId,
    isoWeek: weekId,
    state: 'Draft',
    generatedAt: new Date(),
  }
});

// 2. Clear existing assignments
await prisma.assignment.deleteMany({
  where: { scheduleId: schedule.id }
});

// 3. Create new assignments
await Promise.all(
  assignments.map(assignment =>
    prisma.assignment.create({
      data: {
        scheduleId: schedule.id,
        day: assignment.day,
        startTime: assignment.startTime,
        endTime: assignment.endTime,
        role: assignment.role,
        employeeId: assignment.employeeId,
        sourceTemplateId: assignment.templateId,
      }
    })
  )
);
```

#### **Step 5: Frontend Updates**
```typescript
// Success callback in schedule page
onSuccess={(result) => {
  setNotification({
    message: `Generated ${result.assignments} assignments using CP-SAT solver`,
    type: 'success'
  });
  refetch(store?.id); // Reload schedule data
}}
```

### **🧠 AI Algorithm Details**

#### **Constraint Satisfaction**
```typescript
isEmployeeAvailable(employee, day, shiftStart, shiftEnd) {
  // 1. Check if employee works this day
  const availability = employee.availability.find(a => a.day === day);
  if (!availability || availability.isOff) return false;
  
  // 2. Check if shift fits in availability window
  const availStart = timeToMinutes(availability.startTime);
  const availEnd = timeToMinutes(availability.endTime);
  const shiftStartMin = timeToMinutes(shiftStart);
  const shiftEndMin = timeToMinutes(shiftEnd);
  
  return shiftStartMin >= availStart && shiftEndMin <= availEnd;
}
```

#### **Optimization Criteria**
1. **Hard Constraints**: Employee must be available
2. **Soft Constraints**: Prefer employees under weekly target
3. **Workload Balancing**: Distribute hours fairly

---

## 👆 **Manual Assignment Flow**

### **🎯 Method 1: Drag & Drop**

#### **Step 1: User Drags Employee**
```typescript
// In employee panel
<div
  draggable
  onDragStart={(ev) => {
    ev.dataTransfer.setData('text/plain', JSON.stringify({ 
      employeeIndex: emp._index 
    }));
  }}
>
  {emp.name}
</div>
```

#### **Step 2: Drop on Shift**
```typescript
// In shift block
onDrop={async (ev) => {
  // 1. Parse dropped data
  const data = JSON.parse(ev.dataTransfer.getData('text/plain'));
  const emp = employees[data.employeeIndex];
  
  // 2. Validate availability
  const slot = emp.availability[dayIndex];
  if (!slot || slot.isOff) {
    showError(`${emp.name} is off on ${day}`);
    return;
  }
  
  // 3. Check time compatibility
  if (shiftStart < availStart || shiftEnd > availEnd) {
    showError(`${emp.name} not available during shift time`);
    return;
  }
  
  // 4. Assign directly
  await assignEmployeeToShift(emp, day, role, startMin, endMin);
}
```

#### **Step 3: Direct Assignment Function**
```typescript
const assignEmployeeToShift = async (employee, day, role, startMin, endMin) => {
  // 1. Find existing assignment for this shift
  const existingAssignment = assignments.find(a => 
    a.day === day && 
    a.role === role && 
    timeToMinutes(a.startTime) === startMin && 
    timeToMinutes(a.endTime) === endMin
  );
  
  if (existingAssignment) {
    // 2. Create optimistic employee data
    const optimisticEmployee = {
      id: employee.id,
      name: employee.name,
      label: employee.label,
      color: employee.color,
      storeName: employee.storeId !== store.id ? employee.storeName : undefined,
    };
    
    // 3. Optimistic update (instant UI change)
    updateAssignmentOptimistically(existingAssignment.id, optimisticEmployee);
    
    // 4. Background API call
    const response = await fetch('/api/schedule/assignments/unassign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assignmentId: existingAssignment.id,
        employeeId: employee.id,
      }),
    });
    
    // 5. Handle errors (revert if failed)
    if (!response.ok) {
      updateAssignmentOptimistically(existingAssignment.id, existingAssignment.employee);
      showError('Failed to assign employee');
    }
  }
};
```

### **🎯 Method 2: Click Modal Assignment**

#### **Step 1: Click Shift Block**
```typescript
onClick={() => {
  setSelected({ 
    key, day, role, startMin, endMin,
    assignment: b.assignment // Include current assignment data
  });
  setOpen(true);
}}
```

#### **Step 2: Modal Shows Options**
```typescript
// ShiftManagementModal component
{assignedEmployee ? (
  // Show current assignment with unassign button
  <button onClick={handleUnassign}>Unassign</button>
) : (
  // Show available employees
  availableEmployees.map(emp => (
    <button onClick={() => handleAssign(emp.id)}>
      {emp.name}
    </button>
  ))
)}
```

#### **Step 3: Assignment/Unassignment**
```typescript
const handleAssign = async (employeeId) => {
  // 1. Optimistic update
  updateAssignmentOptimistically(assignmentId, optimisticEmployee);
  onAssignmentChange(); // Close modal
  
  // 2. Background API call
  await fetch('/api/schedule/assignments/unassign', {
    method: 'POST',
    body: JSON.stringify({ assignmentId, employeeId })
  });
};

const handleUnassign = async () => {
  // 1. Optimistic update
  updateAssignmentOptimistically(assignmentId, undefined);
  onAssignmentChange(); // Close modal
  
  // 2. Background API call
  await fetch(`/api/schedule/assignments/unassign?assignmentId=${assignmentId}`, {
    method: 'DELETE'
  });
};
```

---

## 🗄️ **Database Schema**

### **Core Tables**
```sql
-- Stores
Store {
  id: String
  name: String
  managerId: String
  openingTime: DateTime
  closingTime: DateTime
}

-- Employees
Employee {
  id: String
  storeId: String
  name: String
  canWorkAcrossStores: Boolean
  weeklyMinutesTarget: Int
}

-- Employee availability
Availability {
  id: String
  employeeId: String
  day: Weekday (MON, TUE, etc.)
  isOff: Boolean
  startTime: DateTime
  endTime: DateTime
}

-- Shift templates (patterns)
ShiftTemplate {
  id: String
  storeId: String
  role: String
  days: Json // {MON: true, TUE: false, ...}
  startTime: DateTime
  endTime: DateTime
}

-- Weekly schedules
Schedule {
  id: String
  storeId: String
  isoWeek: String // "2025-W41"
  state: ScheduleState (Draft, Published)
  generatedAt: DateTime
}

-- Actual assignments
Assignment {
  id: String
  scheduleId: String
  day: Weekday
  startTime: DateTime
  endTime: DateTime
  role: String
  employeeId: String (nullable)
  sourceTemplateId: String (nullable)
  locked: Boolean
}
```

---

## 🔄 **Data Flow Comparison**

### **AI Generate vs Manual**

| Aspect | AI Generate | Manual Assignment |
|--------|-------------|-------------------|
| **Trigger** | Button click | Drag/drop or modal |
| **Algorithm** | CP-SAT solver | User choice |
| **Scope** | Entire week | Single shift |
| **Speed** | Bulk creation | One at a time |
| **Optimization** | Automatic balancing | Manual decisions |
| **Validation** | Built-in constraints | Real-time checks |
| **Database** | Batch operations | Individual updates |
| **UI Update** | Full refresh | Optimistic updates |

### **Common Elements**
- Both create `Assignment` records in database
- Both respect employee availability constraints
- Both update the same UI components
- Both support cross-store employees
- Both provide error handling and feedback

---

## 🎯 **Key Differences**

### **AI Generate Advantages**
- **Speed**: Assigns entire week instantly
- **Optimization**: Balances workload automatically
- **Consistency**: Uses proven algorithms
- **Completeness**: Covers all shifts at once

### **Manual Assignment Advantages**
- **Control**: Manager makes specific decisions
- **Flexibility**: Can override algorithm choices
- **Instant Feedback**: Optimistic updates
- **Granular**: Adjust individual shifts

### **When to Use Each**
- **AI Generate**: Initial schedule creation, bulk changes
- **Manual**: Fine-tuning, special requests, last-minute changes

The system gives you the best of both worlds - automated intelligence with manual control! 🎯✨