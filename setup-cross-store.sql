-- Script to set up cross-store employees for testing

-- First, let's see current employees
SELECT name, "canWorkAcrossStores", "storeId" FROM "Employee";

-- Update some employees to allow cross-store work
UPDATE "Employee" 
SET "canWorkAcrossStores" = true 
WHERE name IN ('Alice Johnson', 'Bob Smith', 'Frank Miller');

-- Verify the changes
SELECT name, "canWorkAcrossStores", "storeId" FROM "Employee" 
WHERE name IN ('Alice Johnson', 'Bob Smith', 'Frank Miller');

-- Check available stores
SELECT id, name, "managerId" FROM "Store";