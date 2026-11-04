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
import { CONTENT_KEYS, type ContentKey } from "@hericilla/types";
import { useAuth } from "@/lib/auth";

const ALL_KEYS = Object.keys(CONTENT_KEYS) as ContentKey[];
const GROUP_ORDER = ["Homepage", "About", "Contact"] as const;

export default function CmsPagesPage() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: existing, isPending } = useQuery({
    queryKey: ["page-content"],
    queryFn: async () => {
      const { data } = await getSupabase().from("hericilla_page_content").select("key, value").in("key", ALL_KEYS);
      const map: Record<string, string> = {};
      for (const r of (data as { key: string; value: unknown }[]) ?? []) {
        if (typeof r.value === "string") map[r.key] = r.value;
      }
      return map;
    },
  });

  function valueFor(key: ContentKey): string {
    return drafts[key] ?? existing?.[key] ?? "";
  }

  async function save(key: ContentKey) {
    const text = drafts[key];
    if (text == null || text.trim().length === 0) return;
    setBusyKey(key);
    setSaved(null);
    setError(null);
    const { error: err } = await getSupabase()
      .from("hericilla_page_content")
      .upsert({ key, value: text.trim(), updated_by: profile?.id, updated_at: new Date().toISOString() }, { onConflict: "key" });
    setBusyKey(null);
    if (err) {
      setError("Could not save: " + err.message);
      return;
    }
    setSaved(key);
    void qc.invalidateQueries({ queryKey: ["page-content"] });
  }

  async function clearOverride(key: ContentKey) {
    setBusyKey(key);
    setSaved(null);
    setError(null);
    const { error: err } = await getSupabase().from("hericilla_page_content").delete().eq("key", key);
    setBusyKey(null);
    if (err) {
      setError("Could not revert to default: " + err.message);
      return;
    }
    setDrafts((d) => {
      const n = { ...d };
      delete n[key];
      return n;
    });
    void qc.invalidateQueries({ queryKey: ["page-content"] });
  }

  return (
    <div>
      <PageHeader
        title="Page text"
        purpose="Change the wording and contact details on the public website without touching code. Leave a box empty to keep the standard wording."
      />
      <HintCard
        steps={[
          "Type new wording in a box and press Save.",
          "The website shows your words instead of the default within about a minute.",
          "Press “Use default” to remove your version.",
          "Contact details here feed the phone number, email and addresses shown across the site.",
        ]}
      />

      <div className="mt-6 space-y-6">
        {error && <Card className="border-danger-600 text-danger-800">{error}</Card>}
        {isPending ? (
          <Skeleton className="h-40" />
        ) : (
          GROUP_ORDER.map((group) => (
            <section key={group}>
              <h2 className="mb-3 text-lg font-bold text-brand-900">{group}</h2>
              <div className="space-y-6">
                {ALL_KEYS.filter((k) => CONTENT_KEYS[k].group === group).map((key) => {
                  const meta = CONTENT_KEYS[key];
                  const hasOverride = !!existing?.[key];
                  return (
                    <Card key={key}>
                      <BigTextarea
                        label={meta.label}
                        hint={`Default: “${meta.default}”`}
                        value={valueFor(key)}
                        onChange={(e) => setDrafts((d) => ({ ...d, [key]: e.target.value }))}
                      />
                      <div className="flex flex-wrap items-center gap-3">
                        <BigButton variant="success" size="md" onClick={() => void save(key)} disabled={busyKey === key || !drafts[key]?.trim()}>
                          {busyKey === key ? "Saving…" : "Save wording"}
                        </BigButton>
                        {hasOverride && (
                          <BigButton variant="ghost" size="md" onClick={() => void clearOverride(key)} disabled={busyKey === key}>
                            Use default
                          </BigButton>
                        )}
                        {hasOverride && <span className="text-base text-success-800 font-semibold">Currently overriding the default.</span>}
                        {saved === key && <span className="text-base text-brand-700 font-semibold">Saved ✓</span>}
                      </div>
                    </Card>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
