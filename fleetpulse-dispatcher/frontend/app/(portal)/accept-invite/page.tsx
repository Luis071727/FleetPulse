"use client";

import { useState } from "react";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { acceptInvite, setToken, setUser } from "../../../services/api";

export const dynamic = "force-dynamic";

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={<main style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: "#94a3b8" }}>Loading invite...</main>}>
      <AcceptInviteContent />
    </Suspense>
  );
}

function AcceptInviteContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tokenParam = searchParams.get("token") || "";
  const [token, setTokenVal] = useState(tokenParam);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await acceptInvite(token, password);
      if (res.error) {
        setError(res.error);
        return;
      }
      const data = res.data as Record<string, unknown>;
      if (data?.token) setToken(data.token as string);
      setUser(data);
      router.push("/overview");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
      <form onSubmit={handleSubmit} style={{ width: 420, display: "flex", flexDirection: "column", gap: 12 }}>
        <h1 style={{ fontSize: 24, marginBottom: 8 }}>Accept Portal Invite</h1>
        <p style={{ fontSize: 14, color: "#94a3b8", margin: 0 }}>
          Enter your invite token and set a password to access your carrier portal.
        </p>
        <label htmlFor="invite-token" style={{ fontSize: 13, color: "#94a3b8" }}>Invite Token</label>
        <input
          id="invite-token"
          value={token}
          onChange={(e) => setTokenVal(e.target.value)}
          required
          style={inputStyle}
        />
        <label htmlFor="new-password" style={{ fontSize: 13, color: "#94a3b8" }}>Set Password</label>
        <input
          id="new-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          style={inputStyle}
        />
        {error && <p style={{ color: "#ef4444", margin: 0, fontSize: 13 }}>{error}</p>}
        <button type="submit" disabled={loading} style={btnStyle}>
          {loading ? "Activating..." : "Activate Portal Access"}
        </button>
      </form>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "10px 12px", borderRadius: 6, border: "1px solid #334155",
  background: "#0f172a", color: "#f8fafc", fontSize: 14,
};
const btnStyle: React.CSSProperties = {
  padding: "10px 16px", borderRadius: 6, border: "none", background: "#3b82f6",
  color: "#fff", fontSize: 14, cursor: "pointer",
};
