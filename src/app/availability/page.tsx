"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

interface EmployeeInfo {
  id: string;
  name: string;
  contractType: string;
  store: {
    name: string;
    city: string;
  };
}

interface AvailabilityData {
  day: string;
  isOff: boolean;
  startTime: string;
  endTime: string;
}

const DAYS = [
  { key: 'MON', label: 'Monday' },
  { key: 'TUE', label: 'Tuesday' },
  { key: 'WED', label: 'Wednesday' },
  { key: 'THU', label: 'Thursday' },
  { key: 'FRI', label: 'Friday' },
  { key: 'SAT', label: 'Saturday' },
  { key: 'SUN', label: 'Sunday' }
];

export default function AvailabilityPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [employee, setEmployee] = useState<EmployeeInfo | null>(null);
  const [availability, setAvailability] = useState<AvailabilityData[]>([]);

  useEffect(() => {
    if (!token) {
      setError("No token provided in the link");
      setLoading(false);
      return;
    }

    validateToken();
  }, [token]);

  const validateToken = async () => {
    try {
      const response = await fetch(`/api/availability/validate?token=${token}`);
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Invalid link");
        return;
      }

      setEmployee(data.employee);
      
      // Initialize availability with current data or defaults
      const initialAvailability = DAYS.map(day => {
        const existing = data.currentAvailability?.find((a: any) => a.day === day.key);
        return {
          day: day.key,
          isOff: existing?.isOff ?? false,
          startTime: existing?.startTime ?? "09:00",
          endTime: existing?.endTime ?? "17:00"
        };
      });
      
      setAvailability(initialAvailability);
    } catch (err) {
      setError("Failed to load availability form");
    } finally {
      setLoading(false);
    }
  };

  const updateAvailability = (dayKey: string, field: string, value: any) => {
    setAvailability(prev => prev.map(avail => 
      avail.day === dayKey 
        ? { ...avail, [field]: value }
        : avail
    ));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/availability/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          token,
          availability
        })
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to submit availability");
        return;
      }

      setSuccess(true);
    } catch (err) {
      setError("Failed to submit availability");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-6">
          <div className="text-center">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100">
              <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h3 className="mt-2 text-lg font-medium text-gray-900">Link Error</h3>
            <p className="mt-1 text-sm text-gray-500">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-6">
          <div className="text-center">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100">
              <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="mt-2 text-lg font-medium text-gray-900">Availability Updated!</h3>
            <p className="mt-1 text-sm text-gray-500">
              Thank you {employee?.name}! Your availability has been saved successfully.
            </p>
            <p className="mt-2 text-xs text-gray-400">
              You can close this page now.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-2xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow-md">
          <div className="px-6 py-4 border-b border-gray-200">
            <h1 className="text-xl font-semibold text-gray-900">Update Your Availability</h1>
            <p className="mt-1 text-sm text-gray-600">
              Hi {employee?.name}! Please update your weekly availability for {employee?.store.name} in {employee?.store.city}.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="p-6">
            <div className="space-y-6">
              {DAYS.map(day => {
                const dayAvail = availability.find(a => a.day === day.key);
                if (!dayAvail) return null;

                return (
                  <div key={day.key} className="flex items-center space-x-4">
                    <div className="w-20 text-sm font-medium text-gray-700">
                      {day.label}
                    </div>
                    
                    <div className="flex items-center space-x-3">
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={dayAvail.isOff}
                          onChange={(e) => updateAvailability(day.key, 'isOff', e.target.checked)}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <span className="ml-2 text-sm text-gray-600">Not available</span>
                      </label>
                    </div>

                    {!dayAvail.isOff && (
                      <div className="flex items-center space-x-2">
                        <input
                          type="time"
                          value={dayAvail.startTime}
                          onChange={(e) => updateAvailability(day.key, 'startTime', e.target.value)}
                          className="block w-24 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                          required
                        />
                        <span className="text-gray-500">to</span>
                        <input
                          type="time"
                          value={dayAvail.endTime}
                          onChange={(e) => updateAvailability(day.key, 'endTime', e.target.value)}
                          className="block w-24 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                          required
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {error && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            <div className="mt-6 flex justify-end">
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? 'Saving...' : 'Save Availability'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}