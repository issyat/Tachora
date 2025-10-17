type MemoryEntry = {
  value: string;
  expiresAt?: number;
};

const inMemoryStore = new Map<string, MemoryEntry>();
const redisRestUrl = process.env.REDIS_REST_URL;
const redisRestToken = process.env.REDIS_REST_TOKEN;

type RequestOptions = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
};

async function callRedis(path: string, init?: RequestOptions): Promise<Response | null> {
  if (!redisRestUrl || !redisRestToken) {
    return null;
  }

  try {
    const response = await fetch(`${redisRestUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${redisRestToken}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
    return response;
  } catch (error) {
    console.error("[Redis] Request failed", { path, error });
    return null;
  }
}

export async function kvSet(key: string, value: string, ttlMs?: number): Promise<void> {
  const expiresAt = ttlMs ? Date.now() + ttlMs : undefined;
  inMemoryStore.set(key, { value, expiresAt });

  if (!redisRestUrl || !redisRestToken) {
    return;
  }

  const payload: Record<string, unknown> = { value };
  if (ttlMs) {
    payload.ex = Math.max(1, Math.floor(ttlMs / 1000));
  }

  const response = await callRedis(`/set/${encodeURIComponent(key)}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (response && !response.ok) {
    console.error("[Redis] Failed to persist key", key, await response.text());
  }
}

export async function kvGet(key: string): Promise<string | null> {
  const entry = inMemoryStore.get(key);
  if (entry) {
    if (!entry.expiresAt || Date.now() <= entry.expiresAt) {
      return entry.value;
    }
    inMemoryStore.delete(key);
  }

  const response = await callRedis(`/get/${encodeURIComponent(key)}`);
  if (!response) {
    return null;
  }

  if (!response.ok) {
    return null;
  }

  try {
    const result = (await response.json()) as { result?: string | null };
    const value = result?.result ?? null;
    if (value != null) {
      inMemoryStore.set(key, { value });
    }
    return value;
  } catch (error) {
    console.error("[Redis] Failed to parse response", error);
    return null;
  }
}

export async function kvDel(key: string): Promise<void> {
  inMemoryStore.delete(key);

  const response = await callRedis(`/del/${encodeURIComponent(key)}`, {
    method: "POST",
  });

  if (response && !response.ok) {
    console.error("[Redis] Failed to delete key", key, await response.text());
  }
}

// ============================================================================
// Conversation History
// ============================================================================

export interface ConversationTurn {
  user: string;
  assistant: string;
  timestamp: number;
}

/**
 * Save a conversation turn (user message + AI response).
 * Keeps last 3 turns per threadId with 10min TTL.
 */
export async function saveConversationTurn(
  threadId: string,
  userMessage: string,
  assistantReply: string
): Promise<void> {
  try {
    const key = `conv:${threadId}`;
    const existingJson = await kvGet(key);
    let existing: ConversationTurn[] = [];
    
    if (existingJson) {
      try {
        const parsed = JSON.parse(existingJson);
        // Ensure it's an array
        existing = Array.isArray(parsed) ? parsed : [];
      } catch {
        existing = [];
      }
    }
    
    // Add new turn
    existing.push({
      user: userMessage,
      assistant: assistantReply,
      timestamp: Date.now(),
    });
    
    // Keep only last 3 turns
    const recent = existing.slice(-3);
    
    // Save with 10min TTL
    await kvSet(key, JSON.stringify(recent), 10 * 60 * 1000);
  } catch (error) {
    // Fail silently - conversation history is not critical
    console.error('[saveConversationTurn] Error:', error);
  }
}

/**
 * Load recent conversation turns for context.
 * Returns last 3 Q&A pairs.
 */
export async function loadConversationHistory(threadId: string): Promise<ConversationTurn[]> {
  try {
    const key = `conv:${threadId}`;
    const json = await kvGet(key);
    if (!json) return [];
    
    const parsed = JSON.parse(json);
    // Ensure it's an array
    const turns: ConversationTurn[] = Array.isArray(parsed) ? parsed : [];
    return turns;
  } catch {
    return [];
  }
}
