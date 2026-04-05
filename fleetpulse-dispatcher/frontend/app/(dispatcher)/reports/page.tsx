"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { listInvoices, listLoads } from "../../../services/api";
import InvoiceDetailModal from "../../../components/InvoiceDetailModal";
import { FileText } from "../../../components/icons";

type Invoice = Record<string, unknown>;
type Load = Record<string, unknown>;
type Carrier = { id: string; legal_name: string };

const STATUS_COLORS: Record<string, string> = {
  pending: "var(--amber)",
  sent: "var(--blue)",
  paid: "var(--green)",
  overdue: "var(--red)",
  shortpaid: "#f97316",
  claim: "#a78bfa",
};

function toYM(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function shiftMonth(ym: string, delta: number) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return toYM(d);
}

function fmtDate(val: unknown) {
  if (typeof val !== "string" || !val) return "—";
  const d = new Date(val);
  if (isNaN(d.getTime())) return val;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtAmount(val: unknown) {
  return `$${Number(val || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] || "var(--mist)";
  return (
    <span style={{
      fontSize: 11, padding: "2px 8px", borderRadius: 10, fontWeight: 600,
      background: `${color}22`, color, textTransform: "capitalize" as const,
      whiteSpace: "nowrap" as const,
    }}>
      {status === "shortpaid" ? "Short Paid" : status}
    </span>
  );
}

function KPITile({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ background: "var(--surface)", borderRadius: 8, padding: "16px 14px", border: "1px solid var(--border)" }}>
      <p className="fp-mono" style={{ fontSize: 11, color: "var(--mist)", margin: "0 0 6px", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</p>
      <p className="fp-mono" style={{ fontSize: 22, fontWeight: 700, color, margin: 0 }}>{value}</p>
    </div>
  );
}

export default function ReportsPage() {
  const [selectedMonth, setSelectedMonth] = useState(() => toYM(new Date()));
  const [allInvoices, setAllInvoices] = useState<Invoice[]>([]);
  const [allLoads, setAllLoads] = useState<Load[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [invRes, loadRes] = await Promise.all([
        listInvoices({ sort_by: "issued_date", order: "desc", limit: 1000 }),
        listLoads({ status: "delivered", limit: 1000 }),
      ]);
      setAllInvoices((invRes.data as Invoice[]) || []);
      setAllLoads((loadRes.data as Load[]) || []);
    } catch { /* network error */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void fetchData(); }, [fetchData]);

  // Client-side month filter
  const monthInvoices = useMemo(() => {
    return allInvoices
      .filter((inv) => {
        const d = (inv.issued_date as string) || "";
        return d.startsWith(selectedMonth);
      })
      .sort((a, b) => {
        const da = (a.issued_date as string) || "";
        const db = (b.issued_date as string) || "";
        return db.localeCompare(da);
      });
  }, [allInvoices, selectedMonth]);

  const monthLoadsCount = useMemo(() => {
    return allLoads.filter((load) => {
      const d = (load.delivery_date as string) || (load.actual_delivery_at as string) || "";
      return d.startsWith(selectedMonth);
    }).length;
  }, [allLoads, selectedMonth]);

  // KPIs
  const totalInvoiced = monthInvoices.reduce((s, inv) => s + Number(inv.amount || 0), 0);
  const totalCollected = monthInvoices
    .filter((inv) => (inv.status as string) === "paid")
    .reduce((s, inv) => s + Number(inv.amount || 0), 0);
  const outstanding = totalInvoiced - totalCollected;

  // Export CSV
  const handleExport = () => {
    const headers = ["Invoice#", "Carrier", "Broker", "Load", "Amount", "Status", "Issued", "Paid Date"];
    const rows = monthInvoices.map((inv) => [
      String(inv.invoice_number || ""),
      String(inv.carrier_name || ""),
      String(inv.broker_name || ""),
      inv.load_id ? String(inv.load_id).slice(-8) : "—",
      Number(inv.amount || 0).toFixed(2),
      String(inv.status || ""),
      String(inv.issued_date || ""),
      String(inv.paid_date || ""),
    ]);
    const csv = [headers, ...rows]
      .map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fleetpulse-report-${selectedMonth}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Derive carrier list from loaded invoice data for InvoiceDetailModal
  const carriers: Carrier[] = useMemo(() => {
    const seen = new Map<string, string>();
    for (const inv of allInvoices) {
      const id = inv.carrier_id as string;
      const name = inv.carrier_name as string;
      if (id && name && !seen.has(id)) seen.set(id, name);
    }
    return Array.from(seen.entries()).map(([id, legal_name]) => ({ id, legal_name }));
  }, [allInvoices]);

  const isCurrentOrFuture = selectedMonth >= toYM(new Date());

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, margin: "0 0 4px", fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
            <FileText size={20} style={{ color: "var(--blue)" }} />
            Monthly Reports
          </h1>
          <p style={{ fontSize: 13, color: "var(--mist)", margin: 0 }}>Invoice history and revenue summaries</p>
        </div>
        <button
          type="button"
          onClick={handleExport}
          disabled={monthInvoices.length === 0}
          style={{
            padding: "8px 16px", borderRadius: 7, fontSize: 13, cursor: monthInvoices.length === 0 ? "not-allowed" : "pointer",
            border: "1px solid var(--border)", background: "transparent", color: monthInvoices.length === 0 ? "var(--mist)" : "var(--white)",
            opacity: monthInvoices.length === 0 ? 0.5 : 1,
          }}
        >
          Export CSV
        </button>
      </div>

      {/* Month selector */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button
          type="button"
          onClick={() => setSelectedMonth((m) => shiftMonth(m, -1))}
          style={arrowBtn}
          aria-label="Previous month"
        >
          ←
        </button>
        <span style={{ fontSize: 16, fontWeight: 600, color: "var(--white)", minWidth: 160, textAlign: "center" }}>
          {monthLabel(selectedMonth)}
        </span>
        <button
          type="button"
          onClick={() => setSelectedMonth((m) => shiftMonth(m, 1))}
          disabled={isCurrentOrFuture}
          style={{ ...arrowBtn, opacity: isCurrentOrFuture ? 0.3 : 1, cursor: isCurrentOrFuture ? "default" : "pointer" }}
          aria-label="Next month"
        >
          →
        </button>
      </div>

      {/* KPI Strip */}
      {loading ? (
        <div className="fp-kpi-strip" style={{ marginBottom: 20 }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="fp-skeleton" style={{ borderRadius: 8, height: 72 }} />
          ))}
        </div>
      ) : (
        <div className="fp-kpi-strip" style={{ marginBottom: 20 }}>
          <KPITile label="Total Invoiced" value={fmtAmount(totalInvoiced)} color="var(--green)" />
          <KPITile label="Total Collected" value={fmtAmount(totalCollected)} color="var(--amber)" />
          <KPITile label="Outstanding" value={fmtAmount(outstanding)} color={outstanding > 0 ? "var(--red)" : "var(--green)"} />
          <KPITile label="Loads Completed" value={String(monthLoadsCount)} color="var(--mist)" />
        </div>
      )}

      {/* Invoice table */}
      {loading ? (
        <p style={{ fontSize: 13, color: "var(--mist)" }}>Loading…</p>
      ) : monthInvoices.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--mist)" }}>
          <FileText size={36} style={{ color: "var(--border)", marginBottom: 12 }} />
          <p style={{ fontSize: 15, fontWeight: 600, margin: "0 0 4px", color: "var(--white)" }}>No invoices for {monthLabel(selectedMonth)}</p>
          <p style={{ fontSize: 13, margin: 0 }}>Try a different month or check back after invoices are issued.</p>
        </div>
      ) : (
        <>
          <p style={{ fontSize: 12, color: "var(--mist)", margin: "0 0 8px" }}>
            {monthInvoices.length} invoice{monthInvoices.length !== 1 ? "s" : ""}
          </p>
          <div className="fp-table-wrap">
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #1e293b", textAlign: "left" }}>
                  <th style={thStyle}>Carrier</th>
                  <th style={thStyle}>Broker</th>
                  <th style={thStyle}>Invoice #</th>
                  <th style={thStyle}>Load</th>
                  <th style={thStyle}>Amount</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Issued</th>
                  <th style={thStyle}>Paid Date</th>
                </tr>
              </thead>
              <tbody>
                {monthInvoices.map((inv) => (
                  <tr
                    key={inv.id as string}
                    onClick={() => setEditingInvoice(inv)}
                    style={{ borderBottom: "1px solid #0f172a", cursor: "pointer" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <td style={tdStyle}>{(inv.carrier_name as string) || "—"}</td>
                    <td style={tdStyle}>{(inv.broker_name as string) || "—"}</td>
                    <td style={{ ...tdStyle, fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}>
                      {(inv.invoice_number as string) || "—"}
                    </td>
                    <td style={{ ...tdStyle, fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "var(--mist)" }}>
                      {inv.load_id ? `…${String(inv.load_id).slice(-8)}` : "—"}
                    </td>
                    <td style={{ ...tdStyle, fontWeight: 600, color: "var(--white)" }}>
                      {fmtAmount(inv.amount)}
                    </td>
                    <td style={tdStyle}>
                      <StatusBadge status={(inv.status as string) || "pending"} />
                    </td>
                    <td style={tdStyle}>{fmtDate(inv.issued_date)}</td>
                    <td style={{ ...tdStyle, color: inv.paid_date ? "var(--green)" : "var(--mist)" }}>
                      {fmtDate(inv.paid_date)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Invoice Detail Modal */}
      {editingInvoice && (
        <InvoiceDetailModal
          invoice={editingInvoice}
          carriers={carriers}
          onClose={() => setEditingInvoice(null)}
          onSaved={() => { setEditingInvoice(null); void fetchData(); }}
        />
      )}
    </div>
  );
}

const arrowBtn: React.CSSProperties = {
  padding: "6px 12px", borderRadius: 6, border: "1px solid var(--border)",
  background: "transparent", color: "var(--white)", fontSize: 16,
  cursor: "pointer", lineHeight: 1,
};

const thStyle: React.CSSProperties = {
  padding: "8px 10px", fontSize: 12, color: "var(--mist)", fontWeight: 500,
};

const tdStyle: React.CSSProperties = {
  padding: "10px 10px", fontSize: 13, color: "var(--white)", verticalAlign: "middle",
};
