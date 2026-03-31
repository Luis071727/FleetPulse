"use client";

import { useEffect, useState } from "react";
import { listInvoiceDocuments, sendInvoice } from "../services/api";
import { X } from "./icons";

type Invoice = Record<string, unknown>;
type Carrier = { id: string; legal_name: string };

type InvoiceDoc = {
  id: string;
  doc_type: string;
  file_name: string;
  file_url: string;
};

type Props = {
  invoice: Invoice;
  carriers: Carrier[];
  onClose: () => void;
  onSent: () => void;
};

const DOC_LABELS: Record<string, string> = {
  BOL: "BOL", POD: "POD", RATE_CON: "Rate Con",
  WEIGHT_TICKET: "Weight Ticket", LUMPER_RECEIPT: "Lumper Receipt",
  INVOICE: "Invoice", OTHER: "Other",
};

export default function InvoiceSendModal({ invoice, carriers, onClose, onSent }: Props) {
  const id = invoice.id as string;
  const invoiceNumber = (invoice.invoice_number as string) || id.slice(0, 8);
  const carrierId = (invoice.carrier_id as string) || "";
  const carrierName =
    (invoice.carrier_name as string) ||
    carriers.find((c) => c.id === carrierId)?.legal_name ||
    "—";
  const brokerName = (invoice.broker_name as string) || "";
  const amount = Number(invoice.amount || 0);
  const issuedDate = (invoice.issued_date as string) || "";
  const dueDate = (invoice.due_date as string) || "";

  const defaultTo = (invoice.customer_ap_email as string) || "";
  const defaultSubject = `Invoice #${invoiceNumber} – ${brokerName || carrierName} – $${amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
  const defaultBody = buildDefaultBody(invoiceNumber, carrierName, brokerName, amount, issuedDate, dueDate);

  const [to, setTo] = useState(defaultTo);
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody);
  const [documents, setDocuments] = useState<InvoiceDoc[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    listInvoiceDocuments(id)
      .then((res) => {
        if (res.data) {
          const data = res.data as { documents: InvoiceDoc[] };
          setDocuments(data.documents || []);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingDocs(false));
  }, [id]);

  const handleDownloadPdf = () => {
    const html = buildInvoicePrintHtml(invoice, carrierName, brokerName, documents);
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 400);
  };

  const handleOpenGmail = async () => {
    const gmailUrl =
      `https://mail.google.com/mail/?view=cm&fs=1` +
      `&to=${encodeURIComponent(to)}` +
      `&su=${encodeURIComponent(subject)}` +
      `&body=${encodeURIComponent(body)}`;

    window.open(gmailUrl, "_blank");

    // Mark as sent in the backend
    setSending(true);
    try {
      await sendInvoice(id);
    } catch { /* non-blocking */ }
    finally { setSending(false); }

    setSent(true);
    setTimeout(() => { onSent(); onClose(); }, 1800);
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 200 }}
      onClick={onClose}
    >
      <div
        style={{ background: "var(--surface)", borderRadius: 14, padding: 24, width: 560, maxHeight: "88vh", overflowY: "auto", border: "1px solid var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Send Invoice</h2>
            <p style={{ margin: "3px 0 0", fontSize: 12, color: "var(--mist)" }}>
              #{invoiceNumber} · {carrierName} · ${amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </p>
          </div>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", color: "var(--mist)", cursor: "pointer", display: "flex", alignItems: "center" }}>
            <X size={18} />
          </button>
        </div>

        {sent ? (
          <div style={{ textAlign: "center", padding: "32px 0" }}>
            <p style={{ fontSize: 20, marginBottom: 6 }}>✓</p>
            <p style={{ fontSize: 15, fontWeight: 600, margin: "0 0 6px" }}>Gmail opened & invoice marked sent</p>
            <p style={{ fontSize: 13, color: "var(--mist)", margin: 0 }}>Attach the PDF you downloaded and click Send.</p>
          </div>
        ) : (
          <>
            {/* Email fields */}
            <div style={{ marginBottom: 14 }}>
              <label style={lblStyle}>To</label>
              <input
                value={to}
                onChange={(e) => setTo(e.target.value)}
                type="email"
                placeholder="ap@customer.com"
                style={inpStyle}
              />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={lblStyle}>Subject</label>
              <input value={subject} onChange={(e) => setSubject(e.target.value)} style={inpStyle} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={lblStyle}>Body</label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={8}
                style={{ ...inpStyle, resize: "vertical", lineHeight: 1.55, fontFamily: "monospace", fontSize: 12 }}
              />
            </div>

            {/* Documents to attach */}
            <div style={{ marginBottom: 20, padding: "12px 14px", background: "var(--bg)", borderRadius: 10 }}>
              <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 700, color: "var(--mist)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Documents to attach
              </p>
              {/* Generated invoice PDF */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
                <span style={{ fontSize: 13 }}>📄 Invoice Summary (auto-generated PDF)</span>
                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  style={{ fontSize: 12, padding: "3px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "transparent", color: "var(--amber)", cursor: "pointer", fontWeight: 600 }}
                >
                  Download
                </button>
              </div>

              {/* Uploaded load documents */}
              {loadingDocs ? (
                <p style={{ fontSize: 12, color: "var(--mist)", margin: "8px 0 0" }}>Loading documents…</p>
              ) : documents.length === 0 ? (
                <p style={{ fontSize: 12, color: "var(--mist)", margin: "8px 0 0" }}>No additional documents on file.</p>
              ) : (
                documents.map((doc) => (
                  <div key={doc.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
                    <span style={{ fontSize: 13 }}>
                      📎 {DOC_LABELS[doc.doc_type] || doc.doc_type} — <span style={{ color: "var(--mist)", fontSize: 12 }}>{doc.file_name}</span>
                    </span>
                    <a
                      href={doc.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: 12, padding: "3px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "transparent", color: "var(--mist)", cursor: "pointer", textDecoration: "none" }}
                    >
                      Download
                    </a>
                  </div>
                ))
              )}
              <p style={{ margin: "8px 0 0", fontSize: 11, color: "var(--mist)" }}>
                Download these files and attach them in Gmail before clicking Send.
              </p>
            </div>

            {/* Actions */}
            {!to.trim() && (
              <p style={{ fontSize: 12, color: "#f59e0b", marginBottom: 8 }}>⚠ No AP email on file. Enter a recipient above.</p>
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" onClick={onClose} style={btnGhostStyle}>Cancel</button>
              <button
                type="button"
                onClick={handleOpenGmail}
                disabled={sending || !to.trim()}
                style={{ ...btnAmberStyle, opacity: sending || !to.trim() ? 0.55 : 1 }}
              >
                {sending ? "Opening…" : "Open in Gmail"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ── Helpers ── */

function buildDefaultBody(
  invoiceNumber: string,
  carrierName: string,
  brokerName: string,
  amount: number,
  issuedDate: string,
  dueDate: string,
): string {
  const lines = [
    "Hello,",
    "",
    `Please find attached Invoice #${invoiceNumber} for freight transportation services.`,
    "",
    `  Carrier:     ${carrierName}`,
    brokerName ? `  Customer:    ${brokerName}` : null,
    `  Amount Due:  $${amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
    issuedDate ? `  Invoice Date: ${new Date(issuedDate).toLocaleDateString()}` : null,
    dueDate ? `  Due Date:     ${new Date(dueDate).toLocaleDateString()}` : null,
    "",
    "Please remit payment by the due date. Let us know if you have any questions.",
    "",
    "Thank you,",
    "FleetPulse Dispatch",
  ];
  return lines.filter((l) => l !== null).join("\n");
}

function buildInvoicePrintHtml(
  invoice: Record<string, unknown>,
  carrierName: string,
  brokerName: string,
  documents: InvoiceDoc[],
): string {
  const invoiceNumber = (invoice.invoice_number as string) || String(invoice.id as string).slice(0, 8);
  const amount = Number(invoice.amount || 0);
  const issuedDate = invoice.issued_date ? new Date(invoice.issued_date as string).toLocaleDateString() : "—";
  const dueDate = invoice.due_date ? new Date(invoice.due_date as string).toLocaleDateString() : "—";
  const apEmail = (invoice.customer_ap_email as string) || "";
  const docList = documents.map((d) => `<li>${DOC_LABELS[d.doc_type] || d.doc_type} — ${d.file_name}</li>`).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Invoice #${invoiceNumber}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, Arial, sans-serif; color: #111; background: #fff; padding: 48px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; border-bottom: 3px solid #f59e0b; padding-bottom: 20px; }
    .logo { font-size: 24px; font-weight: 800; color: #f59e0b; letter-spacing: -0.5px; }
    .logo span { color: #111; }
    .invoice-label { text-align: right; }
    .invoice-label h1 { font-size: 36px; font-weight: 800; color: #111; letter-spacing: -1px; }
    .invoice-label p { font-size: 14px; color: #555; margin-top: 4px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-bottom: 32px; }
    .section h3 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #888; margin-bottom: 8px; }
    .section p { font-size: 14px; color: #111; line-height: 1.6; }
    .amount-box { background: #fafafa; border: 2px solid #f59e0b; border-radius: 10px; padding: 20px 24px; margin-bottom: 32px; display: flex; justify-content: space-between; align-items: center; }
    .amount-box .label { font-size: 13px; color: #555; }
    .amount-box .value { font-size: 28px; font-weight: 800; color: #111; }
    .docs { margin-bottom: 32px; }
    .docs h3 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #888; margin-bottom: 8px; }
    .docs ul { padding-left: 18px; }
    .docs li { font-size: 13px; color: #333; line-height: 1.8; }
    .footer { border-top: 1px solid #e5e7eb; padding-top: 16px; font-size: 12px; color: #888; text-align: center; }
    @media print {
      body { padding: 32px; }
      @page { margin: 0.5in; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">Fleet<span>Pulse</span></div>
    <div class="invoice-label">
      <h1>INVOICE</h1>
      <p>#${invoiceNumber}</p>
    </div>
  </div>

  <div class="grid">
    <div class="section">
      <h3>Bill To</h3>
      <p><strong>${brokerName || "—"}</strong>${apEmail ? `<br/>${apEmail}` : ""}</p>
    </div>
    <div class="section">
      <h3>Invoice Details</h3>
      <p>
        Invoice Date: <strong>${issuedDate}</strong><br/>
        Due Date: <strong>${dueDate}</strong><br/>
        Carrier: <strong>${carrierName}</strong>
      </p>
    </div>
  </div>

  <div class="amount-box">
    <div>
      <div class="label">Amount Due</div>
      <div class="value">$${amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
    </div>
    <div style="text-align:right">
      <div class="label">Status</div>
      <div style="font-size:14px;font-weight:700;text-transform:uppercase;color:#f59e0b">${(invoice.status as string) || "Pending"}</div>
    </div>
  </div>

  ${documents.length > 0 ? `
  <div class="docs">
    <h3>Supporting Documents</h3>
    <ul>${docList}</ul>
  </div>` : ""}

  <div class="footer">
    Generated by FleetPulse · ${new Date().toLocaleDateString()} · Please contact dispatch with any questions.
  </div>
</body>
</html>`;
}

const lblStyle: React.CSSProperties = { fontSize: 11, color: "var(--mist)", display: "block", marginBottom: 3, fontWeight: 500 };
const inpStyle: React.CSSProperties = { padding: "8px 12px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--white)", fontSize: 14, width: "100%", boxSizing: "border-box" as const };
const btnAmberStyle: React.CSSProperties = { padding: "8px 18px", borderRadius: 6, border: "none", background: "var(--amber)", color: "#000", fontSize: 14, cursor: "pointer", fontWeight: 700 };
const btnGhostStyle: React.CSSProperties = { padding: "8px 16px", borderRadius: 6, border: "1px solid var(--border)", background: "transparent", color: "var(--mist)", fontSize: 14, cursor: "pointer" };
