"use client";

import { useEffect, useState } from "react";
import { listLoads, listInvoices, getUser } from "../../../../services/api";

type R = Record<string, unknown>;

const LOAD_STATUS_COLORS: Record<string, string> = {
  logged: "#3b82f6",
  in_transit: "#a78bfa",
  delivered: "#22c55e",
  cancelled: "#64748b",
};

const INV_STATUS_COLORS: Record<string, string> = {
  pending: "#f59e0b",
  sent: "#3b82f6",
  paid: "#22c55e",
  overdue: "#ef4444",
  shortpaid: "#f97316",
  claim: "#a78bfa",
};

function StatusBadge({ status, colors }: { status: string; colors: Record<string, string> }) {
  const color = colors[status] || "#64748b";
  const label = status === "shortpaid" ? "Short Paid" : status.replace("_", " ");
  return (
    <span style={{
      fontSize: 11, padding: "2px 8px", borderRadius: 10, fontWeight: 600,
      background: `${color}22`, color, textTransform: "capitalize" as const, whiteSpace: "nowrap" as const,
    }}>
      {label}
    </span>
  );
}

function DocProgress({ uploaded, total }: { uploaded: number; total: number }) {
  if (total === 0) return <span style={{ fontSize: 11, color: "#475569", fontStyle: "italic" }}>None requested</span>;
  const pct = Math.round((uploaded / total) * 100);
  const color = uploaded === total ? "#22c55e" : uploaded > 0 ? "#f59e0b" : "#64748b";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ width: 56, height: 4, background: "#1e293b", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 2 }} />
      </div>
      <span style={{ fontSize: 11, color, fontWeight: 600 }}>{uploaded}/{total}</span>
    </div>
  );
}

function fmtDate(v: unknown) {
  if (typeof v !== "string" || !v) return "—";
  const d = new Date(v);
  if (isNaN(d.getTime())) return v;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function PortalLoadsPage() {
  const [loads, setLoads] = useState<R[]>([]);
  const [invoices, setInvoices] = useState<R[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const user = getUser();
        const carrierId = user?.carrier_id as string | undefined;
        const [loadRes, invRes] = await Promise.all([
          listLoads({ carrier_id: carrierId, limit: 100 }),
          listInvoices({ carrier_id: carrierId, limit: 200, sort_by: "issued_date", order: "desc" }),
        ]);
        setLoads((loadRes.data as R[]) || []);
        setInvoices((invRes.data as R[]) || []);
      } catch { /* network error */ }
      finally { setLoading(false); }
    };
    void fetchData();
    const id = window.setInterval(() => { void fetchData(); }, 60000);
    return () => window.clearInterval(id);
  }, []);

  // Map load_id → invoice for quick lookup
  const invoiceByLoadId = new Map<string, R>();
  for (const inv of invoices) {
    if (inv.load_id) invoiceByLoadId.set(inv.load_id as string, inv);
  }

  const activeLoads = loads.filter((l) => l.status === "in_transit" || l.status === "logged");
  const historyLoads = loads.filter((l) => l.status === "delivered" || l.status === "cancelled");

  if (loading) return <p style={{ color: "#94a3b8", padding: 16 }}>Loading…</p>;

  function LoadTable({ items, title }: { items: R[]; title: string }) {
    return (
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 10px", color: "#f0f6fc" }}>{title}</h2>
        {items.length === 0 ? (
          <p style={{ fontSize: 14, color: "#64748b" }}>No loads in this category.</p>
        ) : (
          <div style={{ border: "1px solid #1e293b", borderRadius: 8, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#0d1318", borderBottom: "1px solid #1e293b" }}>
                  <th style={thStyle}>Route</th>
                  <th style={thStyle}>Miles / Rate</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Docs</th>
                  <th style={thStyle}>Invoice</th>
                  <th style={thStyle}>Dates</th>
                </tr>
              </thead>
              <tbody>
                {items.map((l, i) => {
                  const route = (l.route as string) || `${l.origin || "?"} → ${l.destination || "?"}`;
                  const inv = invoiceByLoadId.get(l.id as string);
                  const loadStatus = (l.status as string) || "logged";
                  const invStatus = inv ? ((inv.status as string) || "pending") : null;

                  // doc counts from load fields if backend returns them; fallback 0
                  const docsUploaded = Number(l.docs_uploaded ?? 0);
                  const docsRequested = Number(l.docs_requested ?? 0);

                  return (
                    <tr key={l.id as string} style={{ borderBottom: i < items.length - 1 ? "1px solid #0f172a" : "none" }}>
                      <td style={tdStyle}>
                        <span style={{ fontSize: 13, color: "#f0f6fc", display: "block" }}>{route}</span>
                        {l.rc_reference && (
                          <span style={{ fontSize: 11, color: "#475569" }}>RC: {l.rc_reference as string}</span>
                        )}
                      </td>
                      <td style={tdStyle}>
                        <span style={{ fontSize: 12, color: "#64748b" }}>{l.miles as number} mi</span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#f0f6fc", display: "block" }}>
                          ${Number(l.rate || 0).toLocaleString()}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <StatusBadge status={loadStatus} colors={LOAD_STATUS_COLORS} />
                      </td>
                      <td style={tdStyle}>
                        <DocProgress uploaded={docsUploaded} total={docsRequested} />
                      </td>
                      <td style={tdStyle}>
                        {invStatus ? (
                          <div>
                            <StatusBadge status={invStatus} colors={INV_STATUS_COLORS} />
                            {inv?.amount && (
                              <span style={{ fontSize: 11, color: "#475569", display: "block", marginTop: 2 }}>
                                ${Number(inv.amount).toLocaleString()}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span style={{ fontSize: 12, color: "#475569", fontStyle: "italic" }}>No invoice</span>
                        )}
                      </td>
                      <td style={{ ...tdStyle, color: "#64748b", fontSize: 12 }}>
                        {fmtDate(l.pickup_date)}
                        {fmtDate(l.delivery_date) !== "—" && ` → ${fmtDate(l.delivery_date)}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  return (
    <section>
      <h2 style={{ fontSize: 20, fontWeight: 600, margin: "0 0 20px", color: "#f0f6fc" }}>My Loads</h2>
      <LoadTable items={activeLoads} title={`Active (${activeLoads.length})`} />
      <LoadTable items={historyLoads} title={`History (${historyLoads.length})`} />
    </section>
  );
}

const thStyle: React.CSSProperties = { padding: "8px 12px", fontSize: 12, color: "#64748b", fontWeight: 500, textAlign: "left" };
const tdStyle: React.CSSProperties = { padding: "10px 12px", fontSize: 13, color: "#94a3b8", verticalAlign: "middle" };
