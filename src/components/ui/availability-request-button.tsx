"use client";

import { useState } from "react";

interface AvailabilityRequestButtonProps {
  storeId: string;
  disabled?: boolean;
  onSuccess?: (message: string) => void;
  onError?: (message: string) => void;
}

interface EmailResult {
  employeeId: string;
  employeeName: string;
  employeeEmail: string;
  status: 'sent' | 'failed';
  error?: string;
}

export function AvailabilityRequestButton({ 
  storeId, 
  disabled = false, 
  onSuccess, 
  onError 
}: AvailabilityRequestButtonProps) {
  const [loading, setLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [results, setResults] = useState<EmailResult[]>([]);

  const handleGenerateLinks = async () => {
    if (!storeId || loading) return;

    setLoading(true);
    try {
      const response = await fetch('/api/availability/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ storeId })
      });

      const data = await response.json();

      if (!response.ok) {
        onError?.(data.error || "Failed to send availability request emails");
        return;
      }

      setResults(data.emailResults || []);
      setShowResults(true);
      onSuccess?.(data.message || `Sent availability requests to ${data.emailResults?.filter((r: any) => r.status === 'sent').length || 0} employees`);

    } catch (error) {
      console.error('Failed to generate availability links:', error);
      onError?.("Failed to generate availability request links");
    } finally {
      setLoading(false);
    }
  };



  if (showResults) {
    return (
      <div 
        className="fixed inset-0 bg-white bg-opacity-90 flex items-center justify-center z-50"
        onClick={() => setShowResults(false)}
      >
        <div 
          className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Availability Requests Sent</h3>
              <p className="text-sm text-gray-600 mt-1">
                Availability request emails have been sent to your Student and Flexi employees.
              </p>
            </div>
            <button
              onClick={() => setShowResults(false)}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              title="Close"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          <div className="p-6 overflow-y-auto max-h-96">
            {results.length === 0 ? (
              <p className="text-gray-500 text-center py-4">No eligible employees found.</p>
            ) : (
              <>
                <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-blue-700 font-medium">
                      📧 {results.filter(r => r.status === 'sent').length} emails sent successfully
                    </span>
                    {results.filter(r => r.status === 'failed').length > 0 && (
                      <span className="text-red-700 font-medium">
                        ❌ {results.filter(r => r.status === 'failed').length} failed
                      </span>
                    )}
                  </div>
                </div>
                <div className="space-y-4">
                {results.map((result) => (
                  <div key={result.employeeId} className={`border rounded-lg p-4 transition-all ${
                    result.status === 'sent' 
                      ? 'border-green-200 bg-green-50 hover:bg-green-100' 
                      : 'border-red-200 bg-red-50 hover:bg-red-100'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <h4 className="font-medium text-gray-900">{result.employeeName}</h4>
                        <p className="text-sm text-gray-600">{result.employeeEmail}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {result.status === 'sent' ? (
                          <div className="flex items-center text-green-700 bg-green-100 px-3 py-1 rounded-full">
                            <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                            <span className="text-sm font-medium">Sent</span>
                          </div>
                        ) : (
                          <div className="flex items-center text-red-700 bg-red-100 px-3 py-1 rounded-full">
                            <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                            <span className="text-sm font-medium">Failed</span>
                          </div>
                        )}
                      </div>
                    </div>
                    {result.status === 'failed' && result.error && (
                      <div className="mt-3 p-3 bg-red-100 border border-red-200 rounded-md">
                        <p className="text-sm text-red-700 font-medium">Error Details:</p>
                        <p className="text-sm text-red-600 mt-1">{result.error}</p>
                      </div>
                    )}
                  </div>
                ))}
                </div>
              </>
            )}
          </div>
          
          <div className="px-6 py-4 border-t border-gray-200 flex justify-end">
            <button
              onClick={() => setShowResults(false)}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={handleGenerateLinks}
      disabled={disabled || loading || !storeId}
      className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition"
      title="Send availability request emails to Student and Flexi employees"
    >
      {loading ? (
        <>
          <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Sending Emails...
        </>
      ) : (
        <>
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 7.89a2 2 0 002.83 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 002 2z" />
          </svg>
          Send Availability Requests
        </>
      )}
    </button>
  );
}