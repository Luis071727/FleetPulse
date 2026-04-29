import type { ComplianceStatus, DocumentRequestStatus, InvoiceStatus, LoadStatus } from "@/lib/types";
import { cn } from "@/lib/cn";

type BadgeStatus = LoadStatus | DocumentRequestStatus | ComplianceStatus | InvoiceStatus;

const styles: Record<BadgeStatus, string> = {
  // Load statuses
  pending:       "border border-amber-700/40 bg-brand-amber-light text-brand-amber",
  logged:        "border border-sky-700/40 bg-sky-950/50 text-sky-300",
  in_transit:    "border border-sky-700/40 bg-sky-950/50 text-sky-300",
  delivered:     "border border-emerald-700/40 bg-emerald-950/40 text-emerald-300",
  cancelled:     "border border-rose-700/40 bg-rose-950/40 text-rose-300",
  // Document statuses
  uploaded:      "border border-sky-700/40 bg-sky-950/50 text-sky-300",
  approved:      "border border-emerald-700/40 bg-emerald-950/40 text-emerald-300",
  rejected:      "border border-rose-700/40 bg-rose-950/40 text-rose-300",
  // Compliance statuses
  active:        "border border-emerald-700/40 bg-emerald-950/40 text-emerald-300",
  expired:       "border border-rose-700/40 bg-rose-950/40 text-rose-300",
  expiring_soon: "border border-amber-700/40 bg-brand-amber-light text-brand-amber",
  // Invoice statuses
  sent:          "border border-sky-700/40 bg-sky-950/50 text-sky-300",
  paid:          "border border-emerald-700/40 bg-emerald-950/40 text-emerald-300",
  overdue:       "border border-rose-700/40 bg-rose-950/40 text-rose-300",
  shortpaid:     "border border-orange-700/40 bg-orange-950/40 text-orange-300",
  claim:         "border border-purple-700/40 bg-purple-950/40 text-purple-300",
};

const LABELS: Partial<Record<BadgeStatus, string>> = {
  in_transit:    "In Transit",
  expiring_soon: "Expiring Soon",
  shortpaid:     "Short Paid",
};

export default function StatusBadge({ status, className }: { status: BadgeStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide",
        styles[status] ?? "border border-brand-border bg-brand-surface text-brand-slate-light",
        className,
      )}
    >
      {LABELS[status] ?? status.replace(/_/g, " ")}
    </span>
  );
}
