"use client";

import { useMemo, useState, useEffect } from "react";
import { createCarrierManual } from "../services/api";

type Props = {
  onComplete?: () => void;
};

type FmcsaPreview = {
  dot: string;
  legal_name: string;
  mc_number?: string | null;
  city?: string | null;
  state?: string | null;
  power_units?: number | null;
  drivers?: number | null;
  safety_rating?: string | null;
  telephone?: string | null;
  email?: string | null;
};

export default function AddCarrierModal({ onComplete }: Props) {
  const [dot, setDot] = useState("");
  const [loading, setLoading] = useState(false);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ legal_name: string; dot_number: string } | null>(null);
  const [preview, setPreview] = useState<FmcsaPreview | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [manualMode, setManualMode] = useState(false);

  // Manual fields — pre-filled from preview when available
  const [manualName, setManualName] = useState("");
  const [manualMc, setManualMc] = useState("");
  const [manualAddress, setManualAddress] = useState("");
  const [manualPhone, setManualPhone] = useState("");
  const [manualPowerUnits, setManualPowerUnits] = useState<number | "">("");

  const cleanDot = useMemo(() => dot.replace(/\D/g, ""), [dot]);
  const lookupReady = cleanDot.length >= 4;
  const canSubmit = lookupReady && !!preview && !lookupLoading;

  // DOT lookup via frontend FMCSA route (debounced)
  useEffect(() => {
    setLookupError(null);
    if (!lookupReady) { setPreview(null); return; }

    const timer = window.setTimeout(async () => {
      setLookupLoading(true);
      try {
        const res = await fetch(`/api/fmcsa/carrier/${cleanDot}`);
        const json = await res.json() as { data: FmcsaPreview | null; error?: string };
        if (json.error || !json.data) {
          setPreview(null);
          setLookupError(json.error || "Carrier not found in FMCSA");
        } else {
          setPreview(json.data);
        }
      } catch {
        setPreview(null);
        setLookupError("Lookup failed. Try again.");
      } finally {
        setLookupLoading(false);
      }
    }, 1300);

    return () => window.clearTimeout(timer);
  }, [cleanDot, lookupReady]);

  // Pre-fill manual fields from FMCSA preview
  const switchToManual = () => {
    if (preview) {
      setManualName(preview.legal_name || "");
      setManualMc(preview.mc_number || "");
      setManualPhone(preview.telephone || "");
      setManualPowerUnits(preview.power_units || "");
      setManualAddress([preview.city, preview.state].filter(Boolean).join(", "));
    }
    setManualMode(true);
    setError(null);
  };

  // Add using FMCSA preview data — no backend re-lookup needed
  const handleAdd = async () => {
    if (!canSubmit || !preview) return;
    setLoading(true);
    setError(null);
    try {
      const res = await createCarrierManual({
        legal_name: preview.legal_name,
        dot_number: preview.dot || cleanDot,
        mc_number: preview.mc_number || undefined,
        phone: preview.telephone || undefined,
        power_units: preview.power_units || undefined,
        address: [preview.city, preview.state].filter(Boolean).join(", ") || undefined,
      });
      if (res.error) {
        setError(res.error);
      } else {
        setResult(res.data as { legal_name: string; dot_number: string });
        setDot("");
        setPreview(null);
        onComplete?.();
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  const handleManualAdd = async () => {
    if (!manualName.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await createCarrierManual({
        legal_name: manualName.trim(),
        dot_number: cleanDot || undefined,
        mc_number: manualMc || undefined,
        address: manualAddress || undefined,
        phone: manualPhone || undefined,
        power_units: manualPowerUnits ? Number(manualPowerUnits) : undefined,
      });
      if (res.error) {
        setError(res.error);
      } else {
        setResult(res.data as { legal_name: string; dot_number: string });
        onComplete?.();
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section>
      <h2 style={{ fontSize: 18, marginBottom: 4 }}>Add Carrier</h2>
      <p className="fp-mono" style={{ fontSize: 12, color: "var(--mist)", marginTop: 0, marginBottom: 12 }}>
        Enter a DOT number to auto-fill from FMCSA, or enter details manually.
      </p>

      {/* DOT input row */}
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <input
          placeholder="DOT Number"
          value={dot}
          onChange={(e) => { setDot(e.target.value.replace(/\D/g, "")); setManualMode(false); }}
          style={inputStyle}
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={loading || !canSubmit}
          style={{ ...btnStyle, opacity: loading || !canSubmit ? 0.55 : 1 }}
        >
          {loading ? "Adding…" : "Add Carrier"}
        </button>
      </div>

      {/* Lookup status */}
      {lookupLoading && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span className="fp-spinner" />
          <span style={{ fontSize: 12, color: "var(--mist)" }}>Checking FMCSA…</span>
        </div>
      )}

      {/* FMCSA verified preview */}
      {preview && !manualMode && (
        <div style={{ border: "1px solid var(--green)", borderRadius: 8, padding: 12, marginBottom: 8, background: "color-mix(in srgb, var(--green) 5%, transparent)" }}>
          <p className="fp-mono" style={{ fontSize: 11, color: "var(--green)", margin: "0 0 8px", letterSpacing: "0.05em" }}>✓ FMCSA VERIFIED</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 16px" }}>
            <p style={{ margin: 0, fontSize: 13 }}><strong>Name:</strong> {preview.legal_name || "-"}</p>
            <p style={{ margin: 0, fontSize: 13 }}><strong>MC#:</strong> {preview.mc_number || "-"}</p>
            <p style={{ margin: 0, fontSize: 13 }}><strong>Location:</strong> {[preview.city, preview.state].filter(Boolean).join(", ") || "-"}</p>
            <p style={{ margin: 0, fontSize: 13 }}><strong>Power Units:</strong> {preview.power_units ?? "-"}</p>
            <p style={{ margin: 0, fontSize: 13 }}><strong>Drivers:</strong> {preview.drivers ?? "-"}</p>
            <p style={{ margin: 0, fontSize: 13 }}><strong>Safety:</strong> {preview.safety_rating || "Not rated"}</p>
            {preview.telephone && <p style={{ margin: 0, fontSize: 13 }}><strong>Phone:</strong> {preview.telephone}</p>}
            {preview.email && <p style={{ margin: 0, fontSize: 13 }}><strong>Email:</strong> {preview.email}</p>}
          </div>
        </div>
      )}

      {/* Lookup error */}
      {lookupError && !manualMode && (
        <p style={{ color: "var(--red)", fontSize: 13, margin: "0 0 8px" }}>{lookupError}</p>
      )}

      {/* Hint when no preview yet */}
      {!canSubmit && !lookupLoading && !lookupError && !preview && !manualMode && (
        <p style={{ color: "var(--mist)", fontSize: 12, margin: "0 0 4px" }}>
          Enter 4+ digits — carrier info will auto-load from FMCSA.
        </p>
      )}

      {/* Always-visible manual entry link */}
      {!manualMode && (
        <button
          type="button"
          onClick={switchToManual}
          style={{ background: "none", border: "none", color: "var(--blue)", fontSize: 12, cursor: "pointer", padding: 0, marginBottom: 8, textDecoration: "underline" }}
        >
          {preview ? "Edit details before saving" : "Enter manually instead"}
        </button>
      )}

      {/* Errors / success */}
      {error && <p style={{ color: "var(--red)", fontSize: 13, margin: "4px 0" }}>{error}</p>}
      {result && (
        <p style={{ color: "var(--green)", fontSize: 13, margin: "4px 0" }}>
          Added: {result.legal_name} (DOT {result.dot_number})
        </p>
      )}

      {/* Manual entry form */}
      {manualMode && (
        <div style={{ marginTop: 12, padding: 14, border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <h3 style={{ fontSize: 14, margin: 0, color: "var(--amber)" }}>
              {preview ? "Confirm Details" : "Manual Entry"}
            </h3>
            <button
              type="button"
              onClick={() => setManualMode(false)}
              style={{ background: "none", border: "none", color: "var(--mist)", fontSize: 12, cursor: "pointer" }}
            >
              ← Back
            </button>
          </div>
          {!preview && (
            <p style={{ fontSize: 11, color: "var(--mist)", margin: "0 0 8px" }}>
              Carrier will be marked as unverified until FMCSA data is confirmed.
            </p>
          )}
          <div className="fp-form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
            <input placeholder="Legal Name *" value={manualName} onChange={(e) => setManualName(e.target.value)} style={inputStyle} />
            <input placeholder="MC Number" value={manualMc} onChange={(e) => setManualMc(e.target.value)} style={inputStyle} />
            <input placeholder="Address / City, State" value={manualAddress} onChange={(e) => setManualAddress(e.target.value)} style={inputStyle} />
            <input placeholder="Phone" value={manualPhone} onChange={(e) => setManualPhone(e.target.value)} style={inputStyle} />
            <input type="number" placeholder="Power Units" value={manualPowerUnits} onChange={(e) => setManualPowerUnits(e.target.value ? Number(e.target.value) : "")} style={inputStyle} />
          </div>
          <button
            type="button"
            onClick={handleManualAdd}
            disabled={loading || !manualName.trim()}
            style={{ ...btnStyle, opacity: loading || !manualName.trim() ? 0.55 : 1 }}
          >
            {loading ? "Adding…" : preview ? "Save Carrier" : "Add Carrier (Unverified)"}
          </button>
        </div>
      )}
    </section>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "8px 12px", borderRadius: 6, border: "1px solid var(--border-input)",
  background: "var(--input-bg)", color: "var(--white)", fontSize: 14, flex: 1,
};
const btnStyle: React.CSSProperties = {
  padding: "8px 16px", borderRadius: 6, border: "none", background: "var(--amber)",
  color: "#000", fontSize: 14, cursor: "pointer", whiteSpace: "nowrap", fontWeight: 600,
};
