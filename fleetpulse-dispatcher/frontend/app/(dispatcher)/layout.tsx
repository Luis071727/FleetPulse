"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { clearAuth, getUser } from "../../services/api";
import { BarChart3, Truck, Package, DollarSign, Shield, Fuel, Zap, Menu } from "../../components/icons";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/dashboard", icon: <BarChart3 size={16} /> },
  { label: "Carriers", href: "/carriers", icon: <Truck size={16} /> },
  { label: "Loads", href: "/loads", icon: <Package size={16} /> },
  { label: "Invoices", href: "/invoices", icon: <DollarSign size={16} /> },
  { label: "Insurance IQ", href: "/insurance", icon: <Shield size={16} /> },
  { label: "IFTA", href: "/ifta", icon: <Fuel size={16} /> },
];

export default function DispatcherLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUserState] = useState<Record<string, unknown> | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => { setUserState(getUser()); }, []);

  const handleLogout = () => {
    clearAuth();
    router.push("/login");
  };

  const sidebarContent = (
    <>
      <div style={{ padding: "20px 16px 12px", borderBottom: "1px solid var(--border)" }}>
        <h1 style={{ fontSize: 18, margin: 0, color: "var(--amber)", fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace", display: "flex", alignItems: "center", gap: 6 }}><Zap size={18} /> FleetPulse</h1>
        <p style={{ fontSize: 11, color: "var(--mist)", margin: "4px 0 0" }}>Dispatcher Command Center</p>
      </div>
      <nav style={{ padding: "12px 8px", flex: 1 }}>
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
          return (
            <a
              key={item.href}
              href={item.href}
              onClick={() => setSidebarOpen(false)}
              style={{
                ...navLinkStyle,
                background: active ? "rgba(245,158,11,0.1)" : "transparent",
                color: active ? "var(--amber)" : "var(--mist)",
                borderLeft: active ? "3px solid var(--amber)" : "3px solid transparent",
              }}
            >
              <span style={{ fontSize: 16, display: "flex", alignItems: "center" }}>{item.icon}</span>
              <span>{item.label}</span>
            </a>
          );
        })}
      </nav>
      <div style={{ padding: "12px 16px", borderTop: "1px solid var(--border)" }}>
        <p style={{ fontSize: 12, color: "var(--mist)", margin: 0, fontFamily: "'IBM Plex Mono', monospace" }}>
          {(user?.email as string) || "dispatcher"}
        </p>
        <button type="button" onClick={handleLogout} style={logoutBtnStyle}>
          Sign Out
        </button>
      </div>
    </>
  );

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--bg)" }}>
      {/* Hamburger button — visible < 720px via CSS class */}
      <button
        type="button"
        className="fp-hamburger"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        style={{ position: "fixed", top: 12, right: 12, zIndex: 210, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", color: "var(--white)", fontSize: 18, cursor: "pointer", lineHeight: 1 }}
      >
        <Menu size={18} />
      </button>

      {/* Sidebar backdrop for mobile */}
      <div
        className={sidebarOpen ? "fp-sidebar-backdrop--open" : "fp-sidebar-backdrop"}
        onClick={() => setSidebarOpen(false)}
      />

      {/* Sidebar */}
      <aside className={`fp-sidebar${sidebarOpen ? " fp-sidebar--open" : ""}`} style={sidebarStyle}>
        {sidebarContent}
      </aside>

      {/* Main content */}
      <main style={{ flex: 1, overflowY: "auto", minWidth: 0 }}>
        {children}
      </main>
    </div>
  );
}

const sidebarStyle: React.CSSProperties = {
  width: 220,
  background: "var(--surface)",
  borderRight: "1px solid var(--border)",
  display: "flex",
  flexDirection: "column",
  flexShrink: 0,
};

const navLinkStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "10px 14px",
  borderRadius: 6,
  fontSize: 14,
  textDecoration: "none",
  marginBottom: 2,
  transition: "background 0.15s, color 0.15s",
};

const logoutBtnStyle: React.CSSProperties = {
  marginTop: 8,
  padding: "4px 0",
  background: "none",
  border: "none",
  color: "var(--red)",
  fontSize: 12,
  cursor: "pointer",
};
