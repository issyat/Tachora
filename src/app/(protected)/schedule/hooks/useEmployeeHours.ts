import { useCallback, useEffect, useMemo, useState } from "react";

import { timeToMinutes } from "../utils/time";
import type { Assignment } from "../types";

interface UseEmployeeHoursOptions {
  storeId?: string | null;
  weekId?: string | null;
  employees?: Array<{ id: string }>;
}

export type EmployeeMinutesMap = Record<string, number>;

function calculateLocalHours(assignments: Assignment[]): EmployeeMinutesMap {
  const hours: EmployeeMinutesMap = {};
  
  assignments.forEach((assignment) => {
    if (!assignment.employee?.id) return;
    
    const startMinutes = timeToMinutes(assignment.startTime);
    const endMinutes = timeToMinutes(assignment.endTime);
    const shiftMinutes = endMinutes - startMinutes;
    
    if (shiftMinutes > 0) {
      hours[assignment.employee.id] = (hours[assignment.employee.id] || 0) + shiftMinutes;
    }
  });
  
  return hours;
}

export function useEmployeeHours(assignments: Assignment[], options: UseEmployeeHoursOptions = {}) {
  const { storeId, weekId, employees } = options;
  const [serverHours, setServerHours] = useState<EmployeeMinutesMap>({});
  const [loading, setLoading] = useState(false);

  // Calculate hours locally from current assignments for instant updates
  const localHours = useMemo(() => calculateLocalHours(assignments), [assignments]);

  const fetchServerHours = useCallback(async () => {
    if (!storeId) {
      setServerHours({});
      return;
    }

    setLoading(true);
    try {
      const url = new URL('/api/schedule/employee-hours', window.location.origin);
      if (weekId) {
        url.searchParams.set('weekId', weekId);
      }
      
      const response = await fetch(url.toString(), { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Failed with ${response.status}`);
      }
      const data = await response.json();
      setServerHours(data.employeeHours ?? {});
    } catch (error) {
      console.error('Failed to fetch employee hours', error);
      setServerHours({});
    } finally {
      setLoading(false);
    }
  }, [storeId, weekId]);

  // Fetch server hours when store or week changes
  useEffect(() => {
    let mounted = true;
    fetchServerHours().then(() => {
      if (mounted) {
        setLoading(false);
      }
    });
    return () => { mounted = false; };
  }, [fetchServerHours]); // Depend on fetchServerHours which includes storeId and weekId

  // Merge server hours (cross-store totals) with local hours (instant feedback)
  const mergedHours = useMemo(() => {
    // Start with server hours which include ALL stores
    const merged = { ...serverHours };
    
    // Get all employees that should be tracked
    const allEmployeeIds = new Set<string>();
    
    // Add employees from assignments
    assignments.forEach(assignment => {
      if (assignment.employee?.id) {
        allEmployeeIds.add(assignment.employee.id);
      }
    });
    
    // Add employees from the employees list (if provided)
    if (employees) {
      employees.forEach(employee => {
        allEmployeeIds.add(employee.id);
      });
    }
    
    // Update with local hours for instant UI feedback
    allEmployeeIds.forEach(employeeId => {
      const localMinutes = localHours[employeeId] || 0;
      // Always use local calculation for tracked employees
      // This ensures immediate feedback when assignments are added/removed
      merged[employeeId] = localMinutes;
    });
    
    return merged;
  }, [serverHours, localHours, assignments, employees]);

  return {
    hours: mergedHours,
    loading,
    refresh: fetchServerHours,
  };
}
