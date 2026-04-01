"use client";

import { useState } from "react";
import { X } from "./icons";

type Props = {
  onSaved: (name: string, company: string) => void;
  onClose: () => void;
};

export default function DispatcherSetupModal({ onSaved, onClose }: Props) {
  const [name, setName] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem("fp_dispatcher_name") || "" : ""
  );
  const [company, setCompany] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem("fp_dispatcher_company") || "" : ""
  );

  const handleSave = () => {
    if (!name.trim()) return;
    if (typeof window !== "undefined") {
      localStorage.setItem("fp_dispatcher_name", name.trim());
      localStorage.setItem("fp_dispatcher_company", company.trim());
    }
    onSaved(name.trim(), company.trim());
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 300 }}
      onClick={onClose}
    >
      <div
        style={{ background: "var(--surface)", borderRadius: 14, padding: 28, width: 420, border: "1px solid var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Your Outreach Profile</h2>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--mist)" }}>
              Used to personalize AI-generated emails
            </p>
          </div>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", color: "var(--mist)", cursor: "pointer", display: "flex" }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={lblStyle}>Your Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Maria Rodriguez"
            autoFocus
            style={inpStyle}
          />
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={lblStyle}>Company / Dispatch Name</label>
          <input
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="e.g. FleetPulse Dispatch"
            onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
            style={inpStyle}
          />
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" onClick={onClose} style={btnGhost}>Cancel</button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!name.trim()}
            style={{ ...btnAmber, opacity: name.trim() ? 1 : 0.5 }}
          >
            Save &amp; Continue
          </button>
        </div>
      </div>
    </div>
  );
}

const lblStyle: React.CSSProperties = { fontSize: 11, color: "var(--mist)", display: "block", marginBottom: 4, fontWeight: 500 };
const inpStyle: React.CSSProperties = { padding: "9px 12px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--white)", fontSize: 14, width: "100%", boxSizing: "border-box" };
const btnAmber: React.CSSProperties = { padding: "8px 18px", borderRadius: 7, border: "none", background: "var(--amber)", color: "#000", fontSize: 14, cursor: "pointer", fontWeight: 700 };
const btnGhost: React.CSSProperties = { padding: "8px 16px", borderRadius: 7, border: "1px solid var(--border)", background: "transparent", color: "var(--mist)", fontSize: 14, cursor: "pointer" };
