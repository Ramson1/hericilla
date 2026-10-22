"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BigButton,
  BigInput,
  BigSelect,
  EmptyState,
  Modal,
  RowCard,
  Skeleton,
  StatusBadge,
} from "@hericilla/ui";
import { getSupabase } from "@hericilla/supabase-clients";
import { MOVEMENT_TYPES, statusLabel } from "@hericilla/types";
import { useAuth } from "@/lib/auth";
import { fmtDateTime, pick, type MovementRow, type VehicleRow } from "./types";

export function MovementsPanel({ vehicles }: { vehicles: VehicleRow[] }) {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    vehicle_id: "",
    movement_type: "out_gate",
    odometer_km: "",
    location_note: "",
    occurred_at: (() => {
      const d = new Date();
      d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
      return d.toISOString().slice(0, 16);
    })(),
  });

  const { data: movements, isPending } = useQuery({
    queryKey: ["fleet", "movements"],
    queryFn: async () => {
      const { data } = await getSupabase()
        .from("vehicle_movements")
        .select("*, vehicles(reg_no), profiles(full_name)")
        .order("occurred_at", { ascending: false })
        .limit(200);
      return ((data as MovementRow[]) ?? []).map((r) => {
        const raw = r as unknown as Record<string, unknown>;
        return {
          ...r,
          reg_no: pick<{ reg_no: string }>(raw.vehicles)?.reg_no,
          recorder_name: pick<{ full_name: string }>(raw.profiles)?.full_name,
        };
      });
    },
  });

  async function log() {
    if (!form.vehicle_id) {
      setError("Choose which vehicle this is about.");
      return;
    }
    setBusy(true);
    setError(null);
    const sb = getSupabase();
    const { error: err } = await sb.from("vehicle_movements").insert({
      vehicle_id: form.vehicle_id,
      movement_type: form.movement_type,
      odometer_km: Number(form.odometer_km) || null,
      location_note: form.location_note.trim() || null,
      recorded_by: profile?.id,
      occurred_at: new Date(form.occurred_at).toISOString(),
    });
    if (err) {
      setBusy(false);
      setError("Could not save: " + err.message);
      return;
    }
    // Keep the register odometer in step with gate readings (never backwards).
    const km = Number(form.odometer_km);
    const veh = vehicles.find((v) => v.id === form.vehicle_id);
    if (km > 0 && veh && km > Number(veh.odometer_km ?? 0)) {
      await sb.from("vehicles").update({ odometer_km: km, updated_at: new Date().toISOString() }).eq("id", veh.id);
    }
    setBusy(false);
    setOpen(false);
    setForm({ ...form, vehicle_id: "", odometer_km: "", location_note: "" });
    void qc.invalidateQueries({ queryKey: ["fleet"] });
  }

  return (
    <div className="mt-6">
      <div className="flex justify-end">
        <BigButton onClick={() => { setError(null); setOpen(true); }}>+ Log movement</BigButton>
      </div>

      {isPending ? (
        <div className="mt-4 space-y-3"><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
      ) : (movements ?? []).length === 0 ? (
        <div className="mt-4">
          <EmptyState
            title="No gate movements recorded yet"
            teach="Every time a vehicle leaves or enters the yard, stops for fuel or works at a site — record it here so the board stays true."
          />
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {(movements ?? []).map((m) => (
            <RowCard
              key={m.id}
              title={`${m.reg_no ?? "Vehicle"} — ${statusLabel(m.movement_type)}`}
              subtitle={
                <>
                  <span className="block">
                    {fmtDateTime(m.occurred_at)}
                    {m.odometer_km ? ` · ${Number(m.odometer_km).toLocaleString()} km` : ""}
                    {m.location_note ? ` · ${m.location_note}` : ""}
                  </span>
                  <span className="block">Recorded by {m.recorder_name ?? "someone"}</span>
                </>
              }
              badge={<StatusBadge status={m.movement_type} />}
            />
          ))}
        </div>
      )}

      <Modal open={open} title="Log a vehicle movement" onClose={() => setOpen(false)} wide>
        <div className="space-y-5">
          <BigSelect
            label="Which vehicle?"
            required
            value={form.vehicle_id}
            onChange={(e) => setForm({ ...form, vehicle_id: e.target.value })}
            options={[
              { value: "", label: "Choose a vehicle…" },
              ...vehicles.filter((v) => v.status !== "retired").map((v) => ({ value: v.id, label: `${v.reg_no} · ${statusLabel(v.vehicle_type)}` })),
            ]}
          />
          <div className="grid gap-5 sm:grid-cols-2">
            <BigSelect
              label="What happened?"
              value={form.movement_type}
              onChange={(e) => setForm({ ...form, movement_type: e.target.value })}
              options={MOVEMENT_TYPES.map((t) => ({ value: t, label: statusLabel(t) }))}
            />
            <BigInput label="When" type="datetime-local" value={form.occurred_at} onChange={(e) => setForm({ ...form, occurred_at: e.target.value })} />
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <BigInput label="Odometer (km) — optional" type="number" value={form.odometer_km} onChange={(e) => setForm({ ...form, odometer_km: e.target.value })} />
            <BigInput label="Where (note)" value={form.location_note} onChange={(e) => setForm({ ...form, location_note: e.target.value })} hint="e.g. Abuloma yard, Trans-Amadi, fuel stop at Eagles Mall" />
          </div>
          {error && <p className="text-lg text-danger-800">{error}</p>}
          <div className="flex justify-end gap-3">
            <BigButton variant="secondary" onClick={() => setOpen(false)}>Cancel</BigButton>
            <BigButton variant="success" disabled={busy} onClick={() => void log()}>{busy ? "Saving…" : "Save movement"}</BigButton>
          </div>
        </div>
      </Modal>
    </div>
  );
}
