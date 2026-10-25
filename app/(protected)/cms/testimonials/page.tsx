"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  PageHeader,
  HintCard,
  BigButton,
  BigInput,
  BigTextarea,
  BigSelect,
  Card,
  RowCard,
  Modal,
  Skeleton,
  EmptyState,
} from "@hericilla/ui";
import { getSupabase } from "@hericilla/supabase-clients";

type Testimonial = {
  id: string;
  client_name: string;
  company: string | null;
  photo_url: string | null;
  quote: string;
  rating: number | null;
  approved: boolean;
  display_order: number;
};

const BLANK = { client_name: "", company: "", photo_url: "", quote: "", rating: "5", display_order: "0" };

export default function CmsTestimonialsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(BLANK);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: rows, isPending } = useQuery({
    queryKey: ["testimonials"],
    queryFn: async () => {
      const { data } = await getSupabase().from("hericilla_testimonials").select("*").order("display_order").order("created_at", { ascending: false });
      return (data as Testimonial[]) ?? [];
    },
  });

  function startCreate() {
    setForm(BLANK);
    setEditId(null);
    setOpen(true);
  }

  function startEdit(t: Testimonial) {
    setForm({
      client_name: t.client_name,
      company: t.company ?? "",
      photo_url: t.photo_url ?? "",
      quote: t.quote,
      rating: String(t.rating ?? 5),
      display_order: String(t.display_order ?? 0),
    });
    setEditId(t.id);
    setOpen(true);
  }

  async function save() {
    if (form.client_name.trim().length < 2 || form.quote.trim().length < 5) {
      setError("A name and the actual words are needed.");
      return;
    }
    setBusy(true);
    setError(null);
    const payload = {
      client_name: form.client_name.trim(),
      company: form.company || null,
      photo_url: form.photo_url || null,
      quote: form.quote.trim(),
      rating: Number(form.rating) || 5,
      display_order: Number(form.display_order) || 0,
    };
    const { error: err } = editId
      ? await getSupabase().from("hericilla_testimonials").update(payload).eq("id", editId)
      : await getSupabase().from("hericilla_testimonials").insert({ ...payload, approved: false });
    setBusy(false);
    if (err) {
      setError("Could not save: " + err.message);
      return;
    }
    setOpen(false);
    void qc.invalidateQueries({ queryKey: ["testimonials"] });
  }

  async function toggleApproved(t: Testimonial) {
    await getSupabase().from("hericilla_testimonials").update({ approved: !t.approved }).eq("id", t.id);
    void qc.invalidateQueries({ queryKey: ["testimonials"] });
  }

  async function remove(t: Testimonial) {
    await getSupabase().from("hericilla_testimonials").delete().eq("id", t.id);
    void qc.invalidateQueries({ queryKey: ["testimonials"] });
  }

  return (
    <div>
      <PageHeader
        title="Testimonials"
        purpose="What clients say about us. Only approved quotes appear on the website."
        actions={<BigButton onClick={startCreate}>+ Add testimonial</BigButton>}
      />
      <HintCard
        steps={[
          "Add what the client said, their name and company.",
          "Press “Approve” when you are happy for it to be public.",
          "Lower numbers appear first on the homepage carousel.",
        ]}
      />

      <div className="mt-6">
        {isPending ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
        ) : rows!.length === 0 ? (
          <EmptyState title="No testimonials yet" teach="When a client compliments the work, write it down here and approve it for the site." />
        ) : (
          <div className="space-y-3">
            {rows!.map((t) => (
              <RowCard
                key={t.id}
                title={`“${t.quote.slice(0, 70)}${t.quote.length > 70 ? "…" : ""}”`}
                subtitle={`${t.client_name}${t.company ? `, ${t.company}` : ""} · ${t.rating ?? 5}★ · order ${t.display_order}`}
                actions={
                  <span className="flex gap-2 items-center">
                    <span className={`text-base font-semibold ${t.approved ? "text-success-800" : "text-ink-soft"}`}>
                      {t.approved ? "On website" : "Hidden"}
                    </span>
                    <BigButton size="md" variant={t.approved ? "secondary" : "success"} onClick={() => void toggleApproved(t)}>
                      {t.approved ? "Unapprove" : "Approve"}
                    </BigButton>
                    <BigButton size="md" variant="ghost" onClick={() => startEdit(t)}>
                      Edit
                    </BigButton>
                    <BigButton size="md" variant="ghost" className="text-danger-800" onClick={() => void remove(t)}>
                      Delete
                    </BigButton>
                  </span>
                }
              />
            ))}
          </div>
        )}
      </div>

      <Modal open={open} title={editId ? "Edit testimonial" : "New testimonial"} onClose={() => setOpen(false)} wide>
        <div className="space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <BigInput label="Client name" required value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} />
            <BigInput label="Company" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
          </div>
          <BigTextarea label="What they said" required value={form.quote} onChange={(e) => setForm({ ...form, quote: e.target.value })} />
          <div className="grid gap-5 sm:grid-cols-3">
            <BigSelect
              label="Rating"
              value={form.rating}
              onChange={(e) => setForm({ ...form, rating: e.target.value })}
              options={["5", "4", "3", "2", "1"].map((n) => ({ value: n, label: `${n} stars` }))}
            />
            <BigInput label="Display order" type="number" value={form.display_order} onChange={(e) => setForm({ ...form, display_order: e.target.value })} />
            <BigInput label="Photo URL" hint="Optional" value={form.photo_url} onChange={(e) => setForm({ ...form, photo_url: e.target.value })} />
          </div>
          {error && <Card className="border-danger-600 text-danger-800">{error}</Card>}
          <div className="flex justify-end gap-3">
            <BigButton variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </BigButton>
            <BigButton variant="success" onClick={() => void save()} disabled={busy}>
              {busy ? "Saving…" : "Save testimonial"}
            </BigButton>
          </div>
        </div>
      </Modal>
    </div>
  );
}
