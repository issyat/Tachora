"use client";

import Link from "next/link";
import Image from "next/image";
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
    <div className="min-h-screen bg-[#F2F2F2]">
      <header className="border-b border-white/70 bg-white shadow-sm">
        <div className="mx-auto flex max-w-[1800px] items-center px-4 py-5 lg:px-8">
          <div className="flex flex-1 items-center">
            <div className="relative h-12 w-12 overflow-hidden rounded-full bg-white shadow-sm">
              <Image src="/logo_rounded.png" alt="AnswerPack logo" fill sizes="48px" className="object-contain" />
            </div>
            <span className="sr-only">AnswerPack</span>
          </div>

          <nav className="hidden items-center gap-2 rounded-full bg-white px-3 py-2 shadow-sm sm:flex">
            {nav.map((n) => {
              const isBaseSchedule = n.href === "/schedule";
              const normalizedPath = pathname && pathname.length > 1 && pathname.endsWith("/")
                ? pathname.slice(0, -1)
                : pathname;
              const active = isBaseSchedule
                ? normalizedPath === "/schedule"
                : normalizedPath === n.href || normalizedPath?.startsWith(`${n.href}/`);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition ${
                    active
                      ? "bg-gradient-to-r from-[#04ADBF] to-[#F2A30F] text-white shadow"
                      : "text-slate-600 hover:bg-[#E1F2BD]/60 hover:text-slate-900"
                  }`}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex flex-1 items-center justify-end gap-4">
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsProfileOpen(!isProfileOpen)}
                className="flex items-center gap-3 rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-[#E1F2BD]/60"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[#04ADBF] via-[#F2A30F] to-[#E1F2BD] text-sm font-semibold text-white">
                  {user?.firstName?.charAt(0) || user?.emailAddresses?.[0]?.emailAddress?.charAt(0) || "U"}
                </div>
                <span className="hidden sm:inline">
                  {user?.firstName || user?.emailAddresses?.[0]?.emailAddress?.split('@')[0] || "User"}
                </span>
                <svg className={`h-4 w-4 text-[#04ADBF] transition-transform ${isProfileOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="w-full mx-auto max-w-[1800px] overflow-x-hidden px-4 pb-10 pt-6 lg:px-8">{children}</main>

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
            className="fixed right-4 top-16 z-[99999] w-64 rounded-2xl border border-white/60 bg-white/95 py-1 shadow-2xl backdrop-blur"
            style={{ zIndex: 2147483647 }} // Maximum z-index value
          >
            <div className="px-4 py-3 border-b border-[#E1F2BD]/60 bg-gradient-to-r from-white/80 to-[#E1F2BD]/30">
              <div className="text-sm font-semibold text-slate-900">
                {user?.fullName || user?.firstName || "User"}
              </div>
              <div className="text-xs text-slate-600">
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
                className="flex w-full items-center px-4 py-2 text-sm text-slate-700 transition hover:bg-[#E1F2BD]/40"
              >
                <svg className="mr-3 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                Manage Account
              </button>
              

              <div className="border-t border-[#E1F2BD]/50 mt-1 pt-1">
                <SignOutButton redirectUrl="/">
                  <button
                    type="button"
                    className="flex w-full items-center px-4 py-2 text-sm text-slate-700 transition hover:bg-[#FF8057]/10"
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
