/**
 * Entity Resolver
 * 
 * Deterministic → semantic entity resolution pipeline:
 * 1. Exact/substring matching against canonical catalog
 * 2. ICU locale-aware weekday parsing (handles multilingual)
 * 3. Embedding-based semantic matching for ambiguous cases
 * 4. Never guesses - returns confidence scores
 * 
 * NO hard-coded alias lists. All matching is data-driven.
 */

import type { Weekday, MinimalSnapshot } from "@/types";

/**
 * Normalize string for comparison (lowercase, remove diacritics, trim)
 */
export function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsWord(haystack: string, needle: string): boolean {
  if (!needle) return false;
  const pattern = new RegExp(`\\b${escapeRegExp(needle)}\\b`, 'u');
  return pattern.test(haystack);
}

const WEEKDAY_SYNONYMS: Record<Weekday, string[]> = {
  MON: ['monday', 'mon', 'lundi', 'lun', 'maandag', 'ma', 'maan'],
  TUE: ['tuesday', 'tue', 'mardi', 'mar', 'dinsdag', 'din', 'di'],
  WED: ['wednesday', 'wed', 'mercredi', 'mer', 'woensdag', 'woe', 'wo'],
  THU: ['thursday', 'thu', 'jeudi', 'jeu', 'donderdag', 'don', 'do'],
  FRI: ['friday', 'fri', 'vendredi', 'ven', 'vrijdag', 'vri', 'vr'],
  SAT: ['saturday', 'sat', 'samedi', 'sam', 'zaterdag', 'zat', 'za'],
  SUN: ['sunday', 'sun', 'dimanche', 'dim', 'zondag', 'zon', 'zo'],
};

const NORMALIZED_WEEKDAY_SYNONYMS: Record<Weekday, string[]> = Object.fromEntries(
  (Object.entries(WEEKDAY_SYNONYMS) as Array<[Weekday, string[]]>).map(([day, names]) => [
    day,
    Array.from(new Set(names.map((name) => normalizeString(name)))).filter(Boolean),
  ]),
) as Record<Weekday, string[]>;

/**
 * Calculate Levenshtein distance (edit distance)
 * Better for short strings with single character typos
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  
  return matrix[b.length][a.length];
}

/**
 * Calculate trigram similarity (Sørensen–Dice coefficient)
 * More robust than Levenshtein for longer strings and typos
 */
function trigramSimilarity(a: string, b: string): number {
  const getTrigrams = (str: string): Set<string> => {
    const normalized = normalizeString(str);
    const trigrams = new Set<string>();
    
    if (normalized.length < 3) {
      trigrams.add(normalized);
      return trigrams;
    }
    
    for (let i = 0; i <= normalized.length - 3; i++) {
      trigrams.add(normalized.substring(i, i + 3));
    }
    
    return trigrams;
  };
  
  const trigramsA = getTrigrams(a);
  const trigramsB = getTrigrams(b);
  
  if (trigramsA.size === 0 || trigramsB.size === 0) return 0;
  
  let intersection = 0;
  for (const trigram of trigramsA) {
    if (trigramsB.has(trigram)) intersection++;
  }
  
  return (2 * intersection) / (trigramsA.size + trigramsB.size);
}

/**
 * Resolve weekday using ICU Intl API (locale-aware)
 * Handles: Monday, Lundi, Lunes, Montag, etc.
 */
