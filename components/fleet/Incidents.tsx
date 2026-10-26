"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BigButton,
  BigInput,
  BigSelect,
  BigTextarea,
  EmptyState,
  Modal,
  RowCard,
  Skeleton,
  StatusBadge,
} from "@hericilla/ui";
import { getSupabase } from "@hericilla/supabase-clients";
import { INCIDENT_SEVERITIES, INCIDENT_TYPES, statusLabel } from "@hericilla/types";
import { useAuth } from "@/lib/auth";
import { fmtDateTime, pick, type IncidentRow, type VehicleRow } from "./types";

export function IncidentsPanel({ vehicles }: { vehicles: VehicleRow[] }) {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    vehicle_id: "",
    incident_type: "breakdown",
    severity: "moderate",
    description: "",
    location: "",
    occurred_at: (() => {
      const d = new Date();
      d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
      return d.toISOString().slice(0, 16);
    })(),
  });
  const [resolving, setResolving] = useState<IncidentRow | null>(null);
  const [resolution, setResolution] = useState("");

  const { data: incidents, isPending } = useQuery({
    queryKey: ["fleet", "incidents"],
    queryFn: async () => {
      const { data } = await getSupabase()
        .from("hericilla_incidents")
        .select("*, vehicles:hericilla_vehicles(reg_no), reporter:hericilla_profiles!incidents_reported_by_fkey(full_name)")
        .order("occurred_at", { ascending: false })
        .limit(150);
      return ((data as IncidentRow[]) ?? []).map((r) => {
        const raw = r as unknown as Record<string, unknown>;
        return {
          ...r,
          reg_no: pick<{ reg_no: string }>(raw.vehicles)?.reg_no,
          reporter_name: pick<{ full_name: string }>(raw.reporter)?.full_name,
        };
      });
    },
  });

  async function report() {
    if (!form.description.trim()) {
      setError("Please describe what happened.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await getSupabase().from("hericilla_incidents").insert({
      vehicle_id: form.vehicle_id || null,
      incident_type: form.incident_type,
      severity: form.severity,
      description: form.description.trim(),
      location: form.location.trim() || null,
      occurred_at: new Date(form.occurred_at).toISOString(),
      reported_by: profile?.id,
    });
    setBusy(false);
    if (err) {
      setError("Could not save: " + err.message);
      return;
    }
    setOpen(false);
    setForm({ ...form, vehicle_id: "", description: "", location: "" });
    void qc.invalidateQueries({ queryKey: ["fleet", "incidents"] });
  }

  async function setReview(inc: IncidentRow, status: string) {
    if (status === "reviewing") {
      const { error: err } = await getSupabase().from("hericilla_incidents").update({ status: "reviewing" }).eq("id", inc.id);
      if (err) setError("Could not update: " + err.message);
      void qc.invalidateQueries({ queryKey: ["fleet", "incidents"] });
      return;
    }
    setResolving(inc);
    setResolution(inc.resolution_note ?? "");
  }

  async function resolve() {
    if (!resolving) return;
    if (resolution.trim().length < 5) {
      setError("Write a short note about how it was resolved.");
      return;
    }
    const { error: err } = await getSupabase()
      .from("hericilla_incidents")
      .update({ status: "resolved", resolution_note: resolution.trim() })
      .eq("id", resolving.id);
    if (err) {
      setError("Could not save: " + err.message);
      return;
    }
    setResolving(null);
    setError(null);
    void qc.invalidateQueries({ queryKey: ["fleet", "incidents"] });
  }

  const openCount = (incidents ?? []).filter((i) => i.status !== "resolved").length;

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-base text-ink-soft">
          {openCount > 0 ? <span className="font-semibold text-danger-800">{openCount} incident(s) still open.</span> : "All incidents are resolved."}
        </p>
        <BigButton onClick={() => { setError(null); setOpen(true); }}>+ Report incident</BigButton>
      </div>

      {isPending ? (
        <div className="mt-4 space-y-3"><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
      ) : (incidents ?? []).length === 0 ? (
        <div className="mt-4">
          <EmptyState
            title="No incidents recorded"
            teach="Accidents, breakdowns, near-misses and safety issues — report them here or from the driver app. Every report is tracked until resolved."
          />
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {(incidents ?? []).map((i) => (
            <RowCard
              key={i.id}
              title={`${statusLabel(i.incident_type)} — ${i.reg_no ?? "no vehicle named"} (${statusLabel(i.severity)})`}
              subtitle={
                <>
                  <span className="block">{i.description}</span>
                  <span className="block">
                    {fmtDateTime(i.occurred_at)}{i.location ? ` · ${i.location}` : ""} · reported by {i.reporter_name ?? "someone"}
                  </span>
                  {i.resolution_note && <span className="block font-semibold text-success-800">Resolution: {i.resolution_note}</span>}
                </>
              }
              badge={<StatusBadge status={i.status} />}
              actions={
                i.status === "open" ? (
                  <BigButton size="md" variant="secondary" onClick={() => void setReview(i, "reviewing")}>Start review</BigButton>
                ) : i.status === "reviewing" ? (
                  <BigButton size="md" variant="success" onClick={() => void setReview(i, "resolved")}>Resolve</BigButton>
                ) : undefined
              }
            />
          ))}
        </div>
      )}

      <Modal open={open} title="Report an incident" onClose={() => setOpen(false)} wide>
        <div className="space-y-5">
          <div className="grid gap-5 sm:grid-cols-3">
            <BigSelect
              label="Vehicle (optional)"
              value={form.vehicle_id}
              onChange={(e) => setForm({ ...form, vehicle_id: e.target.value })}
              options={[
                { value: "", label: "No vehicle / not sure" },
                ...vehicles.filter((v) => v.status !== "retired").map((v) => ({ value: v.id, label: `${v.reg_no} · ${statusLabel(v.vehicle_type)}` })),
              ]}
            />
            <BigSelect label="What kind?" value={form.incident_type} onChange={(e) => setForm({ ...form, incident_type: e.target.value })} options={INCIDENT_TYPES.map((t) => ({ value: t, label: statusLabel(t) }))} />
            <BigSelect label="How serious?" value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })} options={INCIDENT_SEVERITIES.map((s) => ({ value: s, label: statusLabel(s) }))} />
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <BigInput label="When happened" type="datetime-local" value={form.occurred_at} onChange={(e) => setForm({ ...form, occurred_at: e.target.value })} />
            <BigInput label="Where (optional)" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          </div>
          <BigTextarea label="What happened?" required rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          {error && <p className="text-base text-danger-800">{error}</p>}
          <div className="flex justify-end gap-3">
            <BigButton variant="secondary" onClick={() => setOpen(false)}>Cancel</BigButton>
            <BigButton variant="success" disabled={busy} onClick={() => void report()}>{busy ? "Saving…" : "Report incident"}</BigButton>
          </div>
        </div>
      </Modal>

      <Modal open={resolving !== null} title="Resolve incident" onClose={() => { setResolving(null); setError(null); }}>
        <div className="space-y-5">
          <p className="text-base">Write what was done to close this incident — e.g. vehicle repaired, insurance claim filed, driver counselled.</p>
          <BigTextarea label="Resolution note" required rows={4} value={resolution} onChange={(e) => setResolution(e.target.value)} />
          {error && <p className="text-base text-danger-800">{error}</p>}
          <div className="flex justify-end gap-3">
            <BigButton variant="secondary" onClick={() => setResolving(null)}>Cancel</BigButton>
            <BigButton variant="success" onClick={() => void resolve()}>Mark resolved</BigButton>
          </div>
        </div>
      </Modal>
    </div>
  );
}
