"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function ScheduleLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

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
          <div className="mx-auto max-w-[1800px] flex items-center gap-6 px-4 lg:px-6 py-4">
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
        </div>
      </header>

  <main className="w-full mx-auto max-w-[1800px] px-4 lg:px-6">{children}</main>
    </div>
  );
}
