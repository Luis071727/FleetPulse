"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, FileText, Truck } from "lucide-react";

import { cn } from "@/lib/cn";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/loads", label: "Loads", icon: Truck },
  { href: "/compliance", label: "Docs", icon: FileText },
];

export default function NavBar({ userEmail }: { userEmail: string | null }) {
  const pathname = usePathname();

  if (pathname.startsWith("/auth")) {
    return null;
  }

  const avatar = userEmail ? userEmail.charAt(0).toUpperCase() : "C";

  return (
    <header className="sticky top-0 z-20 border-b border-brand-border bg-brand-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
        <Link href="/dashboard" className="text-lg font-semibold tracking-tight text-brand-slate">
          FleetPulse
        </Link>
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-slate text-sm font-semibold text-brand-white">
          {avatar}
        </div>
      </div>
      <div className="mx-auto flex max-w-4xl items-center justify-around px-4 pb-3">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex min-w-[88px] flex-col items-center gap-1 rounded-xl px-3 py-2 text-xs font-medium transition-colors",
                active ? "bg-orange-100 text-brand-amber" : "text-brand-slate-light hover:text-brand-slate",
              )}
            >
              <Icon size={18} />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </header>
  );
}

