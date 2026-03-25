"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import DocRequestItem from "@/components/DocRequestItem";
import MessageThread from "@/components/MessageThread";
import StatusBadge from "@/components/StatusBadge";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import type { CarrierRow, DocumentRequestRow, LoadRow, MessageRow } from "@/lib/types";

export default function LoadDetailPage() {
  const params = useParams<{ loadId: string }>();
  const router = useRouter();
  const [supabase] = useState(() =>
    typeof window === "undefined" ? null : createBrowserSupabaseClient(),
  );
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [carrier, setCarrier] = useState<CarrierRow | null>(null);
  const [load, setLoad] = useState<LoadRow | null>(null);
  const [requests, setRequests] = useState<DocumentRequestRow[]>([]);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshLoadContext = async () => {
    const loadId = params.loadId;
    if (!loadId || !supabase) return;

    const userResult = await supabase.auth.getUser();
    const user = userResult.data.user;
    if (!user) {
      setError("Session not found.");
      setLoading(false);
      return;
    }

    setCurrentUserId(user.id);

    const carrierResult = await supabase
      .from("carriers")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    const carrierData = carrierResult.data as CarrierRow | null;

    if (carrierResult.error || !carrierData) {
      setError(carrierResult.error?.message || "Carrier profile not found.");
      setLoading(false);
      return;
    }

    setCarrier(carrierData);

    const loadResult = await supabase
      .from("loads")
      .select("*")
      .eq("id", loadId)
      .eq("carrier_id", carrierData.id)
      .maybeSingle();

    if (loadResult.error || !loadResult.data) {
      setError(loadResult.error?.message || "Load not found.");
      setLoading(false);
      return;
    }

    setLoad(loadResult.data as LoadRow);

    const [requestsResult, messagesResult] = await Promise.all([
      supabase.from("document_requests").select("*").eq("load_id", loadId).order("created_at", { ascending: true }),
      supabase.from("messages").select("*").eq("load_id", loadId).order("created_at", { ascending: true }),
    ]);

    if (requestsResult.error) {
      setError(requestsResult.error.message);
    } else {
      setRequests((requestsResult.data || []) as DocumentRequestRow[]);
    }

    if (messagesResult.error) {
      setError(messagesResult.error.message);
    } else {
      setMessages((messagesResult.data || []) as MessageRow[]);
    }

    setLoading(false);
  };

  useEffect(() => {
    void refreshLoadContext();
  }, [params.loadId, supabase]);

  if (loading) return <p className="text-sm text-brand-slate-light">Loading load...</p>;
  if (error || !load || !carrier || !currentUserId) return <p className="text-sm text-brand-danger">{error || "Load unavailable."}</p>;

  return (
    <div className="space-y-6">
      <button type="button" onClick={() => router.back()} className="text-sm font-medium text-brand-amber">
        ← Back
      </button>

      <section className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-brand-amber">Load #{load.load_number}</p>
            <h1 className="mt-2 text-3xl font-semibold text-brand-slate">
              {load.origin} → {load.destination}
            </h1>
            <div className="mt-3 flex flex-wrap gap-4 text-sm text-brand-slate-light">
              <span>Pickup: {load.pickup_date ?? "TBD"}</span>
              <span>Delivery: {load.delivery_date ?? "TBD"}</span>
              {load.rate !== null && <span>${Number(load.rate).toLocaleString()}</span>}
            </div>
          </div>
          <StatusBadge status={load.status} className="self-start" />
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="section-title">Documents</h2>
          <p className="mt-1 text-sm text-brand-slate-light">Upload what your dispatcher requested for this load.</p>
        </div>
        {requests.length === 0 ? (
          <div className="card p-5 text-sm text-brand-slate-light">No document requests for this load.</div>
        ) : (
          <div className="space-y-3">
            {requests.map((request) => (
              <DocRequestItem
                key={request.id}
                request={request}
                userId={currentUserId}
                carrierId={carrier.id}
                loadId={load.id}
                onRefresh={() => {
                  void refreshLoadContext();
                }}
              />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="section-title">Notes with dispatcher</h2>
          <p className="mt-1 text-sm text-brand-slate-light">Keep all load-specific communication in one place.</p>
        </div>
        <MessageThread currentUserId={currentUserId} loadId={load.id} initialMessages={messages} />
      </section>

      <Link href="/loads" className="inline-flex text-sm font-medium text-brand-amber">
        Back to all loads
      </Link>
    </div>
  );
}

