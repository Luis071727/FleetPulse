"use client";

import { useEffect, useState } from "react";

import LoadCard from "@/components/LoadCard";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import type { CarrierRow, LoadRow } from "@/lib/types";

export default function LoadsPage() {
  const [supabase] = useState(() =>
    typeof window === "undefined" ? null : createBrowserSupabaseClient(),
  );
  const [loads, setLoads] = useState<LoadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      if (!supabase) return;

      const userResult = await supabase.auth.getUser();
      const user = userResult.data.user;
      if (!user) {
        setError("Session not found.");
        setLoading(false);
        return;
      }

      const carrierResult = await supabase.from("carriers").select("id").eq("user_id", user.id).maybeSingle();
      const carrierData = carrierResult.data as Pick<CarrierRow, "id"> | null;
      if (carrierResult.error || !carrierData) {
        setError(carrierResult.error?.message || "Carrier profile not found.");
        setLoading(false);
        return;
      }

      const loadsResult = await supabase
        .from("loads")
        .select("*")
        .eq("carrier_id", carrierData.id)
        .order("pickup_date", { ascending: false });

      if (loadsResult.error) {
        setError(loadsResult.error.message);
      } else {
        setLoads((loadsResult.data || []) as LoadRow[]);
      }
      setLoading(false);
    };

    void loadData();
  }, [supabase]);

  if (loading) return <p className="text-sm text-brand-slate-light">Loading loads...</p>;
  if (error) return <p className="text-sm text-brand-danger">{error}</p>;

  return (
    <div className="space-y-6">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-brand-amber">Loads</p>
        <h1 className="mt-2 text-3xl font-semibold text-brand-slate">Load History</h1>
      </div>

      {loads.length === 0 ? (
        <div className="card p-5 text-sm text-brand-slate-light">No loads are assigned to your portal yet.</div>
      ) : (
        <div className="space-y-4">
          {loads.map((load) => (
            <LoadCard key={load.id} load={load} />
          ))}
        </div>
      )}
    </div>
  );
}

