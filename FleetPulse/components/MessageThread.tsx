"use client";

import { useEffect, useRef, useState } from "react";
import { SendHorizontal } from "lucide-react";

import { createBrowserSupabaseClient } from "@/lib/supabase";
import type { Database, MessageRow } from "@/lib/types";

type Props = {
  currentUserId: string;
  loadId: string;
  initialMessages: MessageRow[];
};

export default function MessageThread({ currentUserId, loadId, initialMessages }: Props) {
  const [supabase] = useState(() =>
    typeof window === "undefined" ? null : createBrowserSupabaseClient(),
  );
  const [messages, setMessages] = useState<MessageRow[]>(initialMessages);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!supabase) return;

    const channel = supabase
      .channel(`messages:${loadId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `load_id=eq.${loadId}` },
        (payload) => {
          setMessages((current) => [...current, payload.new as MessageRow]);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadId, supabase]);

  const handleSend = async () => {
    if (!body.trim() || !supabase) return;
    setSending(true);
    const text = body.trim();
    setBody("");

    const payload = {
      body: text,
      load_id: loadId,
      sender_id: currentUserId,
      sender_role: "carrier",
    } satisfies Database["public"]["Tables"]["messages"]["Insert"];

    const result = await supabase.from("messages").insert(payload as never);

    if (result.error) {
      setBody(text);
    }
    setSending(false);
  };

  return (
    <div className="rounded-card border border-brand-border bg-white">
      <div className="max-h-[360px] space-y-3 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <p className="text-sm text-brand-slate-light">No messages yet. Ask your dispatcher anything about this load.</p>
        ) : (
          messages.map((message) => {
            const ownMessage = message.sender_id === currentUserId || message.sender_role === "carrier";
            return (
              <div key={message.id} className={`flex ${ownMessage ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                    ownMessage ? "bg-brand-amber text-white" : "bg-slate-100 text-brand-slate"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{message.body}</p>
                  <p className={`mt-2 text-[11px] ${ownMessage ? "text-orange-100" : "text-brand-slate-light"}`}>
                    {message.created_at ? new Date(message.created_at).toLocaleString() : "Just now"}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>
      <div className="border-t border-brand-border p-4">
        <div className="flex items-end gap-3">
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={2}
            className="min-h-[76px] flex-1 rounded-xl border border-brand-border px-4 py-3 text-sm outline-none ring-0 focus:border-brand-amber"
            placeholder="Type a note to your dispatcher..."
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={sending || !body.trim()}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-brand-amber px-4 text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <SendHorizontal size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

