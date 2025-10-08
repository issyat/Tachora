"use client";

import { useState } from "react";
import { getIsoWeekId } from "@/lib/week";

interface AIGenerateButtonProps {
  storeId?: string;
  onSuccess?: (result: any) => void;
  onError?: (error: string) => void;
  disabled?: boolean;
  className?: string;
}

export function AIGenerateButton({ 
  storeId, 
  onSuccess, 
  onError, 
  disabled = false,
  className = "" 
}: AIGenerateButtonProps) {
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = async () => {
    if (!storeId) {
      onError?.("Please select a store first");
      return;
    }

    setIsGenerating(true);

    try {
      const response = await fetch("/api/schedule/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          storeId,
          weekId: getIsoWeekId(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to generate schedule");
      }

      onSuccess?.(data);
    } catch (error) {
      console.error("Schedule generation failed:", error);
      onError?.(error instanceof Error ? error.message : "Failed to generate schedule");
    } finally {
      setIsGenerating(false);
    }
  };

  const getCurrentWeekId = () => {
    const now = new Date();
    const year = now.getFullYear();
    const week = getWeekNumber(now);
    return `${year}-W${week.toString().padStart(2, '0')}`;
  };

  const getWeekNumber = (date: Date): number => {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  };

  return (
    <button
      onClick={handleGenerate}
      disabled={disabled || isGenerating || !storeId}
      className={`
        relative inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold
        transition-all duration-200 ease-in-out
        ${isGenerating 
          ? 'bg-gradient-to-r from-purple-500 to-blue-500 text-white cursor-wait' 
          : 'bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white shadow-lg hover:shadow-xl'
        }
        ${disabled || !storeId 
          ? 'opacity-50 cursor-not-allowed' 
          : 'hover:scale-105 active:scale-95'
        }
        ${className}
      `}
    >
      {/* AI Icon */}
      <div className={`transition-transform duration-300 ${isGenerating ? 'animate-spin' : ''}`}>
        {isGenerating ? (
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none">
            <circle 
              cx="12" 
              cy="12" 
              r="10" 
              stroke="currentColor" 
              strokeWidth="2" 
              strokeLinecap="round" 
              strokeDasharray="32" 
              strokeDashoffset="32"
            >
              <animate 
                attributeName="stroke-dasharray" 
                dur="2s" 
                values="0 32;16 16;0 32;0 32" 
                repeatCount="indefinite"
              />
              <animate 
                attributeName="stroke-dashoffset" 
                dur="2s" 
                values="0;-16;-32;-32" 
                repeatCount="indefinite"
              />
            </circle>
          </svg>
        ) : (
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2L2 7l10 5 10-5-10-5z"/>
            <path d="M2 17l10 5 10-5"/>
            <path d="M2 12l10 5 10-5"/>
          </svg>
        )}
      </div>

      {/* Button Text */}
      <span className="relative">
        {isGenerating ? (
          <>
            <span className="opacity-0">AI Generate</span>
            <span className="absolute inset-0 flex items-center justify-center">
              Generating...
            </span>
          </>
        ) : (
          'AI Generate'
        )}
      </span>

      {/* Shimmer Effect */}
      {!isGenerating && !disabled && storeId && (
        <div className="absolute inset-0 -top-px overflow-hidden rounded-lg">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -skew-x-12 -translate-x-full group-hover:animate-shimmer" />
        </div>
      )}

      {/* CP-SAT Badge */}
      <div className="absolute -top-1 -right-1 rounded-full bg-green-500 px-1.5 py-0.5 text-[10px] font-bold text-white shadow-sm">
        CP-SAT
      </div>
    </button>
  );
}

