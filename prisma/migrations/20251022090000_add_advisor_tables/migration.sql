-- Create enum for advisor scope
CREATE TYPE "AdvisorScope" AS ENUM ('HomeOnly', 'AllManaged', 'Specific');

-- AdvisorThread table
CREATE TABLE "AdvisorThread" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "storeId" TEXT,
  "isoWeek" TEXT,
  "scope" "AdvisorScope" NOT NULL DEFAULT 'HomeOnly',
  "extraStoreIds" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdvisorThread_pkey" PRIMARY KEY ("id")
);

-- AdvisorMessage table
CREATE TABLE "AdvisorMessage" (
  "id" TEXT NOT NULL,
  "threadId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "content" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdvisorMessage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AdvisorMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "AdvisorThread"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "AdvisorThread_user_store_week_idx"
  ON "AdvisorThread"("userId", "storeId", "isoWeek");

CREATE INDEX "AdvisorMessage_thread_created_idx"
  ON "AdvisorMessage"("threadId", "createdAt");
