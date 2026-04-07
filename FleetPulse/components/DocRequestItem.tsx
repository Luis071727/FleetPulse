"use client";

import type { DocumentRequestRow } from "@/lib/types";
import StatusBadge from "@/components/StatusBadge";
import UploadButton from "@/components/UploadButton";

export default function DocRequestItem({
  request,
  userId,
  carrierId,
  loadId,
  onRefresh,
}: {
  request: DocumentRequestRow;
  userId: string;
  carrierId: string;
  loadId: string;
  onRefresh: () => void;
}) {
  const needsUpload = request.status === "pending" || request.status === "rejected";
  const label = request.label || request.doc_type;

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-brand-slate">{label}</p>
          <p className="mt-1 text-xs text-brand-slate-light">
            {request.required ? "Required for dispatch completion" : "Optional upload"}
          </p>
        </div>
        <StatusBadge status={request.status} />
      </div>
      <div className="mt-4">
        {needsUpload ? (
          <UploadButton
            userId={userId}
            carrierId={carrierId}
            docType={request.doc_type}
            documentRequestId={request.id}
            loadId={loadId}
            onSuccess={onRefresh}
          />
        ) : (
          <p className="text-sm text-emerald-300">Document already received.</p>
        )}
      </div>
    </div>
  );
}

