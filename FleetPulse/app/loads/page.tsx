"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Loader, Plus } from "lucide-react";

import { createBrowserSupabaseClient } from "@/lib/supabase";
import type { CarrierPortalMode, CarrierRow, InvoiceRow, LoadRow } from "@/lib/types";

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

function LoadCard({ load, invoiceNumber }: { load: LoadRow; invoiceNumber?: string | null }) {
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

const EMPTY_FORM = {
  origin: "",
  destination: "",
  pickup_date: "",
  delivery_date: "",
  rate: "",
  broker_name: "",
  customer_ap_email: "",
  notes: "",
};

type LogLoadForm = typeof EMPTY_FORM;

export default function LoadsPage() {
  const [supabase] = useState(() =>
    typeof window === "undefined" ? null : createBrowserSupabaseClient(),
  );
  const [carrier, setCarrier] = useState<CarrierRow | null>(null);
  const [portalMode, setPortalMode] = useState<CarrierPortalMode>("managed");
  const [loads, setLoads] = useState<LoadRow[]>([]);
  const [invoiceByLoadId, setInvoiceByLoadId] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Log Load form (self-managed only)
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<LogLoadForm>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const originRef = useRef<HTMLInputElement>(null);

  const fetchLoads = async (cId: string) => {
    if (!supabase) return;
    const [loadsResult, invoicesResult] = await Promise.all([
      supabase.from("loads").select("*").eq("carrier_id", cId).is("deleted_at", null).order("pickup_date", { ascending: false }),
      supabase.from("invoices").select("load_id, invoice_number").eq("carrier_id", cId).is("deleted_at", null),
    ]);
    if (!loadsResult.error) setLoads((loadsResult.data || []) as LoadRow[]);
    if (!invoicesResult.error) {
      const map = new Map<string, string>();
      for (const inv of (invoicesResult.data || []) as Pick<InvoiceRow, "load_id" | "invoice_number">[]) {
        if (inv.load_id) map.set(inv.load_id, inv.invoice_number ?? "");
      }
      setInvoiceByLoadId(map);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      if (!supabase) return;

      const userResult = await supabase.auth.getUser();
      const user = userResult.data.user;
      if (!user) { setError("Session not found."); setLoading(false); return; }

      const carrierResult = await supabase.from("carriers").select("*").eq("user_id", user.id).maybeSingle();
      const carrierData = carrierResult.data as CarrierRow | null;
      if (carrierResult.error || !carrierData) {
        setError(carrierResult.error?.message || "Carrier profile not found.");
        setLoading(false);
        return;
      }
      setCarrier(carrierData);
      setPortalMode(carrierData.portal_mode ?? "managed");
      await fetchLoads(carrierData.id);
      setLoading(false);
    };
    void loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  function openForm() {
    setForm(EMPTY_FORM);
    setFormError(null);
    setShowForm(true);
    setTimeout(() => originRef.current?.focus(), 50);
  }

  async function submitLoad(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase || !carrier) return;
    if (!form.origin || !form.destination || !form.rate) {
      setFormError("Origin, destination, and rate are required.");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000/api/v1";
      const res = await fetch(`${apiBase}/loads`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` },
        body: JSON.stringify({
          origin: form.origin,
          destination: form.destination,
          pickup_date: form.pickup_date || null,
          delivery_date: form.delivery_date || null,
          rate: parseFloat(form.rate) || 0,
          broker_name: form.broker_name || null,
          customer_ap_email: form.customer_ap_email || null,
          notes: form.notes || null,
        }),
      });
      const json = await res.json() as { data?: unknown; error?: string };
      if (!res.ok || json.error) throw new Error(json.error ?? "Failed to create load");
      setShowForm(false);
      await fetchLoads(carrier.id);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create load");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <p className="text-sm text-brand-slate-light">Loading loads...</p>;
  if (error) return <p className="text-sm text-brand-danger">{error}</p>;

  const isSelfManaged = portalMode === "self_managed";
  const activeLoads = loads.filter((l) => l.status === "logged" || l.status === "in_transit" || l.status === "pending");
  const historyLoads = loads.filter((l) => l.status === "delivered" || l.status === "cancelled");

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-brand-amber">Loads</p>
          <h1 className="mt-2 text-3xl font-semibold text-brand-slate">Your Loads</h1>
        </div>
        {isSelfManaged && (
          <button
            type="button"
            onClick={() => (showForm ? setShowForm(false) : openForm())}
            className="inline-flex items-center gap-2 rounded-lg border border-amber-700/40 bg-brand-amber px-4 py-2 text-sm font-semibold text-black transition hover:bg-amber-400"
          >
            {showForm ? <ChevronUp size={15} /> : <Plus size={15} />}
            {showForm ? "Cancel" : "Log Load"}
          </button>
        )}
      </div>

      {/* Log Load form (self-managed only) */}
      {isSelfManaged && showForm && (
        <form onSubmit={(e) => void submitLoad(e)} className="card p-5 space-y-4">
          <h2 className="text-sm font-semibold text-brand-slate">New Load</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-slate-light">Origin *</label>
              <input ref={originRef} required value={form.origin} onChange={(e) => setForm((f) => ({ ...f, origin: e.target.value }))}
                placeholder="City, ST" className="w-full rounded-lg border border-brand-border bg-brand-surface px-3 py-2 text-sm text-brand-slate focus:outline-none focus:ring-1 focus:ring-brand-amber" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-slate-light">Destination *</label>
              <input required value={form.destination} onChange={(e) => setForm((f) => ({ ...f, destination: e.target.value }))}
                placeholder="City, ST" className="w-full rounded-lg border border-brand-border bg-brand-surface px-3 py-2 text-sm text-brand-slate focus:outline-none focus:ring-1 focus:ring-brand-amber" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-slate-light">Pickup Date</label>
              <input type="date" value={form.pickup_date} onChange={(e) => setForm((f) => ({ ...f, pickup_date: e.target.value }))} className="w-full rounded-lg border border-brand-border bg-brand-surface px-3 py-2 text-sm text-brand-slate focus:outline-none focus:ring-1 focus:ring-brand-amber" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-slate-light">Delivery Date</label>
              <input type="date" value={form.delivery_date} onChange={(e) => setForm((f) => ({ ...f, delivery_date: e.target.value }))} className="w-full rounded-lg border border-brand-border bg-brand-surface px-3 py-2 text-sm text-brand-slate focus:outline-none focus:ring-1 focus:ring-brand-amber" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-slate-light">Rate ($) *</label>
              <input required type="number" min="0" step="0.01" value={form.rate} onChange={(e) => setForm((f) => ({ ...f, rate: e.target.value }))}
                placeholder="2500.00" className="w-full rounded-lg border border-brand-border bg-brand-surface px-3 py-2 text-sm text-brand-slate focus:outline-none focus:ring-1 focus:ring-brand-amber" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-slate-light">Broker Name</label>
              <input value={form.broker_name} onChange={(e) => setForm((f) => ({ ...f, broker_name: e.target.value }))} placeholder="Optional" className="w-full rounded-lg border border-brand-border bg-brand-surface px-3 py-2 text-sm text-brand-slate focus:outline-none focus:ring-1 focus:ring-brand-amber" />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-brand-slate-light">Broker AP Email</label>
              <input type="email" value={form.customer_ap_email} onChange={(e) => setForm((f) => ({ ...f, customer_ap_email: e.target.value }))}
                placeholder="ap@broker.com" className="w-full rounded-lg border border-brand-border bg-brand-surface px-3 py-2 text-sm text-brand-slate focus:outline-none focus:ring-1 focus:ring-brand-amber" />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-brand-slate-light">Notes</label>
              <textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Optional" className="w-full rounded-lg border border-brand-border bg-brand-surface px-3 py-2 text-sm text-brand-slate focus:outline-none focus:ring-1 focus:ring-brand-amber resize-none" />
            </div>
          </div>
          {formError && <p className="text-xs text-brand-danger">{formError}</p>}
          <div className="flex gap-3">
            <button type="submit" disabled={submitting}
              className="inline-flex items-center gap-2 rounded-lg border border-amber-700/40 bg-brand-amber px-4 py-2 text-sm font-semibold text-black transition hover:bg-amber-400 disabled:opacity-60">
              {submitting && <Loader size={14} className="animate-spin" />}
              {submitting ? "Saving…" : "Save Load"}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="rounded-lg border border-brand-border px-4 py-2 text-sm text-brand-slate-light hover:text-brand-slate transition-colors">
              Cancel
            </button>
          </div>
        </form>
      )}

      {loads.length === 0 ? (
        <div className="card p-5 text-sm text-brand-slate-light">
          {isSelfManaged ? "No loads yet — use Log Load to add your first." : "No loads are assigned to your portal yet."}
        </div>
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="section-title">Active</h2>
            {activeLoads.length === 0 ? (
              <div className="card p-4 text-sm text-brand-slate-light">No active loads.</div>
            ) : (
              <div className="space-y-2">
                {activeLoads.map((load) => <LoadCard key={load.id} load={load} invoiceNumber={invoiceByLoadId.get(load.id)} />)}
              </div>
            )}
          </section>

          {historyLoads.length > 0 && (
            <section className="space-y-3">
              <h2 className="section-title">History</h2>
              <div className="space-y-2">
                {historyLoads.map((load) => <LoadCard key={load.id} load={load} invoiceNumber={invoiceByLoadId.get(load.id)} />)}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
