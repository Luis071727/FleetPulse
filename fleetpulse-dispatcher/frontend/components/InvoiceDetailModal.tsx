"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { updateInvoice, listInvoiceDocuments, uploadInvoiceFileDirect, updateInvoiceDocument, deleteInvoiceDocument } from "../services/api";
import PaperworkRequestModal from "./PaperworkRequestModal";
import { CircleCheck, FileText, Folder, Image, Pencil, Trash2, Upload, X } from "./icons";

type Invoice = Record<string, unknown>;
type Carrier = { id: string; legal_name: string };

type InvoiceDocument = {
  id: string;
  doc_type: string;
  file_name: string;
  file_url: string;
  uploaded_at: string;
  issued_at?: string | null;
  expires_at?: string | null;
};

type PaperworkRequest = {
  id: string;
  doc_types: string[];
  notes: string | null;
  status: string;
  magic_link: string;
  created_at: string;
  expires_at: string;
};

type Tab = "details" | "documents";

type Props = {
  invoice: Invoice;
  carriers: Carrier[];
  onClose: () => void;
  onSaved: () => void;
};

const DOC_LABELS: Record<string, string> = {
  BOL: "BOL", POD: "POD", RATE_CON: "Rate Con",
  WEIGHT_TICKET: "Weight Ticket", LUMPER_RECEIPT: "Lumper Receipt",
  INVOICE: "Invoice", OTHER: "Other",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "#f59e0b", fulfilled: "#22c55e", expired: "#64748b",
};

