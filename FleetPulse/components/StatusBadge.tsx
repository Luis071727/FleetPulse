import type { ComplianceStatus, DocumentRequestStatus, LoadStatus } from "@/lib/types";
import { cn } from "@/lib/cn";

type BadgeStatus = LoadStatus | DocumentRequestStatus | ComplianceStatus;

const styles: Record<BadgeStatus, string> = {
  pending: "bg-brand-amber-light text-orange-700",
  in_transit: "bg-blue-100 text-blue-700",
  delivered: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-rose-100 text-rose-700",
  uploaded: "bg-emerald-100 text-emerald-700",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-rose-100 text-rose-700",
  active: "bg-emerald-100 text-emerald-700",
  expired: "bg-rose-100 text-rose-700",
  expiring_soon: "bg-orange-100 text-orange-700"
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

