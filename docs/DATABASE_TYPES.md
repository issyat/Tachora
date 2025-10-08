# Database Types & Seeding Guide

This document explains the coherent TypeScript interface system and reproducible seeding setup for the Tachora scheduling application.

## Overview

The application uses a comprehensive type system that ensures consistency between:
- Prisma database schema
- API request/response interfaces  
- Frontend component props
- Business logic functions

## Type Structure

### Core Types (`src/types/`)

#### `database.ts`
Contains interfaces that directly mirror the Prisma schema:

```typescript
// Base entities (matching Prisma models exactly)
export interface User extends PrismaUser {}
export interface Store extends PrismaStore {}
export interface Employee extends PrismaEmployee {}

// Extended types with relations
export interface EmployeeWithRelations extends Employee {
  store: Store;
  assignments: Assignment[];
  availability: Availability[];
  roles: Array<EmployeeWorkType & { workType: WorkType }>;
}

// Utility types for operations
export type CreateEmployeeInput = Omit<Employee, 'id' | 'createdAt' | 'updatedAt'>;
export type UpdateEmployeeInput = Partial<Omit<Employee, 'id' | 'storeId' | 'createdAt' | 'updatedAt'>>;
```

#### `api.ts`
Defines request/response interfaces for API endpoints:

```typescript
// API response wrapper
export interface ApiResponse<T = unknown> {
  data?: T;
  error?: string;
  message?: string;
}

// Employee API types
export interface EmployeeResponse {
  id: string;
  name: string;
  email: string;
  // ... other fields
  availability: EmployeeAvailabilitySlot[];
}

export interface CreateEmployeeRequest {
  name: string;
  email: string;
  // ... other fields
}
```

#### `index.ts`
Central export point and additional utility types.

## Database Schema

### Core Entities

1. **User** - System users (managers)
2. **Store** - Physical store locations
3. **Employee** - Store staff members
4. **WorkType** - Job roles/positions
5. **Availability** - Employee availability slots
6. **ShiftTemplate** - Recurring shift patterns
7. **Schedule** - Weekly schedules
8. **Assignment** - Individual shift assignments

### Key Relationships

```
User (1) ──── (N) Store
Store (1) ──── (N) Employee
Store (1) ──── (N) WorkType
Employee (N) ──── (N) WorkType (via EmployeeWorkType)
Employee (1) ──── (N) Availability
Store (1) ──── (N) ShiftTemplate
Store (1) ──── (N) Schedule
Schedule (1) ──── (N) Assignment
```

### Enums

- `UserRole`: BIG_MANAGER
- `ContractType`: FULL_TIME, PART_TIME, STUDENT
- `OnboardingStep`: STORE, EMPLOYEES, SHIFTS, DONE
- `Weekday`: MON, TUE, WED, THU, FRI, SAT, SUN
- `ScheduleState`: Draft, Published

## Seeding System

### Comprehensive Seed Script (`prisma/seed.ts`)

The seed script creates a complete, realistic dataset:

#### Manager
- Uses your actual Clerk user ID: user_3329TDaGk7PRFLRGGcebxRgCqeyid
- Preserves your existing email if you already have a user record
- Sets onboarding to complete for testing

#### Stores
1. **Downtown Brussels**
   - Address: Rue de la Loi 123, 1000 Brussels
   - Hours: 08:00 - 22:00

2. **Antwerp Central** 
   - Address: Meir 45, 2000 Antwerp
   - Hours: 09:00 - 21:00

#### Work Types (per store)
- Cashier (green)
- Sales Associate (blue)
- Security Guard (orange)
- Store Manager (purple)
- Stock Clerk (red)
- Customer Service (cyan)

#### Employees

**Store 1 (Downtown Brussels):**
- Alice Johnson - Senior Cashier (Full-time, 40h/week)
- Bob Smith - Sales Lead (Full-time, 40h/week)
- Claire Davis - Security Officer (Part-time, 20h/week)
- David Wilson - Stock Assistant (Student, 16h/week)

**Store 2 (Antwerp Central):**
- Emma Brown - Store Supervisor (Full-time, 40h/week)
- Frank Miller - Customer Support (Part-time, 30h/week)