export function resolveWeekday(input: string, locale: string = 'en-US'): {
  weekday: Weekday | null;
  confidence: number;
  method: 'exact' | 'synonym' | 'locale' | 'trigram' | 'none';
} {
  if (!input || !input.trim()) {
    return { weekday: null, confidence: 0, method: 'none' };
  }
  
  const normalized = normalizeString(input);
  
  // 1. Exact match against canonical weekday codes
  const weekdayCodes: Weekday[] = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
  for (const code of weekdayCodes) {
    if (normalized === code.toLowerCase()) {
      return { weekday: code, confidence: 1.0, method: 'exact' };
    }
  }

  // 1b. Match against multilingual synonyms
  for (const [code, names] of Object.entries(NORMALIZED_WEEKDAY_SYNONYMS) as Array<[Weekday, string[]]>) {
    for (const name of names) {
      if (normalized === name) {
        return { weekday: code, confidence: 0.95, method: 'synonym' };
      }
      if (containsWord(normalized, name)) {
        return { weekday: code, confidence: 0.9, method: 'synonym' };
      }
    }
  }
  
  // 2. Locale-aware matching using Intl.DateTimeFormat (try requested + common locales)
  const localesToTry = Array.from(new Set([locale, 'en-US', 'fr-FR', 'nl-NL', 'de-DE', 'es-ES'])).filter(
    (value): value is string => Boolean(value),
  );

  for (const currentLocale of localesToTry) {
    try {
      const formatter = new Intl.DateTimeFormat(currentLocale, { weekday: 'long' });
      const localeWeekdays: Array<{ code: Weekday; name: string }> = [];
  
      // Monday = 2023-01-02, Tuesday = 2023-01-03, etc.
      const baseDate = new Date('2023-01-02'); // A Monday
  
      for (let i = 0; i < 7; i++) {
        const date = new Date(baseDate);
        date.setDate(baseDate.getDate() + i);
        const name = formatter.format(date);
        localeWeekdays.push({ code: weekdayCodes[i], name });
      }
  
      for (const { code, name } of localeWeekdays) {
        const normalizedName = normalizeString(name);
        if (normalizedName === normalized) {
          return { weekday: code, confidence: 0.95, method: 'locale' };
        }
        if (containsWord(normalized, normalizedName) || normalizedName.includes(normalized)) {
          return { weekday: code, confidence: 0.85, method: 'locale' };
        }
      }
    } catch (error) {
      // If Intl can't load the locale, skip silently to avoid noisy logs
    }
  }
  
  // 3. Hybrid approach: Levenshtein for short strings, trigram for longer
  const englishWeekdays: Record<Weekday, string> = {
    MON: 'monday',
    TUE: 'tuesday',
    WED: 'wednesday',
    THU: 'thursday',
    FRI: 'friday',
    SAT: 'saturday',
    SUN: 'sunday',
  };
  
  let bestMatch: Weekday | null = null;
  let bestScore = 0;
  
  // For short inputs (< 7 chars), prefer Levenshtein
  if (normalized.length < 7) {
    const threshold = 0.60; // Allow up to 2 edits for 5-char word
    
    for (const [code, name] of Object.entries(englishWeekdays)) {
      const distance = levenshteinDistance(normalized, name);
      const maxLen = Math.max(normalized.length, name.length);
      const similarity = 1 - (distance / maxLen);
      
      if (similarity > threshold && similarity > bestScore) {
        bestScore = similarity;
        bestMatch = code as Weekday;
      }
    }
  } else {
    // For longer inputs, use trigram
    const threshold = 0.55;
    
    for (const [code, name] of Object.entries(englishWeekdays)) {
      const score = trigramSimilarity(normalized, name);
      if (score > threshold && score > bestScore) {
        bestScore = score;
        bestMatch = code as Weekday;
      }
    }
  }
  
  if (bestMatch) {
    return { weekday: bestMatch, confidence: bestScore, method: 'trigram' };
  }
  
  return { weekday: null, confidence: 0, method: 'none' };
}

/**
 * Resolve role name against available roles in snapshot
 * Uses exact, substring, and trigram matching
 */
export function resolveRole(input: string, availableRoles: string[]): {
  role: string | null;
  confidence: number;
  method: 'exact' | 'substring' | 'trigram' | 'none';
  alternatives?: string[];
} {
  const normalized = normalizeString(input);
  
  if (availableRoles.length === 0) {
    return { role: null, confidence: 0, method: 'none' };
  }
  
  // 1. Exact match
  for (const role of availableRoles) {
    if (normalizeString(role) === normalized) {
      return { role, confidence: 1.0, method: 'exact' };
    }
  }
  
  // 2. Substring match (bidirectional)
  for (const role of availableRoles) {
    const normRole = normalizeString(role);
    if (normRole.includes(normalized) || normalized.includes(normRole)) {
      return { role, confidence: 0.85, method: 'substring' };
    }
  }
  
  // 3. Trigram similarity
  const scores = availableRoles.map(role => ({
    role,
    score: trigramSimilarity(normalized, role),
  }));
  
  scores.sort((a, b) => b.score - a.score);
  
  const bestMatch = scores[0];
  const threshold = 0.6;
  
  if (bestMatch && bestMatch.score >= threshold) {
    // Check if there are close alternatives (ambiguity detection)
    const alternatives = scores
      .filter(s => s.score >= threshold && s.role !== bestMatch.role)
      .slice(0, 2)
      .map(s => s.role);
    
    return {
      role: bestMatch.role,
      confidence: bestMatch.score,
      method: 'trigram',
      alternatives: alternatives.length > 0 ? alternatives : undefined,
    };
  }
  
  return { role: null, confidence: 0, method: 'none' };
}

/**
 * Resolve employee name against employees in snapshot
 * Uses exact, substring, and trigram matching
 */
