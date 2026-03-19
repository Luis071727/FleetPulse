"use client";

import { useEffect, useMemo, useState } from "react";
import { addCarrier, lookupDot, createCarrierManual } from "../services/api";

type Props = {
  onComplete?: () => void;
};

export default function AddCarrierModal({ onComplete }: Props) {
  const [dot, setDot] = useState("");
  const [loading, setLoading] = useState(false);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualMc, setManualMc] = useState("");
  const [manualAddress, setManualAddress] = useState("");
  const [manualPhone, setManualPhone] = useState("");
  const [manualPowerUnits, setManualPowerUnits] = useState<number | "">("");

  const cleanDot = useMemo(() => dot.replace(/\D/g, ""), [dot]);
  const lookupReady = cleanDot.length >= 4;
  const canSubmit = lookupReady && !!preview?.found && !lookupLoading;

  useEffect(() => {
    setLookupError(null);
    if (!lookupReady) {
      setPreview(null);
      return;
    }

    const timer = window.setTimeout(async () => {
      setLookupLoading(true);
      try {
        const res = await lookupDot(cleanDot);
        if (res.error) {
          setPreview(null);
          setLookupError(res.error);
        } else {
          const data = (res.data as Record<string, unknown>) || null;
          setPreview(data);
          if (!data?.found) setLookupError("Carrier not found in FMCSA lookup");
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

  const handleAdd = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await addCarrier(cleanDot);
      if (res.error) {
        setError(res.error);
      } else {
        setResult(res.data as Record<string, unknown>);
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
        setResult(res.data as Record<string, unknown>);
        onComplete?.();
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  const switchToManual = () => {
    setManualMode(true);
    setError(null);
  };

  return (
    <section>
      <h2 style={{ fontSize: 18, marginBottom: 12 }}>Add Carrier by DOT</h2>
      <p className="fp-mono" style={{ fontSize: 12, color: "var(--mist)", marginTop: 0 }}>
        Enter 4+ digits to auto-preview FMCSA data (1.3s debounce)
      </p>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <input
          placeholder="DOT Number"
          value={dot}
          onChange={(e) => setDot(e.target.value.replace(/\D/g, ""))}
          style={inputStyle}
        />
        <button type="button" onClick={handleAdd} disabled={loading || !canSubmit} style={{ ...btnStyle, opacity: loading || !canSubmit ? 0.65 : 1 }}>
          {loading ? "Adding..." : "Add Carrier"}
        </button>
      </div>
      {lookupLoading && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span className="fp-spinner" />
          <span style={{ fontSize: 12, color: "var(--mist)" }}>Checking FMCSA...</span>
        </div>
      )}
      {preview && (
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 10, marginBottom: 8, background: "var(--surface)" }}>
          <p className="fp-mono" style={{ fontSize: 11, color: "var(--mist)", margin: "0 0 6px" }}>LOOKUP PREVIEW</p>
          <p style={{ margin: "0 0 4px", fontSize: 13 }}><strong>Name:</strong> {(preview.legal_name as string) || "-"}</p>
          <p style={{ margin: "0 0 4px", fontSize: 13 }}><strong>MC#:</strong> {(preview.mc_number as string) || "-"}</p>
          <p style={{ margin: "0 0 4px", fontSize: 13 }}><strong>Power Units:</strong> {String(preview.power_units || "-")}</p>
          <p style={{ margin: 0, fontSize: 13 }}><strong>Safety:</strong> {(preview.safety_rating as string) || "-"}</p>
        </div>
      )}
      {lookupError && (
        <div style={{ marginBottom: 8 }}>
          <p style={{ color: "var(--red)", fontSize: 13, margin: "0 0 6px" }}>{lookupError}</p>
          {!manualMode && (
            <button type="button" onClick={switchToManual} style={{ ...btnStyle, background: "transparent", border: "1px solid var(--border)", color: "var(--mist)", fontSize: 13 }}>
              Enter Manually
            </button>
          )}
        </div>
      )}
      {!canSubmit && !loading && !lookupError && !manualMode && (
        <p style={{ color: "var(--mist)", fontSize: 12, margin: "0 0 8px" }}>Add Carrier is enabled after a successful lookup.</p>
      )}
      {error && <p style={{ color: "#ef4444", fontSize: 13, margin: 0 }}>{error}</p>}
      {result && (
        <p style={{ color: "#22c55e", fontSize: 13, margin: 0 }}>
          Added: {result.legal_name as string} (DOT {result.dot_number as string})
        </p>
      )}

      {/* Manual entry form */}
      {manualMode && (
        <div style={{ marginTop: 12, padding: 14, border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface)" }}>
          <h3 style={{ fontSize: 14, margin: "0 0 10px", color: "var(--amber)" }}>Manual Carrier Entry</h3>
          <p style={{ fontSize: 11, color: "var(--mist)", margin: "0 0 8px" }}>
            Carrier will be marked as &quot;Not Verified&quot; until FMCSA data is confirmed.
          </p>
          <div className="fp-form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
            <input placeholder="Legal Name *" value={manualName} onChange={(e) => setManualName(e.target.value)} style={inputStyle} />
            <input placeholder="MC Number" value={manualMc} onChange={(e) => setManualMc(e.target.value)} style={inputStyle} />
            <input placeholder="Address" value={manualAddress} onChange={(e) => setManualAddress(e.target.value)} style={inputStyle} />
            <input placeholder="Phone" value={manualPhone} onChange={(e) => setManualPhone(e.target.value)} style={inputStyle} />
            <input type="number" placeholder="Power Units" value={manualPowerUnits} onChange={(e) => setManualPowerUnits(e.target.value ? Number(e.target.value) : "")} style={inputStyle} />
          </div>
          <button type="button" onClick={handleManualAdd} disabled={loading || !manualName.trim()} style={{ ...btnStyle, opacity: loading || !manualName.trim() ? 0.65 : 1 }}>
            {loading ? "Adding..." : "Add Carrier (Unverified)"}
          </button>
        </div>
      )}
    </section>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "8px 12px", borderRadius: 6, border: "1px solid var(--border)",
  background: "var(--surface)", color: "var(--white)", fontSize: 14, flex: 1,
};
const btnStyle: React.CSSProperties = {
  padding: "8px 16px", borderRadius: 6, border: "none", background: "var(--amber)",
  color: "#000", fontSize: 14, cursor: "pointer", whiteSpace: "nowrap", fontWeight: 600,
};