#### Shift Templates
Each store gets realistic shift templates:
- Morning Cashier (08:00-16:00, weekdays)
- Evening Cashier (14:00-22:00, weekdays + Saturday)
- Sales Floor (09:00-17:00, weekdays + Saturday)
- Weekend Security (12:00-20:00, weekends)
- Stock Management (06:00-14:00, Mon/Wed/Fri)

#### Schedules
- Current week (Draft state)
- Next week (Draft state)

### Running the Seed

```bash
# Install dependencies (if not already done)
npm install

# Run the seed script
npm run db:seed

# Reset database and re-seed
npm run db:reset
```

### Seed Configuration

The seed script is highly configurable via the `SEED_CONFIG` object:

```typescript
const SEED_CONFIG = {
  manager: {
    clerkId: 'seed-manager-001',
    email: 'manager@tachora.dev',
    // ...
  },
  stores: [
    {
      name: 'Downtown Brussels',
      city: 'Brussels',
      // ...
    }
  ],
  // ... employees, workTypes, etc.
};
```

## Type Safety Benefits

### 1. Compile-Time Validation
```typescript
// This will cause a TypeScript error if the interface changes
const employee: EmployeeResponse = {
  id: '123',
  name: 'John Doe',
  // Missing required fields will be caught at compile time
};
```

### 2. API Contract Enforcement
```typescript
// API routes are typed
export async function POST(request: Request): Promise<NextResponse<BulkEmployeesResponse>> {
  const body: BulkEmployeesRequest = await request.json();
  // TypeScript ensures the response matches the expected interface
}
```

### 3. Database Query Safety
```typescript
// Prisma queries return typed results
const employee = await prisma.employee.findUnique({
  where: { id },
  include: { availability: true, roles: { include: { workType: true } } }
});
// employee is typed as EmployeeWithRelations
```

## Best Practices

### 1. Always Use Types
```typescript
// Good
function createEmployee(data: CreateEmployeeInput): Promise<Employee> {
  return prisma.employee.create({ data });
}

// Bad
function createEmployee(data: any): Promise<any> {
  return prisma.employee.create({ data });
}
```

### 2. Extend Base Types for Relations
```typescript
// Good - explicit about what relations are included
interface EmployeeWithStore extends Employee {
  store: Store;
}

// Bad - unclear what's included
type EmployeeWithRelations = Employee & { [key: string]: any };
```

### 3. Use Utility Types for Operations
```typescript
// Good - clear intent
type UpdateEmployeeData = Partial<Pick<Employee, 'name' | 'email' | 'phone'>>;

// Bad - allows updating fields that shouldn't change
type UpdateEmployeeData = Partial<Employee>;
```

### 4. Validate API Boundaries
```typescript
// Use Zod schemas that match TypeScript interfaces
const createEmployeeSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  // ... matches CreateEmployeeRequest interface
});
```

## Migration Strategy

When updating the schema:

1. Update Prisma schema
2. Run `prisma generate` to update generated types
3. Update interfaces in `src/types/database.ts`
4. Update API interfaces in `src/types/api.ts`
5. Update seed script if needed
6. Run tests to catch any breaking changes

## Troubleshooting

### Common Issues

1. **Type Mismatch Errors**
   - Ensure Prisma client is regenerated after schema changes
   - Check that custom interfaces extend the correct Prisma types

2. **Seed Script Failures**
   - Verify database connection
   - Check for foreign key constraint violations
   - Ensure unique constraints are respected

3. **API Type Errors**
   - Validate request/response interfaces match actual API behavior
   - Use runtime validation (Zod) alongside TypeScript types

### Debugging Tips

```typescript
// Use satisfies for type checking without losing inference
const employee = {
  id: '123',
  name: 'John Doe',
  // ...
} satisfies EmployeeResponse;

// Use type assertions carefully
const typedData = unknownData as EmployeeResponse;

// Prefer type guards for runtime validation
function isEmployee(obj: unknown): obj is Employee {
  return typeof obj === 'object' && obj !== null && 'id' in obj;
}
```