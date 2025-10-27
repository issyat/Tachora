"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";

export default function Home() {
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (isLoaded) {
      if (isSignedIn) {
        // User is signed in, check their onboarding status
        setChecking(true);
        checkOnboardingStatus();
      } else {
        // User is not signed in, redirect to sign-in
        router.push("/sign-in");
      }
    }
  }, [isLoaded, isSignedIn, router]);

  const checkOnboardingStatus = async () => {
    try {
      const response = await fetch('/api/setup', { cache: 'no-store' });
      const data = await response.json();
      
      if (data.onboardingStep === 'DONE') {
        // User has completed setup, go to schedule
        router.push("/schedule");
      } else {
        // User needs to complete setup wizard
        router.push("/setup");
      }
    } catch (error) {
      console.error('Failed to check onboarding status:', error);
      // Fallback to setup if there's an error
      router.push("/setup");
    }
  };

  // Show a nice loading page while determining auth status (matching sign-in page style)
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-lg shadow-lg p-8 text-center">
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-slate-900 mb-2">Tachora</h1>
            <p className="text-slate-600">Employee Scheduling Made Simple</p>
          </div>
          
          <div className="mb-6">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900 mx-auto"></div>
          </div>
          
          <p className="text-sm text-slate-500">
            {!isLoaded ? "Loading..." : 
             !isSignedIn ? "Redirecting to sign in..." :
             checking ? "Checking your setup..." : 
             "Redirecting..."}
          </p>
        </div>
        
        <div className="mt-8 text-center">
          <p className="text-sm text-slate-600">
            ✨ Smart availability management for retail teams
          </p>
        </div>
      </div>
    </div>
  );
}
