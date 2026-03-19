"use client";

import { useEffect, useState } from "react";
import { listCarriers } from "../../../services/api";
import ComingSoon from "../../../components/ComingSoon";
import { Shield, Truck, AlertTriangle } from "../../../components/icons";

type R = Record<string, unknown>;

export default function InsurancePage() {
  const [carriers, setCarriers] = useState<R[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listCarriers({ limit: 200 }).then((res) => {
      setCarriers((res.data as R[]) || []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  // IRS is Phase 2 — show placeholder scores per carrier
  const irsForCarrier = (_c: R): number | null => null; // Phase 2 stub

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      <h1 style={{ fontSize: 22, margin: "0 0 6px", fontWeight: 600 }}>Insurance IQ</h1>
      <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 20px" }}>
        Insurance Readiness Scoring (IRS) and AI playbook generation. <em>Full scoring launches in Phase 2.</em>
      </p>

      {loading ? (
        <p style={{ color: "#94a3b8" }}>Loading carriers…</p>
      ) : carriers.length === 0 ? (
        <p style={{ color: "#64748b" }}>No carriers in roster. Add carriers first to see insurance data.</p>
      ) : (
        <div className="fp-table-wrap">
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #1e293b" }}>
              <th style={thStyle}>Carrier</th>
              <th style={thStyle}>Safety Rating</th>
              <th style={thStyle}>IRS Score</th>
              <th style={thStyle}>Compliance</th>
              <th style={thStyle}>Power Units</th>
              <th style={thStyle}>Playbook</th>
            </tr>
          </thead>
          <tbody>
            {carriers.map((c) => {
              const irs = irsForCarrier(c);
              const safety = (c.safety_rating as string) || "N/A";
              return (
                <tr key={c.id as string} style={{ borderBottom: "1px solid #0f172a" }}>
                  <td style={tdStyle}>
                    <strong>{c.legal_name as string}</strong>
                    <span style={{ fontSize: 11, color: "#64748b", marginLeft: 8 }}>
                      {c.mc_number ? `MC ${c.mc_number}` : `DOT ${c.dot_number}`}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ color: safety === "Satisfactory" ? "#22c55e" : safety === "N/A" ? "#64748b" : "#f59e0b" }}>
                      {safety}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    {irs !== null ? (
                      <span style={{ color: irs >= 70 ? "#22c55e" : irs >= 50 ? "#f59e0b" : "#ef4444", fontWeight: 600 }}>{irs}</span>
                    ) : (
                      <div
                        className="irs-ring"
                        style={{
                          width: 56,
                          height: 56,
                          margin: "-6px 0",
                          ["--irs-pct" as string]: 0,
                        } as React.CSSProperties & Record<string, string | number>}
                      >
                        <div className="irs-ring__inner" style={{ width: 44, height: 44 }}>
                          <span className="fp-mono" style={{ color: "#475569", fontSize: 10 }}>P2</span>
                        </div>
                      </div>
                    )}
                  </td>
                  <td style={tdStyle}>
                    <span style={{
                      fontSize: 11, padding: "2px 8px", borderRadius: 10, fontWeight: 600,
                      background: safety === "Satisfactory" ? "#22c55e22" : "#f59e0b22",
                      color: safety === "Satisfactory" ? "#22c55e" : "#f59e0b",
                    }}>
                      {safety === "Satisfactory" ? "COMPLIANT" : "REVIEW"}
                    </span>
                  </td>
                  <td style={tdStyle}>{String(c.power_units || "—")}</td>
                  <td style={tdStyle}>
                    <button type="button" disabled style={{
                      padding: "3px 10px", borderRadius: 4, border: "1px solid #334155",
                      background: "transparent", color: "#475569", fontSize: 12, cursor: "not-allowed",
                    }}>
                      Generate Playbook
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      )}

      {/* Phase 2 Coming Soon Cards */}
      <div style={{ marginTop: 24, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
        <ComingSoon
          title="IRS Scoring"
          description="Insurance Readiness Score — composite score from Safety, Compliance, Financial, and Claims sub-scores with risk tier classification."
          phaseLabel="Phase 2"
          icon={<Shield size={20} />}
        />
        <ComingSoon
          title="MVR Driver Reports"
          description="Motor Vehicle Record integration for driver-level risk assessment with automated 30-day cache refresh."
          phaseLabel="Phase 2"
          icon={<Truck size={20} />}
        />
        <ComingSoon
          title="DataQs Challenges"
          description="FMCSA DataQs challenge tracking and resolution workflow with CSA data integration."
          phaseLabel="Phase 2"
          icon={<AlertTriangle size={20} />}
        />
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = { padding: "8px 10px", fontSize: 12, color: "#64748b", textAlign: "left" };
const tdStyle: React.CSSProperties = { padding: "8px 10px", fontSize: 13 };
