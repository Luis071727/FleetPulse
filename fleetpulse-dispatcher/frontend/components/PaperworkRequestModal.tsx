"use client";

import { useState } from "react";
import { requestPaperwork } from "../services/api";
import { CircleCheck, X } from "./icons";

type Props = {
  invoiceId: string;
  invoiceNumber: string;
  onClose: () => void;
  onRequestCreated: () => void;
};

type RequestResult = {
  magic_link: string;
  doc_types: string[];
  expires_at: string;
};

const DOC_TYPE_OPTIONS: { value: string; label: string; description: string }[] = [
  { value: "BOL",           label: "Bill of Lading",    description: "BOL" },
  { value: "POD",           label: "Proof of Delivery", description: "POD" },
  { value: "RATE_CON",      label: "Rate Confirmation", description: "Signed RC" },
  { value: "WEIGHT_TICKET", label: "Weight Ticket",     description: "Scale ticket" },
  { value: "LUMPER_RECEIPT",label: "Lumper Receipt",    description: "Unload receipt" },
  { value: "INVOICE",       label: "Invoice Copy",      description: "Carrier invoice" },
  { value: "OTHER",         label: "Other",             description: "Other document" },
];

export default function PaperworkRequestModal({ invoiceId, invoiceNumber, onClose, onRequestCreated }: Props) {
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set(["BOL", "POD"]));
  const [notes, setNotes] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RequestResult | null>(null);
  const [copied, setCopied] = useState(false);

  const toggleType = (value: string) => {
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  };

  const handleSubmit = async () => {
    if (selectedTypes.size === 0) {
      setError("Select at least one document type.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const res = await requestPaperwork({
      invoice_id: invoiceId,
      doc_types: Array.from(selectedTypes),
      notes: notes.trim() || undefined,
      recipient_email: recipientEmail.trim() || undefined,
    });
    setSubmitting(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setResult(res.data as RequestResult);
  };

  const handleCopy = () => {
    if (!result?.magic_link) return;
    navigator.clipboard.writeText(result.magic_link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const expiresLabel = result?.expires_at
    ? new Date(result.expires_at).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 200 }}
      onClick={onClose}
    >
      <div
        style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: 24, width: 480, maxHeight: "85vh", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Request Paperwork</h2>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--mist)" }}>Invoice #{invoiceNumber}</p>
          </div>
          <button type="button" onClick={onClose} style={iconBtnStyle}><X size={18} /></button>
        </div>

        {/* ── Result state ── */}
        {result ? (
          <div>
            <div style={{ background: "#14291a", border: "1px solid #22c55e44", borderRadius: 10, padding: "14px 16px", marginBottom: 20 }}>
              <p style={{ margin: "0 0 4px", fontSize: 13, color: "#86efac", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                <CircleCheck size={14} style={{ color: "#22c55e" }} /> Link generated
              </p>
              <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>
                Expires {expiresLabel} · {result.doc_types.length} doc{result.doc_types.length !== 1 ? "s" : ""} requested
              </p>
            </div>

            <label style={lblStyle}>Share this link with the driver</label>
            <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
              <input
                readOnly
                value={result.magic_link}
                style={{ ...inpStyle, flex: 1, fontFamily: "monospace", fontSize: 12, color: "var(--mist)" }}
              />
              <button type="button" onClick={handleCopy} style={{ ...btnAmberStyle, minWidth: 90, whiteSpace: "nowrap" }}>
                {copied ? "✓ Copied!" : "Copy Link"}
              </button>
            </div>

            <p style={{ fontSize: 12, color: "#475569", marginBottom: 20 }}>
              You can also share this via WhatsApp, text, or email. The driver doesn't need an account — they just open the link and upload.
            </p>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" onClick={() => { onRequestCreated(); onClose(); }} style={btnAmberStyle}>
                Done
              </button>
            </div>
          </div>
        ) : (
          /* ── Form state ── */
          <div>
            {/* Doc type selection */}
            <label style={{ ...lblStyle, marginBottom: 10, display: "block" }}>Documents needed</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
              {DOC_TYPE_OPTIONS.map(({ value, label, description }) => {
                const checked = selectedTypes.has(value);
                return (
                  <label
                    key={value}
                    style={{
                      display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
                      borderRadius: 8, cursor: "pointer",
                      background: checked ? "#1e3a5f" : "#1e293b",
                      border: `1px solid ${checked ? "#3b82f6" : "var(--border)"}`,
                      transition: "all 0.15s",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleType(value)}
                      style={{ width: 16, height: 16, accentColor: "#3b82f6", cursor: "pointer" }}
                    />
                    <div>
                      <span style={{ fontSize: 14, fontWeight: 600, color: checked ? "#93c5fd" : "var(--white)" }}>
                        {label}
                      </span>
                      <span style={{ fontSize: 12, color: "var(--mist)", marginLeft: 6 }}>{description}</span>
                    </div>
                  </label>
                );
              })}
            </div>

            {/* Notes */}
            <div style={{ marginBottom: 14 }}>
              <label style={lblStyle}>Note for driver <span style={{ color: "#475569", fontWeight: 400 }}>(optional)</span></label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="e.g. Please include both sides of the BOL"
                style={{ ...inpStyle, resize: "vertical" }}
              />
            </div>

            {/* Recipient email */}
            <div style={{ marginBottom: 18 }}>
              <label style={lblStyle}>
                Recipient email <span style={{ color: "#475569", fontWeight: 400 }}>(optional — email sending coming soon)</span>
              </label>
              <input
                type="email"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                placeholder="driver@example.com"
                style={inpStyle}
              />
            </div>

            {error && (
              <p style={{ color: "var(--red)", fontSize: 13, marginBottom: 12 }}>{error}</p>
            )}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" onClick={onClose} style={btnGhostStyle}>Cancel</button>
              <button type="button" onClick={handleSubmit} disabled={submitting || selectedTypes.size === 0} style={{ ...btnAmberStyle, opacity: submitting || selectedTypes.size === 0 ? 0.6 : 1 }}>
                {submitting ? "Generating…" : "Generate Link"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const lblStyle: React.CSSProperties = { fontSize: 11, color: "var(--mist)", display: "block", marginBottom: 6, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" };
const inpStyle: React.CSSProperties = { padding: "8px 12px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--white)", fontSize: 14, width: "100%", boxSizing: "border-box" as const };
const btnAmberStyle: React.CSSProperties = { padding: "8px 18px", borderRadius: 6, border: "none", background: "var(--amber)", color: "#000", fontSize: 14, cursor: "pointer", fontWeight: 700 };
const btnGhostStyle: React.CSSProperties = { padding: "8px 18px", borderRadius: 6, border: "1px solid var(--border)", background: "transparent", color: "var(--mist)", fontSize: 14, cursor: "pointer" };
const iconBtnStyle: React.CSSProperties = { background: "none", border: "none", color: "var(--mist)", cursor: "pointer", display: "flex", alignItems: "center", padding: 4 };
