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

type Career = {
  id: string;
  title: string;
  department: string | null;
  location: string | null;
  description: string | null;
  requirements: string | null;
  closing_date: string | null;
  status: string;
  created_at: string;
};
type Application = {
  id: string;
  career_id: string | null;
  full_name: string;
  email: string;
  phone: string | null;
  cv_url: string | null;
  cover_letter: string | null;
  status: string;
  created_at: string;
};

const BLANK = { title: "", department: "", location: "Port Harcourt", description: "", requirements: "", closing_date: "", status: "open" };
const APP_STATUSES = ["new", "reviewed", "shortlisted", "rejected", "hired"] as const;

export default function CmsCareersPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(BLANK);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appsFor, setAppsFor] = useState<string | null>(null);

  const { data: rows, isPending } = useQuery({
    queryKey: ["careers"],
    queryFn: async () => {
      const { data } = await getSupabase().from("careers").select("*").order("created_at", { ascending: false });
      return (data as Career[]) ?? [];
    },
  });

  const { data: apps, isPending: appsPending } = useQuery({
    queryKey: ["applications", appsFor],
    queryFn: async () => {
      const { data } = await getSupabase().from("job_applications").select("*").eq("career_id", appsFor).order("created_at", { ascending: false });
      return (data as Application[]) ?? [];
    },
    enabled: !!appsFor,
  });

  const { data: allApps } = useQuery({
    queryKey: ["application-counts"],
    queryFn: async () => {
      const { data } = await getSupabase().from("job_applications").select("career_id").eq("status", "new");
      const map: Record<string, number> = {};
      for (const a of (data as { career_id: string | null }[]) ?? []) {
        if (a.career_id) map[a.career_id] = (map[a.career_id] ?? 0) + 1;
      }
      return map;
    },
  });

  function startCreate() {
    setForm(BLANK);
    setEditId(null);
    setOpen(true);
  }
  function startEdit(c: Career) {
    setForm({
      title: c.title,
      department: c.department ?? "",
      location: c.location ?? "Port Harcourt",
      description: c.description ?? "",
      requirements: c.requirements ?? "",
      closing_date: c.closing_date ?? "",
      status: c.status,
    });
    setEditId(c.id);
    setOpen(true);
  }

  async function save() {
    if (form.title.trim().length < 3) {
      setError("Give the vacancy a title.");
      return;
    }
    setBusy(true);
    setError(null);
    const payload = {
      title: form.title.trim(),
      department: form.department || null,
      location: form.location || null,
      description: form.description || null,
      requirements: form.requirements || null,
      closing_date: form.closing_date || null,
      status: form.status,
    };
    const { error: err } = editId
      ? await getSupabase().from("careers").update(payload).eq("id", editId)
      : await getSupabase().from("careers").insert(payload);
    setBusy(false);
    if (err) {
      setError("Could not save: " + err.message);
      return;
    }
    setOpen(false);
    void qc.invalidateQueries({ queryKey: ["careers"] });
  }

  async function remove(c: Career) {
    await getSupabase().from("careers").delete().eq("id", c.id);
    void qc.invalidateQueries({ queryKey: ["careers"] });
  }

  async function setAppStatus(a: Application, status: string) {
    await getSupabase().from("job_applications").update({ status }).eq("id", a.id);
    void qc.invalidateQueries({ queryKey: ["applications", appsFor] });
    void qc.invalidateQueries({ queryKey: ["application-counts"] });
  }

  return (
    <div>
      <PageHeader
        title="Careers"
        purpose="Job openings on the website and the applications people send in."
        actions={<BigButton onClick={startCreate}>+ New vacancy</BigButton>}
      />
      <HintCard
        steps={[
          "Post a vacancy and it appears on the Careers page while its status is “Open”.",
          "Press “Applications” to see who applied and their CV.",
          "Mark each application reviewed, shortlisted, rejected or hired.",
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
          <EmptyState title="No vacancies posted" teach="Press “+ New vacancy” when you are hiring. Applicants will reach this page automatically." />
        ) : (
          <div className="space-y-3">
            {rows!.map((c) => (
              <RowCard
                key={c.id}
                title={c.title}
                subtitle={[c.department, c.location, c.closing_date ? `closes ${new Date(c.closing_date).toLocaleDateString()}` : null].filter(Boolean).join(" · ")}
                badge={
                  <span className="flex gap-2 items-center">
                    {(allApps?.[c.id] ?? 0) > 0 && <StatusBadge status="new" />}
                    <StatusBadge status={c.status} />
                  </span>
                }
                actions={
                  <span className="flex gap-2">
                    <BigButton size="md" variant="secondary" onClick={() => setAppsFor(c.id)}>
                      Applications{allApps?.[c.id] ? ` (${allApps[c.id]})` : ""}
                    </BigButton>
                    <BigButton size="md" variant="ghost" onClick={() => startEdit(c)}>
                      Edit
                    </BigButton>
                    <BigButton size="md" variant="ghost" className="text-danger-800" onClick={() => void remove(c)}>
                      Delete
                    </BigButton>
                  </span>
                }
              />
            ))}
          </div>
        )}
      </div>

      {/* Vacancy editor */}
      <Modal open={open} title={editId ? "Edit vacancy" : "New vacancy"} onClose={() => setOpen(false)} wide>
        <div className="space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <BigInput label="Job title" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <BigInput label="Department" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
            <BigInput label="Location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            <BigInput label="Closing date" type="date" value={form.closing_date} onChange={(e) => setForm({ ...form, closing_date: e.target.value })} />
          </div>
          <BigTextarea label="About the role" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <BigTextarea label="What we need" hint="Skills, certificates, experience" value={form.requirements} onChange={(e) => setForm({ ...form, requirements: e.target.value })} />
          <BigSelect
            label="Status"
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value })}
            options={[
              { value: "open", label: "Open (visible on site)" },
              { value: "closed", label: "Closed" },
            ]}
          />
          {error && <Card className="border-danger-600 text-danger-800">{error}</Card>}
          <div className="flex justify-end gap-3">
            <BigButton variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </BigButton>
            <BigButton variant="success" onClick={() => void save()} disabled={busy}>
              {busy ? "Saving…" : "Save vacancy"}
            </BigButton>
          </div>
        </div>
      </Modal>

      {/* Applications */}
      <Modal open={!!appsFor} title="Applications" onClose={() => setAppsFor(null)} wide>
        {appsPending ? (
          <Skeleton className="h-24" />
        ) : (apps ?? []).length === 0 ? (
          <EmptyState title="Nobody has applied yet" teach="Applications will appear here when someone submits the Careers form on the website." />
        ) : (
          <div className="space-y-4">
            {(apps ?? []).map((a) => (
              <Card key={a.id}>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="text-lg font-bold text-brand-950">{a.full_name}</p>
                    <p className="text-base text-ink-soft">
                      <a className="underline text-brand-700" href={`mailto:${a.email}`}>{a.email}</a>
                      {a.phone ? ` · ${a.phone}` : ""} · {new Date(a.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <StatusBadge status={a.status} />
                </div>
                {a.cover_letter && <p className="mt-2 text-lg">{a.cover_letter}</p>}
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  {a.cv_url && (
                    <a href={a.cv_url} target="_blank" rel="noopener noreferrer">
                      <BigButton size="md" variant="secondary">View CV</BigButton>
                    </a>
                  )}
                  <BigSelect
                    label="Set outcome"
                    value={a.status}
                    onChange={(e) => void setAppStatus(a, e.target.value)}
                    options={APP_STATUSES.map((s) => ({ value: s, label: statusLabel(s) }))}
                  />
                </div>
              </Card>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
