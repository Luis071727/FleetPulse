"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, FileBadge2, FolderOpen, X } from "lucide-react";

import { createBrowserSupabaseClient } from "@/lib/supabase";
import { cn } from "@/lib/cn";

type Props = {
  carrierId: string;
  docType: string;
  docLabel?: string | null;
  initialIssueDate?: string;
  initialExpiresAt?: string;
  onClose: () => void;
  onRenewed: () => void;
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function RenewDocumentModal({
  carrierId,
  docType,
  docLabel,
  initialIssueDate,
  initialExpiresAt,
  onClose,
  onRenewed,
}: Props) {
  const [issueDate, setIssueDate] = useState(initialIssueDate ?? todayIso());
  const [expiresAt, setExpiresAt] = useState(initialExpiresAt ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, submitting]);

  const canSubmit = Boolean(issueDate && expiresAt && file) && !submitting;
  const datesValid = !issueDate || !expiresAt || new Date(expiresAt) > new Date(issueDate);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("Please choose a file or take a photo.");
      return;
    }
    if (!issueDate || !expiresAt) {
      setError("Issue date and expiration date are required.");
      return;
    }
    if (!datesValid) {
      setError("Expiration date must be after the issue date.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const supabase = createBrowserSupabaseClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Your session has expired. Please sign in again.");

      const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000/api/v1";
      const body = new FormData();
      body.append("file", file);
      body.append("doc_type", docType);
      body.append("issue_date", issueDate);
      body.append("expires_at", expiresAt);

      const res = await fetch(`${apiBase}/carrier-compliance/carriers/${carrierId}/renew`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body,
      });

      if (!res.ok) {
        const text = await res.text();
        let detail = text;
        try {
          const parsed = JSON.parse(text) as { detail?: string; error?: string };
          detail = parsed.detail ?? parsed.error ?? text;
        } catch {
          // not json
        }
        throw new Error(detail || `Renewal failed (${res.status})`);
      }

      onRenewed();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Renewal failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 px-4 py-10"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-lg rounded-2xl border border-brand-border bg-brand-surface shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-brand-border p-5">
          <div className="flex items-start gap-3">
            <div className="rounded-xl border border-brand-border bg-brand-amber-light p-2 text-brand-amber">
              <FileBadge2 size={18} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-brand-slate">Renew Document</h2>
              <p className="text-xs text-brand-slate-light">{docLabel || docType}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg p-1 text-brand-slate-light transition hover:bg-brand-surface-light hover:text-brand-slate disabled:opacity-50"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          <p className="text-sm text-brand-slate-light">
            Uploading a new document replaces the existing one. Status is recomputed from the
            dates you provide.
          </p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-brand-slate-light">
                Issue date <span className="text-brand-danger">*</span>
              </span>
              <input
                type="date"
                required
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                className="w-full rounded-lg border border-brand-border bg-brand-surface px-2.5 py-1.5 text-sm text-brand-slate focus:outline-none focus:ring-1 focus:ring-brand-amber"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-brand-slate-light">
                Expiration date <span className="text-brand-danger">*</span>
              </span>
              <input
                type="date"
                required
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className={cn(
                  "w-full rounded-lg border bg-brand-surface px-2.5 py-1.5 text-sm text-brand-slate focus:outline-none focus:ring-1 focus:ring-brand-amber",
                  datesValid ? "border-brand-border" : "border-brand-danger",
                )}
              />
            </label>
          </div>

          <div className="space-y-2">
            <span className="block text-[10px] font-medium uppercase tracking-wide text-brand-slate-light">
              File <span className="text-brand-danger">*</span>
            </span>
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <input
              ref={fileRef}
              type="file"
              accept="image/*,.pdf"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => cameraRef.current?.click()}
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-lg border border-amber-700/40 bg-brand-amber px-3 py-2 text-sm font-semibold text-black transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Camera size={15} />
                Take Photo
              </button>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-lg border border-brand-border bg-transparent px-3 py-2 text-sm font-semibold text-brand-slate transition hover:bg-brand-surface-light disabled:cursor-not-allowed disabled:opacity-60"
              >
                <FolderOpen size={15} />
                Choose File
              </button>
            </div>
            {file ? (
              <p className="text-xs text-brand-slate">
                Selected: <span className="font-mono">{file.name}</span>
              </p>
            ) : (
              <p className="text-xs text-brand-slate-light">No file chosen yet.</p>
            )}
          </div>

          {error && <p className="text-xs text-brand-danger">{error}</p>}

          <div className="flex justify-end gap-2 border-t border-brand-border pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-lg border border-brand-border px-4 py-2 text-sm font-medium text-brand-slate-light transition hover:bg-brand-surface-light disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit || !datesValid}
              className="rounded-lg border border-amber-700/40 bg-brand-amber px-4 py-2 text-sm font-semibold text-black transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Renewing…" : "Renew Document"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
