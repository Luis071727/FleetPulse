"use client";

import { useState } from "react";
import ComingSoon from "../../../components/ComingSoon";
import { Fuel, Calendar, MapPin, FileText, Bell, AlertTriangle } from "../../../components/icons";

const QUARTERS = ["Q1 2026", "Q2 2026", "Q3 2026", "Q4 2026"];

const DEADLINES = [
  { quarter: "Q1 2026", due: "Apr 30, 2026", daysOut: 41 },
  { quarter: "Q2 2026", due: "Jul 31, 2026", daysOut: 133 },
  { quarter: "Q3 2026", due: "Oct 31, 2026", daysOut: 225 },
  { quarter: "Q4 2026", due: "Jan 31, 2027", daysOut: 317 },
];

// Preview mock data — will be replaced by ELD + fuel card integrations
const MOCK_STATES = [
  { state: "TX", miles: 4820, gallons: 723, taxOwed: 312.45, status: "on_track" as const },
  { state: "FL", miles: 3150, gallons: 472, taxOwed: -87.20, status: "credit" as const },
  { state: "GA", miles: 2680, gallons: 402, taxOwed: 145.60, status: "on_track" as const },
  { state: "AL", miles: 1240, gallons: 186, taxOwed: 52.30, status: "attention" as const },
  { state: "LA", miles: 980, gallons: 147, taxOwed: 28.90, status: "on_track" as const },
  { state: "MS", miles: 620, gallons: 93, taxOwed: 15.70, status: "on_track" as const },
];

function statusBadge(s: "on_track" | "credit" | "attention") {
  const map = {
    on_track: { label: "On Track", bg: "#22c55e22", color: "#22c55e" },
    credit: { label: "Credit", bg: "#3b82f622", color: "#3b82f6" },
    attention: { label: "Needs Attention", bg: "#f59e0b22", color: "#f59e0b" },
  };
  const { label, bg, color } = map[s];
  return (
    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 10, fontWeight: 600, background: bg, color }}>
      {label}
    </span>
  );
}

