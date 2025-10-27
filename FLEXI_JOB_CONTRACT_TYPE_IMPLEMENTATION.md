# FLEXI_JOB Contract Type Implementation

## Summary
Added `FLEXI_JOB` as a new contract type option for employees, with full support in the database schema, API interfaces, and user interface.

## Changes Made

### 1. Database Schema
**File**: `prisma/schema.prisma`
- Added `FLEXI_JOB` to the `ContractType` enum

**File**: `prisma/migrations/20251026_add_flexi_job_contract_type/migration.sql`
- Created migration to add the new enum value to the database

### 2. Employee Form Interface
**File**: `src/app/(protected)/schedule/employees/page.tsx`

#### Added Import:
```typescript
import type { ContractType } from "@prisma/client";
```

#### Updated EmployeePayload Type:
```typescript
type EmployeePayload = {
  // ... existing fields
  contractType: ContractType;
  // ... rest of fields
};
```

#### Added Contract Type Form Field:
```tsx
<label className="flex items-center gap-2 text-sm text-slate-700">
  <span>Contract Type</span>
  <select 
    value={draft.contractType} 
    onChange={(e) => updateDraft({ contractType: e.target.value as ContractType })} 
    className="rounded-md border px-2 py-1"
  >
    <option value="FULL_TIME">Full Time</option>
    <option value="PART_TIME">Part Time</option>
    <option value="STUDENT">Student</option>
    <option value="FLEXI_JOB">Flexi Job</option>
  </select>
</label>
```

#### Added Contract Type Display in Employee List:
```tsx
<span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs text-purple-700">
  {e.contractType === 'FULL_TIME' ? 'Full Time' : 
   e.contractType === 'PART_TIME' ? 'Part Time' : 
   e.contractType === 'STUDENT' ? 'Student' : 
   e.contractType === 'FLEXI_JOB' ? 'Flexi Job' : e.contractType}
</span>
```

#### Updated API Calls:
- Modified both create and update employee API calls to send `draft.contractType` instead of hardcoded `"FULL_TIME"`

### 3. Seed Data
**File**: `prisma/seed.ts`
- Updated Jasper Novak to be a `FLEXI_JOB` employee with 30 hours/week target
- Updated Marie Dubois to be a `FLEXI_JOB` employee with 25 hours/week target

### 4. Existing API Support
The following files already had `contractType` support and didn't need changes:
- `src/types/api.ts` - Already includes `contractType?: ContractType` in interfaces
- `src/app/api/employees-v2/route.ts` - Already handles `contractType` in create
- `src/app/api/employees-v2/[id]/route.ts` - Already handles `contractType` in update
- `src/server/setup-serialization.ts` - Already serializes `contractType`

## Features Implemented

### ✅ Database Support
- `FLEXI_JOB` enum value added to PostgreSQL
- Migration created for safe database update

### ✅ User Interface
- Contract type dropdown in employee creation/edit form
- Contract type display badge in employee list
- All four contract types available: Full Time, Part Time, Student, Flexi Job

### ✅ API Integration
- Create employee API accepts `contractType`
- Update employee API accepts `contractType`
- Employee responses include `contractType`

### ✅ Data Validation
- TypeScript type safety with `ContractType` enum
- Form validation ensures valid contract type selection

## Usage

### Creating/Editing Employees
1. Navigate to Schedule → Employees
2. Click "Add Employee" or edit existing employee
3. Select contract type from dropdown:
   - **Full Time**: Traditional full-time employment
   - **Part Time**: Part-time employment
   - **Student**: Student workers (with special hour limits)
   - **Flexi Job**: New flexible job contract type

### Contract Type Display
- Contract type is displayed as a purple badge in the employee list
- Shows user-friendly labels (e.g., "Flexi Job" instead of "FLEXI_JOB")

## Database Migration

To apply the changes to an existing database:

```bash
# Generate Prisma client with new enum
npx prisma generate

# Apply the migration
npx prisma migrate deploy
```

Or for development:
```bash
npx prisma db push
```

## Testing

1. **Create Employee**: Test creating a new employee with FLEXI_JOB contract type
2. **Edit Employee**: Test changing an existing employee's contract type to FLEXI_JOB
3. **Display**: Verify contract type shows correctly in employee list
4. **API**: Confirm API endpoints accept and return the new contract type

The implementation is complete and ready for use!