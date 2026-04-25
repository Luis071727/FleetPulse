"use client";

import { useRouter } from "next/navigation";
import type { TodayAction } from "../services/api";

const PRIORITY_STYLES: Record<string, { bg: string; text: string; border: string; left: string }> = {
  high: { bg: "#ef444420", text: "#ef4444", border: "#ef444440", left: "#ef4444" },
  medium: { bg: "#f59e0b20", text: "#f59e0b", border: "#f59e0b40", left: "#f59e0b" },
  low: { bg: "#64748b20", text: "#94a3b8", border: "#64748b40", left: "#64748b" },
};

const TYPE_LABELS: Record<string, string> = {
  invoice_followup: "Follow-up",
  compliance_expiring: "Compliance",
  paperwork_pending: "Paperwork",
  invoice_ready: "Ready to Send",
};

type Props = {
  actions: TodayAction[];
  loading?: boolean;
  onRefresh?: () => void;
};

export default function TodayWorkPanel({ actions, loading, onRefresh }: Props) {
  const router = useRouter();

  return (
    <section style={{
      background: "var(--surface)",
      borderRadius: 10,
      padding: 16,
      border: "1px solid var(--border)",
      marginBottom: 20,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div>
          <h2 style={{ fontSize: 15, margin: 0, fontWeight: 600 }}>Today's Work</h2>
          {!loading && actions.length > 0 && (
            <p style={{ fontSize: 12, color: "#64748b", margin: "3px 0 0" }}>
              {actions.length} item{actions.length !== 1 ? "s" : ""} need your attention
            </p>
          )}
        </div>
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            style={{
              fontSize: 12, color: "#64748b", background: "none",
              border: "none", cursor: "pointer", padding: "2px 6px",
            }}
          >
            ↺ Refresh
          </button>
        )}
      </div>

      {loading ? (
        <p style={{ color: "#64748b", fontSize: 13, margin: 0 }}>Loading...</p>
      ) : actions.length === 0 ? (
        <div style={{
          padding: "10px 14px",
          borderRadius: 8,
          background: "#0f172a",
          border: "1px solid #1e293b",
          fontSize: 13,
          color: "#64748b",
        }}>
          🎉 You&apos;re all caught up — nothing urgent today.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {actions.map((action) => {
            const s = PRIORITY_STYLES[action.priority] || PRIORITY_STYLES.low;
            return (
              <div
                key={action.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "10px 12px",
                  borderRadius: 8,
                  background: "#0f172a",
                  border: `1px solid ${s.border}`,
                  borderLeft: `3px solid ${s.left}`,
                  gap: 12,
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 4,
                      background: s.bg, color: s.text, textTransform: "uppercase",
                    }}>
                      {action.priority}
                    </span>
                    <span style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                      {TYPE_LABELS[action.type] || action.type}
                    </span>
                  </div>
                  <p style={{
                    margin: 0, fontSize: 13, fontWeight: 500, color: "#f8fafc",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {action.title}
                  </p>
                  <p style={{
                    margin: "2px 0 0", fontSize: 11, color: "#94a3b8",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {action.description}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => router.push(action.cta.action)}
                  style={{
                    flexShrink: 0,
                    padding: "5px 12px",
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 500,
                    background: s.bg,
                    color: s.text,
                    border: `1px solid ${s.border}`,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  {action.cta.label}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