export default function IFTAPage() {
  const [selectedQ, setSelectedQ] = useState(QUARTERS[0]);
  const currentDeadline = DEADLINES.find((d) => d.quarter === selectedQ);
  const totalMiles = MOCK_STATES.reduce((s, r) => s + r.miles, 0);
  const totalGallons = MOCK_STATES.reduce((s, r) => s + r.gallons, 0);
  const totalTax = MOCK_STATES.reduce((s, r) => s + r.taxOwed, 0);

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <Fuel size={22} style={{ color: "var(--amber)" }} />
        <h1 style={{ fontSize: 22, margin: 0, fontWeight: 600 }}>IFTA Dashboard</h1>
        <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, fontWeight: 600, background: "var(--amber)", color: "#000", marginLeft: 4 }}>
          Preview
        </span>
      </div>
      <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 20px" }}>
        International Fuel Tax Agreement — quarterly mileage, fuel, and tax tracking per jurisdiction.
      </p>

      {/* Quarter selector + deadline banner */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 20, alignItems: "center" }}>
        <div style={{ display: "flex", gap: 4 }}>
          {QUARTERS.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => setSelectedQ(q)}
              style={{
                padding: "6px 14px", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer",
                border: selectedQ === q ? "1px solid var(--amber)" : "1px solid var(--border)",
                background: selectedQ === q ? "rgba(245,158,11,0.15)" : "var(--surface)",
                color: selectedQ === q ? "var(--amber)" : "var(--mist)",
              }}
            >
              {q}
            </button>
          ))}
        </div>
        {currentDeadline && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: currentDeadline.daysOut <= 30 ? "#ef4444" : currentDeadline.daysOut <= 60 ? "#f59e0b" : "var(--mist)" }}>
            <Calendar size={14} />
            <span>Due <strong>{currentDeadline.due}</strong> — {currentDeadline.daysOut} days out</span>
          </div>
        )}
      </div>

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12, marginBottom: 24 }}>
        <div style={cardStyle}>
          <span style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: 1 }}>Total Miles</span>
          <span style={{ fontSize: 24, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace" }}>{totalMiles.toLocaleString()}</span>
        </div>
        <div style={cardStyle}>
          <span style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: 1 }}>Total Gallons</span>
          <span style={{ fontSize: 24, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace" }}>{totalGallons.toLocaleString()}</span>
        </div>
        <div style={cardStyle}>
          <span style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: 1 }}>Avg MPG</span>
          <span style={{ fontSize: 24, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace" }}>{(totalMiles / totalGallons).toFixed(1)}</span>
        </div>
        <div style={cardStyle}>
          <span style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: 1 }}>Est. Net Tax</span>
          <span style={{ fontSize: 24, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace", color: totalTax >= 0 ? "#f59e0b" : "#3b82f6" }}>
            ${Math.abs(totalTax).toFixed(2)}
          </span>
        </div>
      </div>

      {/* State breakdown table */}
      <h2 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 10px" }}>Miles &amp; Fuel by State — {selectedQ}</h2>
      <div className="fp-table-wrap">
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 24 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #1e293b" }}>
              <th style={thStyle}><MapPin size={12} style={{ marginRight: 4, verticalAlign: -1 }} />State</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Miles</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Gallons</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Tax Owed / Credit</th>
              <th style={thStyle}>Status</th>
            </tr>
          </thead>
          <tbody>
            {MOCK_STATES.map((row) => (
              <tr key={row.state} style={{ borderBottom: "1px solid #0f172a" }}>
                <td style={tdStyle}><strong>{row.state}</strong></td>
                <td style={{ ...tdStyle, textAlign: "right", fontFamily: "'IBM Plex Mono', monospace" }}>{row.miles.toLocaleString()}</td>
                <td style={{ ...tdStyle, textAlign: "right", fontFamily: "'IBM Plex Mono', monospace" }}>{row.gallons.toLocaleString()}</td>
                <td style={{ ...tdStyle, textAlign: "right", fontFamily: "'IBM Plex Mono', monospace", color: row.taxOwed < 0 ? "#3b82f6" : "inherit" }}>
                  {row.taxOwed < 0 ? `-$${Math.abs(row.taxOwed).toFixed(2)}` : `$${row.taxOwed.toFixed(2)}`}
                </td>
                <td style={tdStyle}>{statusBadge(row.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Quarterly report export */}
      <div style={{ ...cardStyle, flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <FileText size={18} style={{ color: "var(--amber)" }} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Quarterly Report — {selectedQ}</div>
            <div style={{ fontSize: 12, color: "#64748b" }}>IFTA-ready report formatted for base-state submission (FL / TX pre-fill supported)</div>
          </div>
        </div>
        <button type="button" disabled style={exportBtnStyle}>
          Export Report
        </button>
      </div>

      {/* Deadline calendar */}
      <h2 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 10px" }}>
        <Calendar size={16} style={{ marginRight: 6, verticalAlign: -2 }} />
        IFTA Deadline Calendar
      </h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12, marginBottom: 24 }}>
        {DEADLINES.map((d) => {
          const urgent = d.daysOut <= 30;
          const soon = d.daysOut <= 60;
          return (
            <div key={d.quarter} style={{ ...cardStyle, borderLeft: `3px solid ${urgent ? "#ef4444" : soon ? "#f59e0b" : "var(--border)"}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{d.quarter}</span>
                {urgent && <Bell size={14} style={{ color: "#ef4444" }} />}
                {!urgent && soon && <Bell size={14} style={{ color: "#f59e0b" }} />}
              </div>
              <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>Due: {d.due}</div>
              <div style={{ fontSize: 12, fontWeight: 600, marginTop: 4, color: urgent ? "#ef4444" : soon ? "#f59e0b" : "var(--mist)" }}>
                {d.daysOut} days remaining
              </div>
              <div style={{ fontSize: 11, color: "#475569", marginTop: 6 }}>
                Alerts: 30d · 7d · 1d before deadline
              </div>
            </div>
          );
        })}
      </div>

      {/* Coming Soon feature cards */}
      <h2 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 10px" }}>Coming Soon</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
        <ComingSoon
          title="ELD Integration"
          description="Automatic miles-per-state pulled from your ELD provider. No more manual entry or spreadsheet reconciliation."
          phaseLabel="Phase 2"
          icon={<MapPin size={20} />}
        />
        <ComingSoon
          title="Fuel Card Sync"
          description="Direct integration with major fuel card networks to auto-populate gallons by state for each quarter."
          phaseLabel="Phase 2"
          icon={<Fuel size={20} />}
        />
        <ComingSoon
          title="Zero Report Alerts"
          description="Automatic notifications when a carrier has no activity in a quarter — file a zero report on time and avoid penalties."
          phaseLabel="Phase 2"
          icon={<AlertTriangle size={20} />}
        />
        <ComingSoon
          title="FL / TX Portal Pre-Fill"
          description="One-click export pre-formatted for Florida and Texas IFTA portal submission. Additional states coming soon."
          phaseLabel="Phase 2"
          icon={<FileText size={20} />}
        />
      </div>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  padding: "16px",
  borderRadius: 10,
  border: "1px solid var(--border)",
  background: "var(--surface)",
};

const thStyle: React.CSSProperties = { padding: "8px 10px", fontSize: 12, color: "#64748b", textAlign: "left" };
const tdStyle: React.CSSProperties = { padding: "8px 10px", fontSize: 13 };

const exportBtnStyle: React.CSSProperties = {
  padding: "8px 20px",
  borderRadius: 6,
  border: "1px solid #334155",
  background: "transparent",
  color: "#475569",
  fontSize: 13,
  fontWeight: 600,
  cursor: "not-allowed",
};
