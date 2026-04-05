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

      {overdueCount > 0 && (
        <div style={{ background: "#3b1010", borderRadius: 8, padding: "10px 16px", marginBottom: 14, fontSize: 13, color: "#ef4444", display: "flex", alignItems: "center", gap: 8 }}>
          <AlertTriangle size={16} /> {overdueCount} invoice{overdueCount > 1 ? "s" : ""} overdue (22+ days)
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
            const displayed = hidePaid ? invoices.filter((i) => (i.status as string) !== "paid") : invoices;
            const hidden = invoices.length - displayed.length;
            return `${displayed.length} invoice${displayed.length !== 1 ? "s" : ""}${hidden > 0 ? ` (${hidden} paid hidden)` : ""}`;
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
          {(hidePaid ? invoices.filter((i) => (i.status as string) !== "paid") : invoices).map((inv) => (
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
          {invoices.length === 0 && !loading && (
            <tr><td colSpan={7} style={{ ...tdStyle, textAlign: "center", color: "#64748b", padding: 40 }}>
              No invoices yet. Invoices are created automatically when you log a load.
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
