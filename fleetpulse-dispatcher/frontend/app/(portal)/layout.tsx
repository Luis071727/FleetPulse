"use client";

import { usePathname, useRouter } from "next/navigation";
import { clearAuth, getUser } from "../../services/api";
import { Lock } from "../../components/icons";

const PORTAL_NAV = [
  { label: "Overview", href: "/overview" },
  { label: "My Loads", href: "/overview/loads" },
  { label: "Invoices", href: "/overview/invoices" },
  { label: "Insurance Score", href: "/overview/insurance" },
];

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const user = getUser();

  const handleLogout = () => {
    clearAuth();
    router.push("/login");
  };

  return (
    <div style={{ minHeight: "100vh", background: "#080c10" }}>
      {/* Free-tier banner */}
      <div style={{ background: "#1c1508", borderBottom: "1px solid #f59e0b44", padding: "10px 16px",
        display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 13, color: "#f59e0b", display: "flex", alignItems: "center", gap: 6 }}>
          <Lock size={14} /> Free tier — Read-only access. Upgrade to Pro for settlement automation and real-time alerts.
        </span>
      </div>

      {/* Header */}
      <header style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#110f0a" }}>
        <h1 className="fp-serif" style={{ fontSize: 20, margin: 0, color: "var(--amber)", fontWeight: 400, letterSpacing: "0.01em" }}>FleetPulse Carrier Portal</h1>
        <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {user?.email && <span style={{ fontSize: 12, color: "#94a3b8" }}>{user.email as string}</span>}
          <button type="button" onClick={handleLogout} style={logoutBtn}>Log out</button>
        </span>
      </header>

      {/* Tab nav — responsive */}
      <nav style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--border)", overflowX: "auto", padding: "0 16px", background: "#0f0d09" }}>
        {PORTAL_NAV.map((item) => {
          const active = pathname === item.href;
          return (
            <a key={item.href} href={item.href} style={{
              padding: "12px 16px", fontSize: 13, textDecoration: "none", whiteSpace: "nowrap",
              color: active ? "var(--amber)" : "#a8a29e",
              borderBottom: active ? "2px solid var(--amber)" : "2px solid transparent",
            }}>
              {item.label}
            </a>
          );
        })}
      </nav>

      {/* Content */}
      <main style={{ padding: 16, maxWidth: 900, margin: "0 auto" }}>
        {children}
      </main>
    </div>
  );
}

const logoutBtn: React.CSSProperties = {
  background: "none", border: "1px solid #334155", color: "#94a3b8",
  padding: "4px 10px", borderRadius: 4, fontSize: 12, cursor: "pointer",
};
