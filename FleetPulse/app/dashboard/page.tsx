"use client";

import { useEffect, useState } from "react";

import { AlertTriangle, CheckCircle, ClipboardCopy, FileText, Mail, RefreshCw, Send } from "lucide-react";
import Link from "next/link";

import LoadCard from "@/components/LoadCard";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import type { CarrierRow, ComplianceDocumentRow, InvoiceRow, LoadRow } from "@/lib/types";

type PendingPaperwork = {
  request_id: string;
  invoice_id: string;
  invoice_number: string | null;
  load_id: string | null;
  load_number: string | null;
  origin: string;
  destination: string;
  doc_types: string[];
  magic_link: string;
  expires_at: string | null;
};

type InvoiceWithLoad = InvoiceRow & {
  loads?: {
    status: string;
    origin: string;
    destination: string;
    broker_name: string | null;
    customer_ap_email: string | null;
  } | null;
};

function fmtCurrency(n: number) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function daysUntil(dateStr: string): number {
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export default function DashboardPage() {
  const [supabase] = useState(() =>
    typeof window === "undefined" ? null : createBrowserSupabaseClient(),
  );
  const [carrier, setCarrier] = useState<CarrierRow | null>(null);
  const [loads, setLoads] = useState<LoadRow[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Pending actions data
  const [pendingPaperwork, setPendingPaperwork] = useState<PendingPaperwork[]>([]);
  const [expiringDocs, setExpiringDocs] = useState<ComplianceDocumentRow[]>([]);
  const [invoicesToSend, setInvoicesToSend] = useState<InvoiceWithLoad[]>([]);

  // Per-action state
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [sendingInvoice, setSendingInvoice] = useState<string | null>(null);
  const [sentInvoices, setSentInvoices] = useState<Set<string>>(new Set());

  useEffect(() => {
    void loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  async function loadData() {
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

    // Fetch all data in parallel
    const thirtyDaysOut = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const today = new Date().toISOString();

    const [loadsRes, invoicesRes, complianceRes, sessionRes] = await Promise.all([
      supabase
        .from("loads")
        .select("*")
        .eq("carrier_id", carrierData.id)
        .neq("status", "cancelled")
        .order("pickup_date", { ascending: true }),
      supabase
        .from("invoices")
        .select("*, loads(status, origin, destination, broker_name, customer_ap_email)")
        .eq("carrier_id", carrierData.id)
        .is("deleted_at", null),
      supabase
        .from("compliance_documents")
        .select("*")
        .eq("carrier_id", carrierData.id)
        .not("expires_at", "is", null)
        .gte("expires_at", today)
        .lte("expires_at", thirtyDaysOut)
        .order("expires_at", { ascending: true }),
      supabase.auth.getSession(),
    ]);

    const loadRows = (loadsRes.data || []) as LoadRow[];
    setLoads(loadRows);

    const allInvoices = (invoicesRes.data || []) as InvoiceWithLoad[];
    setInvoices(allInvoices.map((i) => i as InvoiceRow));

    // Expiring compliance docs
    setExpiringDocs((complianceRes.data || []) as ComplianceDocumentRow[]);

    // Invoices ready to send: pending invoices where linked load is delivered
    const toSend = allInvoices.filter(
      (inv) => inv.status === "pending" && inv.loads?.status === "delivered",
    );
    setInvoicesToSend(toSend);

    // Fetch pending paperwork from backend
    const session = sessionRes.data.session;
    if (session?.access_token) {
      try {
        const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000/api/v1";
        const res = await fetch(`${apiBase}/paperwork/carrier/pending`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.ok) {
          const json = (await res.json()) as { data?: PendingPaperwork[] };
          setPendingPaperwork(json.data ?? []);
        }
      } catch {
        // non-critical — silently ignore
      }
    }

    setLoading(false);
  }

  async function copyMagicLink(link: string, id: string) {
    await navigator.clipboard.writeText(link);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2500);
  }

  async function sendInvoice(inv: InvoiceWithLoad) {
    if (!supabase) return;
    setSendingInvoice(inv.id);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000/api/v1";
      const res = await fetch(`${apiBase}/invoices/${inv.id}/send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
      });

      if (res.ok) {
        const json = (await res.json()) as { data?: { sent_to?: string } };
        const apEmail = json.data?.sent_to || inv.loads?.customer_ap_email || "";
        setSentInvoices((prev) => new Set(prev).add(inv.id));
        setInvoicesToSend((prev) => prev.filter((i) => i.id !== inv.id));

        // Open mailto if we have an email
        if (apEmail) {
          const invNum = inv.invoice_number ?? inv.id.slice(0, 8);
          const lane = inv.loads ? `${inv.loads.origin} → ${inv.loads.destination}` : "";
          const subject = encodeURIComponent(`Invoice ${invNum}${lane ? ` — ${lane}` : ""}`);
          const body = encodeURIComponent(
            `Hello,\n\nPlease find attached invoice ${invNum}${lane ? ` for the load from ${inv.loads?.origin} to ${inv.loads?.destination}` : ""}.\n\nAmount due: ${fmtCurrency(inv.amount ?? 0)}\n\nPlease remit payment at your earliest convenience.\n\nThank you.`,
          );
          window.open(`mailto:${apEmail}?subject=${subject}&body=${body}`, "_blank");
        }
      }
    } catch {
      // silently ignore
    } finally {
      setSendingInvoice(null);
    }
  }

  const totalPendingActions = pendingPaperwork.length + expiringDocs.length + invoicesToSend.length;

  const paidInvoices = invoices.filter((i) => i.status === "paid");
  const totalEarned = paidInvoices.reduce((s, i) => s + (i.amount ?? 0), 0);
  const outstanding = invoices.filter((i) => i.status !== "paid").reduce((s, i) => s + (i.amount ?? 0), 0);
  const inTransit = loads.filter((l) => l.status === "in_transit").length;

  const activeLoads = loads.filter((l) => ["logged", "in_transit", "pending"].includes(l.status));

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

      {/* Pending Actions */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="section-title">Pending Actions</h2>
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

        {totalPendingActions === 0 ? (
          <div className="card p-5 flex items-center gap-3 text-sm text-brand-slate-light">
            <CheckCircle className="h-4 w-4 text-green-400 shrink-0" />
            Nothing urgent right now — you&apos;re all caught up.
          </div>
        ) : (
          <div className="space-y-3">

            {/* 1. Pending paperwork requests */}
            {pendingPaperwork.map((req) => (
              <div key={req.request_id} className="card p-4 border-l-2 border-amber-500">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-amber-400 shrink-0" />
                      <span className="text-xs font-medium text-amber-400 uppercase tracking-wide">Paperwork Needed</span>
                    </div>
                    <p className="mt-1 text-sm font-medium text-brand-slate truncate">
                      {req.origin} → {req.destination}
                    </p>
                    <p className="text-xs text-brand-slate-light mt-0.5">
                      {req.load_number ? `Load #${req.load_number}` : ""}
                      {req.invoice_number ? ` · INV-${req.invoice_number.slice(0, 8).toUpperCase()}` : ""}
                    </p>
                    {req.doc_types.length > 0 && (
                      <p className="text-xs text-brand-slate-light mt-1">
                        Docs: {req.doc_types.join(", ")}
                      </p>
                    )}
                    {req.expires_at && (
                      <p className="text-xs text-brand-slate-light mt-0.5">
                        Expires {new Date(req.expires_at).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => void copyMagicLink(req.magic_link, req.request_id)}
                    className="shrink-0 flex items-center gap-1.5 rounded-md bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-xs px-3 py-1.5 transition-colors"
                  >
                    {copiedId === req.request_id ? (
                      <>
                        <CheckCircle className="h-3.5 w-3.5" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <ClipboardCopy className="h-3.5 w-3.5" />
                        Copy Link
                      </>
                    )}
                  </button>
                </div>
              </div>
            ))}

            {/* 2. Expiring compliance docs */}
            {expiringDocs.map((doc) => {
              const days = daysUntil(doc.expires_at!);
              return (
                <div key={doc.id} className="card p-4 border-l-2 border-orange-500">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-orange-400 shrink-0" />
                        <span className="text-xs font-medium text-orange-400 uppercase tracking-wide">Compliance Expiring</span>
                      </div>
                      <p className="mt-1 text-sm font-medium text-brand-slate">
                        {doc.label || doc.doc_type}
                      </p>
                      <p className="text-xs text-brand-slate-light mt-0.5">
                        Expires {new Date(doc.expires_at!).toLocaleDateString()} · {days <= 0 ? "Today" : `${days}d left`}
                      </p>
                    </div>
                    <Link
                      href="/compliance"
                      className="shrink-0 flex items-center gap-1.5 rounded-md bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 text-xs px-3 py-1.5 transition-colors"
                    >
                      Renew
                    </Link>
                  </div>
                </div>
              );
            })}

            {/* 3. Invoices ready to send */}
            {invoicesToSend.map((inv) => {
              const isSent = sentInvoices.has(inv.id);
              const isSending = sendingInvoice === inv.id;
              const lane = inv.loads ? `${inv.loads.origin} → ${inv.loads.destination}` : null;
              const broker = inv.loads?.broker_name ?? null;
              const apEmail = inv.loads?.customer_ap_email ?? null;

              return (
                <div key={inv.id} className="card p-4 border-l-2 border-blue-500">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-blue-400 shrink-0" />
                        <span className="text-xs font-medium text-blue-400 uppercase tracking-wide">Invoice Ready to Send</span>
                      </div>
                      {lane && (
                        <p className="mt-1 text-sm font-medium text-brand-slate truncate">{lane}</p>
                      )}
                      <p className="text-xs text-brand-slate-light mt-0.5">
                        {inv.invoice_number ? `INV-${inv.invoice_number.slice(0, 8).toUpperCase()}` : `INV-${inv.id.slice(0, 8).toUpperCase()}`}
                        {broker ? ` · ${broker}` : ""}
                      </p>
                      <p className="text-xs text-brand-slate-light mt-0.5">
                        {fmtCurrency(inv.amount ?? 0)}
                        {apEmail ? ` · ${apEmail}` : ""}
                      </p>
                    </div>
                    <button
                      disabled={isSent || isSending}
                      onClick={() => void sendInvoice(inv)}
                      className="shrink-0 flex items-center gap-1.5 rounded-md bg-blue-500/10 hover:bg-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed text-blue-400 text-xs px-3 py-1.5 transition-colors"
                    >
                      {isSent ? (
                        <>
                          <CheckCircle className="h-3.5 w-3.5" />
                          Sent
                        </>
                      ) : (
                        <>
                          <Send className={`h-3.5 w-3.5 ${isSending ? "animate-pulse" : ""}`} />
                          {isSending ? "Sending…" : "Send Invoice"}
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
    </div>
  );
}
