/**
 * Database Types - Coherent with Prisma Schema
 * 
 * These interfaces represent the database entities and their relationships
 * as defined in the Prisma schema, providing type safety across the application.
 */

import type {
    User as PrismaUser,
    Store as PrismaStore,
    Employee as PrismaEmployee,
    Availability as PrismaAvailability,
    ShiftTemplate as PrismaShiftTemplate,
    Schedule as PrismaSchedule,
    Assignment as PrismaAssignment,
    WorkType as PrismaWorkType,
    EmployeeWorkType as PrismaEmployeeWorkType,
    UserRole,
    ContractType,
    OnboardingStep,
    Weekday,
    ScheduleState,
} from "@/generated/prisma";

// Re-export enums for convenience
export {
    UserRole,
    ContractType,
    OnboardingStep,
    Weekday,
    ScheduleState,
} from "@/generated/prisma";

// Base database entities (matching Prisma models exactly)
export interface User extends PrismaUser { }
export interface Store extends PrismaStore { }
export interface Employee extends PrismaEmployee { }
export interface Availability extends PrismaAvailability { }
export interface ShiftTemplate extends PrismaShiftTemplate { }
export interface Schedule extends PrismaSchedule { }
export interface Assignment extends PrismaAssignment { }
export interface WorkType extends PrismaWorkType { }
export interface EmployeeWorkType extends PrismaEmployeeWorkType { }

// Extended types with relations (commonly used in API responses)
export interface UserWithStores extends User {
    stores: Store[];
}

export interface StoreWithRelations extends Store {
    manager: User;
    employees: Employee[];
    schedules: Schedule[];
    shiftTemplates: ShiftTemplate[];
    workTypes: WorkType[];
}

export interface EmployeeWithRelations extends Employee {
    store: Store;
    assignments: Assignment[];
    availability: Availability[];
    roles: Array<EmployeeWorkType & { workType: WorkType }>;
}

export interface AvailabilityWithEmployee extends Availability {
    employee: Employee;
}

export interface ShiftTemplateWithRelations extends ShiftTemplate {
    store: Store;
    workType?: WorkType | null;
    assignments: Assignment[];
}

export interface ScheduleWithRelations extends Schedule {
    store: Store;
    assignments: Assignment[];
}

export interface AssignmentWithRelations extends Assignment {
    employee?: Employee | null;
    schedule: Schedule;
    sourceTemplate?: ShiftTemplate | null;
}

export interface WorkTypeWithRelations extends WorkType {
    store: Store;
    employees: Array<EmployeeWorkType & { employee: Employee }>;
    shifts: ShiftTemplate[];
}

// Utility types for common operations
export type CreateUserInput = Omit<User, 'id' | 'createdAt' | 'updatedAt'>;
export type UpdateUserInput = Partial<Omit<User, 'id' | 'clerkId' | 'createdAt' | 'updatedAt'>>;

export type CreateStoreInput = Omit<Store, 'id' | 'createdAt' | 'updatedAt'>;
export type UpdateStoreInput = Partial<Omit<Store, 'id' | 'managerId' | 'createdAt' | 'updatedAt'>>;

export type CreateEmployeeInput = Omit<Employee, 'id' | 'createdAt' | 'updatedAt'>;
export type UpdateEmployeeInput = Partial<Omit<Employee, 'id' | 'storeId' | 'createdAt' | 'updatedAt'>>;

export type CreateAvailabilityInput = Omit<Availability, 'id' | 'createdAt' | 'updatedAt'>;
export type UpdateAvailabilityInput = Partial<Omit<Availability, 'id' | 'employeeId' | 'createdAt' | 'updatedAt'>>;

export type CreateShiftTemplateInput = Omit<ShiftTemplate, 'id' | 'createdAt' | 'updatedAt'>;
export type UpdateShiftTemplateInput = Partial<Omit<ShiftTemplate, 'id' | 'storeId' | 'createdAt' | 'updatedAt'>>;

export type CreateScheduleInput = Omit<Schedule, 'id' | 'createdAt' | 'updatedAt'>;
export type UpdateScheduleInput = Partial<Omit<Schedule, 'id' | 'storeId' | 'createdAt' | 'updatedAt'>>;

export type CreateAssignmentInput = Omit<Assignment, 'id' | 'createdAt' | 'updatedAt'>;
export type UpdateAssignmentInput = Partial<Omit<Assignment, 'id' | 'scheduleId' | 'createdAt' | 'updatedAt'>>;

export type CreateWorkTypeInput = Omit<WorkType, 'id' | 'createdAt' | 'updatedAt'>;
export type UpdateWorkTypeInput = Partial<Omit<WorkType, 'id' | 'storeId' | 'createdAt' | 'updatedAt'>>;

// Days configuration for shift templates
export interface DaysConfig {
    [key: string]: boolean;
    MON: boolean;
    TUE: boolean;
    WED: boolean;
    THU: boolean;
    FRI: boolean;
    SAT: boolean;
    SUN: boolean;
}

// Time-related utility types
export interface TimeSlot {
    startTime: Date;
    endTime: Date;
}

export interface TimeSlotString {
    startTime: string; // HH:mm format
    endTime: string;   // HH:mm format
}

// Weekday utilities
export const WEEKDAY_ORDER: Weekday[] = [
    'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'
];

export const WEEKDAY_LABELS: Record<Weekday, string> = {
    MON: 'Monday',
    TUE: 'Tuesday',
    WED: 'Wednesday',
    THU: 'Thursday',
    FRI: 'Friday',
    SAT: 'Saturday',
    SUN: 'Sunday'
};