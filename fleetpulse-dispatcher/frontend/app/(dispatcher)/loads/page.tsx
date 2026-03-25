"use client";

import { useCallback, useEffect, useState } from "react";
import { listLoads, listCarriers, analyzeLoad, updateLoad, deleteLoad, getLoad, listDocumentRequests, createDocumentRequest, updateDocumentRequest, deleteDocumentRequest, listMessages, sendMessage } from "../../../services/api";
import { X } from "../../../components/icons";
import LogLoadModal from "../../../components/LogLoadModal";

type R = Record<string, unknown>;

const STATUS_FILTERS = ["all", "logged", "in_transit", "delivered"];

export default function LoadsPage() {
  const [loads, setLoads] = useState<R[]>([]);
  const [carriers, setCarriers] = useState<R[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [carrierFilter, setCarrierFilter] = useState("");
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<R | null>(null);
  const [showAddLoad, setShowAddLoad] = useState(false);
  const [editingLoad, setEditingLoad] = useState<R | null>(null);

  const fetchLoads = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listLoads({
        status: statusFilter === "all" ? undefined : statusFilter,
        carrier_id: carrierFilter || undefined,
        limit: 100,
      });
      setLoads((res.data as R[]) || []);
      setTotal((res.meta?.total as number) || 0);
    } catch { /* */ }
    finally { setLoading(false); }
  }, [statusFilter, carrierFilter]);

  useEffect(() => { fetchLoads(); }, [fetchLoads]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const loadId = new URLSearchParams(window.location.search).get("loadId");
    if (!loadId) return;

    const existing = loads.find((load) => load.id === loadId);
    if (existing) {
      setEditingLoad(existing);
      return;
    }

    getLoad(loadId).then((res) => {
      if (res.data) setEditingLoad(res.data as R);
    }).catch(() => {});
  }, [loads]);

  const clearLoadQuery = useCallback(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    params.delete("loadId");
    const next = params.toString();
    window.history.replaceState(null, "", next ? `/loads?${next}` : "/loads");
  }, []);

  useEffect(() => {
    listCarriers({ limit: 200 }).then((res) => {
      setCarriers((res.data as R[]) || []);
    }).catch(() => {});
  }, []);

  const handleAnalyze = async (loadId: string) => {
    setAnalyzing(loadId);
    setAiResult(null);
    try {
      const res = await analyzeLoad(loadId);
      if (res.data) setAiResult(res.data as R);
    } catch { /* */ }
    finally { setAnalyzing(null); }
  };

  const statusColor = (s: string) => {
    if (s === "delivered") return "#22c55e";
    if (s === "in_transit") return "#a78bfa";
    if (s === "logged") return "#60a5fa";
    return "#64748b";
  };

  const badgeColor = (rec: string) =>
    rec === "GO" ? "#22c55e" : rec === "NEGOTIATE" ? "#f59e0b" : "#ef4444";

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, margin: 0, fontWeight: 600 }}>Loads</h1>
        <button type="button" onClick={() => setShowAddLoad(true)} style={btnAdd}>
          + Add Load
        </button>
      </div>

      {/* Filter bar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        {STATUS_FILTERS.map((f) => (
          <button key={f} type="button" onClick={() => setStatusFilter(f)}
            className={`fp-chip${statusFilter === f ? " fp-chip--active" : ""}`}>
            {f === "all" ? "All" : f === "in_transit" ? "In Transit" : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
        <select value={carrierFilter} onChange={(e) => setCarrierFilter(e.target.value)}
          style={{ marginLeft: "auto", padding: "6px 10px", borderRadius: 6, border: "1px solid #334155", background: "#0f172a", color: "#f8fafc", fontSize: 13 }}>
          <option value="">All Carriers</option>
          {carriers.map((c) => (
            <option key={c.id as string} value={c.id as string}>{c.legal_name as string}</option>
          ))}
        </select>
      </div>

      <p style={{ fontSize: 12, color: "#64748b", marginBottom: 10 }}>
        {loading ? "Loading…" : `${total} load${total !== 1 ? "s" : ""}`}
      </p>

      {/* Loads table */}
      <div className="fp-table-wrap">
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid #1e293b" }}>
            <th style={thStyle}>Route</th>
            <th style={thStyle}>Carrier</th>
            <th style={thStyle}>Customer</th>
            <th style={thStyle}>RC#</th>
            <th style={thStyle}>Rate</th>
            <th style={thStyle}>Net Profit</th>
            <th style={thStyle}>RPM</th>
            <th style={thStyle}>Miles</th>
            <th style={thStyle}>Status</th>
            <th style={thStyle}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {loads.map((ld) => {
            const st = (ld.status as string) || "logged";
            const carrier = carriers.find((c) => c.id === ld.carrier_id);
            return (
              <tr key={ld.id as string} style={{ borderBottom: "1px solid #0f172a" }}>
                <td style={tdStyle}>
                  {(ld.route as string) || `${ld.origin || "—"} → ${ld.destination || "—"}`}
                </td>
                <td style={tdStyle}>
                  <span style={{ fontSize: 13 }}>{(carrier?.legal_name as string) || "—"}</span>
                </td>
                <td style={tdStyle}>
                  <span style={{ fontSize: 12, color: "#94a3b8" }}>{(ld.broker_name as string) || "—"}</span>
                </td>
                <td style={tdStyle}>
                  <span className="fp-mono" style={{ fontSize: 12, color: "#94a3b8" }}>{(ld.rc_reference as string) || "—"}</span>
                </td>
                <td style={tdStyle}>${Number(ld.load_rate || ld.rate || 0).toLocaleString()}</td>
                <td style={tdStyle}>
                  <span style={{ color: Number(ld.net_profit || 0) >= 0 ? "#22c55e" : "#ef4444" }}>
                    ${Number(ld.net_profit || 0).toLocaleString()}
                  </span>
                </td>
                <td style={tdStyle}>
                  <span style={{ color: Number(ld.net_rpm || 0) >= 1.5 ? "#22c55e" : Number(ld.net_rpm || 0) >= 1.0 ? "#f59e0b" : "#ef4444" }}>
                    ${Number(ld.net_rpm || 0).toFixed(2)}
                  </span>
                </td>
                <td style={tdStyle}>{Number(ld.miles || 0).toLocaleString()}</td>
                <td style={tdStyle}>
                  <select
                    value={st}
                    onChange={async (e) => {
                      const newStatus = e.target.value;
                      await updateLoad(ld.id as string, { status: newStatus });
                      fetchLoads();
                    }}
                    style={{
                      fontSize: 11, padding: "2px 8px", borderRadius: 10, fontWeight: 600,
                      background: `${statusColor(st)}22`, color: statusColor(st),
                      border: `1px solid ${statusColor(st)}44`, cursor: "pointer",
                      textTransform: "uppercase",
                    }}
                  >
                    <option value="logged">Logged</option>
                    <option value="in_transit">In Transit</option>
                    <option value="delivered">Delivered</option>
                  </select>
                </td>
                <td style={tdStyle}>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button type="button" onClick={() => setEditingLoad(ld)}
                      style={btnSmall}>
                      Edit
                    </button>
                    <button type="button" onClick={() => handleAnalyze(ld.id as string)}
                      disabled={analyzing === (ld.id as string)}
                      style={btnSmall}>
                      {analyzing === (ld.id as string) ? "…" : "AI Analysis"}
                    </button>
                    <button type="button" onClick={async () => {
                      if (!confirm("Delete this load and its invoice?")) return;
                      await deleteLoad(ld.id as string);
                      fetchLoads();
                    }} style={{ ...btnSmall, color: "#ef4444", borderColor: "#ef444444" }}>
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
          {loads.length === 0 && !loading && (
            <tr><td colSpan={10} style={{ ...tdStyle, textAlign: "center", color: "#64748b", padding: 40 }}>
              No loads yet. Log a load from a carrier&apos;s detail pane.
            </td></tr>
          )}
        </tbody>
      </table>
      </div>

      {/* AI Analysis Result Overlay */}
      {aiResult && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 100 }}
          onClick={() => setAiResult(null)}>
          <div className="fp-modal" style={{ background: "#0f172a", borderRadius: 12, padding: 24, width: 480, border: "1px solid #1e293b" }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>AI Load Analysis</h3>
              <button type="button" onClick={() => setAiResult(null)}
                style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 18, display: "flex", alignItems: "center" }}><X size={18} /></button>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <span style={{
                display: "inline-block", padding: "4px 14px", borderRadius: 20, fontSize: 14, fontWeight: 600,
                background: badgeColor(aiResult.recommendation as string), color: "#fff",
              }}>{aiResult.recommendation as string}</span>
              {aiResult.target_rate && (
                <span style={{ fontSize: 13, color: "#f59e0b" }}>Target: ${Number(aiResult.target_rate).toLocaleString()}</span>
              )}
              {aiResult.cache_hit && <span style={{ fontSize: 11, color: "#64748b" }}>(cached)</span>}
            </div>
            <p style={{ fontSize: 13, color: "#cbd5e1", margin: 0 }}>{aiResult.reasoning as string}</p>
          </div>
        </div>
      )}

      {/* Add Load Modal */}
      {showAddLoad && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 100 }}>
          <div className="fp-modal" style={{ background: "#0f172a", borderRadius: 12, padding: 24, width: 480, maxHeight: "80vh", overflowY: "auto", border: "1px solid #1e293b" }}>
            <button type="button" onClick={() => setShowAddLoad(false)}
              style={{ float: "right", background: "none", border: "none", color: "#64748b", cursor: "pointer", display: "flex", alignItems: "center" }}><X size={18} /></button>
            <LogLoadModal onComplete={() => { setShowAddLoad(false); fetchLoads(); }} />
          </div>
        </div>
      )}

      {/* Edit Load Modal */}
      {editingLoad && (
        <EditLoadModal
          load={editingLoad}
          carriers={carriers}
          onClose={() => { setEditingLoad(null); clearLoadQuery(); }}
          onSaved={() => { setEditingLoad(null); clearLoadQuery(); fetchLoads(); }}
        />
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = { padding: "8px 10px", fontSize: 12, color: "#64748b", textAlign: "left" };
const tdStyle: React.CSSProperties = { padding: "8px 10px", fontSize: 13 };
const btnSmall: React.CSSProperties = { padding: "3px 10px", borderRadius: 4, border: "1px solid #334155", background: "transparent", color: "#60a5fa", fontSize: 12, cursor: "pointer" };
const btnAdd: React.CSSProperties = {
  padding: "8px 16px", borderRadius: 6, border: "none", background: "var(--amber)",
  color: "#000", fontSize: 14, cursor: "pointer", fontWeight: 600,
};

/* ── Edit Load Modal ── */

function EditLoadModal({ load, carriers, onClose, onSaved }: {
  load: R; carriers: R[]; onClose: () => void; onSaved: () => void;
}) {
  const [origin, setOrigin] = useState((load.origin as string) || "");
  const [destination, setDestination] = useState((load.destination as string) || "");
  const [miles, setMiles] = useState(String(load.miles || ""));
  const [rate, setRate] = useState(String(load.load_rate || load.rate || ""));
  const [driverPay, setDriverPay] = useState(String(load.driver_pay || ""));
  const [fuelCost, setFuelCost] = useState(String(load.fuel_cost || ""));
  const [tolls, setTolls] = useState(String(load.tolls || "0"));
  const [brokerName, setBrokerName] = useState((load.broker_name as string) || "");
  const [rcReference, setRcReference] = useState((load.rc_reference as string) || "");
  const [pickupDate, setPickupDate] = useState((load.pickup_date as string) || "");
  const [deliveryDate, setDeliveryDate] = useState((load.delivery_date as string) || "");
  const [customerApEmail, setCustomerApEmail] = useState((load.customer_ap_email as string) || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Document Requests state
  const [docRequests, setDocRequests] = useState<R[]>([]);
  const [docRequestsLoading, setDocRequestsLoading] = useState(true);
  const [newDocType, setNewDocType] = useState("BOL");
  const [newDocNotes, setNewDocNotes] = useState("");
  const [docRequestSaving, setDocRequestSaving] = useState(false);

  // Messages state
  const [messages, setMessages] = useState<R[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(true);
  const [messageBody, setMessageBody] = useState("");
  const [messageSending, setMessageSending] = useState(false);

  const loadId = load.id as string;

  const fetchDocRequests = useCallback(async () => {
    setDocRequestsLoading(true);
    try {
      const res = await listDocumentRequests(loadId);
      setDocRequests((res.data as R[]) || []);
    } catch { /* */ }
    finally { setDocRequestsLoading(false); }
  }, [loadId]);

  const fetchMessages = useCallback(async () => {
    setMessagesLoading(true);
    try {
      const res = await listMessages(loadId);
      setMessages((res.data as R[]) || []);
    } catch { /* */ }
    finally { setMessagesLoading(false); }
  }, [loadId]);

  useEffect(() => {
    fetchDocRequests();
    fetchMessages();
  }, [fetchDocRequests, fetchMessages]);

  const numRate = Number(rate) || 0;
  const numDriverPay = Number(driverPay) || 0;
  const numFuelCost = Number(fuelCost) || 0;
  const numTolls = Number(tolls) || 0;
  const numMiles = Number(miles) || 0;
  const netProfit = numRate - numDriverPay - numFuelCost - numTolls;
  const netRpm = numMiles ? netProfit / numMiles : 0;

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await updateLoad(load.id as string, {
        origin,
        destination,
        miles: numMiles,
        rate: numRate,
        driver_pay: numDriverPay,
        fuel_cost: numFuelCost,
        tolls: numTolls,
        broker_name: brokerName || undefined,
        rc_reference: rcReference || undefined,
        pickup_date: pickupDate || undefined,
        delivery_date: deliveryDate || undefined,
        customer_ap_email: customerApEmail || undefined,
      });
      if (res.error) setError(res.error);
      else onSaved();
    } catch { setError("Network error"); }
    finally { setSaving(false); }
  };

  const handleCreateDocRequest = async () => {
    setDocRequestSaving(true);
    try {
      await createDocumentRequest(loadId, { doc_type: newDocType, notes: newDocNotes || undefined });
      setNewDocNotes("");
      await fetchDocRequests();
    } catch { /* */ }
    finally { setDocRequestSaving(false); }
  };

  const handleUpdateDocRequest = async (requestId: string, newStatus: string) => {
    try {
      await updateDocumentRequest(loadId, requestId, { status: newStatus });
      await fetchDocRequests();
    } catch { /* */ }
  };

  const handleDeleteDocRequest = async (requestId: string) => {
    if (!confirm("Delete this document request?")) return;
    try {
      await deleteDocumentRequest(loadId, requestId);
      await fetchDocRequests();
    } catch { /* */ }
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

  const docStatusColor = (s: string) => {
    if (s === "approved") return "#22c55e";
    if (s === "uploaded") return "#60a5fa";
    if (s === "rejected") return "#ef4444";
    return "#f59e0b"; // pending
  };

  const inputStyle: React.CSSProperties = {
    padding: "8px 12px", borderRadius: 6, border: "1px solid #334155",
    background: "#0f172a", color: "#f8fafc", fontSize: 14, width: "100%",
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 11, color: "#94a3b8", display: "block", marginBottom: 3, fontWeight: 500,
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 100 }}
      onClick={onClose}>
      <div className="fp-modal" style={{ background: "#0f172a", borderRadius: 12, padding: 24, width: 640, maxHeight: "88vh", overflowY: "auto", border: "1px solid #1e293b" }}
        onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Edit Load</h2>
          <button type="button" onClick={onClose}
            style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", display: "flex", alignItems: "center" }}><X size={18} /></button>
        </div>

        <div className="fp-form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
          <div><label style={labelStyle}>Origin</label><input value={origin} onChange={e => setOrigin(e.target.value)} style={inputStyle} placeholder="City, ST" /></div>
          <div><label style={labelStyle}>Destination</label><input value={destination} onChange={e => setDestination(e.target.value)} style={inputStyle} placeholder="City, ST" /></div>
          <div><label style={labelStyle}>Miles</label><input type="number" value={miles} onChange={e => setMiles(e.target.value)} style={inputStyle} /></div>
          <div><label style={labelStyle}>Pickup Date</label><input type="date" value={pickupDate} onChange={e => setPickupDate(e.target.value)} style={inputStyle} /></div>
          <div><label style={labelStyle}>Delivery Date</label><input type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} style={inputStyle} /></div>
          <div><label style={labelStyle}>Broker Name</label><input value={brokerName} onChange={e => setBrokerName(e.target.value)} style={inputStyle} /></div>
          <div><label style={labelStyle}>RC#</label><input value={rcReference} onChange={e => setRcReference(e.target.value)} style={inputStyle} /></div>
          <div><label style={labelStyle}>Customer AP Email</label><input type="email" value={customerApEmail} onChange={e => setCustomerApEmail(e.target.value)} style={inputStyle} placeholder="ap@customer.com" /></div>
        </div>

        <div style={{ borderTop: "1px solid #1e293b", paddingTop: 12, marginBottom: 14 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#f8fafc" }}>Financials</span>
          <div className="fp-form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 8 }}>
            <div><label style={labelStyle}>Rate ($)</label><input type="number" value={rate} onChange={e => setRate(e.target.value)} style={inputStyle} /></div>
            <div><label style={labelStyle}>Driver Pay ($)</label><input type="number" value={driverPay} onChange={e => setDriverPay(e.target.value)} style={inputStyle} /></div>
            <div><label style={labelStyle}>Fuel Cost ($)</label><input type="number" value={fuelCost} onChange={e => setFuelCost(e.target.value)} style={inputStyle} /></div>
            <div><label style={labelStyle}>Tolls ($)</label><input type="number" value={tolls} onChange={e => setTolls(e.target.value)} style={inputStyle} /></div>
          </div>
          <div style={{ display: "flex", gap: 20, marginTop: 10, fontSize: 14 }}>
            <span>Net Profit: <strong style={{ color: netProfit >= 0 ? "#22c55e" : "#ef4444" }}>${netProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></span>
            <span>Net RPM: <strong style={{ color: netRpm >= 1.5 ? "#22c55e" : netRpm >= 1.0 ? "#f59e0b" : "#ef4444" }}>${netRpm.toFixed(2)}</strong></span>
          </div>
        </div>

        {error && <p style={{ color: "#ef4444", fontSize: 13 }}>{error}</p>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginBottom: 20 }}>
          <button type="button" onClick={onClose} style={{ padding: "8px 16px", borderRadius: 6, border: "1px solid #334155", background: "transparent", color: "#94a3b8", fontSize: 14, cursor: "pointer" }}>Cancel</button>
          <button type="button" onClick={handleSave} disabled={saving} style={{ ...btnAdd, opacity: saving ? 0.6 : 1 }}>
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>

        {/* ── Document Requests ── */}
        <div style={{ borderTop: "1px solid #1e293b", paddingTop: 16, marginBottom: 20 }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 600, color: "#f8fafc" }}>Document Requests</h3>

          {/* Create form */}
          <div style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "flex-end" }}>
            <div style={{ flex: "0 0 140px" }}>
              <label style={labelStyle}>Doc Type</label>
              <select value={newDocType} onChange={e => setNewDocType(e.target.value)}
                style={{ ...inputStyle, padding: "7px 10px" }}>
                {["BOL", "POD", "RATE_CON", "INVOICE", "OTHER"].map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Notes (optional)</label>
              <input value={newDocNotes} onChange={e => setNewDocNotes(e.target.value)}
                style={inputStyle} placeholder="e.g. Signed BOL required" />
            </div>
            <button type="button" onClick={handleCreateDocRequest} disabled={docRequestSaving}
              style={{ padding: "8px 14px", borderRadius: 6, border: "none", background: "#f59e0b", color: "#000", fontSize: 13, cursor: "pointer", fontWeight: 600, opacity: docRequestSaving ? 0.6 : 1, whiteSpace: "nowrap" }}>
              {docRequestSaving ? "…" : "Request Document"}
            </button>
          </div>

          {/* List */}
          {docRequestsLoading ? (
            <p style={{ fontSize: 13, color: "#64748b" }}>Loading…</p>
          ) : docRequests.length === 0 ? (
            <p style={{ fontSize: 13, color: "#64748b" }}>No document requests yet.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {docRequests.map((dr) => {
                const st = dr.status as string;
                return (
                  <div key={dr.id as string} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 8, background: "#0f172a", border: "1px solid #1e293b" }}>
                    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 10, fontWeight: 700, background: "#334155", color: "#f8fafc", whiteSpace: "nowrap" }}>
                      {dr.doc_type as string}
                    </span>
                    <span style={{ flex: 1, fontSize: 13, color: "#94a3b8" }}>{(dr.notes as string) || "—"}</span>
                    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 10, fontWeight: 600, background: `${docStatusColor(st)}22`, color: docStatusColor(st), textTransform: "uppercase", whiteSpace: "nowrap" }}>
                      {st}
                    </span>
                    {st !== "approved" && st !== "rejected" && (
                      <>
                        <button type="button" onClick={() => handleUpdateDocRequest(dr.id as string, "approved")}
                          style={{ padding: "3px 8px", borderRadius: 4, border: "1px solid #22c55e44", background: "transparent", color: "#22c55e", fontSize: 11, cursor: "pointer" }}>
                          Approve
                        </button>
                        <button type="button" onClick={() => handleUpdateDocRequest(dr.id as string, "rejected")}
                          style={{ padding: "3px 8px", borderRadius: 4, border: "1px solid #ef444444", background: "transparent", color: "#ef4444", fontSize: 11, cursor: "pointer" }}>
                          Reject
                        </button>
                      </>
                    )}
                    <button type="button" onClick={() => handleDeleteDocRequest(dr.id as string)}
                      style={{ padding: "3px 8px", borderRadius: 4, border: "1px solid #33415544", background: "transparent", color: "#64748b", fontSize: 11, cursor: "pointer" }}>
                      Delete
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Load Messages ── */}
        <div style={{ borderTop: "1px solid #1e293b", paddingTop: 16 }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 600, color: "#f8fafc" }}>Messages</h3>

          {/* Message thread */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12, maxHeight: 260, overflowY: "auto" }}>
            {messagesLoading ? (
              <p style={{ fontSize: 13, color: "#64748b" }}>Loading…</p>
            ) : messages.length === 0 ? (
              <p style={{ fontSize: 13, color: "#64748b" }}>No messages yet.</p>
            ) : (
              messages.map((msg) => {
                const isDispatcher = (msg.role as string) === "dispatcher";
                return (
                  <div key={msg.id as string} style={{ display: "flex", flexDirection: "column", alignItems: isDispatcher ? "flex-end" : "flex-start" }}>
                    <div style={{
                      maxWidth: "75%", padding: "8px 12px", borderRadius: 10,
                      background: isDispatcher ? "#78350f" : "#1e293b",
                      border: `1px solid ${isDispatcher ? "#f59e0b44" : "#334155"}`,
                    }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                        <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 8, fontWeight: 600, background: isDispatcher ? "#f59e0b33" : "#33415566", color: isDispatcher ? "#f59e0b" : "#94a3b8", textTransform: "uppercase" }}>
                          {msg.role as string}
                        </span>
                        <span style={{ fontSize: 11, color: "#64748b" }}>
                          {msg.created_at ? new Date(msg.created_at as string).toLocaleString() : ""}
                        </span>
                      </div>
                      <p style={{ margin: 0, fontSize: 13, color: "#f8fafc" }}>{msg.body as string}</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Send input */}
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={messageBody}
              onChange={e => setMessageBody(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
              style={{ ...inputStyle, flex: 1 }}
              placeholder="Type a message…"
            />
            <button type="button" onClick={handleSendMessage} disabled={messageSending || !messageBody.trim()}
              style={{ padding: "8px 16px", borderRadius: 6, border: "none", background: "#f59e0b", color: "#000", fontSize: 13, cursor: "pointer", fontWeight: 600, opacity: messageSending || !messageBody.trim() ? 0.6 : 1 }}>
              {messageSending ? "…" : "Send"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
