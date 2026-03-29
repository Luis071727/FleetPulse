"use client";

import { useEffect, useRef, useState } from "react";
import { validateUploadToken, uploadInvoiceFile } from "../../../../services/api";
import { AlertTriangle, Camera, CircleCheck, FileText, Upload } from "../../../../components/icons";

type RequestInfo = {
  request_id: string;
  invoice_number: string;
  invoice_amount: number | null;
  carrier_name: string;
  doc_types: string[];
  notes: string | null;
  expires_at: string;
  status: string;
};

type UploadState = "idle" | "uploading" | "done" | "error";

type DocUpload = {
  state: UploadState;
  fileName: string | null;
  error: string | null;
};

const DOC_LABELS: Record<string, string> = {
  BOL: "Bill of Lading",
  POD: "Proof of Delivery",
  RATE_CON: "Rate Confirmation",
  WEIGHT_TICKET: "Weight Ticket",
  LUMPER_RECEIPT: "Lumper Receipt",
  INVOICE: "Invoice Copy",
  OTHER: "Other Document",
};

export default function UploadPage({ params }: { params: { token: string } }) {
  const { token } = params;

  const [loading, setLoading] = useState(true);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [info, setInfo] = useState<RequestInfo | null>(null);
  const [uploads, setUploads] = useState<Record<string, DocUpload>>({});
  const [allDone, setAllDone] = useState(false);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    validateUploadToken(token).then((res) => {
      if (res.error || !res.data) {
        setLinkError(res.error || "This link is invalid.");
      } else {
        const data = res.data as RequestInfo;
        setInfo(data);
        // Init upload state per doc type
        const initial: Record<string, DocUpload> = {};
        for (const dt of data.doc_types) {
          initial[dt] = { state: "idle", fileName: null, error: null };
        }
        setUploads(initial);
        if (data.status === "fulfilled") setAllDone(true);
      }
      setLoading(false);
    });
  }, [token]);

  const handleFileChange = async (docType: string, file: File | null) => {
    if (!file) return;
    setUploads((prev) => ({
      ...prev,
      [docType]: { state: "uploading", fileName: file.name, error: null },
    }));

    const res = await uploadInvoiceFile(token, file, docType);

    if (res.error) {
      setUploads((prev) => ({
        ...prev,
        [docType]: { state: "error", fileName: file.name, error: res.error },
      }));
    } else {
      setUploads((prev) => {
        const next = {
          ...prev,
          [docType]: { state: "done" as UploadState, fileName: file.name, error: null },
        };
        // Check if all are done
        const allComplete = Object.values(next).every((u) => u.state === "done");
        if (allComplete) setAllDone(true);
        return next;
      });
    }
  };

  if (loading) {
    return (
      <div style={centerStyle}>
        <div style={spinnerStyle} />
        <p style={{ color: "#94a3b8", marginTop: 16 }}>Verifying link…</p>
      </div>
    );
  }

  if (linkError) {
    return (
      <div style={centerStyle}>
        <AlertTriangle size={48} style={{ color: "#f59e0b", marginBottom: 16 }} />
        <h2 style={{ margin: "0 0 8px", fontSize: 20 }}>Link unavailable</h2>
        <p style={{ color: "#94a3b8", maxWidth: 320, textAlign: "center", margin: 0 }}>
          {linkError} Contact your dispatcher to request a new link.
        </p>
      </div>
    );
  }

  if (allDone) {
    return (
      <div style={centerStyle}>
        <CircleCheck size={56} style={{ color: "#22c55e", marginBottom: 16 }} />
        <h2 style={{ margin: "0 0 8px", fontSize: 22, color: "#22c55e" }}>All done — thank you!</h2>
        <p style={{ color: "#94a3b8", maxWidth: 320, textAlign: "center", margin: 0 }}>
          Your documents have been received. Your dispatcher has been notified.
        </p>
      </div>
    );
  }

  const doneCount = Object.values(uploads).filter((u) => u.state === "done").length;
  const totalCount = info!.doc_types.length;

  return (
    <div style={{ maxWidth: 480, margin: "0 auto", padding: "32px 16px 64px" }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <FileText size={28} style={{ color: "#f59e0b" }} />
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Document Upload</h1>
        </div>
        <div style={{ background: "#1e293b", borderRadius: 10, padding: "14px 16px", display: "grid", gap: 4 }}>
          <Row label="Invoice" value={`#${info!.invoice_number}`} />
          {info!.carrier_name && info!.carrier_name !== "—" && (
            <Row label="Carrier" value={info!.carrier_name} />
          )}
          {info!.invoice_amount != null && (
            <Row label="Amount" value={`$${Number(info!.invoice_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`} />
          )}
        </div>
        {info!.notes && (
          <div style={{ marginTop: 12, padding: "12px 14px", background: "#1e3a5f", borderRadius: 8, borderLeft: "3px solid #3b82f6" }}>
            <p style={{ margin: 0, fontSize: 13, color: "#93c5fd" }}>
              <strong>Note from dispatcher:</strong> {info!.notes}
            </p>
          </div>
        )}
      </div>

      {/* Progress */}
      <div style={{ marginBottom: 20, display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ flex: 1, height: 6, background: "#1e293b", borderRadius: 3, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${(doneCount / totalCount) * 100}%`, background: "#22c55e", borderRadius: 3, transition: "width 0.3s ease" }} />
        </div>
        <span style={{ fontSize: 13, color: "#94a3b8", whiteSpace: "nowrap" }}>{doneCount} / {totalCount}</span>
      </div>

      {/* Doc type upload cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {info!.doc_types.map((docType) => {
          const up = uploads[docType];
          const isDone = up?.state === "done";
          const isUploading = up?.state === "uploading";
          const isError = up?.state === "error";

          return (
            <div
              key={docType}
              style={{
                background: isDone ? "#14291a" : "#1e293b",
                border: `1px solid ${isDone ? "#22c55e44" : isError ? "#ef444444" : "#334155"}`,
                borderRadius: 12,
                padding: "16px",
                transition: "all 0.2s",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: isDone ? 6 : 12 }}>
                <div>
                  <span style={{ fontWeight: 600, fontSize: 15 }}>{DOC_LABELS[docType] || docType}</span>
                  {isDone && up.fileName && (
                    <p style={{ margin: "4px 0 0", fontSize: 12, color: "#86efac" }}>✓ {up.fileName}</p>
                  )}
                  {isError && (
                    <p style={{ margin: "4px 0 0", fontSize: 12, color: "#f87171" }}>{up.error} — tap to retry</p>
                  )}
                </div>
                {isDone && <CircleCheck size={22} style={{ color: "#22c55e", flexShrink: 0 }} />}
                {isUploading && <div style={{ ...spinnerStyle, width: 22, height: 22 }} />}
              </div>

              {!isDone && (
                <>
                  {/* Hidden file input */}
                  <input
                    ref={(el) => { fileInputRefs.current[docType] = el; }}
                    type="file"
                    accept="image/*,application/pdf"
                    capture="environment"
                    style={{ display: "none" }}
                    onChange={(e) => handleFileChange(docType, e.target.files?.[0] ?? null)}
                    disabled={isUploading}
                  />
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      disabled={isUploading}
                      onClick={() => {
                        if (fileInputRefs.current[docType]) {
                          // Camera
                          fileInputRefs.current[docType]!.setAttribute("capture", "environment");
                          fileInputRefs.current[docType]!.click();
                        }
                      }}
                      style={{ ...uploadBtnStyle, flex: 1 }}
                    >
                      {isUploading ? "Uploading…" : <><Camera size={15} style={{ marginRight: 6, verticalAlign: "middle" }} />Take Photo</>}
                    </button>
                    <button
                      type="button"
                      disabled={isUploading}
                      onClick={() => {
                        if (fileInputRefs.current[docType]) {
                          fileInputRefs.current[docType]!.removeAttribute("capture");
                          fileInputRefs.current[docType]!.click();
                        }
                      }}
                      style={{ ...uploadBtnStyle, flex: 1, background: "transparent", color: "#94a3b8", borderColor: "#334155" }}
                    >
                      <Upload size={15} style={{ marginRight: 6, verticalAlign: "middle" }} />Choose File
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      <p style={{ marginTop: 24, fontSize: 12, color: "#475569", textAlign: "center" }}>
        Accepted: photos, PDF files · Max 20 MB per file
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
      <span style={{ color: "#64748b" }}>{label}</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  );
}

const centerStyle: React.CSSProperties = {
  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
  minHeight: "100vh", padding: 24, textAlign: "center",
};

const spinnerStyle: React.CSSProperties = {
  width: 36, height: 36, borderRadius: "50%",
  border: "3px solid #1e293b", borderTopColor: "#f59e0b",
  animation: "spin 0.8s linear infinite",
};

const uploadBtnStyle: React.CSSProperties = {
  padding: "12px 16px", borderRadius: 8, border: "1px solid #f59e0b44",
  background: "#f59e0b18", color: "#f59e0b", fontSize: 14, cursor: "pointer",
  fontWeight: 600, textAlign: "center" as const,
};
