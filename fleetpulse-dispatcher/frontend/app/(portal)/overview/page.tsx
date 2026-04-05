"use client";

import { useEffect, useState } from "react";
import { listLoads, listInvoices, getUser } from "../../../services/api";

type R = Record<string, unknown>;

const STATUS_COLORS: Record<string, string> = {
  pending: "#f59e0b",
  sent: "#3b82f6",
  paid: "#22c55e",
  overdue: "#ef4444",
  shortpaid: "#f97316",
  claim: "#a78bfa",
};

function KPITile({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div style={{ border: "1px solid #1e293b", borderRadius: 8, padding: "14px 16px", background: "#0d1318" }}>
      <p style={{ fontSize: 11, color: "#64748b", margin: "0 0 6px", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</p>
      <p style={{ fontSize: 22, fontWeight: 700, color, margin: 0, fontFamily: "'IBM Plex Mono', monospace" }}>{value}</p>
      {sub && <p style={{ fontSize: 11, color: "#475569", margin: "4px 0 0" }}>{sub}</p>}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] || "#64748b";
  const label = status === "shortpaid" ? "Short Paid" : status.charAt(0).toUpperCase() + status.slice(1);
  return (
    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 10, fontWeight: 600, background: `${color}22`, color, textTransform: "capitalize" as const }}>
      {label}
    </span>
  );
}

