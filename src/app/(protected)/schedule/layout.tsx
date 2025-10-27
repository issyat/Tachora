"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignOutButton, useUser } from "@clerk/nextjs";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { AccountModal } from "@/components/ui/account-modal";

export default function ScheduleLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useUser();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const nav = [
    { href: "/schedule", label: "Schedule" },
    { href: "/schedule/employees", label: "Employees" },
    { href: "/schedule/work-types", label: "Work Types" },
    { href: "/schedule/shifts", label: "Shifts" },
    { href: "/schedule/store", label: "Store" },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-white/80 backdrop-blur-sm">
        <div className="w-full">
          <div className="mx-auto max-w-[1800px] flex items-center justify-between px-4 lg:px-6 py-4">
            <div className="flex items-center gap-6">
              <h2 className="text-lg font-semibold">Tachora</h2>
              <nav className="flex gap-2">
                {nav.map((n) => {
                  const active = pathname === n.href || pathname?.startsWith(n.href + "/") || pathname === n.href + "/";
                  return (
                    <Link
                      key={n.href}
                      href={n.href}
                      className={`rounded-md px-3 py-2 text-sm ${
                        active ? "bg-slate-100 font-medium" : "text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      {n.label}
                    </Link>
                  );
                })}
              </nav>
            </div>
            
            <div className="flex items-center relative">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsProfileOpen(!isProfileOpen)}
                  className="flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-400 hover:text-slate-800 hover:bg-slate-50"
                >
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-600 text-xs font-semibold text-white">
                    {user?.firstName?.charAt(0) || user?.emailAddresses?.[0]?.emailAddress?.charAt(0) || "U"}
                  </div>
                  <span className="hidden sm:inline">
                    {user?.firstName || user?.emailAddresses?.[0]?.emailAddress?.split('@')[0] || "User"}
                  </span>
                  <svg className={`h-4 w-4 transition-transform ${isProfileOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>


              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="w-full mx-auto max-w-[1800px] px-4 lg:px-6">{children}</main>

      {/* Account Management Modal */}
      <AccountModal 
        open={isAccountModalOpen} 
        onClose={() => setIsAccountModalOpen(false)} 
      />

      {/* Portal for dropdown - renders outside normal DOM hierarchy */}
      {mounted && isProfileOpen && createPortal(
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-[99998] bg-black/10" 
            onClick={() => setIsProfileOpen(false)}
          />
          
          {/* Dropdown */}
          <div 
            className="fixed right-4 top-16 z-[99999] w-64 rounded-lg border border-slate-200 bg-white py-1 shadow-xl"
            style={{ zIndex: 2147483647 }} // Maximum z-index value
          >
            <div className="px-4 py-3 border-b border-slate-100">
              <div className="text-sm font-medium text-slate-900">
                {user?.fullName || user?.firstName || "User"}
              </div>
              <div className="text-xs text-slate-500">
                {user?.emailAddresses?.[0]?.emailAddress}
              </div>
            </div>
            
            <div className="py-1">
              <button
                type="button"
                onClick={() => {
                  setIsProfileOpen(false);
                  setIsAccountModalOpen(true);
                }}
                className="flex w-full items-center px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                <svg className="mr-3 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                Manage Account
              </button>
              

              <div className="border-t border-slate-100 mt-1 pt-1">
                <SignOutButton redirectUrl="/">
                  <button
                    type="button"
                    className="flex w-full items-center px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <svg className="mr-3 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    Log Out
                  </button>
                </SignOutButton>
              </div>
            </div>
          </div>
        </>,
        document.body
      )}
      

    </div>
  );
}
