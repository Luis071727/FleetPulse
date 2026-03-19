"use client";

import { useCallback, useEffect, useState } from "react";
import { listCarriers, listLoads, listInvoices } from "../../../services/api";

type R = Record<string, unknown>;

export default function DashboardPage() {
  const [carriers, setCarriers] = useState<R[]>([]);
  const [loads, setLoads] = useState<R[]>([]);
  const [invoices, setInvoices] = useState<R[]>([]);
  const [totalCarriers, setTotalCarriers] = useState(0);
  const [totalOutstanding, setTotalOutstanding] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [cRes, lRes, iRes] = await Promise.all([
        listCarriers({ limit: 50 }),
        listLoads({ limit: 5 }),
        listInvoices({ sort_by: "days_outstanding", order: "desc", limit: 5 }),
      ]);
      setCarriers((cRes.data as R[]) || []);
      setTotalCarriers((cRes.meta?.total as number) || 0);
      setLoads((lRes.data as R[]) || []);
      setInvoices((iRes.data as R[]) || []);
      setTotalOutstanding((iRes.meta?.total_outstanding as number) || 0);
    } catch { /* network error */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Derived KPIs
  const activeCarriers = carriers.filter((c) => (c.status as string) === "active" || (c.computed_status as string) === "active").length;
  const inTransit = loads.filter((l) => (l.status as string) === "in_transit").length;
  const overdueInvoices = invoices.filter((i) => {
    const days = Number(i.days_outstanding || 0);
    return days > 0 && (i.status as string) !== "paid";
  }).length;

  // Priority alerts
  const alerts: { label: string; color: string; href: string }[] = [];
  if (overdueInvoices > 0) alerts.push({ label: `${overdueInvoices} Overdue Invoice${overdueInvoices > 1 ? "s" : ""}`, color: "#ef4444", href: "/invoices" });
  const uninvited = carriers.filter((c) => !c.portal_status || c.portal_status === "not_invited").length;
  if (uninvited > 0) alerts.push({ label: `${uninvited} Carrier${uninvited > 1 ? "s" : ""} Not Invited`, color: "#3b82f6", href: "/carriers" });

  if (loading) return <div style={{ padding: 32, color: "#94a3b8" }}>Loading dashboard...</div>;

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ fontSize: 22, margin: "0 0 20px", fontWeight: 600 }}>Dashboard</h1>

      {/* KPI Strip */}
      <div className="fp-kpi-strip" style={{ marginBottom: 20 }}>
        <KPITile label="Active Carriers" value={activeCarriers} color="var(--green)" />
        <KPITile label="Loads In Transit" value={inTransit} color="var(--blue)" />
        <KPITile label="Outstanding AR" value={`$${totalOutstanding.toLocaleString()}`} color="var(--amber)" />
        <KPITile label="Overdue Invoices" value={overdueInvoices} color={overdueInvoices > 0 ? "var(--red)" : "var(--green)"} />
        <KPITile label="Total Carriers" value={totalCarriers} color="#a78bfa" />
      </div>

      {/* Priority Alerts */}
      {alerts.length > 0 && (
        <div style={{ display: "flex", gap: 8, marginBottom: 20, overflowX: "auto", paddingBottom: 4 }}>
          {alerts.map((a, i) => (
            <a key={i} href={a.href} style={{
              padding: "6px 14px", borderRadius: 20, fontSize: 13, fontWeight: 500,
              background: `${a.color}22`, color: a.color, border: `1px solid ${a.color}44`,
              textDecoration: "none", whiteSpace: "nowrap",
            }}>
              {a.label}
            </a>
          ))}
        </div>
      )}

      <div className="fp-dash-panels">
        {/* Carrier Roster Table */}
        <section style={sectionStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h2 style={sectionTitle}>Carrier Roster</h2>
            <a href="/carriers" style={viewAllLink}>View All →</a>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #1e293b" }}>
                <th style={thStyle}>Carrier</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Portal</th>
              </tr>
            </thead>
            <tbody>
              {carriers.slice(0, 8).map((c) => (
                <tr key={c.id as string} style={{ borderBottom: "1px solid #0f172a" }}>
                  <td style={tdStyle}>
                    <div>
                      <span style={{ fontWeight: 500 }}>{c.legal_name as string}</span>
                      <span style={{ fontSize: 11, color: "#64748b", marginLeft: 6 }}>
                        {c.mc_number ? `MC ${c.mc_number}` : `DOT ${c.dot_number}`}
                      </span>
                    </div>
                  </td>
                  <td style={tdStyle}>
                    <StatusBadge status={(c.status as string) || (c.computed_status as string) || "new"} />
                  </td>
                  <td style={tdStyle}>
                    <span style={{ fontSize: 12, color: c.portal_status === "active" ? "#22c55e" : "#64748b" }}>
                      {(c.portal_status as string) || "not invited"}
                    </span>
                  </td>
                </tr>
              ))}
              {carriers.length === 0 && (
                <tr><td colSpan={3} style={{ ...tdStyle, color: "#64748b", textAlign: "center" }}>No carriers yet — <a href="/carriers" style={{ color: "#60a5fa" }}>add one</a></td></tr>
              )}
            </tbody>
          </table>
        </section>

        {/* Right column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Live Load Feed */}
          <section style={sectionStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h2 style={sectionTitle}>Recent Loads</h2>
              <a href="/loads" style={viewAllLink}>View All →</a>
            </div>
            {loads.length === 0 ? (
              <p style={{ color: "#64748b", fontSize: 13 }}>No loads yet</p>
            ) : (
              loads.slice(0, 5).map((l) => (
                <div key={l.id as string} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #0f172a", fontSize: 13 }}>
                  <div>
                    <span style={{ color: "#f8fafc" }}>{(l.route as string) || "—"}</span>
                    <span style={{ color: "#64748b", marginLeft: 8 }}>${Number(l.load_rate || 0).toLocaleString()}</span>
                  </div>
                  <StatusBadge status={(l.status as string) || "logged"} />
                </div>
              ))
            )}
          </section>

          {/* Invoice Tracker */}
          <section style={sectionStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h2 style={sectionTitle}>Urgent Invoices</h2>
              <a href="/invoices" style={viewAllLink}>View All →</a>
            </div>
            {invoices.length === 0 ? (
              <p style={{ color: "#64748b", fontSize: 13 }}>No invoices yet</p>
            ) : (
              invoices.filter((i) => (i.status as string) !== "paid").slice(0, 5).map((inv) => {
                const days = Number(inv.days_outstanding || 0);
                const daysColor = days >= 22 ? "#ef4444" : days >= 8 ? "#f59e0b" : "#22c55e";
                return (
                  <div key={inv.id as string} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #0f172a", fontSize: 13 }}>
                    <span style={{ color: "#f8fafc" }}>INV-{(inv.id as string)?.slice(0, 6)}</span>
                    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                      <span style={{ color: daysColor, fontWeight: 600 }}>{days}d</span>
                      <span style={{ color: "#94a3b8" }}>${Number(inv.amount || 0).toLocaleString()}</span>
                    </div>
                  </div>
                );
              })
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function KPITile({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div style={{ background: "var(--surface)", borderRadius: 8, padding: "16px 14px", border: "1px solid var(--border)" }}>
      <p className="fp-mono" style={{ fontSize: 11, color: "var(--mist)", margin: "0 0 6px", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</p>
      <p className="fp-mono" style={{ fontSize: 24, fontWeight: 700, color, margin: 0 }}>{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: "#22c55e", idle: "#f59e0b", issues: "#ef4444", new: "#94a3b8",
    logged: "#60a5fa", in_transit: "#a78bfa", delivered: "#22c55e",
    pending: "#f59e0b", paid: "#22c55e", overdue: "#ef4444",
  };
  const c = colors[status] || "#64748b";
  return (
    <span style={{
      fontSize: 11, padding: "2px 8px", borderRadius: 10, fontWeight: 600,
      background: `${c}22`, color: c, textTransform: "uppercase",
    }}>
      {status.replace("_", " ")}
    </span>
  );
}

const sectionStyle: React.CSSProperties = {
  background: "var(--surface)", borderRadius: 10, padding: 16, border: "1px solid var(--border)",
};
const sectionTitle: React.CSSProperties = { fontSize: 15, margin: 0, fontWeight: 600 };
const viewAllLink: React.CSSProperties = { fontSize: 12, color: "var(--blue)", textDecoration: "none" };
const thStyle: React.CSSProperties = { padding: "6px 10px", fontSize: 12, color: "var(--mist)", textAlign: "left" };
const tdStyle: React.CSSProperties = { padding: "8px 10px", fontSize: 13 };
