"use client";

import { FileBadge2 } from "lucide-react";

import type { ComplianceDocumentRow, ComplianceStatus } from "@/lib/types";
import StatusBadge from "@/components/StatusBadge";
import UploadButton from "@/components/UploadButton";

type Props = {
  doc: ComplianceDocumentRow;
  carrierId: string;
  currentUserId: string;
  effectiveStatus: ComplianceStatus;
  onRefresh: () => void;
};

export default function ComplianceDocRow({ doc, carrierId, currentUserId, effectiveStatus, onRefresh }: Props) {
  return (
    <div className="card flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-orange-100 p-2 text-brand-amber">
          <FileBadge2 size={18} />
        </div>
        <div>
          <p className="font-semibold text-brand-slate">{doc.label || doc.doc_type}</p>
          <p className="mt-1 text-sm text-brand-slate-light">
            {doc.expires_at ? `Expires ${new Date(doc.expires_at).toLocaleDateString()}` : "No expiry date on file"}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge status={effectiveStatus} />
        <UploadButton
          userId={currentUserId}
          carrierId={carrierId}
          complianceDocumentId={doc.id}
          docType={doc.doc_type}
          label={doc.storage_path ? "Replace" : "Upload renewal"}
          onSuccess={onRefresh}
        />
      </div>
    </div>
  );
}

