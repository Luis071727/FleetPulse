"use client";

import { useEffect, useState } from "react";

import LoadCard from "@/components/LoadCard";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import type { CarrierRow, DocumentRequestRow, LoadRow } from "@/lib/types";

export default function DashboardPage() {
  const [supabase] = useState(() =>
    typeof window === "undefined" ? null : createBrowserSupabaseClient(),
  );
  const [carrier, setCarrier] = useState<CarrierRow | null>(null);
  const [loads, setLoads] = useState<LoadRow[]>([]);
  const [pendingRequests, setPendingRequests] = useState<DocumentRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      if (!supabase) return;

      setLoading(true);
      setError(null);

      const userResult = await supabase.auth.getUser();
      const user = userResult.data.user;
      if (!user) {
        setError("Session not found.");
        setLoading(false);
        return;
      }

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

      const loadsResult = await supabase
        .from("loads")
        .select("*")
        .eq("carrier_id", carrierData.id)
        .neq("status", "cancelled")
        .order("pickup_date", { ascending: true });

      if (loadsResult.error) {
        setError(loadsResult.error.message);
        setLoading(false);
        return;
      }

      const loadRows = (loadsResult.data || []) as LoadRow[];
      setLoads(loadRows);

      const loadIds = loadRows.map((load) => load.id);
      if (loadIds.length === 0) {
        setPendingRequests([]);
        setLoading(false);
        return;
      }

      const requestsResult = await supabase
        .from("document_requests")
        .select("*")
        .in("load_id", loadIds)
        .eq("status", "pending");

      if (requestsResult.error) {
        setError(requestsResult.error.message);
      } else {
        setPendingRequests((requestsResult.data || []) as DocumentRequestRow[]);
      }
      setLoading(false);
    };

    void loadData();
  }, [supabase]);

  const pendingLoads = loads.filter((load) =>
    pendingRequests.some((request) => request.load_id === load.id),
  );
  const otherLoads = loads.filter(
    (load) => !pendingRequests.some((request) => request.load_id === load.id),
  );

  if (loading) return <p className="text-sm text-brand-slate-light">Loading dashboard...</p>;
  if (error) return <p className="text-sm text-brand-danger">{error}</p>;

  return (
    <div className="space-y-8">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-brand-amber">Dashboard</p>
        <h1 className="mt-2 text-3xl font-semibold text-brand-slate">
          {carrier?.company_name || carrier?.name || "Your loads, docs, and updates"}
        </h1>
      </div>

      <section className="space-y-4">
        <div>
          <h2 className="section-title">Pending Actions</h2>
          <p className="mt-1 text-sm text-brand-slate-light">
            Loads with documents your dispatcher still needs from you.
          </p>
        </div>
        {pendingLoads.length === 0 ? (
          <div className="card p-5 text-sm text-brand-slate-light">
            Nothing urgent right now — you&apos;re all caught up.
          </div>
        ) : (
          <div className="space-y-4">
            {pendingLoads.map((load) => (
              <LoadCard
                key={load.id}
                load={load}
                pendingRequests={pendingRequests.filter((request) => request.load_id === load.id)}
              />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="section-title">Active Loads</h2>
          <p className="mt-1 text-sm text-brand-slate-light">
            Loads currently in your queue without pending upload actions.
          </p>
        </div>
        {loads.length === 0 ? (
          <div className="card p-5 text-sm text-brand-slate-light">
            No active loads. Your dispatcher will share your next load here.
          </div>
        ) : otherLoads.length === 0 ? (
          <div className="card p-5 text-sm text-brand-slate-light">
            Every active load currently has a pending document request.
          </div>
        ) : (
          <div className="space-y-4">
            {otherLoads.map((load) => (
              <LoadCard key={load.id} load={load} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

