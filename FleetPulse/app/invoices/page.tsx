"use client";

import { useEffect, useState } from "react";
import { Loader, Plus, Trash2, CheckCircle, Send, Sparkles } from "lucide-react";

import { createBrowserSupabaseClient } from "@/lib/supabase";
import type { CarrierPortalMode, CarrierRow, InvoiceRow, InvoiceStatus, LoadRow } from "@/lib/types";
import InvoiceSendModal from "@/components/InvoiceSendModal";
import FollowUpModal from "@/components/FollowUpModal";
import StatusBadge from "@/components/StatusBadge";

type InvoiceWithLoad = InvoiceRow & {
  loads?: { load_number: string | null; origin: string; destination: string } | null;
};

function daysOutstanding(issuedDate: string | null): number {
  if (!issuedDate) return 0;
  return Math.floor((Date.now() - new Date(issuedDate).getTime()) / 86_400_000);
}

function fmtCurrency(n: number | null) {
  if (n == null) return "—";
  return "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const FIELD_CLS = "w-full rounded-lg border border-brand-border bg-brand-surface px-3 py-2 text-sm text-brand-slate focus:outline-none focus:ring-1 focus:ring-brand-amber";
const EMPTY_FORM = { load_id: "", amount: "", invoice_number: "", issued_date: "", due_date: "", customer_ap_email: "", notes: "" };

export default function InvoicesPage() {
  const [supabase] = useState(() =>
    typeof window === "undefined" ? null : createBrowserSupabaseClient(),
  );
  const [carrier, setCarrier] = useState<CarrierRow | null>(null);
  const [portalMode, setPortalMode] = useState<CarrierPortalMode>("managed");
  const [invoices, setInvoices] = useState<InvoiceWithLoad[]>([]);
  const [deliveredLoads, setDeliveredLoads] = useState<LoadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // New Invoice form
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Per-row actions
  const [actionInvoiceId, setActionInvoiceId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [markingPaidId, setMarkingPaidId] = useState<string | null>(null);

  // Modals (self-managed only)
  const [sendModalInvoice, setSendModalInvoice] = useState<InvoiceWithLoad | null>(null);
  const [followUpInvoice, setFollowUpInvoice] = useState<InvoiceWithLoad | null>(null);

  const fetchData = async (cId: string) => {
    if (!supabase) return;
    const [invRes, loadsRes] = await Promise.all([
      supabase.from("invoices").select("*, loads(load_number, origin, destination)").eq("carrier_id", cId).is("deleted_at", null).order("issued_date", { ascending: false }),
      supabase.from("loads").select("id, load_number, origin, destination, status").eq("carrier_id", cId).eq("status", "delivered").is("deleted_at", null),
    ]);
    if (!invRes.error) setInvoices((invRes.data || []) as InvoiceWithLoad[]);
    if (!loadsRes.error) setDeliveredLoads((loadsRes.data || []) as LoadRow[]);
  };

  useEffect(() => {
    const loadData = async () => {
      if (!supabase) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setError("Session not found."); setLoading(false); return; }

      const { data: cData, error: cErr } = await supabase.from("carriers").select("*").eq("user_id", user.id).limit(1).maybeSingle();
      if (cErr || !cData) { setError(cErr?.message ?? "Carrier profile not found."); setLoading(false); return; }

      setCarrier(cData as CarrierRow);
      setPortalMode((cData as CarrierRow).portal_mode ?? "managed");
      await fetchData((cData as CarrierRow).id);
      setLoading(false);
    };
    void loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  async function submitInvoice(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase || !carrier) return;
    if (!form.amount) { setFormError("Amount is required."); return; }
    setSubmitting(true); setFormError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000/api/v1";
      const res = await fetch(`${apiBase}/invoices`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` },
        body: JSON.stringify({
          load_id: form.load_id || null,
          amount: parseFloat(form.amount),
          invoice_number: form.invoice_number || null,
          issued_date: form.issued_date || null,
          due_date: form.due_date || null,
          customer_ap_email: form.customer_ap_email || null,
          notes: form.notes || null,
        }),
      });
      const json = await res.json() as { data?: InvoiceWithLoad; error?: string };
      if (!res.ok || json.error) throw new Error(json.error ?? "Failed to create invoice");
      setShowForm(false);
      setForm(EMPTY_FORM);
      // Immediately prepend the new invoice so the user sees it at once
      if (json.data) {
        setInvoices((prev) => [json.data as InvoiceWithLoad, ...prev]);
      }
      // Re-fetch in background to get the DB-joined data (load lane, etc.)
      void fetchData(carrier.id);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create invoice");
    } finally { setSubmitting(false); }
  }

  async function markPaid(inv: InvoiceWithLoad) {
    if (!supabase || !carrier) return;
    setMarkingPaidId(inv.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000/api/v1";
      await fetch(`${apiBase}/invoices/${inv.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` },
        body: JSON.stringify({ status: "paid" }),
      });
      await fetchData(carrier.id);
    } finally { setMarkingPaidId(null); setActionInvoiceId(null); }
  }

  async function deleteInvoice(inv: InvoiceWithLoad) {
    if (!supabase || !carrier) return;
    setDeletingId(inv.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000/api/v1";
      await fetch(`${apiBase}/invoices/${inv.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
      });
      setInvoices((prev) => prev.filter((i) => i.id !== inv.id));
    } finally { setDeletingId(null); setActionInvoiceId(null); }
  }

  const outstanding = invoices.filter((i) => i.status !== "paid").reduce((s, i) => s + (i.amount ?? 0), 0);
  const totalEarned = invoices.filter((i) => i.status === "paid").reduce((s, i) => s + (i.amount ?? 0), 0);
  const isSelfManaged = portalMode === "self_managed";

  if (loading) return <p className="text-sm text-brand-slate-light">Loading invoices...</p>;
  if (error) return <p className="text-sm text-brand-danger">{error}</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-brand-amber">Invoices</p>
          <h1 className="mt-2 text-3xl font-semibold text-brand-slate">Invoice History</h1>
        </div>
        {isSelfManaged && (
          <button type="button" onClick={() => { setShowForm((v) => !v); setFormError(null); }}
            className="inline-flex items-center gap-2 rounded-lg border border-brand-warning/40 bg-brand-amber px-4 py-2 text-sm font-semibold text-black transition hover:opacity-90">
            <Plus size={15} />
            {showForm ? "Cancel" : "New Invoice"}
          </button>
        )}
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="card p-4">
          <p className="text-xs text-brand-slate-light">Total Earned</p>
          <p className="mt-1 font-mono text-xl font-semibold text-brand-success">{fmtCurrency(totalEarned)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-brand-slate-light">Outstanding</p>
          <p className={cn("mt-1 font-mono text-xl font-semibold", outstanding > 0 ? "text-brand-danger" : "text-brand-slate-light")}>{fmtCurrency(outstanding)}</p>
        </div>
        <div className="card p-4 col-span-2 sm:col-span-1">
          <p className="text-xs text-brand-slate-light">Total Invoices</p>
          <p className="mt-1 font-mono text-xl font-semibold text-brand-slate">{invoices.length}</p>
        </div>
      </div>

      {/* New Invoice form */}
      {isSelfManaged && showForm && (
        <form onSubmit={(e) => void submitInvoice(e)} className="card p-5 space-y-4">
          <h2 className="text-sm font-semibold text-brand-slate">New Invoice</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-brand-slate-light">Link to Load (optional)</label>
              <select value={form.load_id} onChange={(e) => setForm((f) => ({ ...f, load_id: e.target.value }))} className={FIELD_CLS}>
                <option value="">— No load —</option>
                {deliveredLoads.map((ld) => (
                  <option key={ld.id} value={ld.id}>
                    {ld.origin} → {ld.destination}{ld.load_number ? ` (Load #${ld.load_number})` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-slate-light">Amount ($) *</label>
              <input required type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} placeholder="2500.00" className={FIELD_CLS} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-slate-light">Invoice # (auto if blank)</label>
              <input value={form.invoice_number} onChange={(e) => setForm((f) => ({ ...f, invoice_number: e.target.value }))} placeholder="Optional" className={FIELD_CLS} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-slate-light">Issue Date</label>
              <input type="date" value={form.issued_date} onChange={(e) => setForm((f) => ({ ...f, issued_date: e.target.value }))} className={FIELD_CLS} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-brand-slate-light">Due Date</label>
              <input type="date" value={form.due_date} onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))} className={FIELD_CLS} />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-brand-slate-light">Broker AP Email</label>
              <input type="email" value={form.customer_ap_email} onChange={(e) => setForm((f) => ({ ...f, customer_ap_email: e.target.value }))} placeholder="ap@broker.com" className={FIELD_CLS} />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-brand-slate-light">Notes</label>
              <textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className={cn(FIELD_CLS, "resize-none")} />
            </div>
          </div>
          {formError && <p className="text-xs text-brand-danger">{formError}</p>}
          <div className="flex gap-3">
            <button type="submit" disabled={submitting}
              className="inline-flex items-center gap-2 rounded-lg border border-brand-warning/40 bg-brand-amber px-4 py-2 text-sm font-semibold text-black transition hover:opacity-90 disabled:opacity-50">
              {submitting && <Loader size={14} className="animate-spin" />}
              {submitting ? "Saving…" : "Create Invoice"}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="rounded-lg border border-brand-border px-4 py-2 text-sm text-brand-slate-light hover:text-brand-slate transition-colors">Cancel</button>
          </div>
        </form>
      )}

      {invoices.length === 0 ? (
        <div className="card p-5 text-sm text-brand-slate-light">
          {isSelfManaged ? "No invoices yet — use New Invoice to create one." : "No invoices yet. Your dispatcher will generate invoices from your completed loads."}
        </div>
      ) : (
        <div className="space-y-2">
          {invoices.map((inv) => {
            const days = daysOutstanding(inv.issued_date);
            const daysColor = inv.status === "paid" ? "text-brand-slate-light" : days > 60 ? "text-brand-danger" : days > 30 ? "text-brand-warning" : "text-brand-slate-light";
            const expanded = expandedId === inv.id;
            const showActions = isSelfManaged && actionInvoiceId === inv.id;
            const isDeleting = deletingId === inv.id;
            const isMarkingPaid = markingPaidId === inv.id;

            return (
              <div key={inv.id} className="card overflow-hidden">
                <button type="button" className="w-full px-4 py-3 text-left hover:bg-brand-border/20 transition-colors"
                  onClick={() => setExpandedId(expanded ? null : inv.id)}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      {inv.loads && <p className="font-medium text-brand-slate truncate">{inv.loads.origin} → {inv.loads.destination}</p>}
                      <div className="mt-0.5 flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs text-brand-slate-light">{inv.invoice_number ?? `INV-${inv.id.slice(-8).toUpperCase()}`}</span>
                        {inv.loads?.load_number && <span className="font-mono text-xs text-brand-slate-light">· Load #{inv.loads.load_number}</span>}
                        <StatusBadge status={inv.status as InvoiceStatus} />
                      </div>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      <span className="font-mono text-sm font-semibold text-brand-slate">{fmtCurrency(inv.amount)}</span>
                      <span className={cn("text-xs", daysColor)}>{inv.status === "paid" ? "Paid" : `${days}d outstanding`}</span>
                      <span className="text-xs text-brand-slate-light">{expanded ? "▲" : "▼"}</span>
                    </div>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-3 text-xs text-brand-slate-light">
                    {inv.issued_date && <span>Issued: {inv.issued_date.slice(0, 10)}</span>}
                    {inv.due_date && <span>Due: {inv.due_date.slice(0, 10)}</span>}
                  </div>
                </button>

                {expanded && (
                  <div className="border-t border-brand-border bg-brand-surface px-4 py-3 space-y-3">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-xs">
                      {inv.loads && (
                        <div className="col-span-2 sm:col-span-4">
                          <p className="text-brand-slate-light">Lane</p>
                          <p className="mt-0.5 font-medium text-brand-slate">
                            {inv.loads.origin} → {inv.loads.destination}
                            {inv.loads.load_number && <span className="ml-2 font-mono font-normal text-brand-slate-light">Load #{inv.loads.load_number}</span>}
                          </p>
                        </div>
                      )}
                      <div><p className="text-brand-slate-light">Status</p><p className="mt-0.5 font-medium text-brand-slate">{STATUS_LABEL[inv.status] ?? inv.status}</p></div>
                      <div><p className="text-brand-slate-light">Amount</p><p className="mt-0.5 font-mono font-semibold text-brand-slate">{fmtCurrency(inv.amount)}</p></div>
                      <div><p className="text-brand-slate-light">Issued</p><p className="mt-0.5 text-brand-slate">{inv.issued_date?.slice(0, 10) ?? "—"}</p></div>
                      <div><p className="text-brand-slate-light">Due</p><p className="mt-0.5 text-brand-slate">{inv.due_date?.slice(0, 10) ?? "—"}</p></div>
                    </div>

                    {/* Self-managed actions */}
                    {isSelfManaged && (
                      <div className="flex flex-wrap gap-2 pt-1 border-t border-brand-border">
                        {inv.status !== "paid" && (
                          <button type="button" disabled={isMarkingPaid} onClick={() => void markPaid(inv)}
                            className="inline-flex items-center gap-1.5 rounded-md bg-brand-success/10 hover:bg-brand-success/20 text-brand-success text-xs px-3 py-1.5 transition-colors disabled:opacity-60">
                            {isMarkingPaid ? <Loader size={11} className="animate-spin" /> : <CheckCircle size={11} />}
                            Mark Paid
                          </button>
                        )}
                        {inv.status !== "paid" && (
                          <button type="button" onClick={() => setSendModalInvoice(inv)}
                            className="inline-flex items-center gap-1.5 rounded-md bg-brand-info/10 hover:bg-brand-info/20 text-brand-info text-xs px-3 py-1.5 transition-colors">
                            <Send size={11} />
                            Send Invoice
                          </button>
                        )}
                        {(inv.status === "sent" || inv.status === "overdue") && (
                          <button type="button" onClick={() => setFollowUpInvoice(inv)}
                            className="inline-flex items-center gap-1.5 rounded-md border border-brand-amber/40 bg-brand-amber-light text-brand-amber text-xs px-3 py-1.5 transition-colors hover:bg-brand-amber/10">
                            <Sparkles size={11} />
                            Draft Follow-up
                          </button>
                        )}
                        {showActions ? (
                          <div className="flex items-center gap-2 rounded-md border border-brand-danger bg-brand-danger/10 px-3 py-1.5">
                            <span className="text-xs text-brand-danger">Delete this invoice?</span>
                            <button type="button" disabled={isDeleting} onClick={() => void deleteInvoice(inv)}
                              className="text-xs font-semibold text-brand-danger hover:underline disabled:opacity-60">
                              {isDeleting ? "Deleting…" : "Yes"}
                            </button>
                            <button type="button" onClick={() => setActionInvoiceId(null)} className="text-xs text-brand-slate-light hover:text-brand-slate">No</button>
                          </div>
                        ) : (
                          <button type="button" onClick={() => setActionInvoiceId(inv.id)}
                            className="inline-flex items-center gap-1.5 rounded-md border border-brand-border text-brand-danger text-xs px-3 py-1.5 hover:bg-brand-danger/10 transition-colors">
                            <Trash2 size={11} />
                            Delete
                          </button>
                        )}
                      </div>
                    )}

                    {!isSelfManaged && (
                      <p className="text-xs text-brand-slate-light">
                        To upload or request load paperwork, go to the load detail page from your{" "}
                        <a href="/loads" className="text-brand-amber underline-offset-2 hover:underline">Loads</a> tab.
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {sendModalInvoice && carrier && (
        <InvoiceSendModal
          invoice={sendModalInvoice}
          carrierName={carrier.company_name ?? carrier.name ?? "Your Carrier"}
          onClose={() => setSendModalInvoice(null)}
          onSent={() => { void fetchData(carrier.id); }}
        />
      )}

      {followUpInvoice && (
        <FollowUpModal
          invoiceId={followUpInvoice.id}
          invoiceNumber={followUpInvoice.invoice_number ?? followUpInvoice.id.slice(0, 8).toUpperCase()}
          onClose={() => setFollowUpInvoice(null)}
          onSent={() => { if (carrier) void fetchData(carrier.id); }}
        />
      )}
    </div>
  );
}
