"use client";

import { useEffect, useState } from "react";

import { createBrowserSupabaseClient } from "@/lib/supabase";
import { cn } from "@/lib/cn";
import type { CarrierRow, InvoiceRow } from "@/lib/types";

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  sent: "Sent",
  paid: "Paid",
  overdue: "Overdue",
  shortpaid: "Short Paid",
  claim: "Claim",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-brand-amber-light text-brand-amber border-brand-amber/30",
  sent: "bg-blue-950 text-blue-300 border-blue-800",
  paid: "bg-green-950 text-green-400 border-green-800",
  overdue: "bg-red-950 text-red-400 border-red-800",
  shortpaid: "bg-orange-950 text-orange-400 border-orange-800",
  claim: "bg-purple-950 text-purple-400 border-purple-800",
};

function daysOutstanding(issuedDate: string | null): number {
  if (!issuedDate) return 0;
  const diff = Date.now() - new Date(issuedDate).getTime();
  return Math.floor(diff / 86_400_000);
}

function fmtCurrency(n: number | null) {
  if (n == null) return "—";
  return "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", STATUS_COLORS[status] ?? "bg-brand-surface text-brand-slate-light border-brand-border")}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

export default function InvoicesPage() {
  const [supabase] = useState(() =>
    typeof window === "undefined" ? null : createBrowserSupabaseClient(),
  );
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

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

      const carrierResult = await supabase
        .from("carriers")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      const carrier = carrierResult.data as Pick<CarrierRow, "id"> | null;
      if (!carrier) {
        setError("Carrier profile not found.");
        setLoading(false);
        return;
      }

      const invoicesResult = await supabase
        .from("invoices")
        .select("*")
        .eq("carrier_id", carrier.id)
        .is("deleted_at", null)
        .order("issued_date", { ascending: false });

      if (invoicesResult.error) {
        setError(invoicesResult.error.message);
      } else {
        setInvoices((invoicesResult.data || []) as InvoiceRow[]);
      }
      setLoading(false);
    };

    void loadData();
  }, [supabase]);

  const outstanding = invoices
    .filter((i) => i.status !== "paid")
    .reduce((sum, i) => sum + (i.amount ?? 0), 0);

  const totalEarned = invoices
    .filter((i) => i.status === "paid")
    .reduce((sum, i) => sum + (i.amount ?? 0), 0);

  if (loading) return <p className="text-sm text-brand-slate-light">Loading invoices...</p>;
  if (error) return <p className="text-sm text-brand-danger">{error}</p>;

  return (
    <div className="space-y-6">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-brand-amber">Invoices</p>
        <h1 className="mt-2 text-3xl font-semibold text-brand-slate">Invoice History</h1>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="card p-4">
          <p className="text-xs text-brand-slate-light">Total Earned</p>
          <p className="mt-1 font-mono text-xl font-semibold text-green-400">{fmtCurrency(totalEarned)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-brand-slate-light">Outstanding</p>
          <p className={cn("mt-1 font-mono text-xl font-semibold", outstanding > 0 ? "text-red-400" : "text-brand-slate-light")}>
            {fmtCurrency(outstanding)}
          </p>
        </div>
        <div className="card p-4 col-span-2 sm:col-span-1">
          <p className="text-xs text-brand-slate-light">Total Invoices</p>
          <p className="mt-1 font-mono text-xl font-semibold text-brand-slate">{invoices.length}</p>
        </div>
      </div>

      {invoices.length === 0 ? (
        <div className="card p-5 text-sm text-brand-slate-light">
          No invoices yet. Your dispatcher will generate invoices from your completed loads.
        </div>
      ) : (
        <div className="space-y-2">
          {invoices.map((inv) => {
            const days = daysOutstanding(inv.issued_date);
            const daysColor = inv.status === "paid"
              ? "text-brand-slate-light"
              : days > 60 ? "text-red-400" : days > 30 ? "text-brand-warning" : "text-brand-slate-light";
            const expanded = expandedId === inv.id;

            return (
              <div key={inv.id} className="card overflow-hidden">
                {/* Row */}
                <button
                  type="button"
                  className="w-full px-4 py-3 text-left hover:bg-brand-border/20 transition-colors"
                  onClick={() => setExpandedId(expanded ? null : inv.id)}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-sm font-medium text-brand-slate">
                        {inv.invoice_number ?? inv.id.slice(-8).toUpperCase()}
                      </span>
                      <StatusBadge status={inv.status} />
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="font-mono text-sm font-semibold text-brand-slate">
                        {fmtCurrency(inv.amount)}
                      </span>
                      <span className={cn("text-xs", daysColor)}>
                        {inv.status === "paid" ? "Paid" : `${days}d outstanding`}
                      </span>
                      <span className="text-xs text-brand-slate-light">{expanded ? "▲" : "▼"}</span>
                    </div>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-3 text-xs text-brand-slate-light">
                    {inv.issued_date && <span>Issued: {inv.issued_date.slice(0, 10)}</span>}
                    {inv.due_date && <span>Due: {inv.due_date.slice(0, 10)}</span>}
                    {inv.load_id && <span>Load: {inv.load_id.slice(-8).toUpperCase()}</span>}
                  </div>
                </button>

                {/* Expanded detail */}
                {expanded && (
                  <div className="border-t border-brand-border bg-brand-surface px-4 py-3 space-y-3">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-xs">
                      <div>
                        <p className="text-brand-slate-light">Status</p>
                        <p className="mt-0.5 font-medium text-brand-slate">{STATUS_LABEL[inv.status] ?? inv.status}</p>
                      </div>
                      <div>
                        <p className="text-brand-slate-light">Amount</p>
                        <p className="mt-0.5 font-mono font-semibold text-brand-slate">{fmtCurrency(inv.amount)}</p>
                      </div>
                      <div>
                        <p className="text-brand-slate-light">Issued</p>
                        <p className="mt-0.5 text-brand-slate">{inv.issued_date?.slice(0, 10) ?? "—"}</p>
                      </div>
                      <div>
                        <p className="text-brand-slate-light">Due</p>
                        <p className="mt-0.5 text-brand-slate">{inv.due_date?.slice(0, 10) ?? "—"}</p>
                      </div>
                    </div>
                    <p className="text-xs text-brand-slate-light">
                      To upload or request load paperwork (BOL, POD, etc.), go to the load detail page
                      from your <a href="/loads" className="text-brand-amber underline-offset-2 hover:underline">Loads</a> tab.
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
