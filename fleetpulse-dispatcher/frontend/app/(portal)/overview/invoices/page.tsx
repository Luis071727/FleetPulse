"use client";

import { useEffect, useState } from "react";
import { listInvoices, listInvoiceDocuments, getUser } from "../../../../services/api";

type R = Record<string, unknown>;

const STATUS_COLORS: Record<string, string> = {
  pending: "#f59e0b",
  sent: "#3b82f6",
  paid: "#22c55e",
  overdue: "#ef4444",
  shortpaid: "#f97316",
  claim: "#a78bfa",
};

function statusLabel(s: string) {
  return s === "shortpaid" ? "Short Paid" : s.charAt(0).toUpperCase() + s.slice(1);
}

function fmtDate(v: unknown) {
  if (typeof v !== "string" || !v) return "—";
  const d = new Date(v);
  if (isNaN(d.getTime())) return v;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtAmt(v: unknown) {
  return `$${Number(v || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const DOC_TYPE_LABELS: Record<string, string> = {
  BOL: "Bill of Lading",
  POD: "Proof of Delivery",
  RATE_CON: "Rate Confirmation",
  WEIGHT_TICKET: "Weight Ticket",
  LUMPER_RECEIPT: "Lumper Receipt",
  INVOICE: "Invoice",
  OTHER: "Other",
};

function DocBadge({ type, uploaded }: { type: string; uploaded: boolean }) {
  const color = uploaded ? "#22c55e" : "#64748b";
  return (
    <span style={{
      fontSize: 11, padding: "3px 8px", borderRadius: 10, fontWeight: 600,
      background: `${color}22`, color, border: `1px solid ${color}44`,
      display: "inline-flex", alignItems: "center", gap: 4,
    }}>
      {uploaded ? "✓" : "○"} {DOC_TYPE_LABELS[type] || type}
    </span>
  );
}

function InvoiceDetailPanel({ invoice, onClose }: { invoice: R; onClose: () => void }) {
  const [docs, setDocs] = useState<{ documents: R[]; requests: R[] } | null>(null);
  const [loadingDocs, setLoadingDocs] = useState(true);

  useEffect(() => {
    const id = invoice.id as string;
    if (!id) return;
    listInvoiceDocuments(id)
      .then((res) => {
        const data = res.data as { documents?: R[]; requests?: R[] } | null;
        setDocs({ documents: data?.documents || [], requests: data?.requests || [] });
      })
      .catch(() => setDocs({ documents: [], requests: [] }))
      .finally(() => setLoadingDocs(false));
  }, [invoice.id]);

  const uploadedTypes = new Set((docs?.documents || []).map((d) => d.doc_type as string));
  const requestedTypes = (docs?.requests || []).flatMap((r) => (r.doc_types as string[]) || []);
  const allTypes = requestedTypes.length > 0 ? requestedTypes : Array.from(uploadedTypes);

  const status = (invoice.status as string) || "pending";
  const statusColor = STATUS_COLORS[status] || "#94a3b8";

  return (
    <div style={{ background: "#0d1318", border: "1px solid #1e293b", borderRadius: 10, padding: 20, marginTop: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <div>
          <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 2px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Invoice</p>
          <p style={{ fontSize: 17, fontWeight: 700, color: "#f0f6fc", margin: 0, fontFamily: "'IBM Plex Mono', monospace" }}>
            {(invoice.invoice_number as string) || `#${String(invoice.id).slice(0, 8)}`}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 18, lineHeight: 1, padding: 4 }}
        >
          ×
        </button>
      </div>

      {/* Key fields */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 12, marginBottom: 16 }}>
        <Field label="Amount" value={fmtAmt(invoice.amount)} highlight />
        <Field label="Status">
          <span style={{ fontSize: 13, fontWeight: 600, color: statusColor }}>{statusLabel(status)}</span>
        </Field>
        <Field label="Broker" value={(invoice.broker_name as string) || "—"} />
        <Field label="Issued" value={fmtDate(invoice.issued_date)} />
        <Field label="Due" value={fmtDate(invoice.due_date)} />
        <Field label="Paid Date" value={fmtDate(invoice.paid_date)} />
      </div>

      {/* Documents */}
      <div>
        <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Documents
        </p>
        {loadingDocs ? (
          <p style={{ fontSize: 13, color: "#64748b" }}>Loading…</p>
        ) : allTypes.length === 0 && uploadedTypes.size === 0 ? (
          <p style={{ fontSize: 13, color: "#64748b", fontStyle: "italic" }}>No documents requested yet.</p>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {allTypes.length > 0
              ? allTypes.map((type, i) => (
                  <DocBadge key={i} type={type} uploaded={uploadedTypes.has(type)} />
                ))
              : Array.from(uploadedTypes).map((type) => (
                  <DocBadge key={type} type={type} uploaded />
                ))}
          </div>
        )}

        {/* Uploaded file list */}
        {(docs?.documents || []).length > 0 && (
          <div style={{ marginTop: 12 }}>
            <p style={{ fontSize: 11, color: "#475569", margin: "0 0 6px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Uploaded Files</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {(docs!.documents).map((doc) => (
                <div key={doc.id as string} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                  <span style={{ color: "#22c55e", fontSize: 11 }}>✓</span>
                  <span style={{ color: "#94a3b8", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {(doc.file_name as string) || "file"}
                  </span>
                  <span style={{ fontSize: 11, color: "#475569" }}>
                    {DOC_TYPE_LABELS[doc.doc_type as string] || (doc.doc_type as string)}
                  </span>
                  {doc.file_url && (
                    <a
                      href={doc.file_url as string}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: 11, color: "#3b82f6", textDecoration: "none" }}
                    >
                      View
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, highlight, children }: { label: string; value?: string; highlight?: boolean; children?: React.ReactNode }) {
  return (
    <div>
      <p style={{ fontSize: 11, color: "#64748b", margin: "0 0 2px", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</p>
      {children ?? (
        <p style={{ fontSize: 14, fontWeight: highlight ? 700 : 500, color: highlight ? "#f0f6fc" : "#94a3b8", margin: 0 }}>
          {value || "—"}
        </p>
      )}
    </div>
  );
}

export default function PortalInvoicesPage() {
  const [invoices, setInvoices] = useState<R[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hidePaid, setHidePaid] = useState(false);

  useEffect(() => {
    const fetchInvoices = async () => {
      const user = getUser();
      const carrierId = user?.carrier_id as string | undefined;
      try {
        const res = await listInvoices({ carrier_id: carrierId, limit: 200, sort_by: "issued_date", order: "desc" });
        setInvoices((res.data as R[]) || []);
      } catch { /* network error */ }
      finally { setLoading(false); }
    };

    void fetchInvoices();
    const id = window.setInterval(() => { void fetchInvoices(); }, 60000);
    return () => window.clearInterval(id);
  }, []);

  const displayed = hidePaid ? invoices.filter((i) => i.status !== "paid") : invoices;

  const totalOutstanding = invoices
    .filter((i) => i.status !== "paid")
    .reduce((sum, i) => sum + Number(i.amount || 0), 0);

  const paidCount = invoices.filter((i) => i.status === "paid").length;

  if (loading) return <p style={{ color: "#94a3b8" }}>Loading invoices…</p>;

  return (
    <section>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 20, margin: "0 0 4px" }}>My Invoices</h2>
          <p style={{ fontSize: 13, color: "#64748b", margin: 0 }}>
            Outstanding: <strong style={{ color: "#f59e0b" }}>{fmtAmt(totalOutstanding)}</strong>
          </p>
        </div>
        {paidCount > 0 && (
          <button
            type="button"
            onClick={() => setHidePaid((v) => !v)}
            style={{
              fontSize: 12, padding: "5px 12px", borderRadius: 20, cursor: "pointer",
              border: `1px solid ${hidePaid ? "#3b82f6" : "#334155"}`,
              background: hidePaid ? "rgba(59,130,246,0.12)" : "transparent",
              color: hidePaid ? "#3b82f6" : "#94a3b8",
            }}
          >
            {hidePaid ? `✓ Hiding ${paidCount} paid` : `Show all (${paidCount} paid)`}
          </button>
        )}
      </div>

      {displayed.length === 0 ? (
        <p style={{ color: "#64748b" }}>No invoices found.</p>
      ) : (
        <div>
          {displayed.map((inv) => {
            const id = inv.id as string;
            const status = (inv.status as string) || "pending";
            const statusColor = STATUS_COLORS[status] || "#94a3b8";
            const days = Number(inv.days_outstanding || 0);
            const daysColor = days >= 22 ? "#ef4444" : days >= 8 ? "#f59e0b" : "#22c55e";
            const isOpen = selectedId === id;

            return (
              <div key={id}>
                <div
                  onClick={() => setSelectedId(isOpen ? null : id)}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 90px 70px 90px 24px",
                    gap: 8,
                    alignItems: "center",
                    padding: "12px 10px",
                    borderBottom: "1px solid #0f172a",
                    cursor: "pointer",
                    background: isOpen ? "rgba(255,255,255,0.03)" : "transparent",
                    borderRadius: isOpen ? "6px 6px 0 0" : 0,
                  }}
                >
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#f0f6fc", fontFamily: "'IBM Plex Mono', monospace" }}>
                      {(inv.invoice_number as string) || `#${id.slice(0, 8)}`}
                    </span>
                    {inv.broker_name && (
                      <span style={{ fontSize: 11, color: "#64748b", marginLeft: 8 }}>{inv.broker_name as string}</span>
                    )}
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#f0f6fc" }}>{fmtAmt(inv.amount)}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: daysColor }}>{days}d</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: statusColor }}>{statusLabel(status)}</span>
                  <span style={{ color: "#64748b", fontSize: 14, textAlign: "right" as const }}>{isOpen ? "▲" : "▼"}</span>
                </div>
                {isOpen && <InvoiceDetailPanel invoice={inv} onClose={() => setSelectedId(null)} />}
              </div>
            );
          })}
        </div>
      )}

      {paidCount > 0 && !hidePaid && (
        <p style={{ fontSize: 12, color: "#475569", marginTop: 12, textAlign: "center" as const }}>
          {paidCount} paid invoice{paidCount !== 1 ? "s" : ""} shown above
        </p>
      )}
    </section>
  );
}
