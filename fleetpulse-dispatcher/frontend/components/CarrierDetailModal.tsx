"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  updateCarrier,
  listCarrierDocuments,
  uploadCarrierFileDirect,
  updateCarrierDoc,
  deleteCarrierDoc,
} from "../services/api";
import CarrierDocumentRequestModal from "./CarrierDocumentRequestModal";
import { FileText, Folder, Image, Pencil, Trash2, Upload, X } from "./icons";

type Tab = "info" | "documents";

type CarrierDoc = {
  id: string;
  doc_type: string;
  file_name: string;
  file_url: string;
  issue_date: string | null;
  expires_at: string | null;
  uploaded_at: string;
};

type DocRequest = {
  id: string;
  doc_types: string[];
  notes: string | null;
  status: string;
  magic_link: string;
  created_at: string;
  expires_at: string;
};

type Props = {
  carrier: Record<string, unknown>;
  onClose: () => void;
  onSaved: () => void;
};

const DOC_LABELS: Record<string, string> = {
  MC_AUTHORITY: "MC Authority", W9: "W9", VOID_CHECK: "Void Check",
  CARRIER_AGREEMENT: "Carrier Agreement", NOA: "NOA", COI: "COI", CDL: "CDL", OTHER: "Other",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "#f59e0b", fulfilled: "#22c55e", expired: "#64748b",
};

function expiryBadge(expiresAt: string | null): { label: string; color: string } {
  if (!expiresAt) return { label: "No Expiry", color: "#64748b" };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = Math.ceil((new Date(expiresAt).getTime() - today.getTime()) / 86400000);
  if (days < 0) return { label: "Expired", color: "#ef4444" };
  if (days <= 30) return { label: "Expiring Soon", color: "#f59e0b" };
  return { label: "Active", color: "#22c55e" };
}

