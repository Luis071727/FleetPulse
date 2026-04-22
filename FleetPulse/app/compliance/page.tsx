"use client";

import { useEffect, useState } from "react";

import ComplianceDocRow from "@/components/ComplianceDocRow";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import type { CarrierRow, ComplianceDocumentRow, ComplianceStatus } from "@/lib/types";

function computeComplianceStatus(doc: ComplianceDocumentRow): ComplianceStatus {
  if (!doc.expires_at) return doc.status;
  const today = new Date();
  const expiry = new Date(doc.expires_at);
  const diffDays = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return "expired";
  if (diffDays < 30) return "expiring_soon";
  return "active";
}

export default function CompliancePage() {
  const [supabase] = useState(() =>
    typeof window === "undefined" ? null : createBrowserSupabaseClient(),
  );
  const [carrier, setCarrier] = useState<CarrierRow | null>(null);
  const [docs, setDocs] = useState<ComplianceDocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshDocs = async () => {
    if (!supabase) return;

    const userResult = await supabase.auth.getUser();
    const user = userResult.data.user;
    if (!user) {
      setError("Session not found.");
      setLoading(false);
      return;
    }

    const carrierResult = await supabase.from("carriers").select("*").eq("user_id", user.id).limit(1).maybeSingle();
    const carrierData = carrierResult.data as CarrierRow | null;
    if (carrierResult.error || !carrierData) {
      setError(carrierResult.error?.message || "Carrier profile not found.");
      setLoading(false);
      return;
    }
    setCarrier(carrierData);

    // Only surface active (not superseded) documents — renewals replace them.
    const docsResult = await supabase
      .from("compliance_documents")
      .select("*")
      .eq("carrier_id", carrierData.id)
      .or("is_active.is.null,is_active.eq.true")
      .order("expires_at", { ascending: true });

    if (docsResult.error) {
      setError(docsResult.error.message);
    } else {
      setDocs((docsResult.data || []) as ComplianceDocumentRow[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    void refreshDocs();
  }, [supabase]);

  if (loading) return <p className="text-sm text-brand-slate-light">Loading compliance documents...</p>;
  if (error || !carrier) return <p className="text-sm text-brand-danger">{error || "Compliance unavailable."}</p>;

  return (
    <div className="space-y-6">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-brand-amber">Compliance</p>
        <h1 className="mt-2 text-3xl font-semibold text-brand-slate">Compliance Documents</h1>
      </div>

      {docs.length === 0 ? (
        <div className="card p-5 text-sm text-brand-slate-light">
          No compliance documents are on file yet.
        </div>
      ) : (
        <div className="space-y-3">
          {docs.map((doc) => (
            <ComplianceDocRow
              key={doc.id}
              doc={doc}
              carrierId={carrier.id}
              effectiveStatus={computeComplianceStatus(doc)}
              onRefresh={() => {
                void refreshDocs();
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

