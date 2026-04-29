"use client";

import { useState } from "react";
import { draftFollowup } from "../services/api";
import { X } from "./icons";

type Props = {
  invoiceId: string;
  onSent?: () => void;
};

const TONE_BADGE: Record<string, string> = {
  polite:    "fp-badge fp-badge--active",
  firm:      "fp-badge fp-badge--shortpaid",
  assertive: "fp-badge fp-badge--idle",
  final:     "fp-badge fp-badge--overdue",
};

export default function FollowUpModal({ invoiceId, onSent }: Props) {
  const [open, setOpen]         = useState(false);
  const [loading, setLoading]   = useState(false);
  const [subject, setSubject]   = useState("");
  const [body, setBody]         = useState("");
  const [tone, setTone]         = useState("");
  const [error, setError]       = useState<string | null>(null);
  const [sent, setSent]         = useState(false);
  const [copied, setCopied]     = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  const handleOpen = async () => {
    setOpen(true);
    setSent(false);
    setCopied(false);
    setCopyError(null);
    setError(null);
    setLoading(true);
    try {
      const res = await draftFollowup(invoiceId);
      if (res.error) {
        setError(res.error);
      } else {
        const data = res.data as Record<string, unknown>;
        setSubject((data.subject_line as string) || "");
        setBody((data.draft_message as string) || "");
        setTone((data.tone as string) || "");
      }
    } catch {
      setError("Failed to generate draft");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => setOpen(false);

  const handleMarkSent = () => {
    setSent(true);
    onSent?.();
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(`${subject}\n\n${body}`);
      setCopied(true);
      setCopyError(null);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
      setCopyError("Clipboard copy failed. Please copy the draft manually.");
    }
  };

  return (
    <div style={{ display: "inline-block" }}>
      <button type="button" onClick={handleOpen} className="fp-btn fp-btn--sm fp-btn--outline">
        Draft Follow-up
      </button>

      {open && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", display: "flex",
            justifyContent: "center", alignItems: "center", zIndex: 100 }}
          onClick={handleClose}
        >
          <div
            className="fp-modal"
            style={{ background: "var(--surface)", borderRadius: 12, padding: 24, width: 520,
              border: "1px solid var(--border)", maxHeight: "80vh", overflowY: "auto" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Invoice Follow-up</h3>
                <p style={{ margin: "3px 0 0", fontSize: 12, color: "var(--mist)" }}>AI-drafted payment reminder</p>
              </div>
              <button type="button" onClick={handleClose}
                style={{ background: "none", border: "none", color: "var(--mistLt)", cursor: "pointer", display: "flex", alignItems: "center" }}>
                <X size={18} />
              </button>
            </div>

            {/* Loading */}
            {loading && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--mist)", padding: "12px 0" }}>
                <span className="fp-spinner" />
                <p style={{ margin: 0, fontSize: 13 }}>Generating draft…</p>
              </div>
            )}

            {/* Error */}
            {error && !loading && (
              <p style={{ color: "var(--red)", fontSize: 13, margin: "8px 0" }}>{error}</p>
            )}

            {/* Content */}
            {!loading && !error && (
              <>
                {tone && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                    <span className={TONE_BADGE[tone] ?? "fp-badge fp-badge--new"}>
                      {tone}
                    </span>
                    {tone === "final" && (
                      <span style={{ fontSize: 12, color: "var(--amber)" }}>Escalation recommended</span>
                    )}
                  </div>
                )}

                <div style={{ marginBottom: 10 }}>
                  <label className="fp-label">Subject</label>
                  <input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="fp-input"
                  />
                </div>

                <div style={{ marginBottom: 14 }}>
                  <label className="fp-label">Message</label>
                  <textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    rows={8}
                    className="fp-input"
                    style={{ resize: "vertical" }}
                  />
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {!sent ? (
                    <button type="button" onClick={handleMarkSent} className="fp-btn fp-btn--outline">
                      Mark as Sent
                    </button>
                  ) : (
                    <span style={{ fontSize: 13, color: "var(--green)", display: "flex", alignItems: "center", gap: 4 }}>
                      ✓ Marked as sent
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="fp-btn fp-btn--ghost"
                    style={copied ? { color: "var(--green)", borderColor: "var(--green)" } : undefined}
                  >
                    {copied ? "Copied!" : "Copy to Clipboard"}
                  </button>
                </div>

                {copyError && (
                  <p style={{ color: "var(--red)", fontSize: 12, marginTop: 8 }}>{copyError}</p>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
