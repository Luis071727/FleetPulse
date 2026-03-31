"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { listLoads, listCarriers, updateLoad, deleteLoad, getLoad } from "../../../services/api";
import { X } from "../../../components/icons";
import LogLoadModal from "../../../components/LogLoadModal";
import LoadDetailModal from "../../../components/LoadDetailModal";

type R = Record<string, unknown>;

const STATUS_FILTERS = ["all", "logged", "in_transit", "delivered"];

const STATUS_COLORS: Record<string, string> = {
  delivered: "#22c55e",
  in_transit: "#a78bfa",
  logged: "#60a5fa",
  cancelled: "#ef4444",
};

export default function LoadsPage() {
  const [loads, setLoads] = useState<R[]>([]);
  const [carriers, setCarriers] = useState<R[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [carrierFilter, setCarrierFilter] = useState("");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<string>("pickup_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [showAddLoad, setShowAddLoad] = useState(false);
  const [editingLoad, setEditingLoad] = useState<R | null>(null);

  const fetchLoads = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const res = await listLoads({
        status: statusFilter === "all" ? undefined : statusFilter,
        carrier_id: carrierFilter || undefined,
        limit: 200,
      });
      setLoads((res.data as R[]) || []);
      setTotal((res.meta?.total as number) || 0);
    } catch { /* */ }
    finally { if (showLoading) setLoading(false); }
  }, [statusFilter, carrierFilter]);

  useEffect(() => { void fetchLoads(); }, [fetchLoads]);

  // Auto-refresh every 60s
  useEffect(() => {
    const id = window.setInterval(() => void fetchLoads(false), 60000);
    return () => window.clearInterval(id);
  }, [fetchLoads]);

  useEffect(() => {
    listCarriers({ limit: 200 }).then((res) => {
      setCarriers((res.data as R[]) || []);
    }).catch(() => {});
  }, []);

  // URL-based deep link
  useEffect(() => {
    if (typeof window === "undefined") return;
    const loadId = new URLSearchParams(window.location.search).get("loadId");
    if (!loadId) return;
    const existing = loads.find((l) => l.id === loadId);
    if (existing) { setEditingLoad(existing); return; }
    getLoad(loadId).then((res) => { if (res.data) setEditingLoad(res.data as R); }).catch(() => {});
  }, [loads]);

  const clearLoadQuery = useCallback(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    params.delete("loadId");
    const next = params.toString();
    window.history.replaceState(null, "", next ? `/loads?${next}` : "/loads");
  }, []);

  // Computed summary metrics
  const metrics = useMemo(() => {
    const inTransit = loads.filter((l) => l.status === "in_transit").length;
    const delivered = loads.filter((l) => l.status === "delivered").length;
    const totalRevenue = loads.reduce((s, l) => s + Number(l.load_rate || l.rate || 0), 0);
    const rpms = loads.map((l) => Number(l.net_rpm || 0)).filter((v) => v > 0);
    const avgNetRpm = rpms.length ? rpms.reduce((a, b) => a + b, 0) / rpms.length : 0;
    return { inTransit, delivered, totalRevenue, avgNetRpm };
  }, [loads]);

  // Client-side search + sort
  const displayedLoads = useMemo(() => {
    let filtered = loads;
    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter((l) => {
        const carrier = carriers.find((c) => c.id === l.carrier_id);
        return (
          String(l.origin || "").toLowerCase().includes(q) ||
          String(l.destination || "").toLowerCase().includes(q) ||
          String(l.rc_reference || "").toLowerCase().includes(q) ||
          String(l.broker_name || "").toLowerCase().includes(q) ||
          String(carrier?.legal_name || "").toLowerCase().includes(q)
        );
      });
    }
    return [...filtered].sort((a, b) => {
      let av: unknown = a[sortBy];
      let bv: unknown = b[sortBy];
      if (sortBy === "rate") { av = a.load_rate ?? a.rate; bv = b.load_rate ?? b.rate; }
      const an = Number(av) || 0;
      const bn = Number(bv) || 0;
      if (an !== bn) return sortDir === "desc" ? bn - an : an - bn;
      return String(av || "").localeCompare(String(bv || ""));
    });
  }, [loads, search, sortBy, sortDir, carriers]);

  const handleSort = (col: string) => {
    if (sortBy === col) setSortDir((d) => d === "desc" ? "asc" : "desc");
    else { setSortBy(col); setSortDir("desc"); }
  };

  const sortIndicator = (col: string) =>
    sortBy === col ? (sortDir === "desc" ? " ↓" : " ↑") : "";

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      {/* Page header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, margin: 0, fontWeight: 600 }}>Loads</h1>
        <button type="button" onClick={() => setShowAddLoad(true)} style={btnAdd}>
          + Add Load
        </button>
      </div>

      {/* Summary metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 20 }}>
        <SummaryCard label="Total Loads" value={String(total)} />
        <SummaryCard label="In Transit" value={String(metrics.inTransit)} accent="#a78bfa" />
        <SummaryCard label="Delivered" value={String(metrics.delivered)} accent="#22c55e" />
        <SummaryCard label="Avg Net RPM" value={metrics.avgNetRpm > 0 ? `$${metrics.avgNetRpm.toFixed(2)}` : "—"} accent={metrics.avgNetRpm >= 1.5 ? "#22c55e" : metrics.avgNetRpm >= 1.0 ? "#f59e0b" : "#ef4444"} />
      </div>

      {/* Filter + search bar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        {STATUS_FILTERS.map((f) => (
          <button key={f} type="button" onClick={() => setStatusFilter(f)}
            className={`fp-chip${statusFilter === f ? " fp-chip--active" : ""}`}>
            {f === "all" ? "All" : f === "in_transit" ? "In Transit" : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
        <input
          placeholder="Search route, carrier, RC#, broker…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 200, padding: "6px 12px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--white)", fontSize: 13 }}
        />
        <select value={carrierFilter} onChange={(e) => setCarrierFilter(e.target.value)}
          style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--white)", fontSize: 13 }}>
          <option value="">All Carriers</option>
          {carriers.map((c) => (
            <option key={c.id as string} value={c.id as string}>{c.legal_name as string}</option>
          ))}
        </select>
      </div>

      <p style={{ fontSize: 12, color: "var(--mist)", marginBottom: 10 }}>
        {loading ? "Loading…" : `${displayedLoads.length} of ${total} load${total !== 1 ? "s" : ""}`}
      </p>

      {/* Loads table */}
      <div className="fp-table-wrap">
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <SortTh col="origin" label="Route" current={sortBy} dir={sortDir} onSort={handleSort} />
              <th style={thStyle}>Carrier</th>
              <SortTh col="broker_name" label="Broker" current={sortBy} dir={sortDir} onSort={handleSort} />
              <th style={thStyle}>RC#</th>
              <SortTh col="rate" label="Rate" current={sortBy} dir={sortDir} onSort={handleSort} />
              <SortTh col="net_profit" label="Net Profit" current={sortBy} dir={sortDir} onSort={handleSort} />
              <SortTh col="net_rpm" label="Net RPM" current={sortBy} dir={sortDir} onSort={handleSort} />
              <SortTh col="miles" label="Miles" current={sortBy} dir={sortDir} onSort={handleSort} />
              <SortTh col="pickup_date" label="Pickup" current={sortBy} dir={sortDir} onSort={handleSort} />
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {displayedLoads.map((ld) => {
              const st = (ld.status as string) || "logged";
              const stColor = STATUS_COLORS[st] || "#64748b";
              const carrier = carriers.find((c) => c.id === ld.carrier_id);
              return (
                <tr
                  key={ld.id as string}
                  style={{ borderBottom: "1px solid var(--surface)", cursor: "pointer" }}
                  onClick={() => setEditingLoad(ld)}
                >
                  <td style={tdStyle}>
                    <span style={{ fontWeight: 500 }}>
                      {(ld.route as string) || `${ld.origin || "—"} → ${ld.destination || "—"}`}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ fontSize: 13 }}>{(carrier?.legal_name as string) || "—"}</span>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ fontSize: 12, color: "var(--mist)" }}>{(ld.broker_name as string) || "—"}</span>
                  </td>
                  <td style={tdStyle}>
                    <span className="fp-mono" style={{ fontSize: 12, color: "var(--mist)" }}>{(ld.rc_reference as string) || "—"}</span>
                  </td>
                  <td style={tdStyle}>${Number(ld.load_rate || ld.rate || 0).toLocaleString()}</td>
                  <td style={tdStyle}>
                    <span style={{ color: Number(ld.net_profit || 0) >= 0 ? "#22c55e" : "#ef4444", fontWeight: 600 }}>
                      ${Number(ld.net_profit || 0).toLocaleString()}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ color: Number(ld.net_rpm || 0) >= 1.5 ? "#22c55e" : Number(ld.net_rpm || 0) >= 1.0 ? "#f59e0b" : "#ef4444", fontWeight: 600 }}>
                      ${Number(ld.net_rpm || 0).toFixed(2)}
                    </span>
                  </td>
                  <td style={tdStyle}>{Number(ld.miles || 0).toLocaleString()}</td>
                  <td style={tdStyle}>
                    {ld.pickup_date
                      ? new Date(ld.pickup_date as string).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                      : "—"}
                  </td>
                  <td style={tdStyle} onClick={(e) => e.stopPropagation()}>
                    <select
                      value={st}
                      onChange={async (e) => {
                        const newStatus = e.target.value;
                        await updateLoad(ld.id as string, { status: newStatus });
                        void fetchLoads(false);
                      }}
                      style={{
                        fontSize: 11, padding: "3px 8px", borderRadius: 10, fontWeight: 700,
                        background: `${stColor}22`, color: stColor,
                        border: `1px solid ${stColor}44`, cursor: "pointer",
                        textTransform: "uppercase",
                      }}
                    >
                      <option value="logged">Logged</option>
                      <option value="in_transit">In Transit</option>
                      <option value="delivered">Delivered</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </td>
                  <td style={tdStyle} onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!confirm("Delete this load and its invoice?")) return;
                        await deleteLoad(ld.id as string);
                        void fetchLoads();
                      }}
                      style={{ padding: "3px 10px", borderRadius: 4, border: "1px solid #ef444444", background: "transparent", color: "#ef4444", fontSize: 12, cursor: "pointer" }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
            {displayedLoads.length === 0 && !loading && (
              <tr>
                <td colSpan={11} style={{ ...tdStyle, textAlign: "center", color: "var(--mist)", padding: 40 }}>
                  {search ? "No loads match your search." : "No loads yet. Click \"+ Add Load\" to get started."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add Load Modal */}
      {showAddLoad && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 100 }}
          onClick={() => setShowAddLoad(false)}>
          <div className="fp-modal" style={{ background: "var(--surface)", borderRadius: 14, padding: 24, width: 540, maxHeight: "88vh", overflowY: "auto", border: "1px solid var(--border)" }}
            onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => setShowAddLoad(false)}
              style={{ float: "right", background: "none", border: "none", color: "var(--mist)", cursor: "pointer", display: "flex", alignItems: "center" }}>
              <X size={18} />
            </button>
            <LogLoadModal onComplete={() => { setShowAddLoad(false); void fetchLoads(); }} />
          </div>
        </div>
      )}

      {/* Load Detail Modal */}
      {editingLoad && (
        <LoadDetailModal
          load={editingLoad}
          carriers={carriers}
          onClose={() => { setEditingLoad(null); clearLoadQuery(); }}
          onSaved={() => { setEditingLoad(null); clearLoadQuery(); void fetchLoads(); }}
        />
      )}
    </div>
  );
}

