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

export default function InvoiceRow({ invoice, carriers, onMarkPaid, onFollowupSent, onStatusChanged, onEdit, onDeleted, onSendInvoice }: Props) {
  const id = invoice.id as string;
  const invoiceNumber = (invoice.invoice_number as string) || id.slice(0, 8);
  const carrierId = (invoice.carrier_id as string) || "";
  const carrierName = (invoice.carrier_name as string) || carriers.find(c => c.id === carrierId)?.legal_name || "—";
  const customerName = (invoice.broker_name as string) || "—";
  const customerApEmail = (invoice.customer_ap_email as string) || "";
  const amount = Number(invoice.amount || 0);
  const days = Number(invoice.days_outstanding || 0);
  const status = (invoice.status as string) || "pending";
  const followupsSent = Number(invoice.followups_sent || 0);
  const isPaid = status === "paid";
  const [editingCarrier, setEditingCarrier] = useState(false);

  const daysBadgeColor = days > 30 ? "#ef4444" : days >= 22 ? "#f59e0b" : days >= 8 ? "#60a5fa" : "#22c55e";

  const statusColor = (s: string) => {
    if (s === "paid") return "#22c55e";
    if (s === "overdue") return "#ef4444";
    if (s === "sent") return "#3b82f6";
    if (s === "shortpaid") return "#f97316";
    if (s === "claim") return "#dc2626";
    return "#f59e0b"; // pending
  };

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
    <tr style={{ borderBottom: "1px solid #1e293b", opacity: isPaid ? 0.5 : 1 }}>
      <td style={tdStyle}>{invoiceNumber}</td>
      <td style={tdStyle}>
        {editingCarrier ? (
          <select
            value={carrierId}
            onChange={(e) => handleCarrierChange(e.target.value)}
            onBlur={() => setEditingCarrier(false)}
            autoFocus
            style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #334155", background: "#0f172a", color: "#f8fafc", fontSize: 12, width: "100%" }}
          >
            <option value="">Select carrier…</option>
            {carriers.map((c) => (
              <option key={c.id} value={c.id}>{c.legal_name}</option>
            ))}
          </select>
        ) : (
          <span
            onClick={() => setEditingCarrier(true)}
            style={{ cursor: "pointer", borderBottom: "1px dashed #334155" }}
            title="Click to change carrier"
          >
            {carrierName}
          </span>
        )}
      </td>
      <td style={tdStyle}>
        <div style={{ fontSize: 13 }}>{customerName}</div>
        {customerApEmail && (
          <div style={{ fontSize: 11, color: "#94a3b8" }}>{customerApEmail}</div>
        )}
      </td>
      <td style={tdStyle}>${amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
      <td style={tdStyle}>
        <span style={{
          display: "inline-block", padding: "2px 8px", borderRadius: 12, fontSize: 12,
          background: daysBadgeColor, color: "#fff",
        }}>
          {days}d
        </span>
      </td>
      <td style={tdStyle}>
        <select
          value={status}
          onChange={(e) => handleStatusChange(e.target.value)}
          style={{
            fontSize: 12, padding: "2px 8px", borderRadius: 10, fontWeight: 600,
            background: `${statusColor(status)}22`, color: statusColor(status),
            border: `1px solid ${statusColor(status)}44`, cursor: "pointer",
            textTransform: "uppercase" as const,
          }}
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
          <button type="button" onClick={() => onEdit(invoice)} style={btnStyle}>
            Edit
          </button>
        )}
        {!isPaid && status !== "paid" && (
          <button
            type="button"
            onClick={() => onSendInvoice?.(invoice)}
            style={{ ...btnStyle, color: "#3b82f6", borderColor: "#3b82f6" }}
          >
            Send Invoice
          </button>
        )}
        {!isPaid && (
          <>
            <button type="button" onClick={() => onMarkPaid(id)} style={btnStyle}>
              Mark Paid
            </button>
            <FollowUpModal invoiceId={id} onSent={onFollowupSent} />
          </>
        )}
        <button type="button" onClick={async () => {
          if (!confirm("Delete this invoice?")) return;
          await deleteInvoice(id);
          onDeleted?.();
        }} style={{ ...btnStyle, color: "#ef4444", borderColor: "#ef444444" }}>
          Delete
        </button>
        {followupsSent > 0 && (
          <span style={{ fontSize: 11, color: "#94a3b8" }}>{followupsSent} sent</span>
        )}
      </td>
    </tr>
  );
}

const tdStyle: React.CSSProperties = { padding: "8px 12px", fontSize: 14 };
const btnStyle: React.CSSProperties = {
  padding: "4px 10px", borderRadius: 4, border: "1px solid #334155",
  background: "transparent", color: "#60a5fa", fontSize: 12, cursor: "pointer",
};
