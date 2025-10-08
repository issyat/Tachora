-- Remove capacity and slot fields (reverting to simpler approach)
ALTER TABLE "ShiftTemplate" DROP COLUMN IF EXISTS "capacity";
ALTER TABLE "Assignment" DROP COLUMN IF EXISTS "slot";