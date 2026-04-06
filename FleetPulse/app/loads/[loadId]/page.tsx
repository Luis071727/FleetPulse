"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Copy, CheckCircle, Loader, RefreshCw, FileText } from "lucide-react";

import DocRequestItem from "@/components/DocRequestItem";
import MessageThread from "@/components/MessageThread";
import StatusBadge from "@/components/StatusBadge";
import UploadButton from "@/components/UploadButton";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { cn } from "@/lib/cn";
import type { CarrierRow, DocumentRequestRow, LoadRow, MessageRow } from "@/lib/types";

const DOC_TYPES = [
  { value: "BOL", label: "Bill of Lading (BOL)" },
  { value: "POD", label: "Proof of Delivery (POD)" },
  { value: "RATE_CON", label: "Rate Confirmation" },
  { value: "WEIGHT_TICKET", label: "Weight Ticket" },
  { value: "LUMPER_RECEIPT", label: "Lumper Receipt" },
  { value: "INVOICE", label: "Invoice" },
  { value: "OTHER", label: "Other" },
];

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

  // Doc section state
  const [docMode, setDocMode] = useState<"upload" | "driver">("upload");
  const [selectedDocType, setSelectedDocType] = useState("POD");
  const [driverDocTypes, setDriverDocTypes] = useState<string[]>(["BOL", "POD"]);
  const [driverLink, setDriverLink] = useState<string | null>(null);
  const [generatingLink, setGeneratingLink] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Paperwork status state
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [paperworkDocs, setPaperworkDocs] = useState<Record<string, unknown>[]>([]);
  const [paperworkRequests, setPaperworkRequests] = useState<Record<string, unknown>[]>([]);
  const [fetchingDocs, setFetchingDocs] = useState(false);

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

    // Fetch invoice ID so we can show paperwork status
    const invResult = await supabase
      .from("invoices")
      .select("id")
      .eq("load_id", loadId)
      .eq("carrier_id", carrierData.id)
      .maybeSingle();
    const invId = (invResult.data as { id: string } | null)?.id ?? null;
    setInvoiceId(invId);

    setLoading(false);

    // Kick off paperwork status fetch (non-blocking)
    if (invId) void fetchPaperworkStatus(invId);
  };

  const fetchPaperworkStatus = async (invId?: string) => {
    const id = invId ?? invoiceId;
    if (!id || !supabase) return;
    setFetchingDocs(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000/api/v1";
      const res = await fetch(`${apiBase}/paperwork/invoices/${id}/documents`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) return;
      const json = await res.json() as { data?: { documents?: Record<string, unknown>[]; requests?: Record<string, unknown>[] } };
      setPaperworkDocs(json.data?.documents ?? []);
      setPaperworkRequests(json.data?.requests ?? []);
    } catch {
      // silent — status panel is best-effort
    } finally {
      setFetchingDocs(false);
    }
  };

  useEffect(() => {
    void refreshLoadContext();
  }, [params.loadId, supabase]);

  function toggleDriverDocType(dt: string) {
    setDriverDocTypes((prev) =>
      prev.includes(dt) ? prev.filter((t) => t !== dt) : [...prev, dt],
    );
  }

  async function generateDriverLink() {
    if (!load || !carrier || !supabase || driverDocTypes.length === 0) return;
    setGeneratingLink(true);
    setLinkError(null);
    setDriverLink(null);
    setCopied(false);

    try {
      // Find the invoice for this load
      const invResult = await supabase
        .from("invoices")
        .select("id")
        .eq("load_id", load.id)
        .eq("carrier_id", carrier.id)
        .maybeSingle();
      const invoiceId = (invResult.data as { id: string } | null)?.id;
      if (!invoiceId) throw new Error("No invoice found for this load. Ask your dispatcher to create one first.");

      // Get Supabase session token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Session expired — please refresh.");

      const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000/api/v1";
      const res = await fetch(`${apiBase}/paperwork/requests`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ invoice_id: invoiceId, doc_types: driverDocTypes }),
      });
      const json = await res.json() as { data?: { magic_link?: string }; error?: string };
      if (!res.ok || json.error) throw new Error(json.error ?? "Failed to generate link");
      const link = json.data?.magic_link;
      if (!link) throw new Error("No link returned from server");
      setDriverLink(link);
      void fetchPaperworkStatus(invoiceId ?? undefined);
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : "Could not generate link");
    } finally {
      setGeneratingLink(false);
    }
  }

  function copyLink() {
    if (!driverLink) return;
    void navigator.clipboard.writeText(driverLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

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

      {/* ── Documents ── */}
      <section className="space-y-4">
        <h2 className="section-title">Load Documents</h2>

        {/* Dispatcher-requested docs (if any) */}
        {requests.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-wide text-brand-slate-light">
              Requested by dispatcher
            </p>
            {requests.map((request) => (
              <DocRequestItem
                key={request.id}
                request={request}
                userId={currentUserId}
                carrierId={carrier.id}
                loadId={load.id}
                onRefresh={() => void refreshLoadContext()}
              />
            ))}
          </div>
        )}

        {/* Carrier-initiated doc management */}
        <div className="card p-4 space-y-4">
          {/* Mode tabs */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setDocMode("upload")}
              className={cn(
                "rounded-lg border px-4 py-2 text-sm font-medium transition-colors",
                docMode === "upload"
                  ? "border-brand-amber bg-brand-amber-light text-brand-amber"
                  : "border-brand-border bg-transparent text-brand-slate-light hover:text-brand-slate",
              )}
            >
              Upload Paperwork
            </button>
            <button
              type="button"
              onClick={() => setDocMode("driver")}
              className={cn(
                "rounded-lg border px-4 py-2 text-sm font-medium transition-colors",
                docMode === "driver"
                  ? "border-brand-amber bg-brand-amber-light text-brand-amber"
                  : "border-brand-border bg-transparent text-brand-slate-light hover:text-brand-slate",
              )}
            >
              Request from Driver
            </button>
          </div>

          {/* Upload Paperwork mode */}
          {docMode === "upload" && (
            <div className="space-y-3">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-brand-slate-light">Document type</label>
                <select
                  value={selectedDocType}
                  onChange={(e) => setSelectedDocType(e.target.value)}
                  className="w-full rounded-lg border border-brand-border bg-brand-surface px-3 py-2 text-sm text-brand-slate focus:outline-none focus:ring-1 focus:ring-brand-amber"
                >
                  {DOC_TYPES.map((dt) => (
                    <option key={dt.value} value={dt.value}>{dt.label}</option>
                  ))}
                </select>
              </div>
              <UploadButton
                userId={currentUserId}
                carrierId={carrier.id}
                docType={selectedDocType}
                loadId={load.id}
                label="Upload File"
                onSuccess={() => {
                  void refreshLoadContext();
                  void fetchPaperworkStatus();
                }}
              />
            </div>
          )}

          {/* Request from Driver mode */}
          {docMode === "driver" && (
            <div className="space-y-4">
              <div>
                <p className="mb-2 text-xs font-medium text-brand-slate-light">Select documents to request</p>
                <div className="flex flex-wrap gap-2">
                  {DOC_TYPES.map((dt) => (
                    <button
                      key={dt.value}
                      type="button"
                      onClick={() => toggleDriverDocType(dt.value)}
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                        driverDocTypes.includes(dt.value)
                          ? "border-brand-amber bg-brand-amber-light text-brand-amber"
                          : "border-brand-border bg-transparent text-brand-slate-light hover:text-brand-slate",
                      )}
                    >
                      {dt.value}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                disabled={driverDocTypes.length === 0 || generatingLink}
                onClick={() => void generateDriverLink()}
                className="inline-flex items-center gap-2 rounded-lg border border-amber-700/40 bg-brand-amber px-4 py-2 text-sm font-semibold text-black transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {generatingLink ? <Loader size={14} className="animate-spin" /> : null}
                {generatingLink ? "Generating..." : "Generate Driver Link"}
              </button>

              {linkError && (
                <p className="text-xs text-brand-danger">{linkError}</p>
              )}

              {driverLink && (
                <div className="space-y-2">
                  <p className="text-xs text-brand-slate-light">Share this link with your driver:</p>
                  <div className="flex items-center gap-2">
                    <input
                      readOnly
                      value={driverLink}
                      className="flex-1 truncate rounded-lg border border-brand-border bg-brand-surface px-3 py-2 font-mono text-xs text-brand-slate focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={copyLink}
                      className={cn(
                        "flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap",
                        copied
                          ? "border-green-700 bg-green-950 text-green-400"
                          : "border-brand-border text-brand-slate-light hover:text-brand-slate",
                      )}
                    >
                      {copied ? <CheckCircle size={13} /> : <Copy size={13} />}
                      {copied ? "Copied!" : "Copy"}
                    </button>
                  </div>
                  <p className="text-xs text-brand-slate-light">
                    Send this to your driver. They can open it on any device to upload photos or PDFs — no account needed. Link expires in 72 hours.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ── Paperwork Status ── */}
      {(paperworkDocs.length > 0 || paperworkRequests.length > 0 || fetchingDocs) && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="section-title">Submitted Documents</h2>
            <button
              type="button"
              onClick={() => void fetchPaperworkStatus()}
              disabled={fetchingDocs}
              className="flex items-center gap-1.5 text-xs text-brand-slate-light hover:text-brand-slate transition-colors disabled:opacity-50"
            >
              <RefreshCw size={12} className={fetchingDocs ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>

          {/* Requests (driver link submissions) */}
          {paperworkRequests.length > 0 && (
            <div className="space-y-2">
              {paperworkRequests.map((req) => {
                const status = req.status as string;
                const isFulfilled = status === "fulfilled";
                const isExpired = status === "expired";
                return (
                  <div key={req.id as string} className="card px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
                          isFulfilled ? "border-green-700 bg-green-950 text-green-400"
                            : isExpired ? "border-brand-border bg-brand-surface text-brand-slate-light"
                            : "border-amber-700/40 bg-brand-amber-light text-brand-amber"
                        )}>
                          {isFulfilled ? "Completed" : isExpired ? "Expired" : "Awaiting driver"}
                        </span>
                        <span className="text-xs text-brand-slate-light">
                          {(req.doc_types as string[]).join(", ")}
                        </span>
                      </div>
                      {isFulfilled && req.fulfilled_at && (
                        <p className="text-xs text-green-400">
                          Completed {new Date(req.fulfilled_at as string).toLocaleDateString()}
                        </p>
                      )}
                      {!isFulfilled && !isExpired && req.expires_at && (
                        <p className="text-xs text-brand-slate-light">
                          Link expires {new Date(req.expires_at as string).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Uploaded files */}
          {paperworkDocs.length > 0 && (
            <div className="space-y-1.5">
              {paperworkDocs.map((doc) => (
                <div key={doc.id as string} className="flex items-center justify-between rounded-lg border border-brand-border bg-brand-surface px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText size={14} className="shrink-0 text-brand-amber" />
                    <span className="truncate text-sm text-brand-slate">{doc.file_name as string}</span>
                    <span className="shrink-0 rounded border border-brand-border px-1.5 py-0.5 font-mono text-[10px] text-brand-slate-light">
                      {doc.doc_type as string}
                    </span>
                  </div>
                  {doc.file_url && (
                    <a
                      href={doc.file_url as string}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 text-xs text-brand-amber hover:underline"
                    >
                      View
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

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
