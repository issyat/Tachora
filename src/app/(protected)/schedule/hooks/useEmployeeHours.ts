import { useCallback, useEffect, useMemo, useState } from "react";

import { timeToMinutes } from "../utils/time";
import type { Assignment } from "../types";

interface UseEmployeeHoursOptions {
  storeId?: string | null;
  weekId?: string | null;
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
  const { storeId, weekId } = options;
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

  // Only fetch server hours once on mount, then rely on local calculations
  useEffect(() => {
    let mounted = true;
    fetchServerHours().then(() => {
      if (mounted) {
        // After initial fetch, we rely purely on local calculations for speed
        setLoading(false);
      }
    });
    return () => { mounted = false; };
  }, [storeId]); // Only depend on storeId, not weekId for better performance

  // Use local hours for instant updates, with server hours as fallback for employees without current assignments
  const mergedHours = useMemo(() => {
    const merged = { ...serverHours };
    
    // Override with local hours for instant updates
    Object.entries(localHours).forEach(([employeeId, minutes]) => {
      merged[employeeId] = minutes;
    });
    
    return merged;
  }, [serverHours, localHours]);

  return {
    hours: mergedHours,
    loading,
    refresh: fetchServerHours,
  };
}
