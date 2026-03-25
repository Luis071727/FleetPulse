"use client";

import { useCallback, useEffect, useState } from "react";
import { listInvoices, listCarriers, markInvoicePaid, draftFollowup, updateInvoice, getInvoice } from "../../../services/api";
import InvoiceRow from "../../../components/InvoiceRow";
import { AlertTriangle, X } from "../../../components/icons";
import AddInvoiceModal from "../../../components/AddInvoiceModal";

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
  const [draftingAll, setDraftingAll] = useState(false);
  const [showAddInvoice, setShowAddInvoice] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);

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

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
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

      <p style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>
        {loading ? "Loading…" : `${total} invoice${total !== 1 ? "s" : ""}`}
      </p>

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
          {invoices.map((inv) => (
            <InvoiceRow
              key={inv.id as string}
              invoice={inv}
              carriers={carriers}
              onMarkPaid={handleMarkPaid}
              onFollowupSent={fetchInvoices}
              onStatusChanged={fetchInvoices}
              onDeleted={fetchInvoices}
              onEdit={(inv) => setEditingInvoice(inv)}
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

      {/* Edit Invoice Modal */}
      {editingInvoice && (
        <EditInvoiceModal
          invoice={editingInvoice}
          carriers={carriers}
          onClose={() => { setEditingInvoice(null); clearInvoiceQuery(); }}
          onSaved={() => { setEditingInvoice(null); clearInvoiceQuery(); fetchInvoices(); }}
        />
      )}
    </div>
  );
}

/* ── Edit Invoice Modal ── */

function EditInvoiceModal({ invoice, carriers, onClose, onSaved }: {
  invoice: Invoice; carriers: { id: string; legal_name: string }[];
  onClose: () => void; onSaved: () => void;
}) {
  const [amount, setAmount] = useState(String(invoice.amount || ""));
  const [invoiceNumber, setInvoiceNumber] = useState((invoice.invoice_number as string) || "");
  const [carrierId, setCarrierId] = useState((invoice.carrier_id as string) || "");
  const [customerApEmail, setCustomerApEmail] = useState((invoice.customer_ap_email as string) || "");
  const [notes, setNotes] = useState((invoice.notes as string) || "");
  const [issuedDate, setIssuedDate] = useState((invoice.issued_date as string) || "");
  const [dueDate, setDueDate] = useState((invoice.due_date as string) || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const updates: Record<string, unknown> = {};
      const numAmount = Number(amount);
      if (!isNaN(numAmount) && numAmount !== Number(invoice.amount)) updates.amount = numAmount;
      if (invoiceNumber !== (invoice.invoice_number || "")) updates.invoice_number = invoiceNumber;
      if (carrierId && carrierId !== invoice.carrier_id) updates.carrier_id = carrierId;
      if (customerApEmail !== (invoice.customer_ap_email || "")) updates.customer_ap_email = customerApEmail;
      if (notes !== (invoice.notes || "")) updates.notes = notes;
      if (issuedDate && issuedDate !== invoice.issued_date) updates.issued_date = issuedDate;
      if (dueDate && dueDate !== invoice.due_date) updates.due_date = dueDate;

      if (Object.keys(updates).length === 0) {
        onSaved();
        return;
      }
      const res = await updateInvoice(invoice.id as string, updates);
      if (res.error) setError(res.error);
      else onSaved();
    } catch { setError("Network error"); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 100 }}
      onClick={onClose}>
      <div className="fp-modal" style={{ background: "var(--surface)", borderRadius: 12, padding: 24, width: 480, maxHeight: "80vh", overflowY: "auto", border: "1px solid var(--border)" }}
        onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Edit Invoice</h2>
          <button type="button" onClick={onClose}
            style={{ background: "none", border: "none", color: "var(--mist)", cursor: "pointer", display: "flex", alignItems: "center" }}><X size={18} /></button>
        </div>

        <div className="fp-form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
          <div>
            <label style={lblStyle}>Invoice #</label>
            <input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} style={inpStyle} />
          </div>
          <div>
            <label style={lblStyle}>Carrier</label>
            <select value={carrierId} onChange={(e) => setCarrierId(e.target.value)} style={inpStyle}>
              <option value="">Select carrier…</option>
              {carriers.map((c) => <option key={c.id} value={c.id}>{c.legal_name}</option>)}
            </select>
          </div>
          <div>
            <label style={lblStyle}>Amount ($)</label>
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} style={inpStyle} />
          </div>
          <div>
            <label style={lblStyle}>Issued Date</label>
            <input type="date" value={issuedDate} onChange={(e) => setIssuedDate(e.target.value)} style={inpStyle} />
          </div>
          <div>
            <label style={lblStyle}>Due Date</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={inpStyle} />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={lblStyle}>Customer AP Email</label>
            <input type="email" value={customerApEmail} onChange={(e) => setCustomerApEmail(e.target.value)} style={inpStyle} placeholder="ap@customer.com" />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={lblStyle}>Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} style={{ ...inpStyle, resize: "vertical" }} />
          </div>
        </div>

        {error && <p style={{ color: "var(--red)", fontSize: 13 }}>{error}</p>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" onClick={onClose} style={{ padding: "8px 16px", borderRadius: 6, border: "1px solid var(--border)", background: "transparent", color: "var(--mist)", fontSize: 14, cursor: "pointer" }}>Cancel</button>
          <button type="button" onClick={handleSave} disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }}>
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

const lblStyle: React.CSSProperties = { fontSize: 11, color: "var(--mist)", display: "block", marginBottom: 3, fontWeight: 500 };
const inpStyle: React.CSSProperties = { padding: "8px 12px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--white)", fontSize: 14, width: "100%" };

const btnPrimary: React.CSSProperties = {
  padding: "8px 16px", borderRadius: 6, border: "none", background: "var(--amber)",
  color: "#000", fontSize: 14, cursor: "pointer", fontWeight: 600,
};
const thStyle: React.CSSProperties = { padding: "8px 12px", fontSize: 12, color: "var(--mist)" };
const tdStyle: React.CSSProperties = { padding: "8px 12px", fontSize: 13 };
