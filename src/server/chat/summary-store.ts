import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type ConversationRole = "user" | "assistant" | "system";

export interface ConversationMessage {
  role: ConversationRole;
  content: string;
  timestamp: string;
}

export interface ConversationSummary {
  summary: string | null;
  recentMessages: ConversationMessage[];
}

interface ConversationKey {
  threadId: string;
  userId: string;
  storeId?: string;
  weekId?: string | null;
}

const inMemorySummary = new Map<string, ConversationSummary>();
const inMemoryLog = new Map<string, ConversationMessage[]>();

let supabaseServerClient: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient | null {
  if (supabaseServerClient) {
    return supabaseServerClient;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return null;
  }

  supabaseServerClient = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return supabaseServerClient;
}

function getCacheKey(key: ConversationKey): string {
  const { threadId, userId, storeId, weekId } = key;
  return [userId, storeId ?? "none", weekId ?? "none", threadId].join(":");
}

export async function loadConversationSummary(key: ConversationKey): Promise<ConversationSummary> {
  const cacheKey = getCacheKey(key);
  const cached = inMemorySummary.get(cacheKey);
  if (cached) {
    return cached;
  }

  const client = getSupabaseClient();
  if (!client) {
    return { summary: null, recentMessages: inMemoryLog.get(cacheKey) ?? [] };
  }

  try {
    const { data, error } = await client
      .from("chat_threads")
      .select("rolling_summary, recent_messages")
      .eq("thread_id", key.threadId)
      .eq("user_id", key.userId)
      .maybeSingle();

    if (error) {
      console.error("[ChatSummary] load failed", error);
      return { summary: null, recentMessages: [] };
    }

    if (data) {
      const summary: ConversationSummary = {
        summary: data.rolling_summary ?? null,
        recentMessages: (data.recent_messages as ConversationMessage[]) ?? [],
      };
      inMemorySummary.set(cacheKey, summary);
      inMemoryLog.set(cacheKey, summary.recentMessages.slice(-10));
      return summary;
    }
  } catch (error) {
    console.error("[ChatSummary] load exception", error);
  }

  return { summary: null, recentMessages: inMemoryLog.get(cacheKey) ?? [] };
}

export async function appendConversationMessages(
  key: ConversationKey,
  messages: ConversationMessage[],
): Promise<void> {
  const cacheKey = getCacheKey(key);
  const existing = inMemoryLog.get(cacheKey) ?? [];
  const updated = [...existing, ...messages].slice(-10);
  inMemoryLog.set(cacheKey, updated);

  const summary = inMemorySummary.get(cacheKey) ?? { summary: null, recentMessages: [] };
  inMemorySummary.set(cacheKey, { ...summary, recentMessages: updated });

  const client = getSupabaseClient();
  if (!client) {
    return;
  }

  try {
    const { error } = await client.from("chat_messages").insert(
      messages.map((message) => ({
        thread_id: key.threadId,
        user_id: key.userId,
        store_id: key.storeId ?? null,
        week_id: key.weekId ?? null,
        role: message.role,
        content: message.content,
        timestamp: message.timestamp,
      })),
    );

    if (error) {
      console.error("[ChatSummary] append failed", error);
    }
  } catch (error) {
    console.error("[ChatSummary] append exception", error);
  }
}

export async function updateConversationSummary(
  key: ConversationKey,
  summary: string,
  recentMessages: ConversationMessage[],
): Promise<void> {
  const cacheKey = getCacheKey(key);
  inMemorySummary.set(cacheKey, { summary, recentMessages });
  inMemoryLog.set(cacheKey, recentMessages.slice(-10));

  const client = getSupabaseClient();
  if (!client) {
    return;
  }

  try {
    const { error } = await client
      .from("chat_threads")
      .upsert(
        {
          thread_id: key.threadId,
          user_id: key.userId,
          store_id: key.storeId ?? null,
          week_id: key.weekId ?? null,
          rolling_summary: summary,
          recent_messages: recentMessages.slice(-10),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "thread_id" },
      );

    if (error) {
      console.error("[ChatSummary] upsert failed", error);
    }
  } catch (error) {
    console.error("[ChatSummary] upsert exception", error);
  }
}
