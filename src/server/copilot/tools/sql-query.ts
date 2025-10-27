/**
 * sql.query - Safe ad-hoc SQL query tool
 * 
 * Allows executing SELECT queries on whitelisted views only.
 * Automatically injects context (storeId, isoWeek) and enforces safety rules.
 */

import { prisma } from "@/lib/prisma";
import { ALLOWED_VIEWS } from "../metrics-catalog";
import type { ThreadContext } from "../types";

export interface SqlQueryRequest {
  query: string;
  description?: string; // Optional: what the user is trying to find
}

export interface SqlQueryResult {
  rows: unknown[];
  rowCount: number;
  executedQuery: string;
}

/**
 * Validate and sanitize a SQL query
 */
function validateQuery(query: string): { valid: boolean; error?: string } {
  const normalized = query.trim().toLowerCase();

  // Must be a SELECT statement
  if (!normalized.startsWith("select")) {
    return { valid: false, error: "Only SELECT queries are allowed" };
  }

  // No semicolons (prevents multiple statements)
  if (query.includes(";")) {
    return { valid: false, error: "Multiple statements not allowed (no semicolons)" };
  }

  // No dangerous keywords
  const dangerous = ["insert", "update", "delete", "drop", "alter", "create", "truncate", "exec", "execute"];
  for (const keyword of dangerous) {
    if (normalized.includes(keyword)) {
      return { valid: false, error: `Forbidden keyword: ${keyword}` };
    }
  }

  // Must query from allowed views only
  const hasAllowedView = ALLOWED_VIEWS.some((view) => normalized.includes(view));
  if (!hasAllowedView) {
    return {
      valid: false,
      error: `Must query from allowed views: ${ALLOWED_VIEWS.join(", ")}`,
    };
  }

  // Check for any non-view tables (tables not starting with v_)
  const fromMatch = normalized.match(/\bfrom\s+"?([a-z_][a-z0-9_]*)"?/gi);
  if (fromMatch) {
    for (const match of fromMatch) {
      const tableName = match.replace(/from\s+"?/i, "").replace(/"?$/, "").trim();
      if (!tableName.startsWith("v_")) {
        return { valid: false, error: `Can only query views (v_*), not table: ${tableName}` };
      }
    }
  }

  return { valid: true };
}

/**
 * Auto-inject context parameters into WHERE clause
 */
function injectContext(
  query: string,
  context: {
    storeId: string;
    isoWeek: string;
    allStoreIds: string[];
  },
): { query: string; values: unknown[] } {
  let modifiedQuery = query;
  const values: unknown[] = [];
  let paramIndex = 1;

  // Check if query already has WHERE clause
  const hasWhere = /\bwhere\b/i.test(query);
  
  // Inject storeId if querying v_day_assignments or similar store-specific views
  if (/v_day_assignments|v_employee_hours_week/i.test(query)) {
    if (!hasWhere) {
      modifiedQuery += ` WHERE schedule_store_id = $${paramIndex}`;
      values.push(context.storeId);
      paramIndex++;
    } else if (!/schedule_store_id/i.test(query)) {
      modifiedQuery = modifiedQuery.replace(/\bwhere\b/i, `WHERE schedule_store_id = $${paramIndex} AND `);
      values.push(context.storeId);
      paramIndex++;
    }

    // Inject isoWeek
    if (!/iso_week/i.test(query)) {
      if (!hasWhere) {
        modifiedQuery += ` WHERE iso_week = $${paramIndex}`;
      } else {
        modifiedQuery = modifiedQuery.replace(/\bwhere\b/i, `WHERE iso_week = $${paramIndex} AND `);
      }
      values.push(context.isoWeek);
      paramIndex++;
    }
  }

  // Add LIMIT if not present
  if (!/\blimit\b/i.test(modifiedQuery)) {
    modifiedQuery += " LIMIT 50";
  }

  return { query: modifiedQuery, values };
}

/**
 * Execute a safe SQL query
 */
export async function executeSqlQuery(
  request: SqlQueryRequest,
  context: ThreadContext,
): Promise<SqlQueryResult> {
  // Validate query
  const validation = validateQuery(request.query);
  if (!validation.valid) {
    throw new Error(`Invalid query: ${validation.error}`);
  }

  // Inject context
  const { query, values } = injectContext(request.query, {
    storeId: context.storeId,
    isoWeek: context.isoWeek,
    allStoreIds: [], // Not used in ad-hoc queries for safety
  });

  // Execute
  try {
    const rows = await prisma.$queryRawUnsafe<unknown[]>(query, ...values);
    
    return {
      rows,
      rowCount: rows.length,
      executedQuery: query,
    };
  } catch (error) {
    throw new Error(`Query execution failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