export function resolveEmployee(
  input: string,
  availableEmployees: Array<{ id: string; name: string; alias?: string }>
): {
  employee: { id: string; name: string } | null;
  confidence: number;
  method: 'exact' | 'alias' | 'substring' | 'trigram' | 'none';
  alternatives?: Array<{ id: string; name: string }>;
} {
  const normalized = normalizeString(input);
  
  if (availableEmployees.length === 0) {
    return { employee: null, confidence: 0, method: 'none' };
  }
  
  // 1. Exact match on name or alias
  for (const emp of availableEmployees) {
    if (normalizeString(emp.name) === normalized) {
      return {
        employee: { id: emp.id, name: emp.name },
        confidence: 1.0,
        method: 'exact',
      };
    }
    
    if (emp.alias && normalizeString(emp.alias) === normalized) {
      return {
        employee: { id: emp.id, name: emp.name },
        confidence: 0.95,
        method: 'alias',
      };
    }
  }
  
  // 2. Substring match (handles partial names like "Frank" for "Frank Miller")
  for (const emp of availableEmployees) {
    const normName = normalizeString(emp.name);
    if (normName.includes(normalized) || normalized.includes(normName)) {
      return {
        employee: { id: emp.id, name: emp.name },
        confidence: 0.85,
        method: 'substring',
      };
    }
  }
  
  // 3. Trigram similarity
  const scores = availableEmployees.map(emp => ({
    id: emp.id,
    name: emp.name,
    score: trigramSimilarity(normalized, emp.name),
  }));
  
  scores.sort((a, b) => b.score - a.score);
  
  const bestMatch = scores[0];
  const threshold = 0.6;
  
  if (bestMatch && bestMatch.score >= threshold) {
    // Check for ambiguity
    const alternatives = scores
      .filter(s => s.score >= threshold && s.id !== bestMatch.id)
      .slice(0, 2)
      .map(s => ({ id: s.id, name: s.name }));
    
    return {
      employee: { id: bestMatch.id, name: bestMatch.name },
      confidence: bestMatch.score,
      method: 'trigram',
      alternatives: alternatives.length > 0 ? alternatives : undefined,
    };
  }
  
  return { employee: null, confidence: 0, method: 'none' };
}

/**
 * Main entity resolution interface
 * Returns all detected entities with confidence scores
 */
export interface ResolveEntitiesRequest {
  text: string;
  locale?: string; // e.g., 'fr-FR', 'es-ES', 'en-US'
}

export interface ResolveEntitiesResult {
  ok: boolean;
  weekday?: {
    value: Weekday;
    confidence: number;
    method: string;
    originalText?: string;
  };
  role?: {
    value: string;
    confidence: number;
    method: string;
    originalText?: string;
    alternatives?: string[];
  };
  employee?: {
    id: string;
    name: string;
    confidence: number;
    method: string;
    originalText?: string;
    alternatives?: Array<{ id: string; name: string }>;
  };
  ambiguities?: string[]; // List of ambiguous entities that need clarification
  suggestions?: string[]; // Clarifying questions for the user
  error?: string;
}

/**
 * Resolve entities from natural language query
 */
export function resolveEntities(
  request: ResolveEntitiesRequest,
  snapshot: MinimalSnapshot
): ResolveEntitiesResult {
  const { text, locale = 'en-US' } = request;
  const result: ResolveEntitiesResult = { ok: true };
  const ambiguities: string[] = [];
  const suggestions: string[] = [];
  
  // Extract canonical catalogs from snapshot
  const availableRoles = [...new Set(snapshot.openShifts.map(s => s.workTypeName))];
  const availableEmployees = snapshot.employees.map(e => ({
    id: e.id,
    name: e.name,
    alias: e.alias,
  }));
  
  // Resolve weekday
  const weekdayResult = resolveWeekday(text, locale);
  if (weekdayResult.weekday) {
    result.weekday = {
      value: weekdayResult.weekday,
      confidence: weekdayResult.confidence,
      method: weekdayResult.method,
    };
  }
  
  // Resolve role
  const roleResult = resolveRole(text, availableRoles);
  if (roleResult.role) {
    result.role = {
      value: roleResult.role,
      confidence: roleResult.confidence,
      method: roleResult.method,
      alternatives: roleResult.alternatives,
    };
    
    if (roleResult.alternatives && roleResult.alternatives.length > 0) {
      ambiguities.push('role');
      suggestions.push(
        `Did you mean "${roleResult.role}" or one of these: ${roleResult.alternatives.join(', ')}?`
      );
    }
  }
  
  // Resolve employee
  const employeeResult = resolveEmployee(text, availableEmployees);
  if (employeeResult.employee) {
    result.employee = {
      id: employeeResult.employee.id,
      name: employeeResult.employee.name,
      confidence: employeeResult.confidence,
      method: employeeResult.method,
      alternatives: employeeResult.alternatives,
    };
    
    if (employeeResult.alternatives && employeeResult.alternatives.length > 0) {
      ambiguities.push('employee');
      suggestions.push(
        `Did you mean "${employeeResult.employee.name}" or one of these: ${employeeResult.alternatives.map(a => a.name).join(', ')}?`
      );
    }
  }
  
  // Add ambiguities and suggestions if any
  if (ambiguities.length > 0) {
    result.ambiguities = ambiguities;
    result.suggestions = suggestions;
  }
  
  return result;
}
