"use client";

import { useState } from "react";
import { FileBadge2 } from "lucide-react";

import type { ComplianceDocumentRow, ComplianceStatus } from "@/lib/types";
import { cn } from "@/lib/cn";
import StatusBadge from "@/components/StatusBadge";
import UploadButton from "@/components/UploadButton";

type Props = {
  doc: ComplianceDocumentRow;
  carrierId: string;
  currentUserId: string;
  effectiveStatus: ComplianceStatus;
  onRefresh: () => void;
};

function toDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  // handles both "YYYY-MM-DD" and full ISO timestamps
  return iso.slice(0, 10);
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function ComplianceDocRow({ doc, carrierId, currentUserId, effectiveStatus, onRefresh }: Props) {
  const [issueDate, setIssueDate] = useState(toDateInput(doc.issued_at));
  const [expiresAt, setExpiresAt] = useState(toDateInput(doc.expires_at));

  const isExpired = effectiveStatus === "expired";
  const isExpiringSoon = effectiveStatus === "expiring_soon";

  return (
    <div className={cn(
      "card p-4 space-y-4",
      isExpired && "border-l-2 border-brand-danger",
      isExpiringSoon && !isExpired && "border-l-2 border-orange-500",
    )}>
      {/* Header row */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="rounded-xl border border-brand-border bg-brand-amber-light p-2 text-brand-amber shrink-0">
            <FileBadge2 size={18} />
          </div>
          <div>
            <p className="font-semibold text-brand-slate">{doc.label || doc.doc_type}</p>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-brand-slate-light">
              {doc.expires_at && (
                <span className={cn(isExpired && "text-brand-danger", isExpiringSoon && !isExpired && "text-orange-400")}>
                  {isExpired ? "Expired" : "Expires"} {fmtDate(doc.expires_at)}
                </span>
              )}
              {!doc.expires_at && <span>No expiry date on file</span>}
              {doc.uploaded_at && (
                <span>Last updated {fmtDate(doc.uploaded_at)}</span>
              )}
            </div>
          </div>
        </div>
        <StatusBadge status={effectiveStatus} />
      </div>

      {/* Date inputs + upload */}
      <div className="flex flex-wrap items-end gap-3 pt-1 border-t border-brand-border">
        <div className="flex flex-wrap gap-3 flex-1">
          <div className="min-w-[140px]">
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-brand-slate-light">
              Issue date
            </label>
            <input
              type="date"
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
              className="w-full rounded-lg border border-brand-border bg-brand-surface px-2.5 py-1.5 text-xs text-brand-slate focus:outline-none focus:ring-1 focus:ring-brand-amber"
            />
          </div>
          <div className="min-w-[140px]">
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-brand-slate-light">
              Expiry date
            </label>
            <input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="w-full rounded-lg border border-brand-border bg-brand-surface px-2.5 py-1.5 text-xs text-brand-slate focus:outline-none focus:ring-1 focus:ring-brand-amber"
            />
          </div>
        </div>
        <UploadButton
          userId={currentUserId}
          carrierId={carrierId}
          complianceDocumentId={doc.id}
          docType={doc.doc_type}
          issueDate={issueDate || undefined}
          expiresAt={expiresAt || undefined}
          onSuccess={onRefresh}
        />
      </div>
    </div>
  );
}