function fmtAmt(v: unknown) {
  return `$${Number(v || 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtRpm(v: unknown) {
  const n = Number(v || 0);
  if (!n) return "—";
  return `$${n.toFixed(2)}/mi`;
}

export default function PortalOverviewPage() {
  const [loads, setLoads] = useState<R[]>([]);
  const [invoices, setInvoices] = useState<R[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const user = getUser();
        const carrierId = user?.carrier_id as string | undefined;
        const [loadRes, invRes] = await Promise.all([
          listLoads({ carrier_id: carrierId, limit: 200 }),
          listInvoices({ carrier_id: carrierId, limit: 200, sort_by: "issued_date", order: "desc" }),
        ]);
        setLoads((loadRes.data as R[]) || []);
        setInvoices((invRes.data as R[]) || []);
      } catch { /* network error */ }
      finally { setLoading(false); }
    };
    void fetchData();
  }, []);

  // KPIs
  const deliveredLoads = loads.filter((l) => l.status === "delivered");
  const totalEarned = invoices.filter((i) => i.status === "paid").reduce((s, i) => s + Number(i.amount || 0), 0);
  const totalOutstanding = invoices.filter((i) => i.status !== "paid").reduce((s, i) => s + Number(i.amount || 0), 0);

  const loadsWithRpm = deliveredLoads.filter((l) => Number(l.net_rpm || 0) > 0);
  const avgNetRpm = loadsWithRpm.length
    ? loadsWithRpm.reduce((s, l) => s + Number(l.net_rpm || 0), 0) / loadsWithRpm.length
    : 0;

  // Top 5 most profitable delivered loads
  const topLoads = [...deliveredLoads]
    .sort((a, b) => Number(b.net_profit || 0) - Number(a.net_profit || 0))
    .slice(0, 5);

  // Recent invoices (last 5, any status)
  const recentInvoices = invoices.slice(0, 5);

  // Payment status breakdown
  const paymentSummary = invoices.reduce((acc, inv) => {
    const s = (inv.status as string) || "pending";
    acc[s] = ((acc[s] as number) || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const inTransitCount = loads.filter((l) => l.status === "in_transit").length;

  if (loading) return <p style={{ color: "#94a3b8", padding: 16 }}>Loading…</p>;

  return (
    <div style={{ paddingBottom: 32 }}>
      {/* KPI strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))", gap: 10, marginBottom: 24 }}>
        <KPITile
          label="Total Earned"
          value={fmtAmt(totalEarned)}
          sub={`${invoices.filter((i) => i.status === "paid").length} paid invoices`}
          color="#22c55e"
        />
        <KPITile
          label="Outstanding"
          value={fmtAmt(totalOutstanding)}
          sub={`${invoices.filter((i) => i.status !== "paid").length} unpaid`}
          color={totalOutstanding > 0 ? "#f59e0b" : "#22c55e"}
        />
        <KPITile
          label="Avg Net RPM"
          value={fmtRpm(avgNetRpm)}
          sub={`${deliveredLoads.length} delivered loads`}
          color="#3b82f6"
        />
        <KPITile
          label="In Transit"
          value={String(inTransitCount)}
          sub="active loads"
          color="#a78bfa"
        />
      </div>

      {/* Payment status breakdown */}
      {invoices.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 10px", color: "#f0f6fc" }}>Payment Status</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {Object.entries(paymentSummary).map(([status, count]) => {
              const color = STATUS_COLORS[status] || "#64748b";
              return (
                <div key={status} style={{
                  border: `1px solid ${color}44`, borderRadius: 8, padding: "8px 14px",
                  background: `${color}0f`, display: "flex", alignItems: "center", gap: 8,
                }}>
                  <span style={{ fontSize: 18, fontWeight: 700, color }}>{count as number}</span>
                  <span style={{ fontSize: 12, color: "#94a3b8" }}>
                    {status === "shortpaid" ? "Short Paid" : status.charAt(0).toUpperCase() + status.slice(1)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Most profitable loads */}
      {topLoads.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 10px", color: "#f0f6fc" }}>Most Profitable Loads</h2>
          <div style={{ border: "1px solid #1e293b", borderRadius: 8, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#0d1318", borderBottom: "1px solid #1e293b" }}>
                  <th style={thStyle}>Route</th>
                  <th style={thStyle}>Rate</th>
                  <th style={thStyle}>Net Profit</th>
                  <th style={thStyle}>Net RPM</th>
                </tr>
              </thead>
              <tbody>
                {topLoads.map((l, i) => {
                  const netProfit = Number(l.net_profit || 0);
                  const netRpm = Number(l.net_rpm || 0);
                  const route = (l.route as string) || `${l.origin} → ${l.destination}`;
                  return (
                    <tr key={l.id as string} style={{ borderBottom: i < topLoads.length - 1 ? "1px solid #0f172a" : "none" }}>
                      <td style={tdStyle}>
                        <span style={{ fontSize: 13, color: "#f0f6fc" }}>{route}</span>
                        <span style={{ fontSize: 11, color: "#475569", display: "block" }}>{l.miles as number} mi</span>
                      </td>
                      <td style={{ ...tdStyle, fontWeight: 600 }}>{fmtAmt(l.rate)}</td>
                      <td style={{ ...tdStyle, fontWeight: 700, color: netProfit >= 0 ? "#22c55e" : "#ef4444" }}>
                        {fmtAmt(netProfit)}
                      </td>
                      <td style={{ ...tdStyle, fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: netRpm >= 1.5 ? "#22c55e" : netRpm >= 1.0 ? "#f59e0b" : "#ef4444" }}>
                        {fmtRpm(netRpm)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent invoices */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0, color: "#f0f6fc" }}>Recent Invoices</h2>
          <a href="/overview/invoices" style={{ fontSize: 12, color: "#3b82f6", textDecoration: "none" }}>View all →</a>
        </div>
        {recentInvoices.length === 0 ? (
          <p style={{ fontSize: 14, color: "#64748b" }}>No invoices yet.</p>
        ) : (
          <div style={{ border: "1px solid #1e293b", borderRadius: 8, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#0d1318", borderBottom: "1px solid #1e293b" }}>
                  <th style={thStyle}>Invoice #</th>
                  <th style={thStyle}>Amount</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Issued</th>
                </tr>
              </thead>
              <tbody>
                {recentInvoices.map((inv, i) => {
                  const d = new Date((inv.issued_date as string) || "");
                  const dateStr = isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
                  return (
                    <tr key={inv.id as string} style={{ borderBottom: i < recentInvoices.length - 1 ? "1px solid #0f172a" : "none" }}>
                      <td style={{ ...tdStyle, fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}>
                        {(inv.invoice_number as string) || `#${String(inv.id).slice(0, 8)}`}
                      </td>
                      <td style={{ ...tdStyle, fontWeight: 600 }}>{fmtAmt(inv.amount)}</td>
                      <td style={tdStyle}><StatusBadge status={(inv.status as string) || "pending"} /></td>
                      <td style={{ ...tdStyle, color: "#64748b" }}>{dateStr}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = { padding: "8px 12px", fontSize: 12, color: "#64748b", fontWeight: 500, textAlign: "left" };
const tdStyle: React.CSSProperties = { padding: "10px 12px", fontSize: 13, color: "#94a3b8", verticalAlign: "middle" };
