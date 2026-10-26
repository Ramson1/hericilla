"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BigButton,
  BigInput,
  BigSelect,
  Card,
  EmptyState,
  Modal,
  RowCard,
  Skeleton,
} from "@hericilla/ui";
import { getSupabase } from "@hericilla/supabase-clients";
import { statusLabel } from "@hericilla/types";
import { useAuth } from "@/lib/auth";
import { money } from "@/lib/data";
import { daysUntil, pick, type MaintRecordRow, type ScheduleRow, type VehicleRow } from "./types";

export function MaintenancePanel({ vehicles }: { vehicles: VehicleRow[] }) {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const [schedOpen, setSchedOpen] = useState(false);
  const [recOpen, setRecOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sched, setSched] = useState({ vehicle_id: "", service_type: "", every_km: "", every_days: "", next_due_date: "", next_due_km: "" });
  const [rec, setRec] = useState({ vehicle_id: "", service_type: "", cost: "", odometer_km: "", done_at: new Date().toISOString().slice(0, 10), vendor: "", notes: "" });

  const { data: schedules, isPending } = useQuery({
    queryKey: ["fleet", "maintenance-schedules"],
    queryFn: async () => {
      const { data } = await getSupabase()
        .from("hericilla_maintenance_schedules")
        .select("*, vehicles:hericilla_vehicles(reg_no)")
        .eq("is_active", true)
        .order("next_due_date");
      return ((data as ScheduleRow[]) ?? []).map((r) => ({
        ...r,
        reg_no: pick<{ reg_no: string }>((r as unknown as Record<string, unknown>).vehicles)?.reg_no,
      }));
    },
  });

  const { data: records } = useQuery({
    queryKey: ["fleet", "maintenance-records"],
    queryFn: async () => {
      const { data } = await getSupabase()
        .from("hericilla_maintenance_records")
        .select("*, vehicles:hericilla_vehicles(reg_no)")
        .order("done_at", { ascending: false })
        .limit(100);
      return ((data as MaintRecordRow[]) ?? []).map((r) => ({
        ...r,
        reg_no: pick<{ reg_no: string }>((r as unknown as Record<string, unknown>).vehicles)?.reg_no,
      }));
    },
  });

  async function addSchedule() {
    if (!sched.vehicle_id || !sched.service_type.trim()) {
      setError("A schedule needs a vehicle and the service name (e.g. oil change).");
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await getSupabase().from("hericilla_maintenance_schedules").insert({
      vehicle_id: sched.vehicle_id,
      service_type: sched.service_type.trim(),
      every_km: Number(sched.every_km) || null,
      every_days: Number(sched.every_days) || null,
      next_due_date: sched.next_due_date || null,
      next_due_km: Number(sched.next_due_km) || null,
    });
    setBusy(false);
    if (err) {
      setError("Could not save: " + err.message);
      return;
    }
    setSchedOpen(false);
    setSched({ vehicle_id: "", service_type: "", every_km: "", every_days: "", next_due_date: "", next_due_km: "" });
    void qc.invalidateQueries({ queryKey: ["fleet", "maintenance-schedules"] });
  }

  async function addRecord() {
    if (!rec.vehicle_id || !rec.service_type.trim()) {
      setError("Tell us which vehicle and what was serviced.");
      return;
    }
    setBusy(true);
    setError(null);
    const sb = getSupabase();
    const { error: err } = await sb.from("hericilla_maintenance_records").insert({
      vehicle_id: rec.vehicle_id,
      service_type: rec.service_type.trim(),
      cost: Number(rec.cost) || 0,
      odometer_km: Number(rec.odometer_km) || null,
      done_at: rec.done_at,
      vendor: rec.vendor.trim() || null,
      notes: rec.notes.trim() || null,
      recorded_by: profile?.id,
    });
    if (err) {
      setBusy(false);
      setError("Could not save: " + err.message);
      return;
    }
    // Service done → odometer forward, vehicle back in service if it was at the workshop.
    const km = Number(rec.odometer_km);
    const veh = vehicles.find((v) => v.id === rec.vehicle_id);
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (km > 0 && veh && km > Number(veh.odometer_km ?? 0)) patch.odometer_km = km;
    if (veh?.status === "maintenance") patch.status = "available";
    await sb.from("hericilla_vehicles").update(patch).eq("id", rec.vehicle_id);
    setBusy(false);
    setRecOpen(false);
    setRec({ ...rec, vehicle_id: "", service_type: "", cost: "", odometer_km: "", vendor: "", notes: "" });
    void qc.invalidateQueries({ queryKey: ["fleet", "maintenance-records"] });
    void qc.invalidateQueries({ queryKey: ["fleet"] });
  }

  const vehicleOpts = [
    { value: "", label: "Choose a vehicle…" },
    ...vehicles.filter((v) => v.status !== "retired").map((v) => ({ value: v.id, label: `${v.reg_no} · ${statusLabel(v.vehicle_type)}` })),
  ];

  const totalSpend = (records ?? []).reduce((s, r) => s + Number(r.cost), 0);

  return (
    <div className="mt-6">
      <div className="flex gap-3 justify-end flex-wrap">
        <BigButton variant="secondary" onClick={() => { setError(null); setRecOpen(true); }}>+ Record service done</BigButton>
        <BigButton onClick={() => { setError(null); setSchedOpen(true); }}>+ New schedule</BigButton>
      </div>

      {isPending ? (
        <div className="mt-4 space-y-3"><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
      ) : (
        <div className="mt-4 space-y-8">
          <section>
            <h2 className="text-xl font-bold text-brand-950">Service schedules ({schedules?.length ?? 0})</h2>
            {(schedules ?? []).length === 0 ? (
              <EmptyState title="No schedules yet" teach="Press “+ New schedule” to set when each truck needs oil changes, tyres or inspection." />
            ) : (
              <div className="mt-3 space-y-3">
                {(schedules ?? []).map((s) => {
                  const dueDays = daysUntil(s.next_due_date);
                  const veh = vehicles.find((v) => v.id === s.vehicle_id);
                  const dueKm = s.next_due_km != null && Number(veh?.odometer_km ?? 0) >= Number(s.next_due_km);
                  const dueNow = (dueDays !== null && dueDays <= 0) || dueKm;
                  return (
                    <RowCard
                      key={s.id}
                      title={`${s.reg_no ?? "Vehicle"} — ${s.service_type}`}
                      subtitle={
                        <>
                          <span className="block">
                            {s.every_km ? `Every ${Number(s.every_km).toLocaleString()} km · ` : ""}
                            {s.every_days ? `Every ${s.every_days} days · ` : ""}
                            {s.next_due_date ? `Next due ${s.next_due_date}` : s.next_due_km ? `Next due at ${Number(s.next_due_km).toLocaleString()} km` : "No due set"}
                          </span>
                          {s.last_done_at && <span className="block">Last done {s.last_done_at}{s.last_done_km ? ` at ${Number(s.last_done_km).toLocaleString()} km` : ""}</span>}
                        </>
                      }
                      actions={dueNow ? <span className="px-3 py-1 rounded-full bg-danger-100 text-danger-800 text-base font-semibold">Due now</span> : undefined}
                    />
                  );
                })}
              </div>
            )}
          </section>

          <section>
            <div className="flex items-baseline gap-3">
              <h2 className="text-xl font-bold text-brand-950">Workshop history ({records?.length ?? 0})</h2>
              <span className="text-base text-ink-soft">Total spent: {money(totalSpend)}</span>
            </div>
            {(records ?? []).length === 0 ? (
              <EmptyState title="No maintenance recorded yet" teach="When a vehicle comes back from the workshop, press “+ Record service done”." />
            ) : (
              <div className="mt-3 space-y-3">
                {(records ?? []).map((r) => (
                  <RowCard
                    key={r.id}
                    title={`${r.reg_no ?? "Vehicle"} — ${r.service_type}`}
                    subtitle={`${new Date(r.done_at).toLocaleDateString()} · ${money(r.cost)}${r.vendor ? ` · ${r.vendor}` : ""}${r.odometer_km ? ` · at ${Number(r.odometer_km).toLocaleString()} km` : ""}`}
                  />
                ))}
              </div>
            )}
          </section>

          <Card>
            <p className="text-base text-ink-soft">
              Tip: set a vehicle’s status to “At maintenance” in the Register while it is in the workshop — recording the
              finished service brings it back to “Available” automatically.
            </p>
          </Card>
        </div>
      )}

      <Modal open={schedOpen} title="New service schedule" onClose={() => setSchedOpen(false)} wide>
        <div className="space-y-5">
          <BigSelect label="Which vehicle?" required value={sched.vehicle_id} onChange={(e) => setSched({ ...sched, vehicle_id: e.target.value })} options={vehicleOpts} />
          <div className="grid gap-5 sm:grid-cols-2">
            <BigInput label="Service needed" required value={sched.service_type} onChange={(e) => setSched({ ...sched, service_type: e.target.value })} hint="e.g. oil change, tyres, periodic inspection" />
            <BigInput label="Next due date (optional)" type="date" value={sched.next_due_date} onChange={(e) => setSched({ ...sched, next_due_date: e.target.value })} />
          </div>
          <div className="grid gap-5 sm:grid-cols-3">
            <BigInput label="Repeat every (km)" type="number" value={sched.every_km} onChange={(e) => setSched({ ...sched, every_km: e.target.value })} />
            <BigInput label="Repeat every (days)" type="number" value={sched.every_days} onChange={(e) => setSched({ ...sched, every_days: e.target.value })} />
            <BigInput label="Next due at (km)" type="number" value={sched.next_due_km} onChange={(e) => setSched({ ...sched, next_due_km: e.target.value })} />
          </div>
          {error && <p className="text-base text-danger-800">{error}</p>}
          <div className="flex justify-end gap-3">
            <BigButton variant="secondary" onClick={() => setSchedOpen(false)}>Cancel</BigButton>
            <BigButton variant="success" disabled={busy} onClick={() => void addSchedule()}>{busy ? "Saving…" : "Save schedule"}</BigButton>
          </div>
        </div>
      </Modal>

      <Modal open={recOpen} title="Record finished service" onClose={() => setRecOpen(false)} wide>
        <div className="space-y-5">
          <BigSelect label="Which vehicle?" required value={rec.vehicle_id} onChange={(e) => setRec({ ...rec, vehicle_id: e.target.value })} options={vehicleOpts} />
          <div className="grid gap-5 sm:grid-cols-2">
            <BigInput label="What was serviced?" required value={rec.service_type} onChange={(e) => setRec({ ...rec, service_type: e.target.value })} />
            <BigInput label="Date finished" type="date" value={rec.done_at} onChange={(e) => setRec({ ...rec, done_at: e.target.value })} />
          </div>
          <div className="grid gap-5 sm:grid-cols-3">
            <BigInput label="Cost (₦)" type="number" value={rec.cost} onChange={(e) => setRec({ ...rec, cost: e.target.value })} />
            <BigInput label="Odometer (km)" type="number" value={rec.odometer_km} onChange={(e) => setRec({ ...rec, odometer_km: e.target.value })} />
            <BigInput label="Workshop / vendor" value={rec.vendor} onChange={(e) => setRec({ ...rec, vendor: e.target.value })} />
          </div>
          <BigInput label="Notes (optional)" value={rec.notes} onChange={(e) => setRec({ ...rec, notes: e.target.value })} />
          {error && <p className="text-base text-danger-800">{error}</p>}
          <div className="flex justify-end gap-3">
            <BigButton variant="secondary" onClick={() => setRecOpen(false)}>Cancel</BigButton>
            <BigButton variant="success" disabled={busy} onClick={() => void addRecord()}>{busy ? "Saving…" : "Save record"}</BigButton>
          </div>
        </div>
      </Modal>
    </div>
  );
}
