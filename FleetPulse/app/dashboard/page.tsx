"use client";

import { useCallback, useEffect, useState } from "react";

import { AlertTriangle, CheckCircle, ClipboardCopy, FileText, Mail, RefreshCw, Send } from "lucide-react";

import FollowUpModal from "@/components/FollowUpModal";
import type { InvoiceSendModalData } from "@/components/InvoiceSendModal";
import InvoiceSendModal from "@/components/InvoiceSendModal";
import LoadCard from "@/components/LoadCard";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import type { CarrierRow, InvoiceRow, LoadRow } from "@/lib/types";

type TodayAction = {
  id: string;
  type: "invoice_followup" | "compliance_expiring" | "paperwork_pending" | "invoice_ready";
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
  due_in_days: number | null;
  entity_id: string;
  entity_type: string;
  cta: { label: string; action: string };
};

function fmtCurrency(n: number) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const PRIORITY_BORDER: Record<string, string> = {
  high: "border-red-500",
  medium: "border-amber-500",
  low: "border-slate-500",
};

const PRIORITY_ICON_COLOR: Record<string, string> = {
  high: "text-red-400",
  medium: "text-amber-400",
  low: "text-slate-400",
};

const PRIORITY_BTN: Record<string, string> = {
  high: "bg-red-500/10 hover:bg-red-500/20 text-red-400",
  medium: "bg-amber-500/10 hover:bg-amber-500/20 text-amber-400",
  low: "bg-slate-500/10 hover:bg-slate-500/20 text-slate-400",
};

const TYPE_ICON_MAP: Record<string, React.ElementType> = {
  invoice_followup: Mail,
  compliance_expiring: AlertTriangle,
  paperwork_pending: FileText,
  invoice_ready: Send,
};

