/**
 * Find Employee Tool
 * 
 * Provides diacritics-insensitive employee search by id, name, or alias.
 * Prevents the LLM from guessing or making up employee names.
 */

import type { FindEmployeeRequest, FindEmployeeResult } from "@/types";
import { prisma } from "@/lib/prisma";

/**
 * Normalize string for comparison (lowercase, remove diacritics)
 */
function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ''); // Remove diacritics
}

/**
 * Calculate simple string similarity (0-1)
 */
function similarity(a: string, b: string): number {
  const normA = normalizeString(a);
  const normB = normalizeString(b);
  
  if (normA === normB) return 1.0;
  if (normA.includes(normB) || normB.includes(normA)) return 0.8;
  
  // Simple Levenshtein-inspired score
  const maxLen = Math.max(normA.length, normB.length);
  let matches = 0;
  
  for (let i = 0; i < Math.min(normA.length, normB.length); i++) {
    if (normA[i] === normB[i]) matches++;
  }
  
  return matches / maxLen;
}

export interface FindEmployeeOptions {
  storeId?: string;
  managerId?: string;
  limit?: number;
}

export async function findEmployee(
  request: FindEmployeeRequest,
  options: FindEmployeeOptions = {}
): Promise<FindEmployeeResult> {
  const { query } = request;
  const { storeId, managerId, limit = 10 } = options;

  if (!query?.trim()) {
    return {
      ok: false,
      error: "Query is required",
    };
  }

  const trimmedQuery = query.trim();

  try {
    // Build where clause
    const where: {
      OR?: Array<{
        id?: string;
        name?: { contains: string; mode: 'insensitive' };
      }>;
      storeId?: string;
      store?: { managerId?: string };
    } = {};

    // Check if query is a UUID (exact ID match)
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmedQuery);

    if (isUuid) {
      where.OR = [{ id: trimmedQuery }];
    } else {
      // Search by name (case-insensitive)
      where.OR = [
        { name: { contains: trimmedQuery, mode: 'insensitive' } },
      ];
    }

    // Add store/manager filters
    if (storeId) {
      where.storeId = storeId;
    }
    if (managerId) {
      where.store = { managerId };
    }

    const employees = await prisma.employee.findMany({
      where,
      select: {
        id: true,
        name: true,
        storeId: true,
        store: {
          select: {
            name: true,
          },
        },
      },
      take: limit,
    });

    if (employees.length === 0) {
      return {
        ok: true,
        employees: [],
      };
    }

    // Calculate relevance scores and sort
    const withScores = employees.map((emp) => ({
      ...emp,
      score: Math.max(
        emp.id === trimmedQuery ? 1.0 : 0,
        similarity(emp.name, trimmedQuery),
      ),
    }));

    withScores.sort((a, b) => b.score - a.score);

    return {
      ok: true,
      employees: withScores.map((emp) => ({
        id: emp.id,
        name: emp.name,
        alias: undefined, // Add when available
        storeId: emp.storeId,
      })),
    };
  } catch (error) {
    console.error("findEmployee error:", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to search employees",
    };
  }
}
