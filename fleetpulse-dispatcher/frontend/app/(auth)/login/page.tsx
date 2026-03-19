"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { login, setToken, setUser } from "../../../services/api";

export default function LoginPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await login(email, password);
      if (res.error) {
        setError(res.error);
        return;
      }
      const data = res.data as Record<string, unknown>;
      const session = data?.session as Record<string, string> | undefined;
      if (session?.access_token) setToken(session.access_token);
      const user = (data?.user ?? data) as Record<string, unknown>;
      setUser(user);
      const role = user?.role as string;
      router.push(role?.startsWith("carrier") ? "/overview" : "/dashboard");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (!mounted) return null;

  return (
    <div className="fp-auth-page" style={pageStyle}>
      {/* Left — branding panel */}
      <div className="fp-auth-brand" style={brandPanel}>
        <div>
          <h1 style={{ fontSize: 32, fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>
            <span style={{ color: "var(--amber)" }}>Fleet</span>Pulse
          </h1>
          <p style={{ fontSize: 14, color: "var(--mist)", marginTop: 8 }}>
            Dispatcher Command Center
          </p>
        </div>
        <div style={{ marginTop: 48 }}>
          <p className="fp-serif" style={{ fontSize: 22, color: "var(--white)", lineHeight: 1.4, margin: 0 }}>
            Real-time visibility into your fleet, loads &amp; invoices.
          </p>
          <div style={{ display: "flex", gap: 20, marginTop: 24 }}>
            <Stat label="Carriers" value="500+" />
            <Stat label="Loads tracked" value="12K+" />
            <Stat label="Uptime" value="99.9%" />
          </div>
        </div>
        <p style={{ fontSize: 11, color: "var(--mist)", marginTop: "auto" }}>
          &copy; {new Date().getFullYear()} FleetPulse. All rights reserved.
        </p>
      </div>

      {/* Right — login form */}
      <div className="fp-auth-form-panel" style={formPanel}>
        <form onSubmit={handleSubmit} className="fp-auth-form" style={formCard}>
          <h2 style={{ fontSize: 22, margin: "0 0 4px", fontWeight: 600 }}>Welcome back</h2>
          <p style={{ fontSize: 13, color: "var(--mist)", margin: "0 0 24px" }}>Sign in to your dispatcher account</p>

          <label style={labelStyle}>Email</label>
          <input
            type="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={inputStyle}
          />

          <label style={labelStyle}>Password</label>
          <input
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={inputStyle}
          />

          {error && <p style={{ color: "var(--red)", margin: "4px 0 0", fontSize: 13 }}>{error}</p>}

          <button type="submit" disabled={loading} style={btnPrimary}>
            {loading ? "Signing in…" : "Sign In"}
          </button>

          <p style={{ fontSize: 13, color: "var(--mist)", textAlign: "center", marginTop: 16 }}>
            Don&apos;t have an account?{" "}
            <a href="/signup" style={{ color: "var(--blue)", textDecoration: "none", fontWeight: 500 }}>Create one</a>
          </p>
        </form>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="fp-mono" style={{ fontSize: 20, fontWeight: 700, color: "var(--amber)", margin: 0 }}>{value}</p>
      <p style={{ fontSize: 11, color: "var(--mist)", margin: 0 }}>{label}</p>
    </div>
  );
}

const pageStyle: React.CSSProperties = {
  display: "flex", minHeight: "100vh",
};
const brandPanel: React.CSSProperties = {
  flex: "0 0 420px", background: "var(--surface)", borderRight: "1px solid var(--border)",
  padding: "48px 40px", display: "flex", flexDirection: "column",
};
const formPanel: React.CSSProperties = {
  flex: 1, display: "flex", justifyContent: "center", alignItems: "center",
  background: "var(--bg)",
};
const formCard: React.CSSProperties = {
  width: 380, display: "flex", flexDirection: "column",
};
const labelStyle: React.CSSProperties = {
  fontSize: 12, color: "var(--mist)", marginBottom: 4, fontWeight: 500,
};
const inputStyle: React.CSSProperties = {
  padding: "10px 14px", borderRadius: 8, border: "1px solid var(--border)",
  background: "var(--surface)", color: "var(--white)", fontSize: 14,
  marginBottom: 14, outline: "none",
};
const btnPrimary: React.CSSProperties = {
  padding: "12px 16px", borderRadius: 8, border: "none",
  background: "var(--amber)", color: "#000", fontSize: 15,
  cursor: "pointer", fontWeight: 600, marginTop: 8,
};
