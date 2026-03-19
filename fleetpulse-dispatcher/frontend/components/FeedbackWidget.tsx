"use client";

import { useState } from "react";
import { submitFeedback } from "../services/api";
import { Bug, Lightbulb, Sparkles, MessageCircle, CircleCheck, X } from "./icons";

const CATEGORIES = [
  { key: "bug", label: "Bug", Icon: Bug },
  { key: "ux", label: "UX Issue", Icon: Lightbulb },
  { key: "feature", label: "Feature", Icon: Sparkles },
  { key: "other", label: "Other", Icon: MessageCircle },
];

export default function FeedbackWidget() {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("bug");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState("medium");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const reset = () => {
    setCategory("bug");
    setDescription("");
    setSeverity("medium");
    setDone(false);
  };

  const handleSubmit = async () => {
    if (!description.trim()) return;
    setSubmitting(true);
    await submitFeedback({
      category,
      description: description.trim(),
      severity,
      page: typeof window !== "undefined" ? window.location.pathname : undefined,
    });
    setSubmitting(false);
    setDone(true);
    setTimeout(() => {
      setOpen(false);
      reset();
    }, 1800);
  };

  // Floating tab (collapsed)
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={styles.tab} title="Report an issue">
        <MessageCircle size={14} />
        <span style={{ fontSize: 11, fontWeight: 600 }}>Feedback</span>
      </button>
    );
  }

  // Expanded panel
  return (
    <div style={styles.overlay}>
      <div style={styles.panel}>
        {/* Header */}
        <div style={styles.header}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>Report an Issue</span>
          <button onClick={() => { setOpen(false); reset(); }} style={styles.closeBtn}><X size={14} /></button>
        </div>

        {done ? (
          <div style={styles.doneMsg}>
            <CircleCheck size={28} style={{ color: "#22c55e" }} />
            <p style={{ margin: "8px 0 0", fontSize: 13 }}>Thanks! We&apos;ll look into it.</p>
          </div>
        ) : (
          <>
            {/* Category chips */}
            <div style={styles.section}>
              <label style={styles.label}>What&apos;s this about?</label>
              <div style={styles.chips}>
                {CATEGORIES.map((c) => (
                  <button
                    key={c.key}
                    onClick={() => setCategory(c.key)}
                    style={{
                      ...styles.chip,
                      ...(category === c.key ? styles.chipActive : {}),
                    }}
                  >
                    <c.Icon size={12} style={{ marginRight: 4, verticalAlign: "middle" }} />
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Severity */}
            <div style={styles.section}>
              <label style={styles.label}>Severity</label>
              <div style={styles.chips}>
                {(["low", "medium", "high"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setSeverity(s)}
                    style={{
                      ...styles.chip,
                      ...(severity === s ? styles.chipActive : {}),
                    }}
                  >
                    {s === "low" ? "Minor" : s === "medium" ? "Moderate" : "Urgent"}
                  </button>
                ))}
              </div>
            </div>

            {/* Description */}
            <div style={styles.section}>
              <label style={styles.label}>Describe the issue</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What happened? What did you expect?"
                rows={3}
                style={styles.textarea}
              />
            </div>

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={submitting || !description.trim()}
              style={{
                ...styles.submitBtn,
                opacity: submitting || !description.trim() ? 0.5 : 1,
              }}
            >
              {submitting ? "Sending…" : "Submit"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/* ── Inline styles (matches dark FleetPulse theme) ── */
const styles: Record<string, React.CSSProperties> = {
  tab: {
    position: "fixed",
    bottom: 24,
    right: 0,
    zIndex: 9999,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 2,
    padding: "10px 10px",
    background: "#0d1318",
    border: "1px solid #1e2d3d",
    borderRight: "none",
    borderRadius: "8px 0 0 8px",
    color: "#f0f6fc",
    cursor: "pointer",
    fontFamily: "'IBM Plex Sans', sans-serif",
    boxShadow: "0 2px 12px rgba(0,0,0,0.4)",
    transition: "background 0.15s",
  },
  overlay: {
    position: "fixed",
    bottom: 24,
    right: 16,
    zIndex: 9999,
  },
  panel: {
    width: 320,
    background: "#0d1318",
    border: "1px solid #1e2d3d",
    borderRadius: 12,
    padding: 16,
    fontFamily: "'IBM Plex Sans', sans-serif",
    color: "#f0f6fc",
    boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  closeBtn: {
    background: "none",
    border: "none",
    color: "#64748b",
    cursor: "pointer",
    fontSize: 16,
    padding: 4,
  },
  section: {
    marginBottom: 12,
  },
  label: {
    display: "block",
    fontSize: 11,
    fontWeight: 600,
    color: "#64748b",
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    marginBottom: 6,
  },
  chips: {
    display: "flex",
    gap: 6,
    flexWrap: "wrap" as const,
  },
  chip: {
    padding: "5px 10px",
    fontSize: 12,
    borderRadius: 6,
    border: "1px solid #1e2d3d",
    background: "transparent",
    color: "#f0f6fc",
    cursor: "pointer",
    transition: "all 0.15s",
    fontFamily: "'IBM Plex Sans', sans-serif",
  },
  chipActive: {
    background: "#f59e0b",
    color: "#080c10",
    borderColor: "#f59e0b",
    fontWeight: 600,
  },
  textarea: {
    width: "100%",
    padding: 10,
    fontSize: 13,
    borderRadius: 8,
    border: "1px solid #1e2d3d",
    background: "#080c10",
    color: "#f0f6fc",
    fontFamily: "'IBM Plex Sans', sans-serif",
    resize: "vertical" as const,
    outline: "none",
    boxSizing: "border-box" as const,
  },
  submitBtn: {
    width: "100%",
    padding: "10px 0",
    fontSize: 13,
    fontWeight: 600,
    borderRadius: 8,
    border: "none",
    background: "#f59e0b",
    color: "#080c10",
    cursor: "pointer",
    fontFamily: "'IBM Plex Sans', sans-serif",
    transition: "opacity 0.15s",
  },
  doneMsg: {
    textAlign: "center" as const,
    padding: "24px 0",
  },
};
