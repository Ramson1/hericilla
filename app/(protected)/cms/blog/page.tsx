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
  StatusBadge,
  Modal,
  Skeleton,
  EmptyState,
} from "@hericilla/ui";
import { getSupabase } from "@hericilla/supabase-clients";
import { statusLabel } from "@hericilla/types";
import { useAuth } from "@/lib/auth";

type Post = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  content_md: string;
  cover_image: string | null;
  category: string;
  tags: string[];
  status: string;
  published_at: string | null;
  created_at: string;
};

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
}

const BLANK = { title: "", slug: "", excerpt: "", content_md: "", cover_image: "", category: "blog", tags: "", status: "draft", published_at: "" };

export default function CmsBlogPage() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(BLANK);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: rows, isPending } = useQuery({
    queryKey: ["blog"],
    queryFn: async () => {
      const { data } = await getSupabase().from("hericilla_blog_posts").select("*").order("created_at", { ascending: false });
      return (data as Post[]) ?? [];
    },
  });

  function startCreate() {
    setForm(BLANK);
    setEditId(null);
    setOpen(true);
  }

  function startEdit(p: Post) {
    setForm({
      title: p.title,
      slug: p.slug,
      excerpt: p.excerpt ?? "",
      content_md: p.content_md,
      cover_image: p.cover_image ?? "",
      category: p.category,
      tags: (p.tags ?? []).join(", "),
      status: p.status,
      published_at: p.published_at ? p.published_at.slice(0, 16) : "",
    });
    setEditId(p.id);
    setOpen(true);
  }

  async function save() {
    if (form.title.trim().length < 3) {
      setError("Please give the article a title.");
      return;
    }
    setBusy(true);
    setError(null);
    const payload = {
      title: form.title.trim(),
      slug: form.slug.trim() || slugify(form.title),
      excerpt: form.excerpt || null,
      content_md: form.content_md,
      cover_image: form.cover_image || null,
      category: form.category,
      tags: form.tags ? form.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
      status: form.status,
      published_at: form.status === "published" || form.status === "scheduled"
        ? (form.published_at ? new Date(form.published_at).toISOString() : new Date().toISOString())
        : null,
    };
    const { error: err } = editId
      ? await getSupabase().from("hericilla_blog_posts").update(payload).eq("id", editId)
      : await getSupabase().from("hericilla_blog_posts").insert({ ...payload, author_id: profile?.id });
    setBusy(false);
    if (err) {
      setError("Could not save: " + err.message);
      return;
    }
    setOpen(false);
    void qc.invalidateQueries({ queryKey: ["blog"] });
  }

  async function remove(p: Post) {
    await getSupabase().from("hericilla_blog_posts").delete().eq("id", p.id);
    void qc.invalidateQueries({ queryKey: ["blog"] });
  }

  return (
    <div>
      <PageHeader
        title="Blog & news"
        purpose="Articles that appear on the website. Write in plain text with **bold**, - bullets and links."
        actions={<BigButton onClick={startCreate}>+ New article</BigButton>}
      />
      <HintCard
        steps={[
          "Draft as much as you like — only “Published” shows on the site.",
          "“Scheduled” with a future date will publish itself once the website reloads.",
          "Give each article a category so readers can filter news from stories.",
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
          <EmptyState title="No articles yet" teach="Press “+ New article” to write your first story. Share a completed job, a safety tip or company news." />
        ) : (
          <div className="space-y-3">
            {rows!.map((p) => (
              <RowCard
                key={p.id}
                title={p.title}
                subtitle={`${statusLabel(p.category)} · /${p.slug}`}
                badge={<StatusBadge status={p.status} />}
                actions={
                  <span className="flex gap-2">
                    <BigButton size="md" variant="secondary" onClick={() => startEdit(p)}>
                      Edit
                    </BigButton>
                    <BigButton size="md" variant="ghost" className="text-danger-800" onClick={() => void remove(p)}>
                      Delete
                    </BigButton>
                  </span>
                }
              />
            ))}
          </div>
        )}
      </div>

      <Modal open={open} title={editId ? "Edit article" : "New article"} onClose={() => setOpen(false)} wide>
        <div className="space-y-5">
          <BigInput
            label="Title"
            required
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value, slug: editId ? form.slug : slugify(e.target.value) })}
          />
          <div className="grid gap-5 sm:grid-cols-2">
            <BigInput label="Web address (slug)" hint="Small words with dashes" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
            <BigSelect
              label="Category"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              options={[
                { value: "blog", label: "Blog" },
                { value: "news", label: "News" },
                { value: "project_update", label: "Project update" },
              ]}
            />
          </div>
          <BigTextarea label="Short summary" hint="One or two lines shown in the list" value={form.excerpt} onChange={(e) => setForm({ ...form, excerpt: e.target.value })} />
          <BigTextarea label="Article body" hint="Markdown: **bold**, - lists, [link](https://…)" value={form.content_md} onChange={(e) => setForm({ ...form, content_md: e.target.value })} />
          <div className="grid gap-5 sm:grid-cols-2">
            <BigInput label="Cover image URL" value={form.cover_image} onChange={(e) => setForm({ ...form, cover_image: e.target.value })} />
            <BigInput label="Tags" hint="Comma separated" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <BigSelect
              label="Status"
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
              options={[
                { value: "draft", label: "Draft (hidden)" },
                { value: "scheduled", label: "Scheduled" },
                { value: "published", label: "Published (live)" },
                { value: "archived", label: "Archived" },
              ]}
            />
            {(form.status === "scheduled" || form.status === "published") && (
              <BigInput label="Publish date & time" type="datetime-local" value={form.published_at} onChange={(e) => setForm({ ...form, published_at: e.target.value })} />
            )}
          </div>
          {error && <Card className="border-danger-600 text-danger-800">{error}</Card>}
          <div className="flex justify-end gap-3">
            <BigButton variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </BigButton>
            <BigButton variant="success" onClick={() => void save()} disabled={busy}>
              {busy ? "Saving…" : "Save article"}
            </BigButton>
          </div>
        </div>
      </Modal>
    </div>
  );
}