export default function InvoiceDetailModal({ invoice, carriers, onClose, onSaved }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("details");
  const [documents, setDocuments] = useState<InvoiceDocument[]>([]);
  const [requests, setRequests] = useState<PaperworkRequest[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // ── Details form state ──
  const [amount, setAmount] = useState(String(invoice.amount || ""));
  const [invoiceNumber, setInvoiceNumber] = useState((invoice.invoice_number as string) || "");
  const [carrierId, setCarrierId] = useState((invoice.carrier_id as string) || "");
  const [customerApEmail, setCustomerApEmail] = useState((invoice.customer_ap_email as string) || "");
  const [notes, setNotes] = useState((invoice.notes as string) || "");
  const [issuedDate, setIssuedDate] = useState((invoice.issued_date as string) || "");
  const [dueDate, setDueDate] = useState((invoice.due_date as string) || "");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // ── Direct upload state ──
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadDocType, setUploadDocType] = useState("BOL");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);


  // ── Document edit/delete state ──
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [editDocType, setEditDocType] = useState("");
  const [editIssuedAt, setEditIssuedAt] = useState("");
  const [editExpiresAt, setEditExpiresAt] = useState("");
  const [savingDoc, setSavingDoc] = useState(false);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);

  const invoiceId = invoice.id as string;
  const displayNumber = (invoice.invoice_number as string) || invoiceId.slice(0, 8);

  const fetchDocs = useCallback(async () => {
    setLoadingDocs(true);
    const res = await listInvoiceDocuments(invoiceId);
    if (res.data) {
      const data = res.data as { documents: InvoiceDocument[]; requests: PaperworkRequest[] };
      setDocuments(data.documents || []);
      setRequests(data.requests || []);
    }
    setLoadingDocs(false);
  }, [invoiceId]);

  useEffect(() => {
    if (activeTab === "documents") void fetchDocs();
  }, [activeTab, fetchDocs]);

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    const updates: Record<string, unknown> = {};
    const numAmount = Number(amount);
    if (!isNaN(numAmount) && numAmount !== Number(invoice.amount)) updates.amount = numAmount;
    if (invoiceNumber !== (invoice.invoice_number || "")) updates.invoice_number = invoiceNumber;
    if (carrierId && carrierId !== invoice.carrier_id) updates.carrier_id = carrierId;
    if (customerApEmail !== (invoice.customer_ap_email || "")) updates.customer_ap_email = customerApEmail;
    if (notes !== (invoice.notes || "")) updates.notes = notes;
    if (issuedDate && issuedDate !== invoice.issued_date) updates.issued_date = issuedDate;
    if (dueDate && dueDate !== invoice.due_date) updates.due_date = dueDate;
    if (Object.keys(updates).length === 0) { onSaved(); return; }
    const res = await updateInvoice(invoiceId, updates);
    setSaving(false);
    if (res.error) setSaveError(res.error);
    else onSaved();
  };

  const copyLink = (link: string, id: string) => {
    navigator.clipboard.writeText(link).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    const res = await uploadInvoiceFileDirect(invoiceId, file, uploadDocType);
    setUploading(false);
    if (res.error) {
      setUploadError(res.error);
    } else {
      void fetchDocs();
    }
    // Reset so the same file can be re-selected if needed
    if (fileInputRef.current) fileInputRef.current.value = "";
  };


  const startEditDoc = (doc: InvoiceDocument) => {
    setEditingDocId(doc.id);
    setEditDocType(doc.doc_type);
    setEditIssuedAt(doc.issued_at || "");
    setEditExpiresAt(doc.expires_at || "");
  };

  const handleSaveDoc = async () => {
    if (!editingDocId) return;
    setSavingDoc(true);
    const updates: Record<string, string | null> = {};
    const current = documents.find((d) => d.id === editingDocId);
    if (editDocType && editDocType !== current?.doc_type) updates.doc_type = editDocType;
    if (editIssuedAt !== (current?.issued_at || "")) updates.issued_at = editIssuedAt || null;
    if (editExpiresAt !== (current?.expires_at || "")) updates.expires_at = editExpiresAt || null;
    if (Object.keys(updates).length > 0) {
      await updateInvoiceDocument(invoiceId, editingDocId, updates);
    }
    setSavingDoc(false);
    setEditingDocId(null);
    void fetchDocs();
  };

  const handleDeleteDoc = async (docId: string) => {
    setDeletingDocId(docId);
    await deleteInvoiceDocument(invoiceId, docId);
    setDeletingDocId(null);
    void fetchDocs();
  };

  const docsBadge = documents.length > 0 ? documents.length : null;

  return (
    <>
      <div
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 100 }}
        onClick={onClose}
      >
        <div
          style={{ background: "var(--surface)", borderRadius: 14, padding: 24, width: 520, maxHeight: "85vh", overflowY: "auto", border: "1px solid var(--border)" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Invoice #{displayNumber}</h2>
              <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--mist)" }}>
                {(invoice.carrier_name as string) || carriers.find(c => c.id === carrierId)?.legal_name || ""}
              </p>
            </div>
            <button type="button" onClick={onClose} style={{ background: "none", border: "none", color: "var(--mist)", cursor: "pointer", display: "flex", alignItems: "center" }}>
              <X size={18} />
            </button>
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 4, marginBottom: 20, background: "var(--bg)", borderRadius: 8, padding: 4 }}>
            {(["details", "documents"] as Tab[]).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                style={{
                  flex: 1, padding: "7px 12px", borderRadius: 6, border: "none", cursor: "pointer",
                  fontSize: 13, fontWeight: 600, transition: "all 0.15s",
                  background: activeTab === tab ? "var(--surface)" : "transparent",
                  color: activeTab === tab ? "var(--white)" : "var(--mist)",
                  boxShadow: activeTab === tab ? "0 1px 3px rgba(0,0,0,0.4)" : "none",
                }}
              >
                {tab === "details" ? "Details" : (
                  <span>
                    Documents{docsBadge ? (
                      <span style={{ marginLeft: 6, background: "#f59e0b", color: "#000", borderRadius: 10, fontSize: 10, padding: "1px 6px", fontWeight: 700 }}>
                        {docsBadge}
                      </span>
                    ) : null}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* ── Details tab ── */}
          {activeTab === "details" && (
            <>
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

              {saveError && <p style={{ color: "var(--red)", fontSize: 13 }}>{saveError}</p>}
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button type="button" onClick={onClose} style={btnGhostStyle}>Cancel</button>
                <button type="button" onClick={handleSave} disabled={saving} style={{ ...btnAmberStyle, opacity: saving ? 0.6 : 1 }}>
                  {saving ? "Saving…" : "Save Changes"}
                </button>
              </div>
            </>
          )}

          {/* ── Documents tab ── */}
          {activeTab === "documents" && (
            <div>
              {/* Upload toolbar */}
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
                <select
                  value={uploadDocType}
                  onChange={(e) => setUploadDocType(e.target.value)}
                  style={{ ...inpStyle, width: "auto", fontSize: 13, padding: "6px 10px" }}
                >
                  {Object.entries(DOC_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  style={{ ...btnAmberStyle, display: "flex", alignItems: "center", gap: 6, opacity: uploading ? 0.6 : 1 }}
                >
                  <Upload size={14} />
                  {uploading ? "Uploading…" : "Upload File"}
                </button>
                <button type="button" onClick={() => setShowRequestModal(true)} style={{ ...btnGhostStyle, marginLeft: "auto" }}>
                  + Request from Driver
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                  style={{ display: "none" }}
                  onChange={handleFileSelected}
                />
              </div>
              {uploadError && (
                <p style={{ color: "var(--red)", fontSize: 12, marginBottom: 12 }}>{uploadError}</p>
              )}

              {loadingDocs ? (
                <p style={{ color: "var(--mist)", fontSize: 13, textAlign: "center", padding: "24px 0" }}>Loading…</p>
              ) : (
                <>
                  {/* Uploaded documents */}
                  {documents.length > 0 && (
                    <div style={{ marginBottom: 24 }}>
                      <SectionHead>Uploaded Documents ({documents.length})</SectionHead>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {documents.map((doc) => (
                          <div key={doc.id} style={{ background: "#1e293b", borderRadius: 8, border: "1px solid var(--border)" }}>
                            {editingDocId === doc.id ? (
                              <div style={{ padding: "10px 14px" }}>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
                                  <div>
                                    <label style={{ ...lblStyle, fontSize: 10 }}>Type</label>
                                    <select value={editDocType} onChange={(e) => setEditDocType(e.target.value)} style={{ ...inpStyle, fontSize: 12, padding: "4px 8px" }}>
                                      {Object.entries(DOC_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                                    </select>
                                  </div>
                                  <div>
                                    <label style={{ ...lblStyle, fontSize: 10 }}>Issued Date</label>
                                    <input type="date" value={editIssuedAt} onChange={(e) => setEditIssuedAt(e.target.value)} style={{ ...inpStyle, fontSize: 12, padding: "4px 8px" }} />
                                  </div>
                                  <div>
                                    <label style={{ ...lblStyle, fontSize: 10 }}>Expires Date</label>
                                    <input type="date" value={editExpiresAt} onChange={(e) => setEditExpiresAt(e.target.value)} style={{ ...inpStyle, fontSize: 12, padding: "4px 8px" }} />
                                  </div>
                                </div>
                                <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                                  <button type="button" onClick={() => setEditingDocId(null)} style={{ ...btnGhostStyle, fontSize: 12, padding: "4px 10px" }}>Cancel</button>
                                  <button type="button" onClick={handleSaveDoc} disabled={savingDoc} style={{ ...btnAmberStyle, fontSize: 12, padding: "4px 10px", opacity: savingDoc ? 0.6 : 1 }}>
                                    {savingDoc ? "Saving…" : "Save"}
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px" }}>
                                <a href={doc.file_url} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0, textDecoration: "none", color: "inherit" }}>
                                  {doc.file_name.match(/\.(pdf)$/i)
                                    ? <FileText size={22} style={{ flexShrink: 0, color: "#94a3b8" }} />
                                    : <Image size={22} style={{ flexShrink: 0, color: "#94a3b8" }} />}
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.file_name}</p>
                                    <p style={{ margin: "2px 0 0", fontSize: 11, color: "var(--mist)" }}>
                                      {new Date(doc.uploaded_at).toLocaleDateString()}
                                      {doc.issued_at ? ` · Issued ${new Date(doc.issued_at).toLocaleDateString()}` : ""}
                                      {doc.expires_at ? ` · Exp ${new Date(doc.expires_at).toLocaleDateString()}` : ""}
                                    </p>
                                  </div>
                                  <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: "#1e3a5f", color: "#93c5fd", fontWeight: 700, whiteSpace: "nowrap" }}>
                                    {DOC_LABELS[doc.doc_type] || doc.doc_type}
                                  </span>
                                </a>
                                <button type="button" onClick={() => startEditDoc(doc)} title="Edit" style={{ background: "none", border: "none", color: "var(--mist)", cursor: "pointer", padding: 4, display: "flex", alignItems: "center" }}>
                                  <Pencil size={14} />
                                </button>
                                <button type="button" onClick={() => handleDeleteDoc(doc.id)} disabled={deletingDocId === doc.id} title="Delete" style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", padding: 4, display: "flex", alignItems: "center", opacity: deletingDocId === doc.id ? 0.5 : 1 }}>
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Open requests */}
                  {requests.length > 0 && (
                    <div style={{ marginBottom: 16 }}>
                      <SectionHead>Paperwork Requests</SectionHead>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {requests.map((req) => (
                          <div key={req.id} style={{ background: "#1e293b", borderRadius: 8, padding: "12px 14px", border: "1px solid var(--border)" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                                {req.doc_types.map((dt) => (
                                  <span key={dt} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 10, background: "#1e3a5f", color: "#93c5fd", fontWeight: 700 }}>
                                    {DOC_LABELS[dt] || dt}
                                  </span>
                                ))}
                              </div>
                              <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 10, fontWeight: 700, background: `${STATUS_COLORS[req.status] || "#64748b"}22`, color: STATUS_COLORS[req.status] || "#64748b", textTransform: "uppercase" as const, whiteSpace: "nowrap", marginLeft: 8 }}>
                                {req.status}
                              </span>
                            </div>
                            {req.notes && (
                              <p style={{ margin: "0 0 8px", fontSize: 12, color: "#94a3b8" }}>"{req.notes}"</p>
                            )}
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <span style={{ fontSize: 11, color: "#475569" }}>
                                {new Date(req.created_at).toLocaleDateString()}
                                {req.status === "pending" && ` · expires ${new Date(req.expires_at).toLocaleDateString()}`}
                              </span>
                              {req.status !== "expired" && (
                                <button
                                  type="button"
                                  onClick={() => copyLink(req.magic_link, req.id)}
                                  style={{ padding: "4px 12px", borderRadius: 6, border: "1px solid var(--border)", background: "transparent", color: copiedId === req.id ? "#22c55e" : "var(--mist)", fontSize: 12, cursor: "pointer" }}
                                >
                                  {copiedId === req.id ? "✓ Copied!" : "Copy Link"}
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Empty state */}
                  {documents.length === 0 && requests.length === 0 && (
                    <div style={{ textAlign: "center", padding: "32px 16px" }}>
                      <div style={{ marginBottom: 12, display: "flex", justifyContent: "center" }}>
                        <Folder size={40} style={{ color: "#475569" }} />
                      </div>
                      <p style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 600 }}>No documents yet</p>
                      <p style={{ margin: 0, fontSize: 13, color: "var(--mist)" }}>
                        Use "Request Paperwork" to send a link to the driver.
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Paperwork request modal (stacked above detail modal) */}
      {showRequestModal && (
        <PaperworkRequestModal
          invoiceId={invoiceId}
          invoiceNumber={displayNumber}
          onClose={() => setShowRequestModal(false)}
          onRequestCreated={() => {
            setShowRequestModal(false);
            void fetchDocs();
          }}
        />
      )}
    </>
  );
}

function SectionHead({ children }: { children: React.ReactNode }) {
  return (
    <h4 style={{ fontSize: 11, color: "var(--mist)", margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid var(--border)", paddingBottom: 6, fontWeight: 700 }}>
      {children}
    </h4>
  );
}

const lblStyle: React.CSSProperties = { fontSize: 11, color: "var(--mist)", display: "block", marginBottom: 3, fontWeight: 500 };
const inpStyle: React.CSSProperties = { padding: "8px 12px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--white)", fontSize: 14, width: "100%", boxSizing: "border-box" as const };
const btnAmberStyle: React.CSSProperties = { padding: "8px 16px", borderRadius: 6, border: "none", background: "var(--amber)", color: "#000", fontSize: 14, cursor: "pointer", fontWeight: 700 };
const btnGhostStyle: React.CSSProperties = { padding: "8px 16px", borderRadius: 6, border: "1px solid var(--border)", background: "transparent", color: "var(--mist)", fontSize: 14, cursor: "pointer" };