/* ── Sub-components ── */

function SummaryCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ padding: "14px 16px", background: "var(--surface)", borderRadius: 10, border: "1px solid var(--border)" }}>
      <p style={{ margin: "0 0 4px", fontSize: 11, color: "var(--mist)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</p>
      <p style={{ margin: 0, fontSize: 22, fontWeight: 700, color: accent || "var(--white)" }}>{value}</p>
    </div>
  );
}

function SortTh({ col, label, current, dir, onSort }: {
  col: string; label: string; current: string; dir: "asc" | "desc"; onSort: (col: string) => void;
}) {
  const active = current === col;
  return (
    <th
      style={{ ...thStyle, cursor: "pointer", userSelect: "none", color: active ? "var(--white)" : "var(--mist)" }}
      onClick={() => onSort(col)}
    >
      {label}{active ? (dir === "desc" ? " ↓" : " ↑") : ""}
    </th>
  );
}

const thStyle: React.CSSProperties = { padding: "8px 10px", fontSize: 12, color: "var(--mist)", textAlign: "left", fontWeight: 600 };
const tdStyle: React.CSSProperties = { padding: "9px 10px", fontSize: 13 };
const btnAdd: React.CSSProperties = { padding: "8px 16px", borderRadius: 6, border: "none", background: "var(--amber)", color: "#000", fontSize: 14, cursor: "pointer", fontWeight: 600 };
