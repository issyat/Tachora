export type AdvisorScope = "HomeOnly" | "AllManaged" | "Specific";

export type ClarificationChoice = {
  employeeId: string;
  employeeName: string;
  homeStoreId: string;
};

export type PendingClarification =
  | {
      kind: "employee";
      normalizedName: string;
      originalQuestion: string;
      options: ClarificationChoice[];
    }
  | {
      kind: "availability-day";
      originalQuestion: string;
      query: {
        startTime?: string;
        endTime?: string;
        daypartLabel?: string;
      };
    };

export interface ThreadState {
  clarifications: Record<string, string>;
  pendingClarification: PendingClarification | null;
  notes: {
    daypartReminderShown?: boolean;
  };
}

export interface ThreadContext {
  threadId: string;
  userId: string;
  storeId: string;
  isoWeek: string;
  scope: AdvisorScope;
  extraStoreIds: string[];
  state: ThreadState;
  resolvedEntities?: {
    employeeId?: string;
    employeeName?: string;
    workTypeId?: string;
    workTypeName?: string;
  };
}

export interface ResolvedScope {
  primaryStoreId: string;
  scope: AdvisorScope;
  allStoreIds: string[];
  borrowableStoreIds: string[];
}

export interface ScopeConfig {
  scope: AdvisorScope;
  storeIds: string[];
}

export interface AvailabilityQuery {
  day?: "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";
  startTime?: string;
  endTime?: string;
  workType?: string;
}

export interface AvailabilityResult {
  employeeId: string;
  employeeName: string;
  homeStoreId: string;
  canBorrow: boolean;
  availability: {
    day: AvailabilityQuery["day"];
    startTime: string | null;
    endTime: string | null;
    fullDay: boolean;
  };
  scheduledMinutes: number;
  totalWeekMinutes: number;
  targetMinutes: number;
  roles: string[];
  conflictsWithWindow: boolean;
}

export interface HoursSummary {
  employeeId: string;
  employeeName: string;
  homeStoreId: string;
  totalMinutes: number;
  targetMinutes: number;
}

export interface GapResult {
  assignmentId: string | null;
  workTypeId: string | null;
  workTypeName: string | null;
  day: AvailabilityQuery["day"];
  startTime: string;
  endTime: string;
  minutes: number;
}

export interface SuggestionCandidate {
  employeeId: string;
  employeeName: string;
  homeStoreId: string;
  reason: string;
}
