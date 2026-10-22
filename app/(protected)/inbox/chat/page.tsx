"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  PageHeader,
  HintCard,
  BigButton,
  BigInput,
  Card,
  StatusBadge,
  Skeleton,
  EmptyState,
} from "@hericilla/ui";
import { getSupabase } from "@hericilla/supabase-clients";
import { useAuth } from "@/lib/auth";

type Thread = {
  id: string;
  visitor_name: string | null;
  visitor_contact: string | null;
  status: string;
  last_message_at: string;
  last_message_sender: string | null;
  created_at: string;
};
type Msg = { id: string; thread_id: string; sender_role: string; body: string; created_at: string; read_at: string | null };

export default function ChatInboxPage() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const [openThread, setOpenThread] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: threads, isPending } = useQuery({
    queryKey: ["chat-threads"],
    queryFn: async () => {
      const { data } = await getSupabase().from("chat_threads").select("*").order("last_message_at", { ascending: false }).limit(100);
      return (data as Thread[]) ?? [];
    },
  });

  const { data: messages } = useQuery({
    queryKey: ["chat-messages", openThread],
    queryFn: async () => {
      const { data } = await getSupabase().from("chat_messages").select("*").eq("thread_id", openThread).order("created_at").limit(200);
      return (data as Msg[]) ?? [];
    },
    enabled: !!openThread,
  });

  // Realtime: any new message refreshes the inbox; if it is in the open thread, mark visitor messages read.
  useEffect(() => {
    const ch = getSupabase()
      .channel("admin-chat-inbox")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, (payload) => {
        const m = payload.new as Msg;
        void qc.invalidateQueries({ queryKey: ["chat-threads"] });
        void qc.invalidateQueries({ queryKey: ["chat-messages", m.thread_id] });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "chat_threads" }, () => {
        void qc.invalidateQueries({ queryKey: ["chat-threads"] });
      })
      .subscribe();
    return () => {
      void getSupabase().removeChannel(ch);
    };
  }, [qc]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages?.length]);

  // Mark visitor messages read when the agent looks at the thread
  useEffect(() => {
    if (!openThread) return;
    const unread = (messages ?? []).filter((m) => m.sender_role === "visitor" && !m.read_at);
    if (unread.length === 0) return;
    void getSupabase().from("chat_messages").update({ read_at: new Date().toISOString() }).in("id", unread.map((m) => m.id));
  }, [openThread, messages]);

  async function send() {
    const body = draft.trim();
    if (!body || !openThread || !profile) return;
    setSending(true);
    await getSupabase().from("chat_messages").insert({
      thread_id: openThread,
      sender_role: "agent",
      sender_id: profile.id,
      body,
    });
    await getSupabase()
      .from("chat_threads")
      .update({ last_message_at: new Date().toISOString(), last_message_sender: "agent", assigned_admin: profile.id })
      .eq("id", openThread);
    setSending(false);
    setDraft("");
    void qc.invalidateQueries({ queryKey: ["chat-messages", openThread] });
    void qc.invalidateQueries({ queryKey: ["chat-threads"] });
  }

  async function closeThread(id: string) {
    await getSupabase().from("chat_threads").update({ status: "closed" }).eq("id", id);
    void qc.invalidateQueries({ queryKey: ["chat-threads"] });
  }

  const openCount = (threads ?? []).filter((t) => t.status === "open").length;
  const unreadThreads = (threads ?? []).filter((t) => t.status === "open" && t.last_message_sender === "visitor").length;

  return (
    <div>
      <PageHeader
        title="Inbox — live chat"
        purpose="Conversations started by visitors on the website. Answer like a normal chat; the visitor sees your reply instantly."
        actions={
          <Link href="/inbox">
            <BigButton variant="secondary">← Enquiries</BigButton>
          </Link>
        }
      />
      <HintCard
        steps={[
          `There ${openCount === 1 ? "is 1 open conversation" : `are ${openCount} open conversations`}${unreadThreads ? `, ${unreadThreads} waiting for a reply` : ""}.`,
          "Tap a conversation on the left, type at the bottom, press Send.",
          "Close a conversation when it is finished — the visitor is told the chat is closed.",
        ]}
      />

      <div className="mt-6 grid gap-6 lg:grid-cols-[360px_1fr] min-h-[60vh]">
        {/* Thread list */}
        <Card className="p-0 overflow-hidden">
          <p className="border-b border-[var(--color-line)] p-4 text-lg font-bold text-brand-950">Conversations</p>
          <div className="max-h-[70vh] overflow-y-auto">
            {isPending ? (
              <div className="space-y-3 p-4">
                {[...Array(4)].map((_, i) => (
                  <Skeleton key={i} className="h-16" />
                ))}
              </div>
            ) : (threads ?? []).length === 0 ? (
              <EmptyState
                title="No chats yet"
                teach="The green bubble on the bottom of our website starts a chat here. Until someone uses it, this list stays empty."
              />
            ) : (
              (threads ?? []).map((t) => (
                <button
                  key={t.id}
                  onClick={() => setOpenThread(t.id)}
                  className={`w-full text-left p-4 border-b border-[var(--color-line)] last:border-0 hover:bg-surface ${openThread === t.id ? "bg-brand-100" : ""}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-lg font-bold text-brand-950">{t.visitor_name || "Website visitor"}</p>
                    <StatusBadge status={t.status === "open" && t.last_message_sender === "visitor" ? "new" : t.status} />
                  </div>
                  <p className="text-base text-ink-soft">
                    {new Date(t.last_message_at).toLocaleString()}
                    {t.visitor_contact ? ` · ${t.visitor_contact}` : ""}
                  </p>
                </button>
              ))
            )}
          </div>
        </Card>

        {/* Selected thread */}
        <Card className="flex flex-col p-0 overflow-hidden">
          {!openThread ? (
            <EmptyState title="Pick a conversation" teach="Choose any conversation on the left to read it and reply here." />
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 border-b border-[var(--color-line)] p-4">
                <p className="text-lg font-bold text-brand-950">
                  {(threads ?? []).find((t) => t.id === openThread)?.visitor_name || "Website visitor"}
                </p>
                <BigButton size="md" variant="secondary" onClick={() => void closeThread(openThread)}>
                  Close conversation
                </BigButton>
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto p-4" style={{ maxHeight: "55vh" }}>
                {(messages ?? []).map((m) => (
                  <div key={m.id} className={`flex ${m.sender_role === "agent" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[80%] rounded-2xl px-4 py-3 text-lg ${
                        m.sender_role === "agent" ? "bg-brand-700 text-white" : "bg-surface text-ink border border-[var(--color-line)]"
                      }`}
                    >
                      <p className="whitespace-pre-wrap break-words">{m.body}</p>
                      <p className={`mt-1 text-xs ${m.sender_role === "agent" ? "text-brand-200" : "text-ink-soft"}`}>
                        {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>
              <div className="flex gap-3 border-t border-[var(--color-line)] p-4">
                <div className="flex-1">
                  <BigInput
                    label=" "
                    placeholder="Type your reply…"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void send();
                      }
                    }}
                  />
                </div>
                <BigButton variant="success" onClick={() => void send()} disabled={sending || !draft.trim()} className="mb-5">
                  {sending ? "…" : "Send"}
                </BigButton>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
