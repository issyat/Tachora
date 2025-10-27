-- Quick fix to make employees available on weekdays
UPDATE "EmployeeAvailability" 
SET "isOff" = false 
WHERE "day" IN ('MON', 'TUE', 'WED', 'THU', 'FRI');

-- Keep weekends as off days
UPDATE "EmployeeAvailability" 
SET "isOff" = true 
WHERE "day" IN ('SAT', 'SUN');