export default function CarrierDetailModal({ carrier, onClose, onSaved }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("info");

  // ── Info form state ──
  const [form, setForm] = useState({
    status: String(carrier.status || "active"),
    dba_name: String(carrier.dba_name || ""),
    owner_name: String(carrier.owner_name || ""),
    address: String(carrier.address || ""),
    power_units: String(carrier.power_units || ""),
    drivers: String(carrier.drivers || ""),
    contact_name: String(carrier.contact_name || ""),
    contact_email: String(carrier.contact_email || ""),
    contact_phone: String(carrier.contact_phone || ""),
    phone: String(carrier.phone || ""),
    whatsapp: String(carrier.whatsapp || ""),
    notes: String(carrier.notes || ""),
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // ── Documents state ──
  const [documents, setDocuments] = useState<CarrierDoc[]>([]);
  const [requests, setRequests] = useState<DocRequest[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Upload state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadDocType, setUploadDocType] = useState("W9");
  const [uploadIssueDate, setUploadIssueDate] = useState("");
  const [uploadExpiresAt, setUploadExpiresAt] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Edit/delete state
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [editDocType, setEditDocType] = useState("");
  const [editIssueDate, setEditIssueDate] = useState("");
  const [editExpiresAt, setEditExpiresAt] = useState("");
  const [savingDoc, setSavingDoc] = useState(false);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);

  const carrierId = carrier.id as string;
  const docsBadge = documents.length > 0 ? documents.length : null;

  const fetchDocs = useCallback(async () => {
    setLoadingDocs(true);
    const res = await listCarrierDocuments(carrierId);
    if (res.data) {
      const data = res.data as { documents: CarrierDoc[]; requests: DocRequest[] };
      setDocuments(data.documents || []);
      setRequests(data.requests || []);
    }
    setLoadingDocs(false);
  }, [carrierId]);

  useEffect(() => {
    if (activeTab === "documents") void fetchDocs();
  }, [activeTab, fetchDocs]);

  const updateField = (key: string, val: string) =>
    setForm((prev) => ({ ...prev, [key]: val }));

  const handleSaveInfo = async () => {
    setSaving(true);
    setSaveError(null);
    const updates: Record<string, unknown> = {};
    if (form.status) updates.status = form.status;
    if (form.dba_name.trim()) updates.dba_name = form.dba_name.trim();
    if (form.owner_name.trim()) updates.owner_name = form.owner_name.trim();
    if (form.address.trim()) updates.address = form.address.trim();
    const pu = parseInt(form.power_units, 10);
    if (!isNaN(pu)) updates.power_units = pu;
    const dr = parseInt(form.drivers, 10);
    if (!isNaN(dr)) updates.drivers = dr;
    if (form.contact_name.trim()) updates.contact_name = form.contact_name.trim();
    if (form.contact_email.trim()) updates.contact_email = form.contact_email.trim();
    if (form.contact_phone.trim()) updates.contact_phone = form.contact_phone.trim();
    if (form.phone.trim()) updates.phone = form.phone.trim();
    if (form.whatsapp.trim()) updates.whatsapp = form.whatsapp.trim();
    updates.notes = form.notes.trim();
    const res = await updateCarrier(carrierId, updates);
    setSaving(false);
    if (res.error) setSaveError(res.error);
    else onSaved();
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    const res = await uploadCarrierFileDirect(
      carrierId, file, uploadDocType,
      uploadIssueDate || undefined,
      uploadExpiresAt || undefined,
    );
    setUploading(false);
    if (res.error) {
      setUploadError(res.error);
    } else {
      void fetchDocs();
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const startEditDoc = (doc: CarrierDoc) => {
    setEditingDocId(doc.id);
    setEditDocType(doc.doc_type);
    setEditIssueDate(doc.issue_date || "");
    setEditExpiresAt(doc.expires_at || "");
  };

  const handleSaveDoc = async () => {
    if (!editingDocId) return;
    setSavingDoc(true);
    const current = documents.find((d) => d.id === editingDocId);
    const updates: Record<string, string | null> = {};
    if (editDocType !== current?.doc_type) updates.doc_type = editDocType;
    if (editIssueDate !== (current?.issue_date || "")) updates.issue_date = editIssueDate || null;
    if (editExpiresAt !== (current?.expires_at || "")) updates.expires_at = editExpiresAt || null;
    if (Object.keys(updates).length > 0) {
      setDocuments((prev) => prev.map((d) => d.id === editingDocId ? { ...d, ...updates } : d));
      await updateCarrierDoc(carrierId, editingDocId, updates);
    }
    setSavingDoc(false);
    setEditingDocId(null);
    void fetchDocs();
  };

  const handleDeleteDoc = async (docId: string) => {
    setDeletingDocId(docId);
    setDocuments((prev) => prev.filter((d) => d.id !== docId));
    await deleteCarrierDoc(carrierId, docId);
    setDeletingDocId(null);
  };

  const copyLink = (link: string, id: string) => {
    navigator.clipboard.writeText(link).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  return (
    <>
      <div
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 100 }}
        onClick={onClose}
      >
        <div
          style={{ background: "var(--surface)", borderRadius: 14, padding: 24, width: 580, maxHeight: "88vh", overflowY: "auto", border: "1px solid var(--border)" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{carrier.legal_name as string}</h2>
              <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--mist)" }}>
                {carrier.mc_number ? `MC ${carrier.mc_number as string}` : ""}{carrier.dot_number ? `  DOT ${carrier.dot_number as string}` : ""}
              </p>
            </div>
            <button type="button" onClick={onClose} style={{ background: "none", border: "none", color: "var(--mist)", cursor: "pointer", display: "flex", alignItems: "center" }}>
              <X size={18} />
            </button>
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 4, marginBottom: 20, background: "var(--bg)", borderRadius: 8, padding: 4 }}>
            {(["info", "documents"] as Tab[]).map((tab) => (
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
                {tab === "info" ? "Carrier Info" : (
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

          {/* ── Info tab ── */}
          {activeTab === "info" && (
            <>
              {/* FMCSA read-only */}
              {(carrier.authority_status || carrier.operating_status || carrier.fmcsa_safety_rating) && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 16, padding: "10px 12px", background: "var(--bg)", borderRadius: 8 }}>
                  {carrier.authority_status && <KV label="Authority" value={carrier.authority_status as string} />}
                  {carrier.operating_status && <KV label="Operating" value={carrier.operating_status as string} />}
                  {(carrier.fmcsa_safety_rating || carrier.safety_rating) && (
                    <KV label="Safety Rating" value={(carrier.fmcsa_safety_rating || carrier.safety_rating) as string} />
                  )}
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={lblStyle}>Status</label>
                  <select value={form.status} onChange={(e) => updateField("status", e.target.value)} style={inpStyle}>
                    <option value="active">Active</option>
                    <option value="idle">Idle</option>
                    <option value="issues">Issues</option>
                    <option value="new">New</option>
                  </select>
                </div>
                <div>
                  <label style={lblStyle}>DBA Name</label>
                  <input value={form.dba_name} onChange={(e) => updateField("dba_name", e.target.value)} style={inpStyle} />
                </div>
                <div>
                  <label style={lblStyle}>Owner Name</label>
                  <input value={form.owner_name} onChange={(e) => updateField("owner_name", e.target.value)} style={inpStyle} />
                </div>
                <div>
                  <label style={lblStyle}>Power Units</label>
                  <input type="number" value={form.power_units} onChange={(e) => updateField("power_units", e.target.value)} style={inpStyle} />
                </div>
                <div>
                  <label style={lblStyle}>Drivers</label>
                  <input type="number" value={form.drivers} onChange={(e) => updateField("drivers", e.target.value)} style={inpStyle} />
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={lblStyle}>Address</label>
                  <input value={form.address} onChange={(e) => updateField("address", e.target.value)} style={inpStyle} />
                </div>

                <Divider label="Contact" />
                <div>
                  <label style={lblStyle}>Contact Name</label>
                  <input value={form.contact_name} onChange={(e) => updateField("contact_name", e.target.value)} style={inpStyle} />
                </div>
                <div>
                  <label style={lblStyle}>Contact Email</label>
                  <input type="email" value={form.contact_email} onChange={(e) => updateField("contact_email", e.target.value)} style={inpStyle} />
                </div>
                <div>
                  <label style={lblStyle}>Contact Phone</label>
                  <input type="tel" value={form.contact_phone} onChange={(e) => updateField("contact_phone", e.target.value)} style={inpStyle} />
                </div>
                <div>
                  <label style={lblStyle}>Company Phone</label>
                  <input type="tel" value={form.phone} onChange={(e) => updateField("phone", e.target.value)} style={inpStyle} />
                </div>
                <div>
                  <label style={lblStyle}>WhatsApp</label>
                  <input type="tel" value={form.whatsapp} onChange={(e) => updateField("whatsapp", e.target.value)} style={inpStyle} />
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={lblStyle}>Notes</label>
                  <textarea value={form.notes} onChange={(e) => updateField("notes", e.target.value)} rows={3} style={{ ...inpStyle, resize: "vertical" }} />
                </div>
              </div>

              {saveError && <p style={{ color: "var(--red)", fontSize: 13, marginBottom: 8 }}>{saveError}</p>}
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button type="button" onClick={onClose} style={btnGhostStyle}>Cancel</button>
                <button type="button" onClick={handleSaveInfo} disabled={saving} style={{ ...btnAmberStyle, opacity: saving ? 0.6 : 1 }}>
                  {saving ? "Saving…" : "Save Changes"}
                </button>
              </div>
            </>
          )}

          {/* ── Documents tab ── */}
          {activeTab === "documents" && (
            <div>
              {/* Upload toolbar */}
              <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 8, flexWrap: "wrap", background: "var(--bg)", borderRadius: 10, padding: "10px 12px" }}>
                <div style={{ flex: "0 0 140px" }}>
                  <label style={lblStyle}>Doc Type</label>
                  <select value={uploadDocType} onChange={(e) => setUploadDocType(e.target.value)} style={{ ...inpStyle, fontSize: 12, padding: "5px 8px" }}>
                    {Object.entries(DOC_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1, minWidth: 110 }}>
                  <label style={lblStyle}>Issue Date</label>
                  <input type="date" value={uploadIssueDate} onChange={(e) => setUploadIssueDate(e.target.value)} style={{ ...inpStyle, fontSize: 12, padding: "5px 8px" }} />
                </div>
                <div style={{ flex: 1, minWidth: 110 }}>
                  <label style={lblStyle}>Expiry Date</label>
                  <input type="date" value={uploadExpiresAt} onChange={(e) => setUploadExpiresAt(e.target.value)} style={{ ...inpStyle, fontSize: 12, padding: "5px 8px" }} />
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  style={{ ...btnAmberStyle, display: "flex", alignItems: "center", gap: 6, opacity: uploading ? 0.6 : 1, whiteSpace: "nowrap" }}
                >
                  <Upload size={14} />
                  {uploading ? "Uploading…" : "Upload File"}
                </button>
                <button type="button" onClick={() => setShowRequestModal(true)} style={{ ...btnGhostStyle, whiteSpace: "nowrap" }}>
                  + Request from Carrier
                </button>
                <input ref={fileInputRef} type="file" accept="image/*,.pdf,.doc,.docx" style={{ display: "none" }} onChange={handleFileSelected} />
              </div>
              {uploadError && <p style={{ color: "var(--red)", fontSize: 12, marginBottom: 10 }}>{uploadError}</p>}

              {loadingDocs ? (
                <p style={{ color: "var(--mist)", fontSize: 13, textAlign: "center", padding: "24px 0" }}>Loading…</p>
              ) : (
                <>
                  {documents.length > 0 && (
                    <div style={{ marginBottom: 20 }}>
                      <SectionHead>Documents on File ({documents.length})</SectionHead>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {documents.map((doc) => {
                          const badge = expiryBadge(doc.expires_at);
                          return (
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
                                      <label style={{ ...lblStyle, fontSize: 10 }}>Issue Date</label>
                                      <input type="date" value={editIssueDate} onChange={(e) => setEditIssueDate(e.target.value)} style={{ ...inpStyle, fontSize: 12, padding: "4px 8px" }} />
                                    </div>
                                    <div>
                                      <label style={{ ...lblStyle, fontSize: 10 }}>Expiry Date</label>
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
                                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px" }}>
                                  <a href={doc.file_url} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0, textDecoration: "none", color: "inherit" }}>
                                    {doc.file_name?.match(/\.(pdf)$/i)
                                      ? <FileText size={22} style={{ flexShrink: 0, color: "#94a3b8" }} />
                                      : <Image size={22} style={{ flexShrink: 0, color: "#94a3b8" }} />
                                    }
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.file_name}</p>
                                      <p style={{ margin: "2px 0 0", fontSize: 11, color: "var(--mist)" }}>
                                        {DOC_LABELS[doc.doc_type] || doc.doc_type}
                                        {doc.issue_date ? ` · Issued ${new Date(doc.issue_date).toLocaleDateString()}` : ""}
                                        {doc.expires_at ? ` · Exp ${new Date(doc.expires_at).toLocaleDateString()}` : ""}
                                      </p>
                                    </div>
                                    <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, fontWeight: 700, background: `${badge.color}22`, color: badge.color, whiteSpace: "nowrap" }}>
                                      {badge.label}
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
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {requests.length > 0 && (
                    <div style={{ marginBottom: 16 }}>
                      <SectionHead>Document Requests</SectionHead>
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
                            {req.notes && <p style={{ margin: "0 0 8px", fontSize: 12, color: "#94a3b8" }}>"{req.notes}"</p>}
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

                  {documents.length === 0 && requests.length === 0 && (
                    <div style={{ textAlign: "center", padding: "32px 16px" }}>
                      <div style={{ marginBottom: 12, display: "flex", justifyContent: "center" }}>
                        <Folder size={40} style={{ color: "#475569" }} />
                      </div>
                      <p style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 600 }}>No documents on file</p>
                      <p style={{ margin: 0, fontSize: 13, color: "var(--mist)" }}>
                        Upload a file directly or use &quot;Request from Carrier&quot; to send a link.
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {showRequestModal && (
        <CarrierDocumentRequestModal
          carrierId={carrierId}
          carrierName={carrier.legal_name as string}
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

function KV({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p style={{ fontSize: 10, color: "var(--mist)", margin: 0 }}>{label}</p>
      <p style={{ fontSize: 13, margin: 0, fontWeight: 500 }}>{value ?? "—"}</p>
    </div>
  );
}

function Divider({ label }: { label: string }) {
  return (
    <div style={{ gridColumn: "1 / -1", borderTop: "1px solid var(--border)", paddingTop: 4, marginTop: 4 }}>
      <p style={{ fontSize: 11, color: "var(--mist)", margin: 0, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</p>
    </div>
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
