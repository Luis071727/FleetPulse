"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { listCarrierDocuments, uploadCarrierFileDirect } from "../services/api";
import CarrierDocumentRequestModal from "./CarrierDocumentRequestModal";
import { FileText, Folder, Image, Upload, X } from "./icons";

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
  carrierId: string;
  carrierName: string;
  onClose: () => void;
};

const DOC_LABELS: Record<string, string> = {
  MC_AUTHORITY:      "MC Authority",
  W9:                "W9",
  VOID_CHECK:        "Void Check",
  CARRIER_AGREEMENT: "Carrier Agreement",
  NOA:               "NOA",
  COI:               "COI",
  CDL:               "CDL",
  OTHER:             "Other",
};

const DOC_OPTIONS = Object.entries(DOC_LABELS).map(([v, l]) => ({ value: v, label: l }));

const STATUS_COLORS: Record<string, string> = {
  pending: "#f59e0b", fulfilled: "#22c55e", expired: "#64748b",
};

function expiryStatus(expiresAt: string | null): "active" | "expiring_soon" | "expired" | "none" {
  if (!expiresAt) return "none";
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const exp = new Date(expiresAt);
  const days = Math.ceil((exp.getTime() - today.getTime()) / 86400000);
  if (days < 0) return "expired";
  if (days <= 30) return "expiring_soon";
  return "active";
}

const EXPIRY_COLOR: Record<string, string> = {
  active: "#22c55e", expiring_soon: "#f59e0b", expired: "#ef4444", none: "#64748b",
};
const EXPIRY_LABEL: Record<string, string> = {
  active: "Active", expiring_soon: "Expiring Soon", expired: "Expired", none: "No Expiry",
};

export default function CarrierComplianceModal({ carrierId, carrierName, onClose }: Props) {
  const [documents, setDocuments] = useState<CarrierDoc[]>([]);
  const [requests, setRequests] = useState<DocRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Upload state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadDocType, setUploadDocType] = useState("W9");
  const [uploadIssueDate, setUploadIssueDate] = useState("");
  const [uploadExpiresAt, setUploadExpiresAt] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    const res = await listCarrierDocuments(carrierId);
    if (res.data) {
      const data = res.data as { documents: CarrierDoc[]; requests: DocRequest[] };
      setDocuments(data.documents || []);
      setRequests(data.requests || []);
    }
    setLoading(false);
  }, [carrierId]);

  useEffect(() => { void fetchDocs(); }, [fetchDocs]);

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    const res = await uploadCarrierFileDirect(
      carrierId,
      file,
      uploadDocType,
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

  const copyLink = (link: string, id: string) => {
    navigator.clipboard.writeText(link).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  return (
    <>
      <div
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 200 }}
        onClick={onClose}
      >
        <div
          style={{ background: "var(--surface)", borderRadius: 14, padding: 24, width: 600, maxHeight: "88vh", overflowY: "auto", border: "1px solid var(--border)" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Compliance Documents</h2>
              <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--mist)" }}>{carrierName}</p>
            </div>
            <button type="button" onClick={onClose} style={iconBtnStyle}><X size={18} /></button>
          </div>

          {/* Upload toolbar */}
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 8, flexWrap: "wrap", background: "var(--bg)", borderRadius: 10, padding: "12px 14px" }}>
            <div style={{ flex: "0 0 160px" }}>
              <label style={lblStyle}>Doc Type</label>
              <select value={uploadDocType} onChange={(e) => setUploadDocType(e.target.value)} style={inpStyle}>
                {DOC_OPTIONS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
            <div style={{ flex: 1, minWidth: 120 }}>
              <label style={lblStyle}>Issue Date</label>
              <input type="date" value={uploadIssueDate} onChange={(e) => setUploadIssueDate(e.target.value)} style={inpStyle} />
            </div>
            <div style={{ flex: 1, minWidth: 120 }}>
              <label style={lblStyle}>Expiry Date</label>
              <input type="date" value={uploadExpiresAt} onChange={(e) => setUploadExpiresAt(e.target.value)} style={inpStyle} />
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
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf,.doc,.docx"
              style={{ display: "none" }}
              onChange={handleFileSelected}
            />
          </div>
          {uploadError && <p style={{ color: "var(--red)", fontSize: 12, marginBottom: 12 }}>{uploadError}</p>}

          {loading ? (
            <p style={{ color: "var(--mist)", fontSize: 13, textAlign: "center", padding: "24px 0" }}>Loading…</p>
          ) : (
            <>
              {/* Documents list */}
              {documents.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <SectionHead>Documents on File ({documents.length})</SectionHead>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {documents.map((doc) => {
                      const expStatus = expiryStatus(doc.expires_at);
                      const expColor = EXPIRY_COLOR[expStatus];
                      return (
                        <a
                          key={doc.id}
                          href={doc.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "#1e293b", borderRadius: 8, textDecoration: "none", color: "inherit", border: "1px solid var(--border)" }}
                        >
                          {doc.file_name?.match(/\.(pdf)$/i)
                            ? <FileText size={22} style={{ flexShrink: 0, color: "#94a3b8" }} />
                            : <Image size={22} style={{ flexShrink: 0, color: "#94a3b8" }} />
                          }
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {doc.file_name}
                            </p>
                            <p style={{ margin: "2px 0 0", fontSize: 11, color: "var(--mist)" }}>
                              {DOC_LABELS[doc.doc_type] || doc.doc_type}
                              {doc.issue_date && ` · Issued ${new Date(doc.issue_date).toLocaleDateString()}`}
                              {doc.expires_at && ` · Expires ${new Date(doc.expires_at).toLocaleDateString()}`}
                            </p>
                          </div>
                          <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, fontWeight: 700, background: `${expColor}22`, color: expColor, whiteSpace: "nowrap" }}>
                            {EXPIRY_LABEL[expStatus]}
                          </span>
                        </a>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Open requests */}
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

              {/* Empty state */}
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
      </div>

      {showRequestModal && (
        <CarrierDocumentRequestModal
          carrierId={carrierId}
          carrierName={carrierName}
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
const inpStyle: React.CSSProperties = { padding: "7px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--white)", fontSize: 13, width: "100%", boxSizing: "border-box" as const };
const btnAmberStyle: React.CSSProperties = { padding: "7px 14px", borderRadius: 6, border: "none", background: "var(--amber)", color: "#000", fontSize: 13, cursor: "pointer", fontWeight: 700 };
const btnGhostStyle: React.CSSProperties = { padding: "7px 14px", borderRadius: 6, border: "1px solid var(--border)", background: "transparent", color: "var(--mist)", fontSize: 13, cursor: "pointer" };
const iconBtnStyle: React.CSSProperties = { background: "none", border: "none", color: "var(--mist)", cursor: "pointer", display: "flex", alignItems: "center", padding: 4 };
