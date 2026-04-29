"use client";

import { useCallback, useEffect, useState } from "react";
import { listInvoices, listCarriers, markInvoicePaid, draftFollowup, getInvoice } from "../../../services/api";
import InvoiceRow from "../../../components/InvoiceRow";
import { AlertTriangle, X } from "../../../components/icons";
import AddInvoiceModal from "../../../components/AddInvoiceModal";
import InvoiceDetailModal from "../../../components/InvoiceDetailModal";
import InvoiceSendModal from "../../../components/InvoiceSendModal";

type Invoice = Record<string, unknown>;
type Carrier = { id: string; legal_name: string };

export default function InvoicePage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [carriers, setCarriers] = useState<Carrier[]>([]);
  const [total, setTotal] = useState(0);
  const [totalOutstanding, setTotalOutstanding] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState("days_outstanding");
  const [statusFilter, setStatusFilter] = useState("");
  const [hidePaid, setHidePaid] = useState(true);
  const [draftingAll, setDraftingAll] = useState(false);
  const [getPaidFaster, setGetPaidFaster] = useState(false);
  const [showAddInvoice, setShowAddInvoice] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [sendingInvoice, setSendingInvoice] = useState<Invoice | null>(null);

  const fetchInvoices = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const res = await listInvoices({
        sort_by: sortBy,
        order: "desc",
        status: statusFilter || undefined,
      });
      setInvoices((res.data as Invoice[]) || []);
      setTotal((res.meta?.total as number) || 0);
      setTotalOutstanding((res.meta?.total_outstanding as number) || 0);
    } catch {
      /* network error */
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [sortBy, statusFilter]);

  useEffect(() => {
    void fetchInvoices();
  }, [fetchInvoices]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const invoiceId = new URLSearchParams(window.location.search).get("invoiceId");
    if (!invoiceId) return;

    const existing = invoices.find((invoice) => invoice.id === invoiceId);
    if (existing) {
      setEditingInvoice(existing);
      return;
    }

    getInvoice(invoiceId).then((res) => {
      if (res.data) setEditingInvoice(res.data as Invoice);
    }).catch(() => {});
  }, [invoices]);

  const clearInvoiceQuery = useCallback(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    params.delete("invoiceId");
    const next = params.toString();
    window.history.replaceState(null, "", next ? `/invoices?${next}` : "/invoices");
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void fetchInvoices(false);
    }, 60000);
    return () => window.clearInterval(intervalId);
  }, [fetchInvoices]);

  useEffect(() => {
    listCarriers({ limit: 200 }).then((res) => {
      setCarriers((res.data as Carrier[]) || []);
    }).catch(() => {});
  }, []);

  const handleMarkPaid = async (id: string) => {
    const prev = [...invoices];
    setInvoices(invoices.map((inv) => (inv.id === id ? { ...inv, status: "paid" } : inv)));
    const res = await markInvoicePaid(id);
    if (res.error) {
      setInvoices(prev); // revert on failure (US3 AC5)
    } else {
      fetchInvoices();
    }
  };

  const handleDraftAll = async () => {
    const unpaid = invoices.filter((i) => (i.status as string) !== "paid");
    if (unpaid.length === 0) return;
    setDraftingAll(true);
    for (const inv of unpaid) {
      try {
        await draftFollowup(inv.id as string);
      } catch { /* individual failure is ok */ }
    }
    setDraftingAll(false);
    fetchInvoices();
  };

  const overdueCount = invoices.filter((i) => {
    const days = Number(i.days_outstanding || 0);
    return days >= 22 && (i.status as string) !== "paid";
  }).length;

  const urgentCount = invoices.filter((i) => (i.collection_status as string) === "urgent").length;
  const followUpCount = invoices.filter((i) => (i.collection_status as string) === "follow_up").length;

  const priorityRank: Record<string, number> = { high: 0, medium: 1, low: 2 };
  const displayedInvoices = (() => {
    let list = hidePaid ? invoices.filter((i) => (i.status as string) !== "paid") : invoices;
    if (getPaidFaster) {
      list = list.filter((i) => {
        const cs = i.collection_status as string;
        return cs === "follow_up" || cs === "urgent";
      });
      list = [...list].sort((a, b) => {
        const pa = priorityRank[a.priority as string] ?? 2;
        const pb = priorityRank[b.priority as string] ?? 2;
        if (pa !== pb) return pa - pb;
        return Number(b.days_outstanding || 0) - Number(a.days_outstanding || 0);
      });
    }
    return list;
  })();

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 22, margin: 0, fontWeight: 600 }}>Invoices</h1>
          <span style={{ fontSize: 13, color: "#94a3b8" }}>
            Outstanding: <strong style={{ color: "#f59e0b" }}>${totalOutstanding.toLocaleString()}</strong>
          </span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={() => setShowAddInvoice(true)} style={btnPrimary}>
            + Add Invoice
          </button>
          <button type="button" onClick={handleDraftAll} disabled={draftingAll}
            style={{ ...btnPrimary, background: "var(--blue)", opacity: draftingAll ? 0.6 : 1 }}>
            {draftingAll ? "Drafting\u2026" : "Draft All Follow-ups"}
          </button>
        </div>
      </div>

      {/* Summary bar */}
      <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, color: "#94a3b8" }}>
          <strong style={{ color: "#f59e0b" }}>${totalOutstanding.toLocaleString()}</strong> outstanding
          {urgentCount > 0 && (
            <> &nbsp;·&nbsp; <strong style={{ color: "#ef4444" }}>{urgentCount} urgent</strong></>
          )}
          {followUpCount > 0 && (
            <> &nbsp;·&nbsp; <strong style={{ color: "#f59e0b" }}>{followUpCount} follow-up{followUpCount !== 1 ? "s" : ""} needed</strong></>
          )}
        </span>
        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", marginLeft: "auto",
          fontSize: 13, fontWeight: 600,
          color: getPaidFaster ? "var(--amber)" : "var(--mist)",
          border: `1px solid ${getPaidFaster ? "var(--amber)" : "var(--border)"}`,
          borderRadius: 20, padding: "4px 14px",
          background: getPaidFaster ? "rgba(251,191,36,0.08)" : "transparent",
          transition: "all 0.15s",
        }}>
          <input type="checkbox" checked={getPaidFaster} onChange={(e) => setGetPaidFaster(e.target.checked)}
            style={{ accentColor: "var(--amber)", cursor: "pointer" }} />
          Get Paid Faster Mode
        </label>
      </div>

      {overdueCount > 0 && !getPaidFaster && (
        <div style={{ background: "#3b1010", borderRadius: 8, padding: "10px 16px", marginBottom: 14, fontSize: 13, color: "#ef4444", display: "flex", alignItems: "center", gap: 8 }}>
          <AlertTriangle size={16} /> {overdueCount} invoice{overdueCount > 1 ? "s" : ""} overdue (22+ days)
        </div>
      )}
      {getPaidFaster && (
        <div style={{ background: "rgba(251,191,36,0.08)", borderRadius: 8, padding: "10px 16px", marginBottom: 14, fontSize: 13, color: "var(--amber)", display: "flex", alignItems: "center", gap: 8, border: "1px solid rgba(251,191,36,0.2)" }}>
          <AlertTriangle size={16} /> Get Paid Faster Mode — showing {displayedInvoices.length} invoice{displayedInvoices.length !== 1 ? "s" : ""} needing follow-up, sorted by urgency
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        {["", "pending", "sent", "paid", "shortpaid", "claim", "overdue"].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(s)}
            className={`fp-chip${statusFilter === s ? " fp-chip--active" : ""}`}
          >
            {s === "shortpaid" ? "Short Paid" : s ? s.charAt(0).toUpperCase() + s.slice(1) : "All"}
          </button>
        ))}
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          style={{ marginLeft: "auto", padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border)",
            background: "var(--surface)", color: "var(--white)", fontSize: 13 }}
        >
          <option value="days_outstanding">Sort by Days Outstanding</option>
          <option value="amount">Sort by Amount</option>
          <option value="created_at">Sort by Date</option>
        </select>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
        <button
          type="button"
          onClick={() => setHidePaid((v) => !v)}
          style={{
            fontSize: 12, padding: "4px 12px", borderRadius: 20, cursor: "pointer",
            border: `1px solid ${hidePaid ? "var(--blue)" : "var(--border)"}`,
            background: hidePaid ? "rgba(56,189,248,0.1)" : "transparent",
            color: hidePaid ? "var(--blue)" : "var(--mist)",
          }}
        >
          {hidePaid ? "✓ Hiding paid" : "○ Show paid"}
        </button>
        <a href="/reports" style={{ fontSize: 12, color: "var(--mist)", textDecoration: "none" }}>
          Paid history → Monthly Reports
        </a>
        <p style={{ fontSize: 12, color: "#64748b", margin: 0, marginLeft: "auto" }}>
          {loading ? "Loading…" : (() => {
            const hidden = invoices.length - displayedInvoices.length;
            return `${displayedInvoices.length} invoice${displayedInvoices.length !== 1 ? "s" : ""}${hidden > 0 ? ` (${hidden} hidden)` : ""}`;
          })()}
        </p>
      </div>

      <div className="fp-table-wrap">
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid #1e293b", textAlign: "left" }}>
            <th style={thStyle}>Invoice #</th>
            <th style={thStyle}>Carrier</th>
            <th style={thStyle}>Customer / AP Email</th>
            <th style={thStyle}>Amount</th>
            <th style={thStyle}>Days</th>
            <th style={thStyle}>Status</th>
            <th style={thStyle}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {displayedInvoices.map((inv) => (
            <InvoiceRow
              key={inv.id as string}
              invoice={inv}
              carriers={carriers}
              onMarkPaid={handleMarkPaid}
              onFollowupSent={fetchInvoices}
              onStatusChanged={fetchInvoices}
              onDeleted={fetchInvoices}
              onEdit={(inv) => setEditingInvoice(inv)}
              onSendInvoice={(inv) => setSendingInvoice(inv)}
            />
          ))}
          {displayedInvoices.length === 0 && !loading && (
            <tr><td colSpan={7} style={{ ...tdStyle, textAlign: "center", color: "#64748b", padding: 40 }}>
              {getPaidFaster
                ? (invoices.every((i) => (i.status as string) === "paid") ? "You’re fully collected ✓" : "No outstanding payments needing follow-up")
                : "No invoices yet. Invoices are created automatically when you log a load."}
            </td></tr>
          )}
        </tbody>
      </table>
      </div>

      {/* Add Invoice Modal */}
      {showAddInvoice && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 100 }}>
          <div className="fp-modal" style={{ background: "var(--surface)", borderRadius: 12, padding: 24, width: 480, maxHeight: "80vh", overflowY: "auto", border: "1px solid var(--border)" }}>
            <button type="button" onClick={() => setShowAddInvoice(false)}
              style={{ float: "right", background: "none", border: "none", color: "var(--mist)", cursor: "pointer", display: "flex", alignItems: "center" }}><X size={18} /></button>
            <AddInvoiceModal onComplete={() => { setShowAddInvoice(false); fetchInvoices(); }} />
          </div>
        </div>
      )}

      {/* Invoice Detail Modal */}
      {editingInvoice && (
        <InvoiceDetailModal
          invoice={editingInvoice}
          carriers={carriers}
          onClose={() => { setEditingInvoice(null); clearInvoiceQuery(); }}
          onSaved={() => { setEditingInvoice(null); clearInvoiceQuery(); fetchInvoices(); }}
        />
      )}

      {/* Send Invoice Modal (from row action) */}
      {sendingInvoice && (
        <InvoiceSendModal
          invoice={sendingInvoice}
          carriers={carriers}
          onClose={() => setSendingInvoice(null)}
          onSent={() => { setSendingInvoice(null); fetchInvoices(); }}
        />
      )}
    </div>
  );
}

const btnPrimary: React.CSSProperties = {
  padding: "8px 16px", borderRadius: 6, border: "none", background: "var(--amber)",
  color: "#000", fontSize: 14, cursor: "pointer", fontWeight: 600,
};
const thStyle: React.CSSProperties = { padding: "8px 12px", fontSize: 12, color: "var(--mist)" };
const tdStyle: React.CSSProperties = { padding: "8px 12px", fontSize: 13 };
