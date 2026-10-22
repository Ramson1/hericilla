"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  PageHeader,
  HintCard,
  BigButton,
  BigTextarea,
  Card,
  Skeleton,
} from "@hericilla/ui";
import { getSupabase } from "@hericilla/supabase-clients";
import { useAuth } from "@/lib/auth";

// Keys the website looks up, with their built-in default wording.
const KNOWN_KEYS = [
  { key: "home.hero_title", label: "Homepage — big headline", fallback: "Moving cargo. Sourcing equipment. Supporting Nigeria's energy sector." },
  { key: "home.hero_subtitle", label: "Homepage — line under headline", fallback: "Hericilla Support Services Limited delivers integrated logistics, procurement and supply-chain solutions to the Nigerian oil & gas industry — documented, accountable and on time." },
  { key: "about_intro", label: "About page — introduction", fallback: "Hericilla Support Services Limited is a Port Harcourt–based logistics and supply chain company serving oil & gas operators, servicing companies and contractors." },
];

export default function CmsPagesPage() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const { data: existing, isPending } = useQuery({
    queryKey: ["page-content"],
    queryFn: async () => {
      const { data } = await getSupabase().from("page_content").select("key, value").in("key", KNOWN_KEYS.map((k) => k.key));
      const map: Record<string, string> = {};
      for (const r of (data as { key: string; value: unknown }[]) ?? []) {
        if (typeof r.value === "string") map[r.key] = r.value;
      }
      return map;
    },
  });

  function valueFor(k: (typeof KNOWN_KEYS)[number]): string {
    return drafts[k.key] ?? existing?.[k.key] ?? "";
  }

  async function save(key: string) {
    const text = drafts[key];
    if (text == null || text.trim().length === 0) return;
    setBusyKey(key);
    setSaved(null);
    const { error } = await getSupabase()
      .from("page_content")
      .upsert({ key, value: text.trim(), updated_by: profile?.id, updated_at: new Date().toISOString() }, { onConflict: "key" });
    setBusyKey(null);
    if (!error) {
      setSaved(key);
      void qc.invalidateQueries({ queryKey: ["page-content"] });
    }
  }

  async function clearOverride(key: string) {
    setBusyKey(key);
    await getSupabase().from("page_content").delete().eq("key", key);
    setDrafts((d) => {
      const n = { ...d };
      delete n[key];
      return n;
    });
    setBusyKey(null);
    void qc.invalidateQueries({ queryKey: ["page-content"] });
  }

  return (
    <div>
      <PageHeader
        title="Page text"
        purpose="Change the wording on the public website without touching code. Leave a box empty to keep the standard wording."
      />
      <HintCard
        steps={[
          "Type new wording in a box and press Save.",
          "The website shows your words instead of the default within about a minute.",
          "Press “Use default” to remove your version.",
        ]}
      />

      <div className="mt-6 space-y-6">
        {isPending ? (
          <Skeleton className="h-40" />
        ) : (
          KNOWN_KEYS.map((k) => {
            const hasOverride = !!existing?.[k.key];
            return (
              <Card key={k.key}>
                <BigTextarea
                  label={k.label}
                  hint={`Default: “${k.fallback}”`}
                  value={valueFor(k)}
                  onChange={(e) => setDrafts((d) => ({ ...d, [k.key]: e.target.value }))}
                />
                <div className="flex flex-wrap items-center gap-3">
                  <BigButton variant="success" size="md" onClick={() => void save(k.key)} disabled={busyKey === k.key || !drafts[k.key]?.trim()}>
                    {busyKey === k.key ? "Saving…" : "Save wording"}
                  </BigButton>
                  {hasOverride && (
                    <BigButton variant="ghost" size="md" onClick={() => void clearOverride(k.key)} disabled={busyKey === k.key}>
                      Use default
                    </BigButton>
                  )}
                  {hasOverride && <span className="text-base text-success-800 font-semibold">Currently overriding the default.</span>}
                  {saved === k.key && <span className="text-base text-brand-700 font-semibold">Saved ✓</span>}
                </div>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
