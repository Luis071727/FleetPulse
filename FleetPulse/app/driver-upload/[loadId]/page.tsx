"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { Upload, CheckCircle, AlertCircle } from "lucide-react";

const DOC_LABELS: Record<string, string> = {
  BOL: "Bill of Lading (BOL)",
  POD: "Proof of Delivery (POD)",
  RATE_CON: "Rate Confirmation",
  WEIGHT_TICKET: "Weight Ticket",
  LUMPER_RECEIPT: "Lumper Receipt",
  INVOICE: "Invoice",
  OTHER: "Other Document",
};

type UploadState = "idle" | "uploading" | "done" | "error";

function DocUploader({
  docType,
  loadId,
  carrierId,
}: {
  docType: string;
  loadId: string;
  carrierId: string;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [state, setState] = useState<UploadState>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setState("uploading");
    setErrorMsg(null);

    const body = new FormData();
    body.append("file", file);
    body.append("docType", docType);
    body.append("cid", carrierId);

    try {
      const res = await fetch(`/api/driver-upload/${loadId}`, { method: "POST", body });
      const json = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok || json.error) throw new Error(json.error ?? "Upload failed");
      setState("done");
    } catch (err) {
      setState("error");
      setErrorMsg(err instanceof Error ? err.message : "Upload failed");
    }
  };

  return (
    <div className="rounded-xl border border-[#1E2D3D] bg-[#0D1318] p-4">
      <p className="text-sm font-semibold text-[#F0F6FC]">{DOC_LABELS[docType] ?? docType}</p>

      {state === "done" ? (
        <div className="mt-3 flex items-center gap-2 text-sm text-green-400">
          <CheckCircle size={16} />
          <span>{fileName} uploaded</span>
        </div>
      ) : (
        <>
          <input
            ref={inputRef}
            type="file"
            accept="image/*,.pdf"
            capture="environment"
            className="hidden"
            onChange={handleFile}
          />
          <button
            type="button"
            disabled={state === "uploading"}
            onClick={() => inputRef.current?.click()}
            className="mt-3 inline-flex items-center gap-2 rounded-lg border border-amber-700/40 bg-[#F59E0B] px-4 py-2 text-sm font-semibold text-black transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Upload size={15} />
            {state === "uploading" ? "Uploading..." : "Choose File"}
          </button>
          {state === "error" && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-red-400">
              <AlertCircle size={13} />
              {errorMsg}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function DriverUploadPage() {
  const params = useParams<{ loadId: string }>();
  const searchParams = useSearchParams();

  const loadId = params.loadId;
  const carrierId = searchParams.get("cid") ?? "";
  const rawTypes = searchParams.get("types") ?? "";
  const docTypes = rawTypes
    .split(",")
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean);

  if (!carrierId || docTypes.length === 0) {
    return (
      <div style={{ minHeight: "100vh", background: "#080C10", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ maxWidth: 400, textAlign: "center", color: "#94A3B8" }}>
          <p style={{ fontSize: 18, color: "#F0F6FC", fontWeight: 600, marginBottom: 8 }}>Invalid upload link</p>
          <p style={{ fontSize: 14 }}>This link is missing required parameters. Please ask the carrier for a new link.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#080C10", fontFamily: "'IBM Plex Sans', sans-serif" }}>
      <div style={{ maxWidth: 540, margin: "0 auto", padding: "32px 16px" }}>
        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: "#F59E0B", margin: "0 0 8px" }}>
            FleetPulse
          </p>
          <h1 style={{ fontSize: 24, fontWeight: 600, color: "#F0F6FC", margin: 0 }}>Upload Load Documents</h1>
          <p style={{ marginTop: 8, fontSize: 14, color: "#94A3B8" }}>
            Please upload the documents listed below for your load. Each file can be a photo or PDF.
          </p>
        </div>

        {/* Doc uploaders */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {docTypes.map((dt) => (
            <DocUploader key={dt} docType={dt} loadId={loadId} carrierId={carrierId} />
          ))}
        </div>

        <p style={{ marginTop: 20, fontSize: 12, color: "#475569", textAlign: "center" }}>
          Powered by FleetPulse · Carrier freight management
        </p>
      </div>
    </div>
  );
}
