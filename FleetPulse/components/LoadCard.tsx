import Link from "next/link";

import type { DocumentRequestRow, LoadRow } from "@/lib/types";
import StatusBadge from "@/components/StatusBadge";

export default function LoadCard({
  load,
  pendingRequests,
}: {
  load: LoadRow;
  pendingRequests?: DocumentRequestRow[];
}) {
  return (
    <Link href={`/loads/${load.id}`} className="card block p-4 transition-transform hover:-translate-y-0.5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-brand-slate-light">Load #{load.load_number}</p>
          <h3 className="mt-1 text-lg font-semibold text-brand-slate">
            {load.origin} → {load.destination}
          </h3>
        </div>
        <StatusBadge status={load.status} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs text-brand-slate-light">
        <span>Pickup: {load.pickup_date ?? "TBD"}</span>
        <span>Delivery: {load.delivery_date ?? "TBD"}</span>
        {load.rate !== null && <span>${Number(load.rate).toLocaleString()}</span>}
      </div>
      {pendingRequests && pendingRequests.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {pendingRequests.map((request) => (
            <span key={request.id} className="rounded-full bg-orange-100 px-2.5 py-1 text-xs font-medium text-orange-700">
              {request.label || request.doc_type}
            </span>
          ))}
        </div>
      )}
    </Link>
  );
}

