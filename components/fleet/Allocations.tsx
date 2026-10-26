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
} from "@hericilla/ui";
import { getSupabase } from "@hericilla/supabase-clients";
import { statusLabel } from "@hericilla/types";
import { useAuth } from "@/lib/auth";
import { fmtDateTime, pick, type AllocationRow, type Mini, type SiteMini, type VehicleRow, type WoMini } from "./types";

function nowLocalInput(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export function AllocationsPanel({
  vehicles,
  drivers,
  workOrders,
  sites,
}: {
  vehicles: VehicleRow[];
  drivers: Mini[];
  workOrders: WoMini[];
  sites: SiteMini[];
}) {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    vehicle_id: "",
    driver_id: "",
    work_order_id: "",
    site_id: "",
    valid_from: nowLocalInput(),
    valid_to: "",
    notes: "",
  });

  const { data: allocations, isPending } = useQuery({
    queryKey: ["fleet", "allocations"],
    queryFn: async () => {
      const { data } = await getSupabase()
        .from("hericilla_vehicle_allocations")
        .select("*, vehicles:hericilla_vehicles(reg_no), driver:hericilla_profiles!vehicle_allocations_driver_id_fkey(full_name), work_orders:hericilla_work_orders(wo_number), sites:hericilla_sites(name)")
        .order("valid_from", { ascending: false })
        .limit(200);
      return ((data as AllocationRow[]) ?? []).map((r) => {
        const raw = r as unknown as Record<string, unknown>;
        return {
          ...r,
          reg_no: pick<{ reg_no: string }>(raw.vehicles)?.reg_no,
          driver_name: pick<{ full_name: string }>(raw.driver)?.full_name,
          wo_number: pick<{ wo_number: string }>(raw.work_orders)?.wo_number,
          site_name: pick<{ name: string }>(raw.sites)?.name,
        };
      });
    },
  });

  async function create() {
    if (!form.vehicle_id) {
      setError("Choose which vehicle is going out.");
      return;
    }
    if (!form.driver_id) {
      setError("Choose the driver who will take it.");
      return;
    }
    setBusy(true);
    setError(null);
    const sb = getSupabase();
    const { error: err } = await sb.from("hericilla_vehicle_allocations").insert({
      vehicle_id: form.vehicle_id,
      driver_id: form.driver_id,
      work_order_id: form.work_order_id || null,
      site_id: form.site_id || null,
      valid_from: new Date(form.valid_from).toISOString(),
      valid_to: form.valid_to ? new Date(form.valid_to).toISOString() : null,
      notes: form.notes.trim() || null,
      created_by: profile?.id,
    });
    if (err) {
      setBusy(false);
      setError(
        err.message.includes("already allocated")
          ? "That vehicle is already out on another allocation for these dates. Release the current one first, or change the dates."
          : "Could not save: " + err.message,
      );
      return;
    }
    const veh = vehicles.find((v) => v.id === form.vehicle_id);
    if (veh && veh.status === "available") {
      await sb.from("hericilla_vehicles").update({ status: "allocated", updated_at: new Date().toISOString() }).eq("id", veh.id);
    }
    setBusy(false);
    setOpen(false);
    setForm({ ...form, vehicle_id: "", driver_id: "", work_order_id: "", site_id: "", notes: "" });
    void qc.invalidateQueries({ queryKey: ["fleet"] });
  }

  async function release(a: AllocationRow) {
    const sb = getSupabase();
    const { error: err } = await sb
      .from("hericilla_vehicle_allocations")
      .update({ released_at: new Date().toISOString() })
      .eq("id", a.id);
    if (!err) {
      const veh = vehicles.find((v) => v.id === a.vehicle_id);
      if (veh && (veh.status === "allocated" || veh.status === "in_use")) {
        await sb.from("hericilla_vehicles").update({ status: "available", updated_at: new Date().toISOString() }).eq("id", veh.id);
      }
    }
    void qc.invalidateQueries({ queryKey: ["fleet"] });
  }

  const active = (allocations ?? []).filter((a) => !a.released_at);
  const past = (allocations ?? []).filter((a) => a.released_at);

  return (
    <div className="mt-6">
      <div className="flex justify-end">
        <BigButton onClick={() => { setError(null); setOpen(true); }}>+ New allocation</BigButton>
      </div>

      {isPending ? (
        <div className="mt-4 space-y-3"><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
      ) : active.length === 0 && past.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            title="No vehicle has been allocated yet"
            teach="Press “+ New allocation” to give a vehicle to a driver, with or without a work order. The system refuses double-booking."
          />
        </div>
      ) : (
        <>
          <h2 className="mt-4 text-xl font-bold text-brand-950">Out now ({active.length})</h2>
          {active.length === 0 ? (
            <p className="mt-2 text-base text-ink-soft italic">Every vehicle is back in the yard.</p>
          ) : (
            <div className="mt-2 space-y-3">
              {active.map((a) => (
                <RowCard
                  key={a.id}
                  title={`${a.reg_no ?? "Vehicle"} → ${a.driver_name ?? "Driver not named"}`}
                  subtitle={
                    <>
                      <span className="block">
                        {a.wo_number ? `Work order ${a.wo_number}` : "No work order"}
                        {a.site_name ? ` · ${a.site_name}` : ""} · since {fmtDateTime(a.valid_from)}
                        {a.valid_to ? ` · planned back ${fmtDateTime(a.valid_to)}` : ""}
                      </span>
                      {a.notes && <span className="block">{a.notes}</span>}
                    </>
                  }
                  actions={<BigButton size="md" variant="secondary" onClick={() => void release(a)}>Release back to yard</BigButton>}
                />
              ))}
            </div>
          )}

          {past.length > 0 && (
            <>
              <h2 className="mt-8 text-xl font-bold text-brand-950">Finished ({past.length})</h2>
              <div className="mt-2 space-y-3">
                {past.slice(0, 30).map((a) => (
                  <RowCard
                    key={a.id}
                    title={`${a.reg_no ?? "Vehicle"} — ${a.driver_name ?? "driver not named"}`}
                    subtitle={`Back in the yard ${fmtDateTime(a.released_at)} · was out since ${fmtDateTime(a.valid_from)}`}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}

      <Modal open={open} title="Allocate a vehicle" onClose={() => setOpen(false)} wide>
        <div className="space-y-5">
          <BigSelect
            label="Which vehicle?"
            required
            value={form.vehicle_id}
            onChange={(e) => setForm({ ...form, vehicle_id: e.target.value })}
            options={[
              { value: "", label: "Choose a vehicle…" },
              ...vehicles.filter((v) => v.status !== "retired").map((v) => ({ value: v.id, label: `${v.reg_no} · ${statusLabel(v.vehicle_type)} (${statusLabel(v.status)})` })),
            ]}
          />
          <BigSelect
            label="Which driver?"
            required
            value={form.driver_id}
            onChange={(e) => setForm({ ...form, driver_id: e.target.value })}
            options={[{ value: "", label: "Choose a driver…" }, ...drivers.map((d) => ({ value: d.id, label: d.full_name }))]}
          />
          <div className="grid gap-5 sm:grid-cols-2">
            <BigSelect
              label="Work order (optional)"
              value={form.work_order_id}
              onChange={(e) => setForm({ ...form, work_order_id: e.target.value })}
              options={[{ value: "", label: "Not tied to a work order" }, ...workOrders.map((w) => ({ value: w.id, label: w.wo_number }))]}
            />
            <BigSelect
              label="Site (optional)"
              value={form.site_id}
              onChange={(e) => setForm({ ...form, site_id: e.target.value })}
              options={[{ value: "", label: "No specific site" }, ...sites.map((s) => ({ value: s.id, label: s.name }))]}
            />
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <BigInput label="Goes out at" required type="datetime-local" value={form.valid_from} onChange={(e) => setForm({ ...form, valid_from: e.target.value })} />
            <BigInput label="Planned back (optional)" type="datetime-local" value={form.valid_to} onChange={(e) => setForm({ ...form, valid_to: e.target.value })} />
          </div>
          <BigInput label="Notes (optional)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          {error && <p className="text-base text-danger-800">{error}</p>}
          <div className="flex justify-end gap-3">
            <BigButton variant="secondary" onClick={() => setOpen(false)}>Cancel</BigButton>
            <BigButton variant="success" disabled={busy} onClick={() => void create()}>{busy ? "Saving…" : "Allocate vehicle"}</BigButton>
          </div>
        </div>
      </Modal>
    </div>
  );
}
