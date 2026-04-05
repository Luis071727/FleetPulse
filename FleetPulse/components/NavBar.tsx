"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, FileText, Truck, Zap, Receipt } from "lucide-react";

import { cn } from "@/lib/cn";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/loads", label: "Loads", icon: Truck },
  { href: "/invoices", label: "Invoices", icon: Receipt },
  { href: "/compliance", label: "Docs", icon: FileText },
];

export default function NavBar({ userEmail }: { userEmail: string | null }) {
  const pathname = usePathname();

  if (pathname.startsWith("/auth")) {
    return null;
  }

  const avatar = userEmail ? userEmail.charAt(0).toUpperCase() : "C";

  return (
    <header className="sticky top-0 z-20 border-b border-brand-border bg-brand-surface/95 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
        <div>
          <Link href="/dashboard" className="flex items-center gap-2 text-lg font-semibold tracking-tight text-brand-amber">
            <Zap size={18} />
            <span>FleetPulse</span>
          </Link>
          <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.2em] text-brand-slate-light">
            Carrier Portal
          </p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-full border border-brand-border bg-brand-amber-light text-sm font-semibold text-brand-slate">
          {avatar}
        </div>
      </div>
      <div className="mx-auto flex max-w-5xl items-center gap-2 overflow-x-auto px-4 pb-4 sm:px-6">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "inline-flex min-w-[96px] items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors",
                active
                  ? "border-brand-amber bg-brand-amber-light text-brand-amber"
                  : "border-brand-border bg-transparent text-brand-slate-light hover:border-brand-slate-light hover:text-brand-slate",
              )}
            >
              <Icon size={16} />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </header>
  );
}

