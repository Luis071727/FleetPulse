"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";

import { createBrowserSupabaseClient } from "@/lib/supabase";
import type { Database } from "@/lib/types";

type Props = {
  userId: string;
  carrierId: string;
  docType: string;
  loadId?: string;
  documentRequestId?: string;
  complianceDocumentId?: string;
  /** YYYY-MM-DD — written to compliance_documents.issued_at on upload */
  issueDate?: string;
  /** YYYY-MM-DD — written to compliance_documents.expires_at on upload */
  expiresAt?: string;
  label?: string;
  onSuccess?: () => void;
};

export default function UploadButton({
  userId,
  carrierId,
  docType,
  loadId,
  documentRequestId,
  complianceDocumentId,
  issueDate,
  expiresAt,
  label = "Upload",
  onSuccess,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const extension = file.name.split(".").pop() || "bin";
    const storagePath = loadId
      ? `${userId}/${loadId}/${docType}_${Date.now()}.${extension}`
      : `${userId}/compliance/${docType}_${Date.now()}.${extension}`;

    setUploading(true);
    setError(null);

    try {
      const supabase = createBrowserSupabaseClient();
      const uploadResult = await supabase.storage.from("load-documents").upload(storagePath, file, {
        cacheControl: "3600",
        upsert: false,
      });

      if (uploadResult.error) throw uploadResult.error;

      if (loadId) {
        const documentPayload = {
          carrier_id: carrierId,
          document_request_id: documentRequestId ?? null,
          file_name: file.name,
          file_size_bytes: file.size,
          file_type: file.type,
          load_id: loadId,
          storage_path: storagePath,
          uploaded_by: userId,
        } satisfies Database["public"]["Tables"]["documents"]["Insert"];

        const docInsert = await supabase.from("documents").insert(documentPayload as never);

        if (docInsert.error) throw docInsert.error;

        // If this is fulfilling a dispatcher doc request, mark it uploaded
        if (documentRequestId) {
          const requestPayload = {
            status: "uploaded",
          } satisfies Database["public"]["Tables"]["document_requests"]["Update"];

          const requestUpdate = await supabase
            .from("document_requests")
            .update(requestPayload as never)
            .eq("id", documentRequestId);

          if (requestUpdate.error) throw requestUpdate.error;
        }
      }

      if (complianceDocumentId) {
        const compliancePayload: Database["public"]["Tables"]["compliance_documents"]["Update"] = {
          file_name: file.name,
          status: "active",
          storage_path: storagePath,
          uploaded_at: new Date().toISOString(),
          ...(issueDate ? { issued_at: issueDate } : {}),
          ...(expiresAt ? { expires_at: expiresAt } : {}),
        };

        const complianceUpdate = await supabase
          .from("compliance_documents")
          .update(compliancePayload as never)
          .eq("id", complianceDocumentId);

        if (complianceUpdate.error) throw complianceUpdate.error;
      }

      onSuccess?.();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  return (
    <div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.pdf"
        capture="environment"
        className="hidden"
        onChange={handleFileSelected}
      />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        className="inline-flex items-center gap-2 rounded-lg border border-amber-700/40 bg-brand-amber px-3 py-2 text-sm font-semibold text-black transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Upload size={16} />
        {uploading ? "Uploading..." : label}
      </button>
      {error && <p className="mt-2 text-xs text-brand-danger">{error}</p>}
    </div>
  );
}

