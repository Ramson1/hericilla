"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  PageHeader,
  HintCard,
  BigButton,
  BigInput,
  BigTextarea,
  RowCard,
  Skeleton,
  EmptyState,
} from "@hericilla/ui";
import { getSupabase } from "@hericilla/supabase-clients";
import { useAuth } from "@/lib/auth";

type Announcement = { id: string; title: string; body: string; audience: string[]; created_at: string };

const AUDIENCES = [
  { role: "staff", label: "Office staff" },
  { role: "driver", label: "Drivers" },
  { role: "supervisor", label: "Supervisors" },
  { role: "warehouse_agent", label: "Warehouse agents" },
];

export default function AnnouncementsPage() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<string[]>(["staff", "driver"]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data, isPending } = useQuery({
    queryKey: ["announcements"],
    queryFn: async () => {
      const { data } = await getSupabase().from("hericilla_announcements").select("*").order("created_at", { ascending: false }).limit(100);
      return (data as Announcement[]) ?? [];
    },
  });

  async function send() {
    if (!title.trim() || !body.trim()) {
      setError("Write a title and a message first.");
      return;
    }
    if (audience.length === 0) {
      setError("Pick at least one group to receive it.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error: insErr } = await getSupabase().from("hericilla_announcements").insert({
      title: title.trim(),
      body: body.trim(),
      audience,
      created_by: profile?.id,
      sent_at: new Date().toISOString(),
    });
    if (insErr) {
      setBusy(false);
      setError("Could not send: " + insErr.message);
      return;
    }
    // Queue one outbox message per targeted role — the notify service fans out.
    for (const role of audience) {
      await getSupabase().rpc("hericilla_push_notification", {
        target_user: null,
        target_role: role,
        chans: ["in_app", "web_push", "expo_push"],
        ttl: title.trim(),
        tbo: body.trim(),
      });
    }
    setBusy(false);
    setTitle("");
    setBody("");
    void qc.invalidateQueries({ queryKey: ["announcements"] });
  }

  function toggle(role: string) {
    setAudience((a) => (a.includes(role) ? a.filter((x) => x !== role) : [...a, role]));
  }

  return (
    <div>
      <PageHeader
        title="Announcements"
        purpose="One message out to whole teams at once — it lands in their portal bell, browser pop-ups and phones."
      />
      <HintCard
        steps={[
          "Write it like you would a WhatsApp message: short and clear.",
          "Tick who should receive it.",
          "Press Send — everyone gets it within a minute.",
        ]}
      />

      <div className="mt-6 rounded-[var(--radius-card)] bg-white border border-[var(--color-line)] p-6 shadow-[var(--shadow-card)] space-y-5">
        <BigInput label="Title" required value={title} onChange={(e) => setTitle(e.target.value)} />
        <BigTextarea label="Message" required rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
        <div>
          <p className="text-base font-semibold mb-2">Who receives it?</p>
          <div className="flex gap-3 flex-wrap">
            {AUDIENCES.map((a) => (
              <BigButton
                key={a.role}
                size="md"
                variant={audience.includes(a.role) ? "primary" : "secondary"}
                onClick={() => toggle(a.role)}
              >
                {a.label}
              </BigButton>
            ))}
          </div>
        </div>
        {error && <p className="text-base text-danger-800">{error}</p>}
        <div className="flex justify-end">
          <BigButton variant="success" disabled={busy} onClick={() => void send()}>{busy ? "Sending…" : "Send to everyone"}</BigButton>
        </div>
      </div>

      <h2 className="mt-10 text-lg font-bold text-brand-950">Sent before</h2>
      {isPending ? (
        <div className="mt-4 space-y-3"><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
      ) : (data ?? []).length === 0 ? (
        <div className="mt-4">
          <EmptyState title="No announcements yet" teach="The first one you send will appear here with its date." />
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {(data ?? []).map((a) => (
            <RowCard
              key={a.id}
              title={a.title}
              subtitle={`${a.body} · to ${a.audience.join(", ")} · ${new Date(a.created_at).toLocaleString()}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
