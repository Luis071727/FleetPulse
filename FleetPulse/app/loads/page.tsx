"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { createBrowserSupabaseClient } from "@/lib/supabase";
import type { CarrierRow, InvoiceRow, LoadRow } from "@/lib/types";

const STATUS_LABEL: Record<string, string> = {
  logged: "Logged",
  in_transit: "In Transit",
  delivered: "Delivered",
  cancelled: "Cancelled",
  pending: "Pending",
};

const STATUS_COLORS: Record<string, string> = {
  logged: "bg-brand-amber-light text-brand-amber border-brand-amber/30",
  in_transit: "bg-blue-950 text-blue-300 border-blue-800",
  delivered: "bg-green-950 text-green-400 border-green-800",
  cancelled: "bg-brand-surface text-brand-slate-light border-brand-border",
  pending: "bg-brand-surface text-brand-slate-light border-brand-border",
};

function StatusPill({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[status] ?? "bg-brand-surface text-brand-slate-light border-brand-border"}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

function LoadRow({ load, invoiceNumber }: { load: LoadRow; invoiceNumber?: string | null }) {
  return (
    <Link
      href={`/loads/${load.id}`}
      className="card flex flex-wrap items-center justify-between gap-3 p-4 hover:bg-brand-border/20 transition-colors no-underline"
    >
      <div className="min-w-0">
        <p className="font-medium text-brand-slate truncate">
          {load.origin} → {load.destination}
        </p>
        <div className="mt-1 flex flex-wrap gap-3 text-xs text-brand-slate-light">
          {load.load_number && <span>Load #{load.load_number}</span>}
          {invoiceNumber && <span className="text-brand-amber/80">· {invoiceNumber}</span>}
          {load.pickup_date && <span>Pickup: {load.pickup_date}</span>}
          {load.delivery_date && <span>Delivery: {load.delivery_date}</span>}
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {load.rate != null && (
          <span className="font-mono text-sm font-semibold text-brand-slate">
            ${Number(load.rate).toLocaleString()}
          </span>
        )}
        <StatusPill status={load.status} />
      </div>
    </Link>
  );
}

export default function LoadsPage() {
  const [supabase] = useState(() =>
    typeof window === "undefined" ? null : createBrowserSupabaseClient(),
  );
  const [loads, setLoads] = useState<LoadRow[]>([]);
  const [invoiceByLoadId, setInvoiceByLoadId] = useState<Map<string, string>>(new Map());
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

      const [loadsResult, invoicesResult] = await Promise.all([
        supabase.from("loads").select("*").eq("carrier_id", carrierData.id).order("pickup_date", { ascending: false }),
        supabase.from("invoices").select("load_id, invoice_number").eq("carrier_id", carrierData.id).is("deleted_at", null),
      ]);

      if (loadsResult.error) {
        setError(loadsResult.error.message);
      } else {
        setLoads((loadsResult.data || []) as LoadRow[]);
      }

      if (!invoicesResult.error) {
        const map = new Map<string, string>();
        for (const inv of (invoicesResult.data || []) as Pick<InvoiceRow, "load_id" | "invoice_number">[]) {
          if (inv.load_id) map.set(inv.load_id, inv.invoice_number ?? "");
        }
        setInvoiceByLoadId(map);
      }

      setLoading(false);
    };

    void loadData();
  }, [supabase]);

  if (loading) return <p className="text-sm text-brand-slate-light">Loading loads...</p>;
  if (error) return <p className="text-sm text-brand-danger">{error}</p>;

  const activeLoads = loads.filter((l) => l.status === "logged" || l.status === "in_transit" || l.status === "pending");
  const historyLoads = loads.filter((l) => l.status === "delivered" || l.status === "cancelled");

  return (
    <div className="space-y-8">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-brand-amber">Loads</p>
        <h1 className="mt-2 text-3xl font-semibold text-brand-slate">Your Loads</h1>
      </div>

      {loads.length === 0 ? (
        <div className="card p-5 text-sm text-brand-slate-light">No loads are assigned to your portal yet.</div>
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="section-title">Active</h2>
            {activeLoads.length === 0 ? (
              <div className="card p-4 text-sm text-brand-slate-light">No active loads.</div>
            ) : (
              <div className="space-y-2">
                {activeLoads.map((load) => <LoadRow key={load.id} load={load} invoiceNumber={invoiceByLoadId.get(load.id)} />)}
              </div>
            )}
          </section>

          {historyLoads.length > 0 && (
            <section className="space-y-3">
              <h2 className="section-title">History</h2>
              <div className="space-y-2">
                {historyLoads.map((load) => <LoadRow key={load.id} load={load} invoiceNumber={invoiceByLoadId.get(load.id)} />)}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
