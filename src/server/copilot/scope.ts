import { prisma } from "@/lib/prisma";
import type { AdvisorScope, ThreadContext } from "./types";

export interface ResolvedScope {
  primaryStoreId: string;
  scope: AdvisorScope;
  allStoreIds: string[];
  borrowableStoreIds: string[];
}

export async function resolveScope(
  managerIdOrClerkId: string,
  context: ThreadContext,
): Promise<ResolvedScope> {
  const primaryStoreId = context.storeId;

  if (!primaryStoreId) {
    throw new Error("Thread is missing a primary storeId.");
  }

  if (context.scope === "HomeOnly") {
    return {
      primaryStoreId,
      scope: "HomeOnly",
      allStoreIds: [primaryStoreId],
      borrowableStoreIds: [],
    };
  }

  if (context.scope === "Specific") {
    const explicit = Array.isArray(context.extraStoreIds) ? context.extraStoreIds : [];
    const storeIds = new Set([primaryStoreId, ...explicit]);
    return {
      primaryStoreId,
      scope: "Specific",
      allStoreIds: Array.from(storeIds),
      borrowableStoreIds: Array.from(storeIds).filter((id) => id !== primaryStoreId),
    };
  }

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
      console.warn(`[SCOPE] No user found for Clerk ID: ${managerIdOrClerkId}`);
      // Return empty scope rather than crash
      return {
        primaryStoreId,
        scope: "AllManaged",
        allStoreIds: [primaryStoreId],
        borrowableStoreIds: [],
      };
    }
    managerId = user.id;
  }

  const managerStores = await prisma.store.findMany({
    where: { managerId },
    select: { id: true },
  });

  const allStoreIds = managerStores.map((store) => store.id);

  return {
    primaryStoreId,
    scope: "AllManaged",
    allStoreIds,
    borrowableStoreIds: allStoreIds.filter((id) => id !== primaryStoreId),
  };
}
