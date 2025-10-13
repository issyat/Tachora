/**
 * Types Index - Central export for all type definitions
 * 
 * This file provides a single import point for all types used throughout the application.
 */

// API types  
export * from './api';
export * from './schedule-facts';

// Import specific types for use in this file
import type { QueryParams } from './api';

// Additional utility types
export interface Color {
  hex: string;
  name?: string;
}

export interface TimeRange {
  start: string; // HH:mm format
  end: string;   // HH:mm format
}

export interface DateRange {
  startDate: Date;
  endDate: Date;
}

// Form-related types
export interface FormField<T = string> {
  value: T;
  error?: string;
  touched?: boolean;
}

export interface FormState<T extends Record<string, unknown>> {
  fields: { [K in keyof T]: FormField<T[K]> };
  isValid: boolean;
  isSubmitting: boolean;
}

// UI state types
export interface LoadingState {
  isLoading: boolean;
  error?: string;
}

export interface AsyncState<T> extends LoadingState {
  data?: T;
}

// Navigation types
export interface NavItem {
  label: string;
  href: string;
  icon?: string;
  active?: boolean;
}

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

// Theme types
export interface Theme {
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    surface: string;
    text: string;
    textSecondary: string;
    border: string;
    error: string;
    warning: string;
    success: string;
    info: string;
  };
  spacing: {
    xs: string;
    sm: string;
    md: string;
    lg: string;
    xl: string;
  };
  borderRadius: {
    sm: string;
    md: string;
    lg: string;
  };
}

// Configuration types
export interface AppConfig {
  api: {
    baseUrl: string;
    timeout: number;
  };
  auth: {
    provider: 'clerk';
    redirectUrl: string;
  };
  database: {
    provider: 'postgresql' | 'supabase';
  };
  features: {
    multiStore: boolean;
    crossStoreEmployees: boolean;
    advancedScheduling: boolean;
  };
}

// Event types for real-time updates
export interface ScheduleUpdateEvent {
  type: 'schedule_updated';
  scheduleId: string;
  storeId: string;
  changes: string[];
}

export interface EmployeeUpdateEvent {
  type: 'employee_updated';
  employeeId: string;
  storeId: string;
  changes: string[];
}

export type AppEvent = ScheduleUpdateEvent | EmployeeUpdateEvent;

// Utility type helpers
export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
export type RequiredFields<T, K extends keyof T> = T & Required<Pick<T, K>>;
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

// Export commonly used Prisma types for convenience
export type {
  PrismaClient,
  Prisma,
} from '@/generated/prisma';

export type {
  Availability,
  Employee,
  EmployeeWorkType,
  ShiftTemplate,
  Weekday,
  WorkType,
} from '@/generated/prisma';

// Generic CRUD operations (using imported QueryParams)
export interface CrudOperations<T, CreateInput, UpdateInput> {
  create: (input: CreateInput) => Promise<T>;
  read: (id: string) => Promise<T | null>;
  update: (id: string, input: UpdateInput) => Promise<T>;
  delete: (id: string) => Promise<void>;
  list: (params?: QueryParams) => Promise<T[]>;
}