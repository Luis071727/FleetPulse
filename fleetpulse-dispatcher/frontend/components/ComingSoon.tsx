"use client";

import React from "react";

type Props = {
  title: string;
  description: string;
  phaseLabel?: string;
  icon?: React.ReactNode;
};

export default function ComingSoon({ title, description, phaseLabel = "Phase 2", icon }: Props) {
  return (
    <div style={{
      padding: 20,
      borderRadius: 10,
      border: "1px solid var(--border)",
      background: "var(--surface)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        {icon && <span style={{ color: "var(--amber)", display: "flex", alignItems: "center" }}>{icon}</span>}
        <h3 style={{ fontSize: 15, margin: 0, fontWeight: 600 }}>{title}</h3>
        <span style={{
          fontSize: 10, padding: "2px 8px", borderRadius: 10, fontWeight: 600,
          background: "var(--amber)", color: "#000", marginLeft: "auto",
        }}>
          {phaseLabel}
        </span>
      </div>
      <p style={{ fontSize: 13, color: "var(--mist)", margin: 0, lineHeight: 1.6 }}>{description}</p>
    </div>
  );
}
