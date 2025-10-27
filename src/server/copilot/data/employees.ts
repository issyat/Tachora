import { prisma } from "@/lib/prisma";
import type { ResolvedScope } from "../scope";

export interface ScopedEmployee {
  id: string;
  name: string;
  storeId: string;
  canWorkAcrossStores: boolean;
  weeklyMinutesTarget: number;
  roles: string[];
}

export async function fetchScopedEmployees(
  managerIdOrClerkId: string,
  scope: ResolvedScope,
): Promise<ScopedEmployee[]> {
  // Convert Clerk ID to Prisma User ID if needed
  // Store.managerId references User.id (not User.clerkId)
  let managerId = managerIdOrClerkId;
  if (managerIdOrClerkId.startsWith('user_')) {
    // This is a Clerk ID, need to look up the Prisma User.id
    const user = await prisma.user.findUnique({
      where: { clerkId: managerIdOrClerkId },
      select: { id: true },
    });
    if (!user) {
      console.warn(`[EMPLOYEES] No user found for Clerk ID: ${managerIdOrClerkId}`);
      return [];
    }
    managerId = user.id;
  }

  const employees = await prisma.employee.findMany({
    where: {
      store: { managerId },
      storeId: { in: scope.allStoreIds },
    },
    select: {
      id: true,
      name: true,
      storeId: true,
      canWorkAcrossStores: true,
      weeklyMinutesTarget: true,
      roles: {
        select: {
          workType: {
            select: { name: true },
          },
        },
      },
    },
  });

  return employees
    .filter((employee) => {
      if (employee.storeId === scope.primaryStoreId) {
        return true;
      }
      if (scope.borrowableStoreIds.includes(employee.storeId)) {
        return employee.canWorkAcrossStores;
      }
      return false;
    })
    .map((employee) => ({
      id: employee.id,
      name: employee.name,
      storeId: employee.storeId,
      canWorkAcrossStores: employee.canWorkAcrossStores,
      weeklyMinutesTarget: employee.weeklyMinutesTarget,
      roles: employee.roles.map((role) => role.workType.name),
    }));
}
