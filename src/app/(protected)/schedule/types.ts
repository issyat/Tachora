export type DayKey = 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN';

export interface Template {
  id: string;
  workTypeId: string;
  workType: {
    id: string;
    name: string;
    color: string;
  } | null;
  days: Record<DayKey, boolean> | Record<string, boolean>;
  startTime: string;
  endTime: string;
}

export interface EmployeeAvailability {
  day: DayKey | string;
  isOff: boolean;
  startTime: string;
  endTime: string;
}

export interface Employee {
  id: string;
  name: string;
  email: string;
  phone: string;
  color: string;
  availability: EmployeeAvailability[];
  storeId: string;
  storeName?: string;
  weeklyMinutesTarget: number;
  canWorkAcrossStores: boolean;
  contractType?: string | null;
  roleIds?: string[];
  roles?: Array<{ id: string; name: string; color: string }>;
  _index?: number;
}

export interface StoreSummary {
  id: string;
  name: string;
  address: string;
  city: string;
  country: string;
  openingTime: string;
  closingTime: string;
}

export interface Assignment {
  id: string;
  day: DayKey;
  startTime: string;
  endTime: string;
  workType: {
    id: string;
    name: string;
    color: string;
  };
  locked: boolean;
  employee?: {
    id: string;
    name: string;
    color: string;
    storeName?: string;
  };
  sourceTemplate?: {
    id: string;
    workTypeId: string;
  };
}

export interface ScheduleSummary {
  id: string;
  weekId: string;
  state: string;
  generatedAt?: string;
}

export interface ScheduleDataPayload {
  stores: StoreSummary[];
  store: StoreSummary | null;
  shiftTemplates: Template[];
  employees: Employee[];
  assignments: Assignment[];
  schedule?: ScheduleSummary | null;
}