export default function DashboardPage() {
  const [supabase] = useState(() =>
    typeof window === "undefined" ? null : createBrowserSupabaseClient(),
  );
  const [carrier, setCarrier] = useState<CarrierRow | null>(null);
  const [loads, setLoads] = useState<LoadRow[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Today's actions
  const [actions, setActions] = useState<TodayAction[]>([]);
  const [actionsLoading, setActionsLoading] = useState(true);
  const [sessionToken, setSessionToken] = useState<string | null>(null);

  // CTA state
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const [followupState, setFollowupState] = useState<{ invoiceId: string; invoiceNumber: string } | null>(null);
  const [sendModalInvoice, setSendModalInvoice] = useState<InvoiceSendModalData | null>(null);

  const fetchActions = useCallback(async (token: string) => {
    setActionsLoading(true);
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000/api/v1";
      const res = await fetch(`${apiBase}/actions/today`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = (await res.json()) as { data?: TodayAction[] };
        setActions(json.data ?? []);
      }
    } catch {
      // non-critical
    } finally {
      setActionsLoading(false);
    }
  }, []);

  const loadData = useCallback(async () => {
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
      .limit(1)
      .maybeSingle();
    const carrierData = carrierResult.data as CarrierRow | null;

    if (carrierResult.error || !carrierData) {
      setError(carrierResult.error?.message || "Carrier profile not found.");
      setLoading(false);
      return;
    }

    setCarrier(carrierData);

    const [loadsRes, invoicesRes, sessionRes] = await Promise.all([
      supabase
        .from("loads")
        .select("*")
        .eq("carrier_id", carrierData.id)
        .neq("status", "cancelled")
        .order("pickup_date", { ascending: true }),
      supabase
        .from("invoices")
        .select("*")
        .eq("carrier_id", carrierData.id)
        .is("deleted_at", null),
      supabase.auth.getSession(),
    ]);

    setLoads((loadsRes.data || []) as LoadRow[]);
    setInvoices((invoicesRes.data || []) as InvoiceRow[]);

    const token = sessionRes.data.session?.access_token ?? null;
    setSessionToken(token);
    if (token) {
      void fetchActions(token);
    } else {
      setActionsLoading(false);
    }

    setLoading(false);
  }, [supabase, fetchActions]);

  useEffect(() => {
    void loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  async function handleCta(action: TodayAction) {
    const { action: ctaAction } = action.cta;

    if (ctaAction.startsWith("copy:")) {
      const link = ctaAction.slice(5);
      await navigator.clipboard.writeText(link);
      setCopiedId(action.id);
      setTimeout(() => setCopiedId(null), 2500);
      return;
    }

    if (ctaAction === "/compliance") {
      window.location.href = "/compliance";
      return;
    }

    if (ctaAction.startsWith("followup:")) {
      const invId = ctaAction.slice(9);
      const inv = invoices.find((i) => i.id === invId);
      setFollowupState({
        invoiceId: invId,
        invoiceNumber: inv?.invoice_number ?? invId.slice(0, 8).toUpperCase(),
      });
      return;
    }

    if (ctaAction.startsWith("send_invoice:")) {
      const invId = ctaAction.slice(13);
      const inv = invoices.find((i) => i.id === invId);
      if (inv) {
        setSendModalInvoice(inv as InvoiceSendModalData);
      } else {
        await sendInvoiceDirect(invId, action.id);
      }
      return;
    }
  }

  async function sendInvoiceDirect(invoiceId: string, actionId: string) {
    if (!sessionToken) return;
    setSendingId(actionId);
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000/api/v1";
      const res = await fetch(`${apiBase}/invoices/${invoiceId}/send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      if (res.ok) {
        setSentIds((prev) => new Set(prev).add(actionId));
        setActions((prev) => prev.filter((a) => a.id !== actionId));
      }
    } catch { /* silently ignore */ }
    finally { setSendingId(null); }
  }

  const paidInvoices = invoices.filter((i) => i.status === "paid");
  const totalEarned = paidInvoices.reduce((s, i) => s + (i.amount ?? 0), 0);
  const outstanding = invoices.filter((i) => i.status !== "paid").reduce((s, i) => s + (i.amount ?? 0), 0);
  const inTransit = loads.filter((l) => l.status === "in_transit").length;
  const activeLoads = loads.filter((l) => ["logged", "in_transit", "pending"].includes(l.status));

  const carrierName = carrier?.company_name ?? carrier?.name ?? "Your company";

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

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="card p-4">
          <p className="text-xs text-brand-slate-light">Total Earned</p>
          <p className="mt-1 font-mono text-lg font-semibold text-green-400">{fmtCurrency(totalEarned)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-brand-slate-light">Outstanding</p>
          <p className={`mt-1 font-mono text-lg font-semibold ${outstanding > 0 ? "text-red-400" : "text-brand-slate-light"}`}>
            {fmtCurrency(outstanding)}
          </p>
        </div>
        <div className="card p-4 col-span-2 sm:col-span-1">
          <p className="text-xs text-brand-slate-light">In Transit</p>
          <p className="mt-1 font-mono text-lg font-semibold text-blue-400">{inTransit}</p>
        </div>
      </div>

      {/* Today's Work */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="section-title">Today&apos;s Work</h2>
            <p className="mt-1 text-sm text-brand-slate-light">
              Items that need your attention.
            </p>
          </div>
          <button
            onClick={() => void loadData()}
            className="flex items-center gap-1.5 text-xs text-brand-slate-light hover:text-brand-slate transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>

        {actionsLoading ? (
          <div className="card p-5 text-sm text-brand-slate-light">Loading actions…</div>
        ) : actions.length === 0 ? (
          <div className="card p-5 flex items-center gap-3 text-sm text-brand-slate-light">
            <CheckCircle className="h-4 w-4 text-green-400 shrink-0" />
            You&apos;re all caught up — nothing urgent right now.
          </div>
        ) : (
          <div className="space-y-3">
            {actions.map((action) => {
              const borderClass = PRIORITY_BORDER[action.priority] ?? "border-slate-500";
              const iconColorClass = PRIORITY_ICON_COLOR[action.priority] ?? "text-slate-400";
              const btnClass = PRIORITY_BTN[action.priority] ?? PRIORITY_BTN.low;
              const Icon = TYPE_ICON_MAP[action.type] ?? FileText;
              const isCopied = copiedId === action.id;
              const isSending = sendingId === action.id;
              const isSent = sentIds.has(action.id);

              return (
                <div key={action.id} className={`card p-4 border-l-2 ${borderClass}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Icon className={`h-4 w-4 shrink-0 ${iconColorClass}`} />
                        <span className={`text-xs font-medium uppercase tracking-wide ${iconColorClass}`}>
                          {action.type.replace(/_/g, " ")}
                        </span>
                      </div>
                      <p className="mt-1 text-sm font-medium text-brand-slate truncate">{action.title}</p>
                      <p className="text-xs text-brand-slate-light mt-0.5 truncate">{action.description}</p>
                    </div>
                    <button
                      disabled={isSent || isSending}
                      onClick={() => void handleCta(action)}
                      className={`shrink-0 flex items-center gap-1.5 rounded-md text-xs px-3 py-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${btnClass}`}
                    >
                      {isCopied ? (
                        <><CheckCircle className="h-3.5 w-3.5" />Copied!</>
                      ) : isSent ? (
                        <><CheckCircle className="h-3.5 w-3.5" />Done</>
                      ) : isSending ? (
                        <><Send className="h-3.5 w-3.5 animate-pulse" />Sending…</>
                      ) : (
                        <>
                          {action.type === "paperwork_pending" && <ClipboardCopy className="h-3.5 w-3.5" />}
                          {action.cta.label}
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Active Loads */}
      <section className="space-y-4">
        <div>
          <h2 className="section-title">Active Loads</h2>
          <p className="mt-1 text-sm text-brand-slate-light">
            Your current load queue.
          </p>
        </div>
        {activeLoads.length === 0 ? (
          <div className="card p-5 text-sm text-brand-slate-light">
            No active loads. Your dispatcher will share your next load here.
          </div>
        ) : (
          <div className="space-y-4">
            {activeLoads.map((load) => (
              <LoadCard key={load.id} load={load} />
            ))}
          </div>
        )}
      </section>

      {/* Follow-up modal */}
      {followupState && (
        <FollowUpModal
          invoiceId={followupState.invoiceId}
          invoiceNumber={followupState.invoiceNumber}
          onClose={() => setFollowupState(null)}
          onSent={() => {
            setActions((prev) => prev.filter((a) => a.entity_id !== followupState.invoiceId));
            setFollowupState(null);
          }}
        />
      )}

      {/* Send invoice modal */}
      {sendModalInvoice && (
        <InvoiceSendModal
          invoice={sendModalInvoice}
          carrierName={carrierName}
          onClose={() => setSendModalInvoice(null)}
          onSent={() => {
            setActions((prev) => prev.filter((a) => a.entity_id !== sendModalInvoice.id));
            setSendModalInvoice(null);
          }}
        />
      )}
    </div>
  );
}
