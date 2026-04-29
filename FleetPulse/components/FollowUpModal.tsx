"use client";

import { useEffect, useState } from "react";
import { Copy, Loader, Sparkles, X } from "lucide-react";

import { cn } from "@/lib/cn";
import { createBrowserSupabaseClient } from "@/lib/supabase";

type Props = {
  invoiceId: string;
  invoiceNumber: string;
  onClose: () => void;
  onSent?: () => void;
};

type DraftResponse = {
  subject_line?: string;
  draft_message?: string;
  tone?: string;
};

const TONE_COLORS: Record<string, string> = {
  polite:    "border border-emerald-700/40 bg-emerald-950/40 text-emerald-300",
  firm:      "border border-orange-700/40 bg-orange-950/40 text-orange-300",
  assertive: "border border-amber-700/40 bg-brand-amber-light text-brand-amber",
  final:     "border border-rose-700/40 bg-rose-950/40 text-rose-300",
};

export default function FollowUpModal({ invoiceId, invoiceNumber, onClose, onSent }: Props) {
  const [supabase] = useState(() => (typeof window === "undefined" ? null : createBrowserSupabaseClient()));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [tone, setTone] = useState("");
  const [sent, setSent] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const draft = async () => {
      if (!supabase) return;
      setLoading(true);
      setError(null);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000/api/v1";
        const res = await fetch(`${apiBase}/ai/invoice/followup`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token ?? ""}`,
          },
          body: JSON.stringify({ invoice_id: invoiceId }),
        });
        const json = await res.json() as { data?: DraftResponse; error?: string };
        if (cancelled) return;
        if (!res.ok || json.error) {
          setError(json.error ?? `Failed to generate draft (HTTP ${res.status})`);
          return;
        }
        setSubject(json.data?.subject_line ?? "");
        setBody(json.data?.draft_message ?? "");
        setTone(json.data?.tone ?? "");
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to generate draft");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void draft();
    return () => { cancelled = true; };
  }, [invoiceId, supabase]);

  const handleMarkSent = () => {
    setSent(true);
    onSent?.();
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(`${subject}\n\n${body}`);
      setCopied(true);
      setCopyError(null);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
      setCopyError("Clipboard copy failed. Please copy the draft manually.");
    }
  };

  const toneBadgeCls = tone ? TONE_COLORS[tone] ?? "bg-brand-surface text-brand-slate-light border-brand-border" : "";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl max-h-[85vh] overflow-y-auto rounded-xl border border-brand-border bg-brand-surface p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-brand-slate">
              <Sparkles size={16} className="text-brand-amber" />
              Invoice Follow-up
            </h2>
            <p className="mt-0.5 text-xs text-brand-slate-light">AI-drafted reminder for #{invoiceNumber}</p>
          </div>
          <button type="button" onClick={onClose} className="text-brand-slate-light hover:text-brand-slate">
            <X size={18} />
          </button>
        </div>

        {loading && (
          <div className="mt-6 flex items-center gap-3 text-sm text-brand-slate-light">
            <Loader size={14} className="animate-spin" />
            Generating draft…
          </div>
        )}

        {error && !loading && <p className="mt-4 text-sm text-brand-danger">{error}</p>}

        {!loading && !error && (
          <>
            {tone && (
              <div className="mt-4 flex items-center gap-2">
                <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide", toneBadgeCls)}>
                  {tone}
                </span>
                {tone === "final" && (
                  <span className="text-xs text-brand-warning">Escalation recommended</span>
                )}
              </div>
            )}

            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-brand-slate-light">Subject</label>
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full rounded-lg border border-brand-border bg-brand-surface px-3 py-2 text-sm text-brand-slate focus:outline-none focus:ring-1 focus:ring-brand-amber"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-brand-slate-light">Message</label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={10}
                  className="w-full resize-y rounded-lg border border-brand-border bg-brand-surface px-3 py-2 text-sm leading-6 text-brand-slate focus:outline-none focus:ring-1 focus:ring-brand-amber"
                />
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              {!sent ? (
                <button
                  type="button"
                  onClick={handleMarkSent}
                  className="inline-flex items-center gap-2 rounded-lg border border-brand-info/30 bg-brand-info/10 px-4 py-2 text-sm font-semibold text-brand-info hover:bg-brand-info/20"
                >
                  Mark as Sent
                </button>
              ) : (
                <span className="text-sm font-semibold text-brand-success">✓ Marked as sent</span>
              )}
              <button
                type="button"
                onClick={handleCopy}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold transition-colors",
                  copied
                    ? "border-brand-success text-brand-success"
                    : "border-brand-border text-brand-slate-light hover:text-brand-slate",
                )}
              >
                <Copy size={13} />
                {copied ? "Copied!" : "Copy to Clipboard"}
              </button>
            </div>

            {copyError && <p className="mt-2 text-xs text-brand-danger">{copyError}</p>}
          </>
        )}
      </div>
    </div>
  );
}
