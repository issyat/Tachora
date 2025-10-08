-- Add closingTime column to Store with no default (null allowed)
ALTER TABLE "Store"
  ADD COLUMN IF NOT EXISTS "closingTime" TIME;

-- Ensure existing rows have a sensible default to avoid null-driven glitches
UPDATE "Store"
  SET "closingTime" = COALESCE("closingTime", TIME '22:00');
