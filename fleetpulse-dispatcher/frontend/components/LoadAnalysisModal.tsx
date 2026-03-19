"use client";

import { useState } from "react";
import { analyzeLoad } from "../services/api";

type Props = {
  loadId: string;
};

export default function LoadAnalysisModal({ loadId }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  const runAnalysis = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await analyzeLoad(loadId);
      if (res.error) {
        setError(res.error);
      } else {
        setResult(res.data as Record<string, unknown>);
      }
    } catch {
      setError("AI service temporarily unavailable");
    } finally {
      setLoading(false);
    }
  };

  const rec = result?.recommendation as string | undefined;
  const badgeColor = rec === "GO" ? "#22c55e" : rec === "NEGOTIATE" ? "#f59e0b" : "#ef4444";
  const metrics = result?.summary_metrics as Record<string, unknown> | undefined;

  return (
    <section>
      <h2 style={{ fontSize: 18, marginBottom: 12 }}>Load Analysis</h2>
      <button type="button" onClick={runAnalysis} disabled={loading} style={btnPrimary}>
        {loading ? "Analyzing..." : "Analyze with AI"}
      </button>

      {result && (
        <div style={{ marginTop: 12, padding: 12, borderRadius: 8, border: "1px solid #334155", background: "#1e293b" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{
              display: "inline-block", padding: "4px 12px", borderRadius: 20, fontSize: 14, fontWeight: 600,
              background: badgeColor, color: "#fff",
            }}>
              {rec}
            </span>
            {result.target_rate && (
              <span style={{ fontSize: 13, color: "#f59e0b" }}>
                Target rate: ${(result.target_rate as number).toLocaleString()}
              </span>
            )}
            {result.cache_hit && (
              <span style={{ fontSize: 11, color: "#64748b" }}>(cached)</span>
            )}
          </div>
          <p style={{ fontSize: 13, color: "#cbd5e1", margin: 0 }}>{result.reasoning as string}</p>
          {metrics && (
            <div style={{ marginTop: 8, fontSize: 12, color: "#94a3b8", display: "flex", gap: 16 }}>
              <span>RPM: {metrics.net_rpm as number}</span>
              <span>Trust: {metrics.broker_trust_score as number}</span>
              {(metrics.broker_trust_score as number) < 50 && (
                <span style={{ color: "#ef4444", fontWeight: 600 }}>High-risk broker</span>
              )}
            </div>
          )}
        </div>
      )}

      {error && (
        <div style={{ marginTop: 8 }}>
          <p style={{ color: "#ef4444", fontSize: 13 }}>{error}</p>
          <button type="button" onClick={runAnalysis} disabled={loading} style={btnSmall}>
            Retry analysis
          </button>
        </div>
      )}
    </section>
  );
}

const btnPrimary: React.CSSProperties = {
  padding: "8px 16px", borderRadius: 6, border: "none", background: "#3b82f6",
  color: "#fff", fontSize: 14, cursor: "pointer",
};
const btnSmall: React.CSSProperties = {
  padding: "4px 10px", borderRadius: 4, border: "1px solid #334155",
  background: "transparent", color: "#60a5fa", fontSize: 12, cursor: "pointer",
};
