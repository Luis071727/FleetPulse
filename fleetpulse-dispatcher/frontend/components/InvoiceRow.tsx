"use client";

import { useState } from "react";
import FollowUpModal from "./FollowUpModal";
import { updateInvoice, deleteInvoice } from "../services/api";

type Carrier = { id: string; legal_name: string };

type Props = {
  invoice: Record<string, unknown>;
  carriers: Carrier[];
  onMarkPaid: (id: string) => void;
  onFollowupSent: () => void;
  onStatusChanged?: () => void;
  onEdit?: (invoice: Record<string, unknown>) => void;
  onDeleted?: () => void;
  onSendInvoice?: (invoice: Record<string, unknown>) => void;
};

const DAYS_BADGE_CLASS = (days: number) => {
  if (days > 30)  return "fp-badge fp-badge--overdue";
  if (days >= 22) return "fp-badge fp-badge--idle";
  if (days >= 8)  return "fp-badge fp-badge--sent";
  return "fp-badge fp-badge--active";
};

const STATUS_BADGE_CLASS: Record<string, string> = {
  paid:      "fp-badge fp-badge--paid",
  overdue:   "fp-badge fp-badge--overdue",
  sent:      "fp-badge fp-badge--sent",
  shortpaid: "fp-badge fp-badge--shortpaid",
  claim:     "fp-badge fp-badge--claim",
  pending:   "fp-badge fp-badge--pending",
};

const STATUS_SELECT_STYLE = (status: string): React.CSSProperties => {
  const colorMap: Record<string, string> = {
    paid:      "var(--green)",
    overdue:   "var(--red)",
    sent:      "var(--blue-action)",
    shortpaid: "var(--orange)",
    claim:     "var(--red)",
    pending:   "var(--amber)",
  };
  const c = colorMap[status] ?? "var(--amber)";
  return {
    fontSize: 12, padding: "2px 8px", borderRadius: 10, fontWeight: 600,
    background: `color-mix(in srgb, ${c} 15%, transparent)`,
    color: c,
    border: `1px solid color-mix(in srgb, ${c} 30%, transparent)`,
    cursor: "pointer",
    textTransform: "uppercase",
    fontFamily: "inherit",
  };
};

export default function InvoiceRow({ invoice, carriers, onMarkPaid, onFollowupSent, onStatusChanged, onEdit, onDeleted, onSendInvoice }: Props) {
  const id            = invoice.id as string;
  const invoiceNumber = (invoice.invoice_number as string) || id.slice(0, 8);
  const carrierId     = (invoice.carrier_id as string) || "";
  const carrierName   = (invoice.carrier_name as string) || carriers.find(c => c.id === carrierId)?.legal_name || "—";
  const customerName  = (invoice.broker_name as string) || "—";
  const customerApEmail = (invoice.customer_ap_email as string) || "";
  const amount        = Number(invoice.amount || 0);
  const days          = Number(invoice.days_outstanding || 0);
  const status        = (invoice.status as string) || "pending";
  const followupsSent = Number(invoice.followups_sent || 0);
  const isPaid        = status === "paid";
  const [editingCarrier, setEditingCarrier] = useState(false);

  const handleStatusChange = async (newStatus: string) => {
    await updateInvoice(id, {
      status: newStatus,
      ...(newStatus === "paid" ? { paid_date: new Date().toISOString().split("T")[0] } : {}),
    });
    onStatusChanged?.();
  };

  const handleCarrierChange = async (newCarrierId: string) => {
    await updateInvoice(id, { carrier_id: newCarrierId });
    setEditingCarrier(false);
    onStatusChanged?.();
  };

  return (
    <tr style={{ borderBottom: "1px solid var(--border)", opacity: isPaid ? 0.5 : 1 }}>
      <td style={tdStyle}>{invoiceNumber}</td>

      <td style={tdStyle}>
        {editingCarrier ? (
          <select
            value={carrierId}
            onChange={(e) => handleCarrierChange(e.target.value)}
            onBlur={() => setEditingCarrier(false)}
            autoFocus
            className="fp-select fp-select--sm"
          >
            <option value="">Select carrier…</option>
            {carriers.map((c) => (
              <option key={c.id} value={c.id}>{c.legal_name}</option>
            ))}
          </select>
        ) : (
          <span
            onClick={() => setEditingCarrier(true)}
            style={{ cursor: "pointer", borderBottom: "1px dashed var(--border-input)" }}
            title="Click to change carrier"
          >
            {carrierName}
          </span>
        )}
      </td>

      <td style={tdStyle}>
        <div style={{ fontSize: 13 }}>{customerName}</div>
        {customerApEmail && <div style={{ fontSize: 11, color: "var(--mistLt)" }}>{customerApEmail}</div>}
      </td>

      <td style={tdStyle}>${amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>

      <td style={tdStyle}>
        <span className={DAYS_BADGE_CLASS(days)}>{days}d</span>
      </td>

      <td style={tdStyle}>
        <select
          value={status}
          onChange={(e) => handleStatusChange(e.target.value)}
          style={STATUS_SELECT_STYLE(status)}
        >
          <option value="pending">Pending</option>
          <option value="sent">Sent</option>
          <option value="paid">Paid</option>
          <option value="shortpaid">Short Paid</option>
          <option value="claim">Claim</option>
          <option value="overdue">Overdue</option>
        </select>
      </td>

      <td style={{ ...tdStyle, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        {onEdit && (
          <button type="button" onClick={() => onEdit(invoice)} className="fp-btn fp-btn--sm fp-btn--outline">
            Edit
          </button>
        )}
        {!isPaid && status !== "paid" && (
          <button type="button" onClick={() => onSendInvoice?.(invoice)} className="fp-btn fp-btn--sm fp-btn--outline">
            Send Invoice
          </button>
        )}
        {!isPaid && (
          <>
            <button type="button" onClick={() => onMarkPaid(id)} className="fp-btn fp-btn--sm fp-btn--ghost">
              Mark Paid
            </button>
            <FollowUpModal invoiceId={id} onSent={onFollowupSent} />
          </>
        )}
        <button
          type="button"
          onClick={async () => {
            if (!confirm("Delete this invoice?")) return;
            await deleteInvoice(id);
            onDeleted?.();
          }}
          className="fp-btn fp-btn--sm fp-btn--danger"
        >
          Delete
        </button>
        {followupsSent > 0 && (
          <span style={{ fontSize: 11, color: "var(--mistLt)" }}>{followupsSent} sent</span>
        )}
      </td>
    </tr>
  );
}

const tdStyle: React.CSSProperties = { padding: "8px 12px", fontSize: 14 };
