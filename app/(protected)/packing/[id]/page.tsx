"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  PageHeader,
  BigButton,
  BigInput,
  BigSelect,
  Card,
  RowCard,
  StatusBadge,
  Modal,
  Skeleton,
  ConfirmDialog,
} from "@hericilla/ui";
import { getSupabase } from "@hericilla/supabase-clients";
import { PACKING_JOB_STAGES, statusLabel } from "@hericilla/types";

type PackingJob = {
  id: string;
  ref_no: string;
  origin_address: string;
  destination_address: string;
  stage: string;
  scheduled_at: string | null;
  notes: string | null;
  supervisor_id: string | null;
  work_order_id: string;
};
type TeamRow = { packing_job_id: string; profile_id: string; role_in_job: string; full_name?: string };
type VehicleRow = { id: string; equipment: string | null };
type ItemRow = { id: string; box_no: string | null; description: string; quantity: number; condition: string };
type HandoverRow = { id: string; handed_over_at: string; handed_by: string | null; received_by: string | null; item_summary: string | null; notes: string | null };

export default function PackingJobPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();

  const [itemOpen, setItemOpen] = useState(false);
  const [handoverOpen, setHandoverOpen] = useState(false);
  const [deleteItemId, setDeleteItemId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [item, setItem] = useState({ description: "", box_no: "", quantity: "1", condition: "good" });
  const [handover, setHandover] = useState({ handed_by: "", received_by: "", item_summary: "", notes: "" });
  const [equipment, setEquipment] = useState("");

  const { data: job, isPending } = useQuery({
    queryKey: ["packing-job", id],
    queryFn: async () => {
      const { data, error } = await getSupabase().from("hericilla_packing_jobs").select("*").eq("id", id).single();
      if (error) throw error;
      return data as PackingJob;
    },
  });

  const { data: team } = useQuery({
    queryKey: ["packing-team", id],
    queryFn: async () => {
      const { data } = await getSupabase().from("hericilla_packing_job_teams").select("*").eq("packing_job_id", id);
      const rows = (data as TeamRow[]) ?? [];
      const people = await getSupabase().from("hericilla_profiles").select("id, full_name").in("id", rows.length ? rows.map((r) => r.profile_id) : ["00000000-0000-0000-0000-000000000000"]);
      const names = new Map(((people.data as { id: string; full_name: string }[]) ?? []).map((p) => [p.id, p.full_name]));
      return rows.map((r) => ({ ...r, full_name: names.get(r.profile_id) ?? "Someone" }));
    },
  });

  const { data: vehicles } = useQuery({
    queryKey: ["packing-vehicles", id],
    queryFn: async () => {
      const { data } = await getSupabase().from("hericilla_packing_job_vehicles").select("id, equipment").eq("packing_job_id", id);
      return (data as VehicleRow[]) ?? [];
    },
  });

  const { data: items } = useQuery({
    queryKey: ["removal-items", id],
    queryFn: async () => {
      const { data } = await getSupabase().from("hericilla_removal_items").select("*").eq("packing_job_id", id).order("box_no", { ascending: true });
      return (data as ItemRow[]) ?? [];
    },
  });

  const { data: handovers } = useQuery({
    queryKey: ["handovers", id],
    queryFn: async () => {
      const { data } = await getSupabase().from("hericilla_handover_records").select("*").eq("packing_job_id", id).order("handed_over_at", { ascending: false });
      return (data as HandoverRow[]) ?? [];
    },
  });

  const { data: people } = useQuery({
    queryKey: ["profiles-mini"],
    queryFn: async () => {
      const { data } = await getSupabase().from("hericilla_profiles").select("id, full_name").eq("status", "active").order("full_name");
      return (data as { id: string; full_name: string }[]) ?? [];
    },
  });

  async function setStage(stage: string) {
    setBusy(true);
    await getSupabase().from("hericilla_packing_jobs").update({ stage }).eq("id", id);
    setBusy(false);
    void qc.invalidateQueries({ queryKey: ["packing-job", id] });
  }

  async function addTeamMember(pid: string) {
    if (!pid) return;
    await getSupabase().from("hericilla_packing_job_teams").insert({ packing_job_id: id, profile_id: pid, role_in_job: "packer" });
    void qc.invalidateQueries({ queryKey: ["packing-team", id] });
  }

  async function removeTeamMember(pid: string) {
    await getSupabase().from("hericilla_packing_job_teams").delete().eq("packing_job_id", id).eq("profile_id", pid);
    void qc.invalidateQueries({ queryKey: ["packing-team", id] });
  }

  async function addEquipment() {
    if (!equipment.trim()) return;
    setBusy(true);
    await getSupabase().from("hericilla_packing_job_vehicles").insert({ packing_job_id: id, vehicle_id: null, equipment: equipment.trim() });
    setEquipment("");
    setBusy(false);
    void qc.invalidateQueries({ queryKey: ["packing-vehicles", id] });
  }

  async function addItem() {
    if (!item.description.trim()) return;
    setBusy(true);
    await getSupabase().from("hericilla_removal_items").insert({
      packing_job_id: id,
      description: item.description.trim(),
      box_no: item.box_no.trim() || null,
      quantity: Number(item.quantity) || 1,
      condition: item.condition,
    });
    setBusy(false);
    setItemOpen(false);
    setItem({ description: "", box_no: "", quantity: "1", condition: "good" });
    void qc.invalidateQueries({ queryKey: ["removal-items", id] });
  }

  async function deleteItem() {
    if (!deleteItemId) return;
    await getSupabase().from("hericilla_removal_items").delete().eq("id", deleteItemId);
    setDeleteItemId(null);
    void qc.invalidateQueries({ queryKey: ["removal-items", id] });
  }

  async function addHandover() {
    setBusy(true);
    await getSupabase().from("hericilla_handover_records").insert({
      packing_job_id: id,
      handed_by: handover.handed_by || null,
      received_by: handover.received_by || null,
      item_summary: handover.item_summary || null,
      notes: handover.notes || null,
    });
    setBusy(false);
    setHandoverOpen(false);
    setHandover({ handed_by: "", received_by: "", item_summary: "", notes: "" });
    void qc.invalidateQueries({ queryKey: ["handovers", id] });
  }

  if (isPending || !job) return <div className="space-y-4"><Skeleton className="h-12 w-72" /><Skeleton className="h-48" /></div>;

  return (
    <div>
      <PageHeader
        title={job.ref_no}
        purpose="This move, step by step: what is packed, who is doing it, and the handover at the other end."
        actions={<BigButton variant="secondary" onClick={() => router.push("/packing")}>← Packing jobs</BigButton>}
      />

      {/* Stage stepper */}
      <Card className="mt-6">
        <div className="flex items-center gap-3 flex-wrap">
          <StatusBadge status={job.stage} />
          <div className="flex-1" />
          {PACKING_JOB_STAGES.map((s) => (
            <BigButton
              key={s}
              size="md"
              variant={job.stage === s ? "primary" : "secondary"}
              disabled={busy || job.stage === s}
              onClick={() => void setStage(s)}
            >
              {statusLabel(s)}
            </BigButton>
          ))}
        </div>
        <dl className="mt-4 grid gap-2 sm:grid-cols-2 text-lg">
          <div><dt className="text-ink-soft">Pack at</dt><dd className="font-semibold">{job.origin_address}</dd></div>
          <div><dt className="text-ink-soft">Unpack at</dt><dd className="font-semibold">{job.destination_address}</dd></div>
          <div><dt className="text-ink-soft">Planned date</dt><dd className="font-semibold">{job.scheduled_at ? new Date(job.scheduled_at).toLocaleDateString() : "Not set"}</dd></div>
          <div>
            <dt className="text-ink-soft">Linked work order</dt>
            <dd>
              <button className="font-semibold text-brand-800 underline" onClick={() => router.push(`/jobs/${job.work_order_id}`)}>Open the job</button>
            </dd>
          </div>
        </dl>
        {job.notes && <p className="mt-3 text-lg rounded-xl bg-surface p-4">{job.notes}</p>}
      </Card>

      {/* Item list */}
      <Card className="mt-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-brand-950">Item list ({(items ?? []).length})</h2>
          <BigButton size="md" onClick={() => setItemOpen(true)}>+ Add item</BigButton>
        </div>
        <div className="mt-3 space-y-2">
          {(items ?? []).length === 0 && <p className="text-lg text-ink-soft">Nothing listed yet. Add every box and piece of equipment so nothing gets lost.</p>}
          {(items ?? []).map((it) => (
            <div key={it.id} className="flex items-center justify-between gap-3 border-b border-[var(--color-line)] last:border-0 py-2">
              <div>
                <p className="text-lg font-semibold">{it.box_no ? `Box ${it.box_no} — ` : ""}{it.description}</p>
                <p className="text-base text-ink-soft">{Number(it.quantity)} pc · {it.condition}</p>
              </div>
              <BigButton size="md" variant="ghost" className="text-danger-800" onClick={() => setDeleteItemId(it.id)}>Remove</BigButton>
            </div>
          ))}
        </div>
      </Card>

      {/* Team */}
      <Card className="mt-6">
        <h2 className="text-xl font-bold text-brand-950">Team on this move</h2>
        <div className="mt-3 space-y-2">
          {(team ?? []).length === 0 && <p className="text-lg text-ink-soft">No one assigned yet.</p>}
          {(team ?? []).map((t) => (
            <div key={t.profile_id} className="flex items-center justify-between gap-3 py-1">
              <p className="text-lg">{t.full_name}</p>
              <BigButton size="md" variant="ghost" className="text-danger-800" onClick={() => void removeTeamMember(t.profile_id)}>Remove</BigButton>
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-3 items-end">
          <BigSelect
            label="Add a worker"
            className="flex-1"
            value=""
            onChange={(e) => { void addTeamMember(e.target.value); e.target.value = ""; }}
            options={[{ value: "", label: "Choose a person…" }, ...(people ?? []).map((p) => ({ value: p.id, label: p.full_name }))]}
          />
        </div>
      </Card>

      {/* Equipment */}
      <Card className="mt-6">
        <h2 className="text-xl font-bold text-brand-950">Vehicles & equipment</h2>
        <div className="mt-3 space-y-2">
          {(vehicles ?? []).length === 0 && <p className="text-lg text-ink-soft">Nothing booked yet.</p>}
          {(vehicles ?? []).map((v) => (
            <p key={v.id} className="text-lg py-1">{v.equipment ?? "Vehicle"}</p>
          ))}
        </div>
        <div className="mt-3 flex gap-3 items-end">
          <BigInput label="What is needed? (truck, crane, forklift…)" className="flex-1" value={equipment} onChange={(e) => setEquipment(e.target.value)} />
          <BigButton size="md" variant="secondary" disabled={busy} onClick={() => void addEquipment()}>+ Book it</BigButton>
        </div>
      </Card>

      {/* Handovers */}
      <Card className="mt-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-brand-950">Handover records</h2>
          <BigButton size="md" onClick={() => setHandoverOpen(true)}>+ Record handover</BigButton>
        </div>
        <div className="mt-3 space-y-2">
          {(handovers ?? []).length === 0 && <p className="text-lg text-ink-soft">No handover written down yet. Record who gave and who received the items.</p>}
          {(handovers ?? []).map((h) => (
            <div key={h.id} className="border-b border-[var(--color-line)] last:border-0 py-2">
              <p className="text-lg font-semibold">{h.handed_by ?? "?"} → {h.received_by ?? "?"} · {new Date(h.handed_over_at).toLocaleString()}</p>
              {h.item_summary && <p className="text-base text-ink-soft">{h.item_summary}</p>}
            </div>
          ))}
        </div>
      </Card>

      <Modal open={itemOpen} title="Add an item" onClose={() => setItemOpen(false)}>
        <div className="space-y-5">
          <BigInput label="What is it?" required value={item.description} onChange={(e) => setItem({ ...item, description: e.target.value })} />
          <div className="grid gap-5 sm:grid-cols-3">
            <BigInput label="Box no." value={item.box_no} onChange={(e) => setItem({ ...item, box_no: e.target.value })} />
            <BigInput label="Quantity" type="number" value={item.quantity} onChange={(e) => setItem({ ...item, quantity: e.target.value })} />
            <BigSelect label="Condition" value={item.condition} onChange={(e) => setItem({ ...item, condition: e.target.value })} options={["new", "good", "fair", "damaged"].map((c) => ({ value: c, label: c }))} />
          </div>
          <div className="flex justify-end gap-3">
            <BigButton variant="secondary" onClick={() => setItemOpen(false)}>Cancel</BigButton>
            <BigButton variant="success" disabled={busy} onClick={() => void addItem()}>{busy ? "Saving…" : "Save item"}</BigButton>
          </div>
        </div>
      </Modal>

      <Modal open={handoverOpen} title="Record a handover" onClose={() => setHandoverOpen(false)}>
        <div className="space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <BigInput label="Handed over by (name)" value={handover.handed_by} onChange={(e) => setHandover({ ...handover, handed_by: e.target.value })} />
            <BigInput label="Received by (name)" value={handover.received_by} onChange={(e) => setHandover({ ...handover, received_by: e.target.value })} />
          </div>
          <BigInput label="What was handed over?" value={handover.item_summary} onChange={(e) => setHandover({ ...handover, item_summary: e.target.value })} />
          <BigInput label="Notes (optional)" value={handover.notes} onChange={(e) => setHandover({ ...handover, notes: e.target.value })} />
          <div className="flex justify-end gap-3">
            <BigButton variant="secondary" onClick={() => setHandoverOpen(false)}>Cancel</BigButton>
            <BigButton variant="success" disabled={busy} onClick={() => void addHandover()}>{busy ? "Saving…" : "Save handover"}</BigButton>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteItemId}
        title="Remove this item?"
        message="It will disappear from the packing list. You can add it again if that was a mistake."
        confirmWord="remove"
        danger
        onCancel={() => setDeleteItemId(null)}
        onConfirm={() => void deleteItem()}
      />
    </div>
  );
}
