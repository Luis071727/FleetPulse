"use client";

import { useState } from "react";
import { X, Sparkles } from "./icons";

type Carrier = {
  dot_number: string;
  legal_name: string;
  state: string;
  city: string;
  power_units: number;
  drivers: number;
  carrier_operation?: string | null;
  authorized_for_hire?: boolean;
  hauls_hazmat?: boolean;
  add_date?: string | null;
  last_filing?: string | null;
  annual_mileage?: number;
  telephone?: string | null;
  email?: string | null;
};

type Props = {
  carrier: Carrier;
  dispatcherName: string;
  dispatcherCompany: string;
  onClose: () => void;
};

type Tone = "friendly" | "professional" | "urgent";

export default function OutreachModal({ carrier, dispatcherName, dispatcherCompany, onClose }: Props) {
  const [tone, setTone] = useState<Tone>("professional");
  const [draft, setDraft] = useState("");
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  const handleGenerate = async () => {
    setGenerating(true);
    setError("");
    try {
      const res = await fetch("/api/outreach/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ carrier, dispatcher_name: dispatcherName, dispatcher_company: dispatcherCompany, tone  }),
      });
      const json = await res.json() as { data?: string; error?: string };
      if (json.error) throw new Error(json.error);
      setDraft(json.data || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!draft) return;
    await navigator.clipboard.writeText(draft);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 300 }}
      onClick={onClose}
    >
      <div
        className="fp-modal"
        style={{ background: "var(--surface)", borderRadius: 14, padding: 24, width: 520, maxHeight: "88vh", overflowY: "auto", border: "1px solid var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, display: "flex", alignItems: "center", gap: 7 }}>
              <Sparkles size={16} style={{ color: "var(--amber)" }} />
              Write Outreach
            </h2>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--mist)" }}>
              {carrier.legal_name} · {carrier.city}, {carrier.state} · {carrier.power_units} trucks · DOT #{carrier.dot_number}
            </p>
          </div>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", color: "var(--mist)", cursor: "pointer", display: "flex" }}>
            <X size={18} />
          </button>
        </div>

        {/* Carrier summary */}
        <div style={{ background: "var(--surface2)", borderRadius: 10, padding: "10px 14px", marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: (carrier.telephone || carrier.email) ? 10 : 0 }}>
            <Metric label="Fleet" value={`${carrier.power_units} trucks`} />
            <Metric label="Drivers" value={String(carrier.drivers)} />
            <Metric label="Operation" value={carrier.carrier_operation || "—"} />
            {carrier.authorized_for_hire !== undefined && (
              <Metric label="Authority" value={carrier.authorized_for_hire ? "For Hire" : "Private"} />
            )}
          </div>
          {(carrier.telephone || carrier.email) && (
            <div style={{ borderTop: "1px solid var(--border2)", paddingTop: 8, display: "flex", flexWrap: "wrap", gap: 14 }}>
              {carrier.telephone && (
                <span style={{ fontSize: 12, color: "var(--mistLt)" }}>📞 <a href={`tel:${carrier.telephone}`} style={{ color: "var(--blue)", textDecoration: "none" }}>{carrier.telephone}</a></span>
              )}
              {carrier.email && (
                <span style={{ fontSize: 12, color: "var(--mistLt)" }}>✉ <a href={`mailto:${carrier.email}`} style={{ color: "var(--blue)", textDecoration: "none" }}>{carrier.email}</a></span>
              )}
            </div>
          )}
        </div>

        {/* Tone selector */}
        <div style={{ marginBottom: 14 }}>
          <p style={{ fontSize: 11, color: "var(--mist)", marginBottom: 6, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" }}>Tone</p>
          <div style={{ display: "flex", gap: 6 }}>
            {(["friendly", "professional", "urgent"] as Tone[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTone(t)}
                className={`fp-chip${tone === t ? " fp-chip--active" : ""}`}
                style={{ fontSize: 12, padding: "5px 12px" }}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Generate button */}
        {!draft && (
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating}
            style={{ width: "100%", padding: "10px", borderRadius: 8, border: "none", background: "var(--amber)", color: "#000", fontSize: 14, fontWeight: 700, cursor: generating ? "wait" : "pointer", opacity: generating ? 0.7 : 1, marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
          >
            {generating ? (
              <><span className="fp-spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Generating…</>
            ) : (
              <><Sparkles size={15} /> Generate with AI</>
            )}
          </button>
        )}

        {error && <p style={{ fontSize: 13, color: "var(--red)", marginBottom: 10 }}>{error}</p>}

        {/* Draft editor */}
        {draft && (
          <>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={10}
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--white)", fontSize: 13, lineHeight: 1.6, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box", marginBottom: 12 }}
            />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={generating}
                style={{ padding: "8px 14px", borderRadius: 7, border: "1px solid var(--border)", background: "transparent", color: "var(--mist)", fontSize: 13, cursor: "pointer" }}
              >
                {generating ? "Regenerating…" : "Try Again"}
              </button>
              <button
                type="button"
                onClick={handleCopy}
                style={{ padding: "8px 18px", borderRadius: 7, border: "none", background: copied ? "var(--green)" : "var(--amber)", color: "#000", fontSize: 13, fontWeight: 700, cursor: "pointer", transition: "background 0.2s" }}
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: "var(--mist)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 1 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--white)" }}>{value}</div>
    </div>
  );
}
