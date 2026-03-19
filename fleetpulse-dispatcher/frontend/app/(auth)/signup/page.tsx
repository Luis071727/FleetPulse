"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { signup, setToken, setUser } from "../../../services/api";

export default function SignupPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [orgName, setOrgName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await signup(email, password, orgName);
      if (res.error) {
        setError(res.error);
        return;
      }
      const data = res.data as Record<string, unknown>;
      const session = data?.session as Record<string, string> | undefined;
      if (session?.access_token) setToken(session.access_token);
      setUser((data?.user ?? data) as Record<string, unknown>);
      router.push("/dashboard");
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
            Take control of your dispatch operations from day one.
          </p>
          <ul style={{ listStyle: "none", padding: 0, margin: "24px 0 0" }}>
            <Feature text="Carrier roster with FMCSA verification" />
            <Feature text="Load tracking with real-time profitability" />
            <Feature text="Invoice management & follow-up automation" />
            <Feature text="AI-powered rate analysis" />
          </ul>
        </div>
        <p style={{ fontSize: 11, color: "var(--mist)", marginTop: "auto" }}>
          &copy; {new Date().getFullYear()} FleetPulse. All rights reserved.
        </p>
      </div>

      {/* Right — signup form */}
      <div className="fp-auth-form-panel" style={formPanel}>
        <form onSubmit={handleSubmit} className="fp-auth-form" style={formCard}>
          <h2 style={{ fontSize: 22, margin: "0 0 4px", fontWeight: 600 }}>Create your account</h2>
          <p style={{ fontSize: 13, color: "var(--mist)", margin: "0 0 24px" }}>Start managing your fleet in minutes</p>

          <label style={labelStyle}>Company Name</label>
          <input
            placeholder="Your Trucking Co."
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            required
            style={inputStyle}
          />

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
            placeholder="Min. 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            style={inputStyle}
          />

          {error && <p style={{ color: "var(--red)", margin: "4px 0 0", fontSize: 13 }}>{error}</p>}

          <button type="submit" disabled={loading} style={btnPrimary}>
            {loading ? "Creating account…" : "Get Started"}
          </button>

          <p style={{ fontSize: 13, color: "var(--mist)", textAlign: "center", marginTop: 16 }}>
            Already have an account?{" "}
            <a href="/login" style={{ color: "var(--blue)", textDecoration: "none", fontWeight: 500 }}>Sign in</a>
          </p>
        </form>
      </div>
    </div>
  );
}

function Feature({ text }: { text: string }) {
  return (
    <li style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, fontSize: 13, color: "var(--white)" }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--amber)", flexShrink: 0 }} />
      {text}
    </li>
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
