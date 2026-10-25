"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  PageHeader,
  HintCard,
  BigButton,
  BigInput,
  BigTextarea,
  BigSelect,
  RowCard,
  StatusBadge,
  Modal,
  Skeleton,
  EmptyState,
  Wizard,
} from "@hericilla/ui";
import { getSupabase } from "@hericilla/supabase-clients";
import { useAuth } from "@/lib/auth";

type PackingJob = {
  id: string;
  ref_no: string;
  origin_address: string;
  destination_address: string;
  stage: string;
  scheduled_at: string | null;
  work_order_id: string;
  wo_number?: string;
};

export default function PackingPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { profile } = useAuth();
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    work_order_id: "",
    scheduled_at: "",
    origin_address: "",
    destination_address: "",
    supervisor_id: "",
    notes: "",
  });

  const { data: jobs, isPending } = useQuery({
    queryKey: ["packing-jobs"],
    queryFn: async () => {
      const { data } = await getSupabase()
        .from("hericilla_packing_jobs")
        .select("*, work_orders:hericilla_work_orders(wo_number)")
        .order("created_at", { ascending: false })
        .limit(200);
      const pick = <T,>(v: unknown): T | null => (v == null ? null : Array.isArray(v) ? ((v[0] as T) ?? null) : (v as T));
      return ((data as PackingJob[]) ?? []).map((r) => ({
        ...r,
        wo_number: pick<{ wo_number: string }>((r as unknown as { work_orders: unknown }).work_orders)?.wo_number ?? "",
      }));
    },
  });

  const { data: openWos } = useQuery({
    queryKey: ["work-orders-open"],
    queryFn: async () => {
      const { data } = await getSupabase()
        .from("hericilla_work_orders")
        .select("id, wo_number, service_type, clients:hericilla_clients(name)")
        .in("status", ["new", "quoted", "approved", "assigned", "in_progress"])
        .order("created_at", { ascending: false });
      const pick = <T,>(v: unknown): T | null => (v == null ? null : Array.isArray(v) ? ((v[0] as T) ?? null) : (v as T));
      return ((data as (Omit<{ id: string; wo_number: string; service_type: string; clients?: unknown }, never>)[]) ?? []).map((r) => ({
        id: r.id,
        wo_number: r.wo_number,
        service_type: r.service_type,
        client_name: pick<{ name: string }>(r.clients)?.name ?? "",
      }));
    },
    enabled: creating,
  });

  const { data: people } = useQuery({
    queryKey: ["profiles-mini"],
    queryFn: async () => {
      const { data } = await getSupabase().from("hericilla_profiles").select("id, full_name").eq("status", "active").order("full_name");
      return (data as { id: string; full_name: string }[]) ?? [];
    },
    enabled: creating,
  });

  async function createJob() {
    if (!form.work_order_id) {
      setError("Pick the work order this move belongs to.");
      return;
    }
    if (!form.origin_address.trim() || !form.destination_address.trim()) {
      setError("Both the pick-up and drop-off addresses are needed.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await getSupabase().from("hericilla_packing_jobs").insert({
      work_order_id: form.work_order_id,
      origin_address: form.origin_address.trim(),
      destination_address: form.destination_address.trim(),
      supervisor_id: form.supervisor_id || null,
      scheduled_at: form.scheduled_at ? new Date(form.scheduled_at + "T08:00:00+01:00").toISOString() : null,
      notes: form.notes || null,
      created_by: profile?.id,
      stage: "packing",
    });
    setBusy(false);
    if (err) {
      setError("Could not save: " + err.message);
      return;
    }
    setCreating(false);
    setForm({ work_order_id: "", scheduled_at: "", origin_address: "", destination_address: "", supervisor_id: "", notes: "" });
    void qc.invalidateQueries({ queryKey: ["packing-jobs"] });
  }

  const active = (jobs ?? []).filter((j) => j.stage !== "completed");
  const done = (jobs ?? []).filter((j) => j.stage === "completed");

  return (
    <div>
      <PageHeader
        title="Packing & Removal"
        purpose="Moving jobs: pack at one place, transport, unpack at the next. Every move is tied to a work order."
        actions={<BigButton onClick={() => setCreating(true)}>+ New packing job</BigButton>}
      />
      <HintCard
        steps={[
          "Create the job with the pick-up and drop-off addresses.",
          "Open the job to add its item list, team and vehicles.",
          "Update the stage as the move progresses — the work order follows automatically.",
        ]}
      />

      {isPending ? (
        <div className="mt-6 space-y-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : (jobs ?? []).length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No packing jobs yet"
            teach="When a client asks you to move an office or a house, press “+ New packing job” and pick its work order."
          />
        </div>
      ) : (
        <>
          <section className="mt-6 space-y-3">
            <h2 className="text-xl font-bold text-brand-950">Ongoing ({active.length})</h2>
            {active.length === 0 && <p className="text-lg text-ink-soft">Nothing in progress right now.</p>}
            {active.map((j) => (
              <RowCard
                key={j.id}
                title={`${j.ref_no} — ${j.origin_address} → ${j.destination_address}`}
                subtitle={`${j.wo_number}${j.scheduled_at ? ` · planned ${new Date(j.scheduled_at).toLocaleDateString()}` : ""}`}
                badge={<StatusBadge status={j.stage} />}
                onClick={() => router.push(`/packing/${j.id}`)}
              />
            ))}
          </section>
          {done.length > 0 && (
            <section className="mt-10 space-y-3">
              <h2 className="text-xl font-bold text-brand-950">Completed ({done.length})</h2>
              {done.map((j) => (
                <RowCard
                  key={j.id}
                  title={`${j.ref_no} — ${j.origin_address} → ${j.destination_address}`}
                  subtitle={j.wo_number}
                  badge={<StatusBadge status={j.stage} />}
                  onClick={() => router.push(`/packing/${j.id}`)}
                />
              ))}
            </section>
          )}
        </>
      )}

      <Modal open={creating} title="New packing job" onClose={() => setCreating(false)} wide>
        <Wizard
          submitLabel="Create job"
          submitting={busy}
          onSubmit={() => void createJob()}
          steps={[
            {
              title: "Which work order",
              valid: !!form.work_order_id,
              content: (
                <div className="space-y-5">
                  <BigSelect
                    label="Work order this move belongs to"
                    required
                    value={form.work_order_id}
                    onChange={(e) => setForm({ ...form, work_order_id: e.target.value })}
                    options={(openWos ?? []).map((w) => ({
                      value: w.id,
                      label: `${w.wo_number} — ${w.client_name || "no client"} (${w.service_type.replace(/_/g, " ")})`,
                    }))}
                  />
                  {(openWos ?? []).length === 0 && (
                    <p className="text-lg text-warning-800">No open work orders yet. Approve a quotation on the Jobs page first.</p>
                  )}
                  <BigInput
                    label="Planned moving date (optional)"
                    type="date"
                    value={form.scheduled_at}
                    onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })}
                  />
                </div>
              ),
            },
            {
              title: "From and to",
              valid: form.origin_address.trim() !== "" && form.destination_address.trim() !== "",
              content: (
                <div className="space-y-5">
                  <BigTextarea
                    label="Pick-up address (where we pack)"
                    required
                    value={form.origin_address}
                    onChange={(e) => setForm({ ...form, origin_address: e.target.value })}
                  />
                  <BigTextarea
                    label="Drop-off address (where we unpack)"
                    required
                    value={form.destination_address}
                    onChange={(e) => setForm({ ...form, destination_address: e.target.value })}
                  />
                </div>
              ),
            },
            {
              title: "People & notes",
              content: (
                <div className="space-y-5">
                  <BigSelect
                    label="Supervisor for this move (optional)"
                    value={form.supervisor_id}
                    onChange={(e) => setForm({ ...form, supervisor_id: e.target.value })}
                    options={[{ value: "", label: "Nobody yet" }, ...(people ?? []).map((p) => ({ value: p.id, label: p.full_name }))]}
                  />
                  <BigTextarea
                    label="Notes (special items, access issues…)"
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  />
                  {error && <p className="text-lg text-danger-800">{error}</p>}
                </div>
              ),
            },
          ]}
        />
      </Modal>
    </div>
  );
}
