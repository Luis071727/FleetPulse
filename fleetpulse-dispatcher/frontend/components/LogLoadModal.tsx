"use client";

import { useEffect, useMemo, useState } from "react";
import { createLoad, analyzeLoad, listCarriers } from "../services/api";

type Carrier = { id: string; legal_name: string };

type Props = {
  carrierId?: string;
  onComplete?: () => void;
};

export default function LogLoadModal({ carrierId: initialCarrierId, onComplete }: Props) {
  const [selectedCarrierId, setSelectedCarrierId] = useState(initialCarrierId || "");
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [carrierSearch, setCarrierSearch] = useState("");
  const [rate, setRate] = useState<number | "">(2400);
  const [driverPay, setDriverPay] = useState<number | "">(800);
  const [fuelCost, setFuelCost] = useState<number | "">(400);
  const [tolls, setTolls] = useState<number | "">(0);
  const [miles, setMiles] = useState<number | "">(500);
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [brokerMc, setBrokerMc] = useState("");
  const [brokerName, setBrokerName] = useState("");
  const [pickupDate, setPickupDate] = useState(new Date().toISOString().slice(0, 10));
  const [deliveryDate, setDeliveryDate] = useState("");
  const [rcReference, setRcReference] = useState("");
  const [customerApEmail, setCustomerApEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedLoadId, setSavedLoadId] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<Record<string, unknown> | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const numRate = Number(rate) || 0;
  const numDriverPay = Number(driverPay) || 0;
  const numFuelCost = Number(fuelCost) || 0;
  const numTolls = Number(tolls) || 0;
  const numMiles = Number(miles) || 0;

  const netProfit = useMemo(() => numRate - numDriverPay - numFuelCost - numTolls, [numRate, numDriverPay, numFuelCost, numTolls]);
  const netRpm = useMemo(() => (numMiles ? netProfit / numMiles : 0), [numMiles, netProfit]);

  // Load carrier list when no carrierId is pre-selected
  useEffect(() => {
    if (!initialCarrierId) {
      listCarriers({ limit: 200 }).then((res) => {
        const data = (res.data as Carrier[]) || [];
        setCarriers(data);
      }).catch(() => {});
    }
  }, [initialCarrierId]);

  const filteredCarriers = carrierSearch
    ? carriers.filter((c) => c.legal_name?.toLowerCase().includes(carrierSearch.toLowerCase()))
    : carriers;

  const effectiveCarrierId = initialCarrierId || selectedCarrierId;

  const handleSave = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await createLoad({
        carrier_id: effectiveCarrierId,
        broker_mc: brokerMc,
        broker_name: brokerName || undefined,
        origin,
        destination,
        miles: numMiles,
        rate: numRate,
        driver_pay: numDriverPay,
        fuel_cost: numFuelCost,
        tolls: numTolls || undefined,
        pickup_date: pickupDate || undefined,
        delivery_date: deliveryDate || undefined,
        rc_reference: rcReference || undefined,
        customer_ap_email: customerApEmail || undefined,
      });
      if (res.error) {
        setError(res.error);
      } else {
        const data = res.data as Record<string, unknown>;
        const load = (data.load ?? data) as Record<string, unknown>;
        setSavedLoadId(load.id as string);
        // Auto-close after a short delay so the user sees the success message
        setTimeout(() => { onComplete?.(); }, 2000);
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  const handleAnalyze = async () => {
    if (!savedLoadId) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await analyzeLoad(savedLoadId);
      if (res.error) setAiError(res.error);
      else setAiResult(res.data as Record<string, unknown>);
    } catch {
      setAiError("AI service temporarily unavailable");
    } finally {
      setAiLoading(false);
    }
  };

  const badgeColor = (rec: string) =>
    rec === "GO" ? "#22c55e" : rec === "NEGOTIATE" ? "#f59e0b" : "#ef4444";

  return (
    <section>
      <h2 style={{ fontSize: 18, marginBottom: 16 }}>Log Load</h2>

      {/* Carrier selector — shown when no carrierId prop */}
      {!initialCarrierId && (
        <fieldset style={fieldsetStyle}>
          <legend style={legendStyle}>Carrier</legend>
          <input
            placeholder="Search carriers…"
            value={carrierSearch}
            onChange={(e) => setCarrierSearch(e.target.value)}
            style={{ ...inputStyle, width: "100%", marginBottom: 6 }}
          />
          <select
            value={selectedCarrierId}
            onChange={(e) => setSelectedCarrierId(e.target.value)}
            style={{ ...inputStyle, width: "100%" }}
          >
            <option value="">Select a carrier…</option>
            {filteredCarriers.map((c) => (
              <option key={c.id} value={c.id}>{c.legal_name}</option>
            ))}
          </select>
        </fieldset>
      )}

      {/* Route Details */}
      <fieldset style={fieldsetStyle}>
        <legend style={legendStyle}>Route Details</legend>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <LabeledInput label="Origin" value={origin} onChange={setOrigin} placeholder="City, ST" />
          <LabeledInput label="Destination" value={destination} onChange={setDestination} placeholder="City, ST" />
          <LabeledInput label="Miles" value={miles} onChange={(v) => setMiles(v ? Number(v) : "")} type="number" placeholder="0" />
          <div>
            <label style={labelStyle}>Pickup Date</label>
            <input type="date" value={pickupDate} onChange={(e) => setPickupDate(e.target.value)} style={{ ...inputStyle, width: "100%" }} />
          </div>
          <div>
            <label style={labelStyle}>Delivery Date</label>
            <input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} style={{ ...inputStyle, width: "100%" }} />
          </div>
        </div>
      </fieldset>

      {/* Broker Info */}
      <fieldset style={fieldsetStyle}>
        <legend style={legendStyle}>Broker Info</legend>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <LabeledInput label="Broker Name" value={brokerName} onChange={setBrokerName} placeholder="e.g. TQL, CH Robinson" />
          <LabeledInput label="Broker MC#" value={brokerMc} onChange={setBrokerMc} placeholder="MC number" />
          <LabeledInput label="Rate Confirmation #" value={rcReference} onChange={setRcReference} placeholder="RC# or PDF filename" />
          <LabeledInput label="Customer AP Email" value={customerApEmail} onChange={setCustomerApEmail} placeholder="ap@customer.com" type="email" />
        </div>
      </fieldset>

      {/* Financials */}
      <fieldset style={fieldsetStyle}>
        <legend style={legendStyle}>Financials</legend>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <LabeledInput label="Gross Rate ($)" value={rate} onChange={(v) => setRate(v ? Number(v) : "")} type="number" placeholder="0" />
          <LabeledInput label="Driver Pay ($)" value={driverPay} onChange={(v) => setDriverPay(v ? Number(v) : "")} type="number" placeholder="0" />
          <LabeledInput label="Fuel Cost ($)" value={fuelCost} onChange={(v) => setFuelCost(v ? Number(v) : "")} type="number" placeholder="0" />
          <LabeledInput label="Tolls ($)" value={tolls} onChange={(v) => setTolls(v ? Number(v) : "")} type="number" placeholder="0" />
        </div>
        {/* Live net profit preview */}
        <div style={{ display: "flex", gap: 20, marginTop: 10, fontSize: 14 }}>
          <span>Net Profit: <strong style={{ color: netProfit >= 0 ? "#22c55e" : "#ef4444" }}>
            ${netProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </strong></span>
          <span>Net RPM: <strong style={{ color: netRpm >= 1.5 ? "#22c55e" : netRpm >= 1.0 ? "#f59e0b" : "#ef4444" }}>
            ${netRpm.toFixed(2)}
          </strong></span>
        </div>
      </fieldset>

      {error && <p style={{ color: "#ef4444", fontSize: 13 }}>{error}</p>}

      {!savedLoadId ? (
        <button type="button" onClick={handleSave} disabled={loading || !effectiveCarrierId} style={{ ...btnPrimary, opacity: loading || !effectiveCarrierId ? 0.5 : 1 }}>
          {loading ? "Saving..." : "Save Load"}
        </button>
      ) : (
        <div>
          <p style={{ color: "#22c55e", fontSize: 13 }}>Load saved. Invoice created automatically.</p>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button type="button" onClick={handleAnalyze} disabled={aiLoading} style={btnPrimary}>
              {aiLoading ? "Analyzing..." : "Analyze with AI"}
            </button>
            <button type="button" onClick={onComplete} style={btnSecondary}>Done</button>
          </div>
        </div>
      )}

      {/* AI result display */}
      {aiResult && (
        <div style={{ marginTop: 12, padding: 12, borderRadius: 8, border: "1px solid #334155", background: "#1e293b" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{
              display: "inline-block", padding: "4px 12px", borderRadius: 20, fontSize: 14, fontWeight: 600,
              background: badgeColor(aiResult.recommendation as string),
              color: "#fff",
            }}>
              {aiResult.recommendation as string}
            </span>
            {aiResult.target_rate && (
              <span style={{ fontSize: 13, color: "#f59e0b" }}>
                Target rate: ${(aiResult.target_rate as number).toLocaleString()}
              </span>
            )}
          </div>
          <p style={{ fontSize: 13, color: "#cbd5e1", margin: 0 }}>{aiResult.reasoning as string}</p>
        </div>
      )}
      {aiError && (
        <div style={{ marginTop: 8 }}>
          <p style={{ color: "#ef4444", fontSize: 13 }}>{aiError}</p>
          <button type="button" onClick={handleAnalyze} disabled={aiLoading} style={btnSmall}>Retry</button>
        </div>
      )}
    </section>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "8px 12px", borderRadius: 6, border: "1px solid #334155",
  background: "#0f172a", color: "#f8fafc", fontSize: 14,
};
const labelStyle: React.CSSProperties = {
  fontSize: 11, color: "#94a3b8", display: "block", marginBottom: 3, fontWeight: 500,
};
const fieldsetStyle: React.CSSProperties = {
  border: "none", padding: 0, margin: "0 0 14px",
};
const legendStyle: React.CSSProperties = {
  fontSize: 13, fontWeight: 600, color: "#f8fafc", marginBottom: 8, display: "block",
  borderBottom: "1px solid #1e293b", paddingBottom: 4, width: "100%",
};
const btnPrimary: React.CSSProperties = {
  padding: "8px 16px", borderRadius: 6, border: "none", background: "#3b82f6",
  color: "#fff", fontSize: 14, cursor: "pointer",
};
const btnSecondary: React.CSSProperties = {
  padding: "8px 16px", borderRadius: 6, border: "1px solid #334155",
  background: "transparent", color: "#94a3b8", fontSize: 14, cursor: "pointer",
};
const btnSmall: React.CSSProperties = {
  padding: "4px 10px", borderRadius: 4, border: "1px solid #334155",
  background: "transparent", color: "#60a5fa", fontSize: 12, cursor: "pointer",
};

function LabeledInput({ label, value, onChange, type = "text", placeholder }: {
  label: string;
  value: string | number | "";
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ ...inputStyle, width: "100%" }}
      />
    </div>
  );
}
