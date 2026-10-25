"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  PageHeader,
  HintCard,
  BigButton,
  BigInput,
  BigSelect,
  Card,
  Modal,
  RowCard,
  StatusBadge,
  Skeleton,
  EmptyState,
  Wizard,
} from "@hericilla/ui";
import { getSupabase } from "@hericilla/supabase-clients";
import { SERVICE_TYPES, SERVICE_LABELS, PRIORITIES, type ServiceType, type Priority } from "@hericilla/types";
import { useAuth } from "@/lib/auth";

type SrRow = {
  id: string;
  ref_no: string;
  title: string;
  service_type: ServiceType;
  priority: Priority;
  status: string;
  deadline: string | null;
  created_at: string;
  client_name: string | null;
};

const FILTERS = [
  { key: "open", label: "Open", match: (s: SrRow) => ["new", "quoted", "approved", "assigned", "in_progress"].includes(s.status) },
  { key: "completed", label: "Completed", match: (s: SrRow) => ["completed", "invoiced", "closed"].includes(s.status) },
  { key: "stopped", label: "Rejected / cancelled", match: (s: SrRow) => ["rejected", "cancelled"].includes(s.status) },
  { key: "all", label: "Everything", match: () => true },
] as const;

export default function JobsPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { profile } = useAuth();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("open");
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    client_id: "",
    service_type: "" as ServiceType | "",
    title: "",
    description: "",
    priority: "normal" as Priority,
    deadline: "",
    sla_days: "",
    assigned_department_id: "",
    assigned_to: "",
  });

  const { data: rows, isPending } = useQuery({
    queryKey: ["service-requests"],
    queryFn: async () => {
      const { data, error: err } = await getSupabase()
        .from("hericilla_service_requests")
        .select("id, ref_no, title, service_type, priority, status, deadline, created_at, clients:hericilla_clients(name)")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(200);
      if (err) throw err;
      return (
        (data as (Omit<SrRow, "client_name"> & { clients?: { name: string }[] | { name: string } | null })[]).map((r) => ({
          ...r,
          client_name: Array.isArray(r.clients) ? (r.clients[0]?.name ?? null) : (r.clients?.name ?? null),
        })) ?? []
      ) as SrRow[];
    },
  });

  const { data: clients } = useQuery({
    queryKey: ["clients-mini"],
    queryFn: async () => {
      const { data } = await getSupabase().from("hericilla_clients").select("id, name").is("deleted_at", null).order("name");
      return (data as { id: string; name: string }[]) ?? [];
    },
    enabled: creating,
  });

  const { data: departments } = useQuery({
    queryKey: ["departments"],
    queryFn: async () => {
      const { data } = await getSupabase().from("hericilla_departments").select("id, name").order("name");
      return (data as { id: string; name: string }[]) ?? [];
    },
    enabled: creating,
  });

  const { data: people } = useQuery({
    queryKey: ["profiles-mini"],
    queryFn: async () => {
      const { data } = await getSupabase().from("hericilla_profiles").select("id, full_name, role").eq("status", "active").order("full_name");
      return (data as { id: string; full_name: string; role: string }[]) ?? [];
    },
    enabled: creating,
  });

  const visible = useMemo(() => {
    const f = FILTERS.find((x) => x.key === filter)!;
    return (rows ?? []).filter(f.match);
  }, [rows, filter]);

  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map((f) => [f.key, (rows ?? []).filter(f.match).length])) as Record<string, number>,
    [rows],
  );

  async function createSr() {
    setBusy(true);
    setError(null);
    const { error: err } = await getSupabase().from("hericilla_service_requests").insert({
      client_id: form.client_id || null,
      service_type: form.service_type,
      title: form.title.trim(),
      description: form.description || null,
      priority: form.priority,
      deadline: form.deadline || null,
      sla_days: form.sla_days ? Number(form.sla_days) : null,
      assigned_department_id: form.assigned_department_id || null,
      assigned_to: form.assigned_to || null,
      origin: "internal",
      created_by: profile?.id,
    });
    setBusy(false);
    if (err) {
      setError("Could not save: " + err.message);
      return;
    }
    setCreating(false);
    setForm({ client_id: "", service_type: "" as ServiceType | "", title: "", description: "", priority: "normal", deadline: "", sla_days: "", assigned_department_id: "", assigned_to: "" });
    void qc.invalidateQueries({ queryKey: ["service-requests"] });
  }

  return (
    <div>
      <PageHeader
        title="Jobs — service requests"
        purpose="Every piece of work we have been asked to do, from first request to closed job."
        actions={<BigButton onClick={() => setCreating(true)}>+ New service request</BigButton>}
      />
      <HintCard
        steps={[
          "New request? Press “+ New service request” and follow the four short steps.",
          "Tap any job card to add a quotation, assign a team and track progress.",
          "When a quotation is approved, the work order is created automatically.",
        ]}
      />

      <div className="mt-6 flex flex-wrap gap-3" role="tablist" aria-label="Filter jobs">
        {FILTERS.map((f) => (
          <BigButton
            key={f.key}
            size="md"
            variant={filter === f.key ? "primary" : "secondary"}
            onClick={() => setFilter(f.key)}
          >
            {f.label} ({counts[f.key] ?? 0})
          </BigButton>
        ))}
      </div>

      {isPending ? (
        <div className="mt-6 space-y-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="Nothing here yet"
            teach="When a client asks us for something — a truck, a procurement, a full office move — record it with “+ New service request”. Every job starts there."
          />
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {visible.map((r) => (
            <RowCard
              key={r.id}
              title={`${r.ref_no} — ${r.title}`}
              subtitle={
                <>
                  {r.client_name && <span>{r.client_name}</span>}
                  <span> · {SERVICE_LABELS[r.service_type]}</span>
                  {r.deadline && <span> · due {new Date(r.deadline).toLocaleDateString()}</span>}
                </>
              }
              badge={
                <span className="flex gap-2">
                  {(r.priority === "urgent" || r.priority === "high") && <StatusBadge status={r.priority} />}
                  <StatusBadge status={r.status} />
                </span>
              }
              onClick={() => router.push(`/jobs/${r.id}`)}
            />
          ))}
        </div>
      )}

      <Modal open={creating} title="New service request" onClose={() => setCreating(false)} wide>
        <Wizard
          submitLabel="Save request"
          submitting={busy}
          onSubmit={() => void createSr()}
          steps={[
            {
              title: "Who and what",
              valid: !!form.service_type,
              content: (
                <div className="space-y-5">
                  <BigSelect
                    label="Client"
                    hint="Leave blank for an internal or walk-in request"
                    value={form.client_id}
                    onChange={(e) => setForm({ ...form, client_id: e.target.value })}
                    options={(clients ?? []).map((c) => ({ value: c.id, label: c.name }))}
                  />
                  <BigSelect
                    label="Service type"
                    required
                    value={form.service_type}
                    onChange={(e) => setForm({ ...form, service_type: e.target.value as ServiceType })}
                    options={SERVICE_TYPES.map((s) => ({ value: s, label: SERVICE_LABELS[s] }))}
                  />
                </div>
              ),
            },
            {
              title: "The job",
              valid: form.title.trim().length >= 3,
              content: (
                <div className="space-y-5">
                  <BigInput
                    label="Title"
                    required
                    hint="Short words, e.g. “Move drill pipes to Obon”"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                  />
                  <BigInput
                    label="Details"
                    hint="What exactly is needed, where, anything special"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                  />
                </div>
              ),
            },
            {
              title: "Urgency and deadline",
              content: (
                <div className="space-y-5">
                  <BigSelect
                    label="Priority"
                    value={form.priority}
                    onChange={(e) => setForm({ ...form, priority: e.target.value as Priority })}
                    options={PRIORITIES.map((p) => ({ value: p, label: p[0].toUpperCase() + p.slice(1) }))}
                  />
                  <BigInput
                    label="Deadline (optional)"
                    type="date"
                    value={form.deadline}
                    onChange={(e) => setForm({ ...form, deadline: e.target.value })}
                  />
                  <BigInput
                    label="SLA days (optional)"
                    hint="How many working days we promise to finish in"
                    type="number"
                    value={form.sla_days}
                    onChange={(e) => setForm({ ...form, sla_days: e.target.value })}
                  />
                </div>
              ),
            },
            {
              title: "Who handles it",
              content: (
                <div className="space-y-5">
                  <BigSelect
                    label="Department"
                    value={form.assigned_department_id}
                    onChange={(e) => setForm({ ...form, assigned_department_id: e.target.value })}
                    options={(departments ?? []).map((d) => ({ value: d.id, label: d.name }))}
                  />
                  <BigSelect
                    label="Officer in charge"
                    value={form.assigned_to}
                    onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}
                    options={(people ?? []).map((p) => ({ value: p.id, label: p.full_name }))}
                  />
                  <Card className="text-lg">
                    Review: <strong>{form.title || "—"}</strong> for {form.client_id ? (clients?.find((c) => c.id === form.client_id)?.name ?? "client") : "no client"},{" "}
                    {form.service_type ? SERVICE_LABELS[form.service_type as ServiceType] : "—"}. Press “Save request” to finish.
                  </Card>
                  {error && <Card className="border-danger-600 text-danger-800">{error}</Card>}
                </div>
              ),
            },
          ]}
        />
      </Modal>
    </div>
  );
}
