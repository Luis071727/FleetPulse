"use client";

import { useState } from "react";
import { FileBadge2, RefreshCcw } from "lucide-react";

import type { ComplianceDocumentRow, ComplianceStatus } from "@/lib/types";
import { cn } from "@/lib/cn";
import StatusBadge from "@/components/StatusBadge";
import RenewDocumentModal from "@/components/RenewDocumentModal";

type Props = {
  doc: ComplianceDocumentRow;
  carrierId: string;
  effectiveStatus: ComplianceStatus;
  onRefresh: () => void;
};

function toDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function ComplianceDocRow({ doc, carrierId, effectiveStatus, onRefresh }: Props) {
  const [showRenew, setShowRenew] = useState(false);

  const isExpired = effectiveStatus === "expired";
  const isExpiringSoon = effectiveStatus === "expiring_soon";

  return (
    <>
      <div className={cn(
        "card p-4 space-y-3",
        isExpired && "border-l-2 border-brand-danger",
        isExpiringSoon && !isExpired && "border-l-2 border-orange-500",
      )}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="rounded-xl border border-brand-border bg-brand-amber-light p-2 text-brand-amber shrink-0">
              <FileBadge2 size={18} />
            </div>
            <div>
              <p className="font-semibold text-brand-slate">{doc.label || doc.doc_type}</p>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-brand-slate-light">
                {doc.issued_at && <span>Issued {fmtDate(doc.issued_at)}</span>}
                {doc.expires_at && (
                  <span className={cn(isExpired && "text-brand-danger", isExpiringSoon && !isExpired && "text-orange-400")}>
                    {isExpired ? "Expired" : "Expires"} {fmtDate(doc.expires_at)}
                  </span>
                )}
                {!doc.expires_at && <span>No expiry date on file</span>}
                {doc.uploaded_at && <span>Last updated {fmtDate(doc.uploaded_at)}</span>}
              </div>
            </div>
          </div>
          <StatusBadge status={effectiveStatus} />
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-brand-border pt-3">
          <button
            type="button"
            onClick={() => setShowRenew(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-amber-700/40 bg-brand-amber px-3 py-2 text-sm font-semibold text-black transition hover:bg-amber-400"
          >
            <RefreshCcw size={15} />
            Renew Document
          </button>
        </div>
      </div>

      {showRenew && (
        <RenewDocumentModal
          carrierId={carrierId}
          docType={doc.doc_type}
          docLabel={doc.label}
          initialIssueDate={toDateInput(doc.issued_at)}
          initialExpiresAt={toDateInput(doc.expires_at)}
          onClose={() => setShowRenew(false)}
          onRenewed={() => {
            setShowRenew(false);
            onRefresh();
          }}
        />
      )}
    </>
  );
}
