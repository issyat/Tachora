CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create table for rolling conversation summaries
CREATE TABLE IF NOT EXISTS "chat_threads" (
  "thread_id" TEXT PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "store_id" TEXT,
  "week_id" TEXT,
  "rolling_summary" TEXT,
  "recent_messages" JSONB,
  "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "chat_threads_scoped_idx"
  ON "chat_threads" ("user_id", "store_id", "week_id");

-- Create table for conversation message log
CREATE TABLE IF NOT EXISTS "chat_messages" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "thread_id" TEXT NOT NULL REFERENCES "chat_threads"("thread_id") ON DELETE CASCADE,
  "user_id" TEXT NOT NULL,
  "store_id" TEXT,
  "week_id" TEXT,
  "role" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "timestamp" TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX IF NOT EXISTS "chat_messages_thread_ts_idx"
  ON "chat_messages" ("thread_id", "timestamp");
