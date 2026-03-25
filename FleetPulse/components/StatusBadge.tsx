import type { ComplianceStatus, DocumentRequestStatus, LoadStatus } from "@/lib/types";
import { cn } from "@/lib/cn";

type BadgeStatus = LoadStatus | DocumentRequestStatus | ComplianceStatus;

const styles: Record<BadgeStatus, string> = {
  pending: "border border-amber-700/40 bg-brand-amber-light text-brand-amber",
  logged: "border border-sky-700/40 bg-sky-950/50 text-sky-300",
  in_transit: "border border-sky-700/40 bg-sky-950/50 text-sky-300",
  delivered: "border border-emerald-700/40 bg-emerald-950/40 text-emerald-300",
  cancelled: "border border-rose-700/40 bg-rose-950/40 text-rose-300",
  uploaded: "border border-sky-700/40 bg-sky-950/50 text-sky-300",
  approved: "border border-emerald-700/40 bg-emerald-950/40 text-emerald-300",
  rejected: "border border-rose-700/40 bg-rose-950/40 text-rose-300",
  active: "border border-emerald-700/40 bg-emerald-950/40 text-emerald-300",
  expired: "border border-rose-700/40 bg-rose-950/40 text-rose-300",
  expiring_soon: "border border-amber-700/40 bg-brand-amber-light text-brand-amber"
};

export default function StatusBadge({ status, className }: { status: BadgeStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide",
        styles[status],
        className,
      )}
    >
      {status.replace("_", " ")}
    </span>
  );
}

