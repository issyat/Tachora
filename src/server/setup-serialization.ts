import { timeDateToString } from "@/lib/time";
import { WEEKDAY_ORDER } from "@/types";
import type {
  Availability,
  Employee,
  EmployeeWorkType,
  ShiftTemplate,
  Weekday,
  WorkType,
  EmployeeResponse,
  ShiftTemplateResponse,
  WorkTypeResponse,
  EmployeeAvailabilitySlot,
  ShiftTemplateDays,
} from "@/types";

type EmployeeWithRelations = Employee & {
  availability: Availability[];
  roles: Array<EmployeeWorkType & { workType: WorkType | null }>;
};

type TemplateWithRelations = ShiftTemplate & {
  workType: WorkType | null;
};

type WorkTypeLike = WorkType;

export const dayOrder: Weekday[] = WEEKDAY_ORDER;

const DEFAULT_START = "09:00";
const DEFAULT_END = "22:00";

function serializeAvailability(slots: Availability[]): EmployeeAvailabilitySlot[] {
  const slotMap = new Map<Weekday, Availability>();
  slots.forEach((slot) => {
    slotMap.set(slot.day, slot);
  });

  return dayOrder.map((day) => {
    const slot = slotMap.get(day);
    return {
      day,
      isOff: slot?.isOff ?? true,
      startTime: timeDateToString(slot?.startTime, DEFAULT_START),
      endTime: timeDateToString(slot?.endTime, DEFAULT_END),
    };
  });
}

function serializeRoles(roles: EmployeeWithRelations["roles"]): EmployeeResponse["roles"] {
  return roles
    .map((pivot) => {
      if (!pivot.workType) return null;
      return {
        id: pivot.workTypeId,
        name: pivot.workType.name,
        color: pivot.workType.color ?? "#0f172a",
      };
    })
    .filter((role): role is NonNullable<typeof role> => Boolean(role));
}

export function serializeEmployees(employees: EmployeeWithRelations[]): EmployeeResponse[] {
  return employees.map((employee) => {
    const roles = serializeRoles(employee.roles ?? []);
    return {
      id: employee.id,
      name: employee.name,
      email: employee.email ?? "",
      phone: employee.phone ?? "",
      color: employee.color,
      canWorkAcrossStores: employee.canWorkAcrossStores,
      weeklyMinutesTarget: employee.weeklyMinutesTarget ?? 2400,
      contractType: employee.contractType,
      roleIds: roles.map((role) => role.id),
      roles,
      availability: serializeAvailability(employee.availability ?? []),
      storeId: employee.storeId,
      storeName: (employee as any).store?.name, // For cross-store employees
    } satisfies EmployeeResponse;
  });
}

export function serializeShiftTemplates(templates: TemplateWithRelations[]): ShiftTemplateResponse[] {
  return templates.map((template) => {
    const rawDays = (template.days ?? {}) as Record<string, boolean>;

    const days = dayOrder.reduce<ShiftTemplateDays>((acc, day) => {
      acc[day] = Boolean(rawDays?.[day]);
      return acc;
    }, {} as ShiftTemplateDays);

    return {
      id: template.id,
      workTypeId: template.workTypeId,
      workType: template.workType ? {
        id: template.workType.id,
        name: template.workType.name,
        color: template.workType.color ?? "#0f172a",
      } : null,
      days,
      startTime: timeDateToString(template.startTime, DEFAULT_START),
      endTime: timeDateToString(template.endTime, DEFAULT_END),
    } satisfies ShiftTemplateResponse;
  });
}

export function serializeWorkTypes(workTypes: WorkTypeLike[]): WorkTypeResponse[] {
  return workTypes.map((type) => ({
    id: type.id,
    name: type.name,
    color: type.color ?? "#0f172a",
  }));
}

