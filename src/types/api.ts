/**
 * API Types - Request/Response interfaces for API endpoints
 * 
 * These interfaces define the shape of data sent to and received from API endpoints,
 * providing type safety for client-server communication.
 */

import type {
  Weekday,
  ContractType,
  OnboardingStep,
  ScheduleState,
  UserRole,
} from './database';

// Common API response wrapper
export interface ApiResponse<T = unknown> {
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// User-related API types
export interface UserResponse {
  id: string;
  clerkId: string;
  email?: string;
  role: UserRole;
  onboardingStep: OnboardingStep;
  createdAt: string;
  updatedAt: string;
}

// Store-related API types
export interface StoreResponse {
  id: string;
  name: string;
  country: string;
  city: string;
  address?: string;
  openingTime: string; // HH:mm format
  closingTime: string; // HH:mm format
}

export interface CreateStoreRequest {
  name: string;
  city: string;
  address?: string;
  openingTime?: string; // HH:mm format
  closingTime?: string; // HH:mm format
}

export interface UpdateStoreRequest extends Partial<CreateStoreRequest> {}

// Employee-related API types
export interface EmployeeAvailabilitySlot {
  day: Weekday;
  isOff: boolean;
  startTime: string; // HH:mm format
  endTime: string;   // HH:mm format
}

export interface EmployeeRole {
  id: string;
  name: string;
  color: string;
}

export interface EmployeeResponse {
  id: string;
  name: string;
  email: string;
  phone: string;
  color: string;
  canWorkAcrossStores: boolean;
  weeklyMinutesTarget: number;
  contractType: ContractType;
  roleIds: string[];
  roles: EmployeeRole[];
  availability: EmployeeAvailabilitySlot[];
  storeId: string;
  storeName?: string; // For cross-store employees
}

export interface CreateEmployeeRequest {
  name: string;
  email: string;
  phone: string;
  color: string;
  canWorkAcrossStores: boolean;
  weeklyMinutesTarget?: number;
  contractType?: ContractType;
  roleIds: string[];
  availability: EmployeeAvailabilitySlot[];
}

export interface UpdateEmployeeRequest extends Partial<CreateEmployeeRequest> {}

export interface BulkEmployeesRequest {
  storeId: string;
  employees: CreateEmployeeRequest[];
}

export interface BulkEmployeesResponse extends ApiResponse {
  employees: EmployeeResponse[];
  onboardingStep: OnboardingStep;
}

// Work Type API types
export interface WorkTypeResponse {
  id: string;
  name: string;
  color: string;
}

export interface CreateWorkTypeRequest {
  storeId: string;
  name: string;
  color?: string;
}

export interface UpdateWorkTypeRequest extends Partial<Omit<CreateWorkTypeRequest, 'storeId'>> {}

// Shift Template API types
export interface ShiftTemplateDays {
  [key: string]: boolean;
  MON: boolean;
  TUE: boolean;
  WED: boolean;
  THU: boolean;
  FRI: boolean;
  SAT: boolean;
  SUN: boolean;
}

export interface ShiftTemplateResponse {
  id: string;
  workTypeId: string;
  workType: {
    id: string;
    name: string;
    color: string;
  } | null;
  days: ShiftTemplateDays;
  startTime: string; // HH:mm format
  endTime: string;   // HH:mm format
}

export interface CreateShiftTemplateRequest {
  storeId: string;
  role: string;
  workTypeId?: string;
  days: ShiftTemplateDays;
  startTime: string; // HH:mm format
  endTime: string;   // HH:mm format
}

export interface UpdateShiftTemplateRequest extends Partial<Omit<CreateShiftTemplateRequest, 'storeId'>> {}

// Schedule API types
export interface ScheduleResponse {
  id: string;
  storeId: string;
  isoWeek: string;
  state: ScheduleState;
  generatedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateScheduleRequest {
  storeId: string;
  isoWeek: string;
}

export interface UpdateScheduleRequest {
  state?: ScheduleState;
}

// Assignment API types
export interface AssignmentResponse {
  id: string;
  scheduleId: string;
  day: Weekday;
  startTime: string; // HH:mm format
  endTime: string;   // HH:mm format
  role: string;
  employeeId?: string;
  sourceTemplateId?: string;
  locked: boolean;
}

export interface CreateAssignmentRequest {
  scheduleId: string;
  day: Weekday;
  startTime: string; // HH:mm format
  endTime: string;   // HH:mm format
  role: string;
  employeeId?: string;
  sourceTemplateId?: string;
  locked?: boolean;
}

export interface UpdateAssignmentRequest extends Partial<Omit<CreateAssignmentRequest, 'scheduleId'>> {}

// Setup/Onboarding API types
export interface SetupResponse extends ApiResponse {
  stores: StoreResponse[];
  store?: StoreResponse;
  employees: EmployeeResponse[];
  shiftTemplates: ShiftTemplateResponse[];
  workTypes: WorkTypeResponse[];
  onboardingStep: OnboardingStep;
}

// Validation schemas (for use with zod)
export interface TimeValidation {
  startTime: string;
  endTime: string;
}

export interface AvailabilityValidation extends TimeValidation {
  day: Weekday;
  isOff: boolean;
}

// Error types
export interface ValidationError {
  field: string;
  message: string;
  code?: string;
}

export interface ApiError {
  error: string;
  details?: ValidationError[];
  statusCode?: number;
}

// Utility types for API operations
export type ApiMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface ApiRequestConfig {
  method: ApiMethod;
  headers?: Record<string, string>;
  body?: unknown;
}

// Common query parameters
export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface SortParams {
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface FilterParams {
  search?: string;
  storeId?: string;
  employeeId?: string;
  scheduleId?: string;
}

export type QueryParams = PaginationParams & SortParams & FilterParams;