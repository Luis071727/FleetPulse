"use client";

import { useCallback, useEffect, useState } from "react";
import { updateLoad, analyzeLoad, listMessages, sendMessage } from "../services/api";
import { X } from "./icons";

type Tab = "details" | "messages" | "ai";

type Load = Record<string, unknown>;
type Carrier = Record<string, unknown>;

type Message = {
  id: string;
  role: string;
  body: string;
  created_at: string;
};

type Props = {
  load: Load;
  carriers: Carrier[];
  onClose: () => void;
  onSaved: () => void;
};

const STATUS_OPTIONS = [
  { value: "logged",     label: "Logged",     color: "var(--blue-action)" },
  { value: "in_transit", label: "In Transit", color: "var(--purple)" },
  { value: "delivered",  label: "Delivered",  color: "var(--green)" },
  { value: "cancelled",  label: "Cancelled",  color: "var(--red)" },
];

export default function LoadDetailModal({ load, carriers, onClose, onSaved }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("details");

  // ── Details form state ──
  const [status, setStatus] = useState((load.status as string) || "logged");
  const [origin, setOrigin] = useState((load.origin as string) || "");
  const [destination, setDestination] = useState((load.destination as string) || "");
  const [miles, setMiles] = useState(String(load.miles || ""));
  const [pickupDate, setPickupDate] = useState((load.pickup_date as string) || "");
  const [deliveryDate, setDeliveryDate] = useState((load.delivery_date as string) || "");
  const [brokerName, setBrokerName] = useState((load.broker_name as string) || "");
  const [brokerMc, setBrokerMc] = useState((load.broker_mc as string) || "");
  const [rcReference, setRcReference] = useState((load.rc_reference as string) || "");
  const [customerApEmail, setCustomerApEmail] = useState((load.customer_ap_email as string) || "");
  const [rate, setRate] = useState(String(load.load_rate || load.rate || ""));
  const [driverPay, setDriverPay] = useState(String(load.driver_pay || ""));
  const [fuelCost, setFuelCost] = useState(String(load.fuel_cost || ""));
  const [tolls, setTolls] = useState(String(load.tolls || "0"));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // ── Messages state ──
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messageBody, setMessageBody] = useState("");
  const [messageSending, setMessageSending] = useState(false);

  // ── AI state ──
  const [aiResult, setAiResult] = useState<Load | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const loadId = load.id as string;
  const carrier = carriers.find((c) => c.id === load.carrier_id);

  // Live financials
  const numRate = Number(rate) || 0;
  const numDriverPay = Number(driverPay) || 0;
  const numFuelCost = Number(fuelCost) || 0;
  const numTolls = Number(tolls) || 0;
  const numMiles = Number(miles) || 0;
  const netProfit = numRate - numDriverPay - numFuelCost - numTolls;
  const netRpm = numMiles ? netProfit / numMiles : 0;

  const fetchMessages = useCallback(async () => {
    setMessagesLoading(true);
    try {
      const res = await listMessages(loadId);
      setMessages((res.data as Message[]) || []);
    } catch { /* */ }
    finally { setMessagesLoading(false); }
  }, [loadId]);

  useEffect(() => {
    if (activeTab === "messages") void fetchMessages();
  }, [activeTab, fetchMessages]);

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await updateLoad(loadId, {
        status,
        origin,
        destination,
        miles: numMiles,
        rate: numRate,
        driver_pay: numDriverPay,
        fuel_cost: numFuelCost,
        tolls: numTolls,
        broker_name: brokerName || undefined,
        broker_mc: brokerMc || undefined,
        rc_reference: rcReference || undefined,
        pickup_date: pickupDate || undefined,
        delivery_date: deliveryDate || undefined,
        customer_ap_email: customerApEmail || undefined,
      });
      if (res.error) setSaveError(res.error);
      else onSaved();
    } catch { setSaveError("Network error"); }
    finally { setSaving(false); }
  };

  const handleSendMessage = async () => {
    if (!messageBody.trim()) return;
    setMessageSending(true);
    try {
      await sendMessage(loadId, messageBody.trim());
      setMessageBody("");
      await fetchMessages();
    } catch { /* */ }
    finally { setMessageSending(false); }
  };

  const handleAnalyze = async (forceRefresh = false) => {
    setAnalyzing(true);
    setAiError(null);
    try {
      const res = await analyzeLoad(loadId, forceRefresh);
      if (res.error) setAiError(res.error);
      else setAiResult(res.data as Load);
    } catch { setAiError("AI service temporarily unavailable"); }
    finally { setAnalyzing(false); }
  };

  useEffect(() => {
    if (activeTab === "ai" && !aiResult && !analyzing) void handleAnalyze();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const msgsBadge = messages.length > 0 ? messages.length : null;
  const statusInfo = STATUS_OPTIONS.find((s) => s.value === status) || STATUS_OPTIONS[0];

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 100 }}
      onClick={onClose}
    >
      <div
        style={{ background: "var(--surface)", borderRadius: 14, padding: 24, width: 640, maxHeight: "88vh", overflowY: "auto", border: "1px solid var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
              {origin || "—"} → {destination || "—"}
            </h2>
            <div style={{ display: "flex", gap: 10, marginTop: 5, alignItems: "center" }}>
              {carrier && (
                <span style={{ fontSize: 12, color: "var(--mist)" }}>
                  {carrier.legal_name as string}
                </span>
              )}
              {load.rc_reference && (
                <span className="fp-mono" style={{ fontSize: 11, color: "var(--mist)" }}>RC# {load.rc_reference as string}</span>
              )}
              <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, fontWeight: 700, background: `${statusInfo.color}22`, color: statusInfo.color, textTransform: "uppercase" as const }}>
                {statusInfo.label}
              </span>
            </div>
          </div>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", color: "var(--mist)", cursor: "pointer", display: "flex", alignItems: "center" }}>
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 20, background: "var(--bg)", borderRadius: 8, padding: 4 }}>
          {(["details", "messages", "ai"] as Tab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              style={{
                flex: 1, padding: "7px 12px", borderRadius: 6, border: "none", cursor: "pointer",
                fontSize: 13, fontWeight: 600, transition: "all 0.15s",
                background: activeTab === tab ? "var(--surface)" : "transparent",
                color: activeTab === tab ? "var(--white)" : "var(--mist)",
                boxShadow: activeTab === tab ? "0 1px 3px rgba(0,0,0,0.4)" : "none",
              }}
            >
              {tab === "details" ? "Load Details" : tab === "messages" ? (
                <span>
                  Messages{msgsBadge && activeTab === "messages" ? (
                    <span style={{ marginLeft: 6, background: "var(--blue-action)", color: "#fff", borderRadius: 10, fontSize: 10, padding: "1px 6px", fontWeight: 700 }}>
                      {msgsBadge}
                    </span>
                  ) : null}
                </span>
              ) : "AI Analysis"}
            </button>
          ))}
        </div>

        {/* ── Details tab ── */}
        {activeTab === "details" && (
          <>
            {/* Status */}
            <div style={{ marginBottom: 16 }}>
              <label style={lblStyle}>Status</label>
              <div style={{ display: "flex", gap: 6 }}>
                {STATUS_OPTIONS.filter((s) => s.value !== "cancelled").map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setStatus(s.value)}
                    style={{
                      padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer", border: "none",
                      background: status === s.value ? `${s.color}33` : "var(--bg)",
                      color: status === s.value ? s.color : "var(--mist)",
                      outline: status === s.value ? `2px solid ${s.color}88` : "2px solid transparent",
                    }}
                  >
                    {s.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setStatus("cancelled")}
                  style={{
                    padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer", border: "none", marginLeft: "auto",
                    background: status === "cancelled" ? "color-mix(in srgb, var(--red) 15%, transparent)" : "var(--bg)",
                    color: status === "cancelled" ? "var(--red)" : "var(--mist)",
                    outline: status === "cancelled" ? "2px solid color-mix(in srgb, var(--red) 50%, transparent)" : "2px solid transparent",
                  }}
                >
                  Cancelled
                </button>
              </div>
            </div>

            {/* Route */}
            <SectionLabel>Route</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
              <div>
                <label style={lblStyle}>Origin</label>
                <input value={origin} onChange={(e) => setOrigin(e.target.value)} style={inpStyle} placeholder="City, ST" />
              </div>
              <div>
                <label style={lblStyle}>Destination</label>
                <input value={destination} onChange={(e) => setDestination(e.target.value)} style={inpStyle} placeholder="City, ST" />
              </div>
              <div>
                <label style={lblStyle}>Miles</label>
                <input type="number" value={miles} onChange={(e) => setMiles(e.target.value)} style={inpStyle} />
              </div>
              <div />
              <div>
                <label style={lblStyle}>Pickup Date</label>
                <input type="date" value={pickupDate} onChange={(e) => setPickupDate(e.target.value)} style={inpStyle} />
              </div>
              <div>
                <label style={lblStyle}>Delivery Date</label>
                <input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} style={inpStyle} />
              </div>
            </div>

            {/* Broker */}
            <SectionLabel>Broker</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
              <div>
                <label style={lblStyle}>Broker Name</label>
                <input value={brokerName} onChange={(e) => setBrokerName(e.target.value)} style={inpStyle} placeholder="e.g. TQL, CH Robinson" />
              </div>
              <div>
                <label style={lblStyle}>Broker MC#</label>
                <input value={brokerMc} onChange={(e) => setBrokerMc(e.target.value)} style={inpStyle} />
              </div>
              <div>
                <label style={lblStyle}>Rate Confirmation #</label>
                <input value={rcReference} onChange={(e) => setRcReference(e.target.value)} style={inpStyle} placeholder="RC# or PDF filename" />
              </div>
              <div>
                <label style={lblStyle}>Customer AP Email</label>
                <input type="email" value={customerApEmail} onChange={(e) => setCustomerApEmail(e.target.value)} style={inpStyle} placeholder="ap@customer.com" />
              </div>
            </div>

            {/* Financials */}
            <SectionLabel>Financials</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
              <div>
                <label style={lblStyle}>Gross Rate ($)</label>
                <input type="number" value={rate} onChange={(e) => setRate(e.target.value)} style={inpStyle} />
              </div>
              <div>
                <label style={lblStyle}>Driver Pay ($)</label>
                <input type="number" value={driverPay} onChange={(e) => setDriverPay(e.target.value)} style={inpStyle} />
              </div>
              <div>
                <label style={lblStyle}>Fuel Cost ($)</label>
                <input type="number" value={fuelCost} onChange={(e) => setFuelCost(e.target.value)} style={inpStyle} />
              </div>
              <div>
                <label style={lblStyle}>Tolls ($)</label>
                <input type="number" value={tolls} onChange={(e) => setTolls(e.target.value)} style={inpStyle} />
              </div>
            </div>

            {/* Live financial summary */}
            <div style={{ display: "flex", gap: 16, padding: "10px 14px", background: "var(--bg)", borderRadius: 8, marginBottom: 16, flexWrap: "wrap" }}>
              <Metric label="Net Profit" value={`$${netProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}`} color={netProfit >= 0 ? "var(--green)" : "var(--red)"} />
              <Metric label="Net RPM"    value={`$${netRpm.toFixed(2)}`}                                                 color={netRpm >= 1.5 ? "var(--green)" : netRpm >= 1.0 ? "var(--amber)" : "var(--red)"} />
              <Metric label="Gross RPM"  value={numMiles ? `$${(numRate / numMiles).toFixed(2)}` : "—"}                  color="var(--white)" />
              <Metric label="Margin"     value={numRate ? `${Math.round((netProfit / numRate) * 100)}%` : "—"}           color={netProfit >= 0 ? "var(--green)" : "var(--red)"} />
            </div>

            {saveError && <p style={{ color: "var(--red)", fontSize: 13, marginBottom: 8 }}>{saveError}</p>}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" onClick={onClose} className="fp-btn fp-btn--ghost">Cancel</button>
              <button type="button" onClick={handleSave} disabled={saving} className="fp-btn fp-btn--primary">
                {saving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </>
        )}

        {/* ── Messages tab ── */}
        {activeTab === "messages" && (
          <div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14, maxHeight: 380, overflowY: "auto", paddingRight: 4 }}>
              {messagesLoading ? (
                <p style={{ fontSize: 13, color: "var(--mist)", textAlign: "center", padding: "24px 0" }}>Loading…</p>
              ) : messages.length === 0 ? (
                <div style={{ textAlign: "center", padding: "32px 0" }}>
                  <p style={{ fontSize: 15, fontWeight: 600, margin: "0 0 6px" }}>No messages yet</p>
                  <p style={{ fontSize: 13, color: "var(--mist)", margin: 0 }}>Start a conversation with the carrier below.</p>
                </div>
              ) : (
                messages.map((msg) => {
                  const isDispatcher = msg.role === "dispatcher";
                  return (
                    <div key={msg.id} style={{ display: "flex", flexDirection: "column", alignItems: isDispatcher ? "flex-end" : "flex-start" }}>
                      <div style={{
                        maxWidth: "75%", padding: "8px 12px", borderRadius: 10,
                        background: isDispatcher ? "color-mix(in srgb, var(--amber) 12%, var(--surface))" : "var(--surface2)",
                        border: `1px solid ${isDispatcher ? "color-mix(in srgb, var(--amber) 25%, transparent)" : "var(--border-input)"}`,
                      }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                          <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 8, fontWeight: 600, background: isDispatcher ? "color-mix(in srgb, var(--amber) 20%, transparent)" : "color-mix(in srgb, var(--mist) 20%, transparent)", color: isDispatcher ? "var(--amber)" : "var(--mistLt)", textTransform: "uppercase" as const }}>
                            {msg.role}
                          </span>
                          <span style={{ fontSize: 11, color: "var(--mist)" }}>
                            {msg.created_at ? new Date(msg.created_at).toLocaleString() : ""}
                          </span>
                        </div>
                        <p style={{ margin: 0, fontSize: 13, color: "var(--white)" }}>{msg.body}</p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            <div style={{ display: "flex", gap: 8, borderTop: "1px solid var(--border)", paddingTop: 14 }}>
              <input
                value={messageBody}
                onChange={(e) => setMessageBody(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void handleSendMessage(); } }}
                style={{ ...inpStyle, flex: 1 }}
                placeholder="Type a message to the carrier…"
              />
              <button
                type="button"
                onClick={() => void handleSendMessage()}
                disabled={messageSending || !messageBody.trim()}
                className="fp-btn fp-btn--primary"
              >
                {messageSending ? "…" : "Send"}
              </button>
            </div>
          </div>
        )}

        {/* ── AI Analysis tab ── */}
        {activeTab === "ai" && (
          <div>
            {analyzing ? (
              <div style={{ textAlign: "center", padding: "40px 0" }}>
                <p style={{ fontSize: 14, color: "var(--mist)" }}>Analyzing load…</p>
              </div>
            ) : aiError ? (
              <div style={{ textAlign: "center", padding: "32px 0" }}>
                <p style={{ color: "var(--red)", fontSize: 13, marginBottom: 12 }}>{aiError}</p>
                <button type="button" onClick={() => void handleAnalyze(true)} className="fp-btn fp-btn--primary">Retry</button>
              </div>
            ) : aiResult ? (
              <div>
                {/* Recommendation badge */}
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
                  <span style={{
                    padding: "8px 20px", borderRadius: 20, fontSize: 16, fontWeight: 700,
                    background: recColor(aiResult.recommendation as string),
                    color: "#fff",
                  }}>
                    {aiResult.recommendation as string}
                  </span>
                  {aiResult.target_rate && (
                    <div>
                      <p style={{ margin: 0, fontSize: 11, color: "var(--mist)" }}>Target Rate</p>
                      <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--amber)" }}>
                        ${Number(aiResult.target_rate).toLocaleString()}
                      </p>
                    </div>
                  )}
                  {aiResult.cache_hit && (
                    <span style={{ fontSize: 11, color: "var(--mist)", marginLeft: "auto" }}>cached</span>
                  )}
                </div>

                {/* Key metrics */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 16 }}>
                  <MetricBox label="Net RPM" value={`$${Number(load.net_rpm || 0).toFixed(2)}`} threshold={Number(load.net_rpm || 0) >= 1.5 ? "good" : Number(load.net_rpm || 0) >= 1.0 ? "warn" : "bad"} />
                  <MetricBox label="Net Profit" value={`$${Number(load.net_profit || 0).toLocaleString()}`} threshold={Number(load.net_profit || 0) >= 0 ? "good" : "bad"} />
                  <MetricBox label="Broker Trust" value={aiResult.broker_trust != null ? `${aiResult.broker_trust as number}` : "—"} threshold={(aiResult.broker_trust as number) >= 70 ? "good" : (aiResult.broker_trust as number) >= 50 ? "warn" : "bad"} />
                </div>

                {/* Reasoning */}
                <div style={{ padding: "14px 16px", background: "var(--bg)", borderRadius: 10, marginBottom: 16 }}>
                  <p style={{ margin: "0 0 6px", fontSize: 11, color: "var(--mist)", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.05em" }}>Reasoning</p>
                  <p style={{ margin: 0, fontSize: 13, color: "var(--white)", lineHeight: 1.6 }}>{aiResult.reasoning as string}</p>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button type="button" onClick={() => void handleAnalyze(true)} disabled={analyzing} className="fp-btn fp-btn--ghost" style={{ fontSize: 13 }}>
                    Refresh Analysis
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 11, color: "var(--mist)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 8px", borderBottom: "1px solid var(--border)", paddingBottom: 6 }}>
      {children}
    </p>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <p style={{ margin: 0, fontSize: 10, color: "var(--mist)", fontWeight: 500 }}>{label}</p>
      <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color }}>{value}</p>
    </div>
  );
}

function MetricBox({ label, value, threshold }: { label: string; value: string; threshold: "good" | "warn" | "bad" }) {
  const color = threshold === "good" ? "var(--green)" : threshold === "warn" ? "var(--amber)" : "var(--red)";
  return (
    <div style={{ padding: "10px 12px", background: "var(--bg)", borderRadius: 8, border: `1px solid color-mix(in srgb, ${color} 20%, transparent)` }}>
      <p style={{ margin: "0 0 4px", fontSize: 10, color: "var(--mist)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</p>
      <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color }}>{value}</p>
    </div>
  );
}

function recColor(rec: string) {
  if (rec === "GO")        return "var(--green)";
  if (rec === "NEGOTIATE") return "var(--amber)";
  return "var(--red)";
}

const lblStyle: React.CSSProperties = { fontSize: 11, color: "var(--mist)", display: "block", marginBottom: 3, fontWeight: 500 };
const inpStyle: React.CSSProperties = { padding: "8px 12px", borderRadius: 6, border: "1px solid var(--border-input)", background: "var(--input-bg)", color: "var(--white)", fontSize: 14, width: "100%", boxSizing: "border-box" as const };
