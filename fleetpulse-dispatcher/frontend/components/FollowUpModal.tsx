"use client";

import { useState } from "react";
import { draftFollowup } from "../services/api";
import { X } from "./icons";

type Props = {
  invoiceId: string;
  onSent?: () => void;
};

export default function FollowUpModal({ invoiceId, onSent }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [tone, setTone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const handleOpen = async () => {
    setOpen(true);
    setSent(false);
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

  const handleMarkSent = () => {
    setSent(true);
    onSent?.();
  };

  const toneColor = tone === "final" ? "#ef4444" : tone === "assertive" ? "#f59e0b" : tone === "firm" ? "#fb923c" : "#22c55e";

  return (
    <div style={{ display: "inline-block" }}>
      <button type="button" onClick={handleOpen} style={btnStyle}>Draft Follow-up</button>
      {open && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex",
          justifyContent: "center", alignItems: "center", zIndex: 100 }}>
          <div style={{ background: "#0f172a", borderRadius: 12, padding: 24, width: 520,
            border: "1px solid #334155", maxHeight: "80vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>Invoice Follow-up</h3>
              <button type="button" onClick={() => setOpen(false)}
                style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 18, display: "flex", alignItems: "center" }}><X size={18} /></button>
            </div>

            {loading && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--mist)" }}>
                <span className="fp-spinner" />
                <p style={{ margin: 0 }}>Generating draft...</p>
              </div>
            )}
            {error && <p style={{ color: "#ef4444", fontSize: 13 }}>{error}</p>}

            {!loading && !error && (
              <>
                {tone && (
                  <div style={{ marginBottom: 8 }}>
                    <span style={{ display: "inline-block", padding: "2px 10px", borderRadius: 12,
                      fontSize: 12, background: toneColor, color: "#fff" }}>
                      {tone.toUpperCase()}
                    </span>
                    {tone === "final" && (
                      <span style={{ fontSize: 12, color: "#f59e0b", marginLeft: 8 }}>
                        Escalation recommended
                      </span>
                    )}
                  </div>
                )}
                <label style={{ fontSize: 13, color: "#94a3b8" }}>Subject</label>
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  style={{ ...inputStyle, marginBottom: 8 }}
                />
                <label style={{ fontSize: 13, color: "#94a3b8" }}>Message</label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={8}
                  style={{ ...inputStyle, resize: "vertical" }}
                />
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  {!sent ? (
                    <button type="button" onClick={handleMarkSent} style={btnPrimary}>Mark as Sent</button>
                  ) : (
                    <span style={{ color: "#22c55e", fontSize: 13 }}>Marked as sent</span>
                  )}
                  <button type="button" onClick={() => { navigator.clipboard.writeText(`${subject}\n\n${body}`); }}
                    style={btnSecondary}>Copy to Clipboard</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "8px 12px", borderRadius: 6, border: "1px solid #334155",
  background: "#1e293b", color: "#f8fafc", fontSize: 14, width: "100%",
  display: "block",
};
const btnStyle: React.CSSProperties = {
  padding: "4px 10px", borderRadius: 4, border: "1px solid #334155",
  background: "transparent", color: "#60a5fa", fontSize: 12, cursor: "pointer",
};
const btnPrimary: React.CSSProperties = {
  padding: "8px 16px", borderRadius: 6, border: "none", background: "#3b82f6",
  color: "#fff", fontSize: 14, cursor: "pointer",
};
const btnSecondary: React.CSSProperties = {
  padding: "8px 16px", borderRadius: 6, border: "1px solid #334155",
  background: "transparent", color: "#94a3b8", fontSize: 14, cursor: "pointer",
};
