-- Add capacity field to ShiftTemplate
ALTER TABLE "ShiftTemplate" ADD COLUMN "capacity" INTEGER NOT NULL DEFAULT 1;

-- Add slot field to Assignment
ALTER TABLE "Assignment" ADD COLUMN "slot" INTEGER NOT NULL DEFAULT 0;