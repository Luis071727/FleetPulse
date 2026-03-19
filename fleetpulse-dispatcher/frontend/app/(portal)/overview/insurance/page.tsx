"use client";

import { getUser } from "../../../../services/api";

export default function PortalInsurancePage() {
  const user = getUser();
  const carrierName = (user?.full_name as string) || (user?.email as string) || "Your Carrier";

  return (
    <section>
      <h2 className="fp-serif" style={{ fontSize: 28, marginBottom: 6, fontWeight: 400, color: "var(--amber)" }}>Insurance Score</h2>
      <p style={{ fontSize: 13, color: "#64748b", marginBottom: 20 }}>
        Your Insurance Readiness Score (IRS) and compliance status.
      </p>

      {/* Placeholder for Phase 2 */}
      <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 10, padding: 24, textAlign: "center" }}>
        <div
          className="irs-ring"
          style={{ margin: "0 auto 16px", ["--irs-pct" as string]: 0 } as React.CSSProperties & Record<string, string | number>}
        >
          <div className="irs-ring__inner">
            <span className="fp-mono" style={{ fontSize: 28, fontWeight: 700, color: "#475569" }}>—</span>
          </div>
        </div>
        <p style={{ fontSize: 16, fontWeight: 600, margin: "0 0 4px" }}>{carrierName}</p>
        <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 20px" }}>IRS score will be available in Phase 2</p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, maxWidth: 400, margin: "0 auto" }}>
          <SubScore label="Safety" value={null} />
          <SubScore label="Compliance" value={null} />
          <SubScore label="Financial" value={null} />
          <SubScore label="Claims" value={null} />
        </div>
      </div>

      {/* Upgrade teaser */}
      <div style={{ marginTop: 20, padding: 16, background: "#1e293b", borderRadius: 8, border: "1px solid #334155" }}>
        <h3 style={{ fontSize: 14, margin: "0 0 6px", color: "#f59e0b" }}>Upgrade to Pro</h3>
        <p style={{ fontSize: 13, color: "#94a3b8", margin: 0 }}>
          Get detailed IRS breakdowns, renewal risk alerts, and AI-generated improvement recommendations.
        </p>
      </div>
    </section>
  );
}

function SubScore({ label, value }: { label: string; value: number | null }) {
  return (
    <div style={{ background: "#1e293b", borderRadius: 8, padding: 12, textAlign: "center" }}>
      <p style={{ fontSize: 11, color: "#64748b", margin: "0 0 4px", textTransform: "uppercase" as const }}>{label}</p>
      <p style={{ fontSize: 20, fontWeight: 600, color: value !== null ? "#60a5fa" : "#475569", margin: 0 }}>
        {value !== null ? value : "—"}
      </p>
    </div>
  );
}
