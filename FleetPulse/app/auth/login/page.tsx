"use client";

import { FormEvent, useState } from "react";

import { createBrowserSupabaseClient } from "@/lib/supabase";

export default function LoginPage() {
  const [supabase] = useState(() =>
    typeof window === "undefined" ? null : createBrowserSupabaseClient(),
  );
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    if (!supabase) {
      setError("Supabase client is unavailable.");
      setLoading(false);
      return;
    }

    const redirectBase = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
    const result = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${redirectBase}/auth/callback`,
      },
    });

    if (result.error) {
      setError(result.error.message);
    } else {
      setMessage(`Check your inbox — we sent a link to ${email}`);
      setEmail("");
    }
    setLoading(false);
  };

  return (
    <div className="mx-auto flex min-h-[75vh] max-w-md items-center">
      <div className="card w-full p-8">
        <p className="font-mono text-sm font-semibold uppercase tracking-[0.2em] text-brand-amber">FleetPulse</p>
        <h1 className="mt-3 text-3xl font-semibold text-brand-slate">Access your carrier portal</h1>
        <p className="mt-3 text-sm leading-6 text-brand-slate-light">
          Enter your email and we&apos;ll send a secure magic link. No account setup or password is needed.
        </p>

        <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
          <label className="block text-sm font-medium text-brand-slate">
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="dispatch@example.com"
              required
              className="mt-2 w-full rounded-xl border border-brand-border px-4 py-3 outline-none transition focus:border-brand-amber"
            />
          </label>
          <button
            type="submit"
            disabled={loading || !email}
            className="w-full rounded-xl bg-brand-amber px-4 py-3 font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Sending..." : "Send me a link"}
          </button>
        </form>

        {message && <p className="mt-4 text-sm text-emerald-700">{message}</p>}
        {error && <p className="mt-4 text-sm text-brand-danger">{error}</p>}

        <p className="mt-6 text-sm text-brand-slate-light">
          No account needed. Your dispatcher handles your access.
        </p>
      </div>
    </div>
  );
}

