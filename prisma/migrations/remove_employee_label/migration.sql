-- Drop the index that uses the label column
DROP INDEX IF EXISTS "Employee_storeId_label_idx";

-- Remove the label column from the Employee table
ALTER TABLE "Employee" DROP COLUMN IF EXISTS "label";