"use client";

import { useEffect, useState } from "react";
import { Download, Loader, Mail, X } from "lucide-react";

import { cn } from "@/lib/cn";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import type { InvoiceRow } from "@/lib/types";

export type InvoiceSendModalData = InvoiceRow & {
  loads?: { load_number: string | null; origin: string; destination: string } | null;
};

type Props = {
  invoice: InvoiceSendModalData;
  carrierName: string;
  onClose: () => void;
  onSent: () => void;
};

type InvoiceDoc = {
  id: string;
  doc_type: string;
  file_name: string;
  file_url: string;
};

const DOC_LABELS: Record<string, string> = {
  BOL: "BOL",
  POD: "POD",
  RATE_CON: "Rate Con",
  WEIGHT_TICKET: "Weight Ticket",
  LUMPER_RECEIPT: "Lumper Receipt",
  INVOICE: "Invoice",
  OTHER: "Other",
};

function fmtCurrency(n: number | null | undefined) {
  const v = Number(n ?? 0);
  return "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function InvoiceSendModal({ invoice, carrierName, onClose, onSent }: Props) {
  const [supabase] = useState(() => (typeof window === "undefined" ? null : createBrowserSupabaseClient()));

  const invoiceNumber = invoice.invoice_number ?? invoice.id.slice(0, 8).toUpperCase();
  const brokerName = invoice.loads ? `${invoice.loads.origin} → ${invoice.loads.destination}` : "";
  const amount = Number(invoice.amount ?? 0);
  const issuedDate = invoice.issued_date ?? "";
  const dueDate = invoice.due_date ?? "";
  const defaultTo = invoice.customer_ap_email ?? "";

  const [to, setTo] = useState(defaultTo);
  const [subject, setSubject] = useState(
    `Invoice #${invoiceNumber} – ${carrierName} – ${fmtCurrency(amount)}`,
  );
  const [body, setBody] = useState(buildDefaultBody(invoiceNumber, carrierName, brokerName, amount, issuedDate, dueDate));
  const [documents, setDocuments] = useState<InvoiceDoc[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loadDocs = async () => {
      if (!supabase) return;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000/api/v1";
        const res = await fetch(`${apiBase}/paperwork/invoices/${invoice.id}/documents`, {
          headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
        });
        if (!res.ok) return;
        const json = await res.json() as { data?: { documents?: InvoiceDoc[] } };
        if (!cancelled) setDocuments(json.data?.documents ?? []);
      } catch {
        /* non-blocking */
      } finally {
        if (!cancelled) setLoadingDocs(false);
      }
    };
    void loadDocs();
    return () => { cancelled = true; };
  }, [invoice.id, supabase]);

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
    if (!supabase || !to.trim()) return;
    setSending(true);
    setSendError(null);

    const gmailUrl =
      `https://mail.google.com/mail/?view=cm&fs=1` +
      `&to=${encodeURIComponent(to)}` +
      `&su=${encodeURIComponent(subject)}` +
      `&body=${encodeURIComponent(body)}`;
    window.open(gmailUrl, "_blank");

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000/api/v1";
      await fetch(`${apiBase}/invoices/${invoice.id}/send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
      });
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Failed to mark invoice as sent");
    } finally {
      setSending(false);
    }

    setSent(true);
    setTimeout(() => { onSent(); onClose(); }, 1800);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl max-h-[88vh] overflow-y-auto rounded-xl border border-brand-border bg-brand-surface p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-brand-slate">Send Invoice</h2>
            <p className="mt-0.5 text-xs text-brand-slate-light">
              #{invoiceNumber} · {carrierName} · {fmtCurrency(amount)}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-brand-slate-light hover:text-brand-slate">
            <X size={18} />
          </button>
        </div>

        {sent ? (
          <div className="py-8 text-center">
            <p className="text-xl text-brand-success">✓</p>
            <p className="mt-2 text-sm font-semibold text-brand-slate">Gmail opened & invoice marked sent</p>
            <p className="mt-1 text-xs text-brand-slate-light">Attach the PDF you downloaded and click Send.</p>
          </div>
        ) : (
          <>
            <div className="mt-5 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-brand-slate-light">To</label>
                <input
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  type="email"
                  placeholder="ap@customer.com"
                  className="w-full rounded-lg border border-brand-border bg-brand-surface px-3 py-2 text-sm text-brand-slate focus:outline-none focus:ring-1 focus:ring-brand-amber"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-brand-slate-light">Subject</label>
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full rounded-lg border border-brand-border bg-brand-surface px-3 py-2 text-sm text-brand-slate focus:outline-none focus:ring-1 focus:ring-brand-amber"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-brand-slate-light">Body</label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={8}
                  className="w-full resize-y rounded-lg border border-brand-border bg-brand-surface px-3 py-2 font-mono text-xs leading-6 text-brand-slate focus:outline-none focus:ring-1 focus:ring-brand-amber"
                />
              </div>
            </div>

            <div className="mt-5 rounded-lg border border-brand-border bg-black/20 px-4 py-3">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-brand-slate-light">
                Documents to attach
              </p>

              <div className="flex items-center justify-between border-b border-brand-border py-2">
                <span className="text-sm text-brand-slate">📄 Invoice Summary (auto-generated PDF)</span>
                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  className="inline-flex items-center gap-1 rounded-md border border-brand-border px-3 py-1 text-xs font-semibold text-brand-amber hover:bg-brand-amber/10"
                >
                  <Download size={12} />
                  Download
                </button>
              </div>

              {loadingDocs ? (
                <p className="pt-2 text-xs text-brand-slate-light">Loading documents…</p>
              ) : documents.length === 0 ? (
                <p className="pt-2 text-xs text-brand-slate-light">No additional documents on file.</p>
              ) : (
                documents.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between border-b border-brand-border py-2">
                    <span className="truncate text-sm text-brand-slate">
                      📎 {DOC_LABELS[doc.doc_type] || doc.doc_type} —{" "}
                      <span className="text-xs text-brand-slate-light">{doc.file_name}</span>
                    </span>
                    <a
                      href={doc.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-md border border-brand-border px-3 py-1 text-xs text-brand-slate-light hover:text-brand-slate"
                    >
                      <Download size={12} />
                      Download
                    </a>
                  </div>
                ))
              )}
              <p className="mt-2 text-[11px] text-brand-slate-light">
                Download these files and attach them in Gmail before clicking Send.
              </p>
            </div>

            {!to.trim() && (
              <p className="mt-3 text-xs text-brand-warning">⚠ No AP email on file. Enter a recipient above.</p>
            )}
            {sendError && <p className="mt-2 text-xs text-brand-danger">{sendError}</p>}

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-brand-border px-4 py-2 text-sm text-brand-slate-light hover:text-brand-slate"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleOpenGmail}
                disabled={sending || !to.trim()}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg border border-amber-700/40 bg-brand-amber px-4 py-2 text-sm font-semibold text-black transition hover:bg-amber-400",
                  (sending || !to.trim()) && "opacity-60",
                )}
              >
                {sending ? <Loader size={14} className="animate-spin" /> : <Mail size={14} />}
                {sending ? "Opening…" : "Open in Gmail"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

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
    brokerName ? `  Lane:        ${brokerName}` : null,
    `  Amount Due:  ${fmtCurrency(amount)}`,
    issuedDate ? `  Invoice Date: ${new Date(issuedDate).toLocaleDateString()}` : null,
    dueDate ? `  Due Date:     ${new Date(dueDate).toLocaleDateString()}` : null,
    "",
    "Please remit payment by the due date. Let us know if you have any questions.",
    "",
    "Thank you,",
    carrierName,
  ];
  return lines.filter((l) => l !== null).join("\n");
}

function buildInvoicePrintHtml(
  invoice: InvoiceSendModalData,
  carrierName: string,
  brokerName: string,
  documents: InvoiceDoc[],
): string {
  const invoiceNumber = invoice.invoice_number ?? invoice.id.slice(0, 8).toUpperCase();
  const amount = Number(invoice.amount ?? 0);
  const issuedDate = invoice.issued_date ? new Date(invoice.issued_date).toLocaleDateString() : "—";
  const dueDate = invoice.due_date ? new Date(invoice.due_date).toLocaleDateString() : "—";
  const apEmail = invoice.customer_ap_email ?? "";
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
      <p>${apEmail ? apEmail : "—"}</p>
    </div>
    <div class="section">
      <h3>Invoice Details</h3>
      <p>
        Invoice Date: <strong>${issuedDate}</strong><br/>
        Due Date: <strong>${dueDate}</strong><br/>
        Carrier: <strong>${carrierName}</strong>${brokerName ? `<br/>Lane: <strong>${brokerName}</strong>` : ""}
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
      <div style="font-size:14px;font-weight:700;text-transform:uppercase;color:#f59e0b">${invoice.status ?? "Pending"}</div>
    </div>
  </div>

  ${documents.length > 0 ? `
  <div class="docs">
    <h3>Supporting Documents</h3>
    <ul>${docList}</ul>
  </div>` : ""}

  <div class="footer">
    Generated by FleetPulse · ${new Date().toLocaleDateString()} · Please contact ${carrierName} with any questions.
  </div>
</body>
</html>`;
}
