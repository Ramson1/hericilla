"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  BigButton,
  BigInput,
  BigSelect,
  BigTextarea,
  Card,
  ConfirmDialog,
  EmptyState,
  Modal,
  RowCard,
  StatusBadge,
} from "@hericilla/ui";
import { getSupabase } from "@hericilla/supabase-clients";
import { VEHICLE_STATUSES, VEHICLE_TYPES, statusLabel } from "@hericilla/types";
import { daysUntil, type VehicleRow } from "./types";

const BLANK = {
  reg_no: "",
  make: "",
  model: "",
  year: "",
  vehicle_type: "truck",
  capacity: "",
  status: "available",
  odometer_km: "0",
  insurance_expiry: "",
  inspection_expiry: "",
  notes: "",
};
type Form = typeof BLANK;

function toForm(v: VehicleRow): Form {
  return {
    reg_no: v.reg_no,
    make: v.make ?? "",
    model: v.model ?? "",
    year: v.year ? String(v.year) : "",
    vehicle_type: v.vehicle_type,
    capacity: v.capacity ?? "",
    status: v.status,
    odometer_km: String(v.odometer_km ?? 0),
    insurance_expiry: v.insurance_expiry ?? "",
    inspection_expiry: v.inspection_expiry ?? "",
    notes: v.notes ?? "",
  };
}

export function RegisterPanel({ vehicles }: { vehicles: VehicleRow[] }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<VehicleRow | null>(null);
  const [form, setForm] = useState<Form>(BLANK);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retiring, setRetiring] = useState<VehicleRow | null>(null);

  function startAdd() {
    setEditing(null);
    setForm(BLANK);
    setError(null);
    setOpen(true);
  }
  function startEdit(v: VehicleRow) {
    setEditing(v);
    setForm(toForm(v));
    setError(null);
    setOpen(true);
  }

  async function save() {
    if (!form.reg_no.trim()) {
      setError("Every vehicle needs its number plate.");
      return;
    }
    setBusy(true);
    setError(null);
    const payload = {
      reg_no: form.reg_no.trim().toUpperCase(),
      make: form.make.trim() || null,
      model: form.model.trim() || null,
      year: Number(form.year) || null,
      vehicle_type: form.vehicle_type,
      capacity: form.capacity.trim() || null,
      status: form.status,
      odometer_km: Number(form.odometer_km) || 0,
      insurance_expiry: form.insurance_expiry || null,
      inspection_expiry: form.inspection_expiry || null,
      notes: form.notes.trim() || null,
      updated_at: new Date().toISOString(),
    };
    const sb = getSupabase();
    const { error: err } = editing
      ? await sb.from("vehicles").update(payload).eq("id", editing.id)
      : await sb.from("vehicles").insert(payload);
    setBusy(false);
    if (err) {
      setError(
        err.message.toLowerCase().includes("duplicate")
          ? `That number plate (${payload.reg_no}) is already in the register.`
          : "Could not save: " + err.message,
      );
      return;
    }
    setOpen(false);
    void qc.invalidateQueries({ queryKey: ["fleet"] });
  }

  async function retire() {
    if (!retiring) return;
    const { error: err } = await getSupabase()
      .from("vehicles")
      .update({ status: "retired", updated_at: new Date().toISOString() })
      .eq("id", retiring.id);
    if (err) setError("Could not retire: " + err.message);
    setRetiring(null);
    void qc.invalidateQueries({ queryKey: ["fleet"] });
  }

  const soon = (d: string | null) => {
    const n = daysUntil(d);
    return n !== null && n <= 60;
  };

  return (
    <div className="mt-6">
      <div className="flex justify-end">
        <BigButton onClick={startAdd}>+ Add vehicle</BigButton>
      </div>
      {vehicles.length === 0 ? (
        <div className="mt-4">
          <EmptyState title="The register is empty" teach="Press “+ Add vehicle” to record the first truck, crane or van." />
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {vehicles.map((v) => (
            <RowCard
              key={v.id}
              title={`${v.reg_no} — ${[v.make, v.model].filter(Boolean).join(" ") || statusLabel(v.vehicle_type)}`}
              subtitle={
                <>
                  <span className="block">
                    {statusLabel(v.vehicle_type)}
                    {v.capacity ? ` · carries ${v.capacity}` : ""}
                    {v.year ? ` · ${v.year}` : ""} · {Number(v.odometer_km ?? 0).toLocaleString()} km
                  </span>
                  {(soon(v.insurance_expiry) || soon(v.inspection_expiry)) && (
                    <span className="block font-semibold text-danger-800">
                      {soon(v.insurance_expiry) ? `Insurance ${v.insurance_expiry && daysUntil(v.insurance_expiry)! < 0 ? "EXPIRED" : "due " + v.insurance_expiry} · ` : ""}
                      {soon(v.inspection_expiry) ? `Inspection ${v.inspection_expiry && daysUntil(v.inspection_expiry)! < 0 ? "EXPIRED" : "due " + v.inspection_expiry}` : ""}
                    </span>
                  )}
                </>
              }
              badge={<StatusBadge status={v.status} />}
              actions={
                <>
                  <BigButton size="md" variant="secondary" onClick={() => startEdit(v)}>Edit</BigButton>
                  {v.status !== "retired" && (
                    <BigButton size="md" variant="danger" onClick={() => setRetiring(v)}>Retire</BigButton>
                  )}
                </>
              }
            />
          ))}
        </div>
      )}

      <Modal open={open} title={editing ? `Edit ${editing.reg_no}` : "Add a vehicle"} onClose={() => setOpen(false)} wide>
        <div className="space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <BigInput label="Number plate" required value={form.reg_no} onChange={(e) => setForm({ ...form, reg_no: e.target.value })} hint="e.g. PH-123-AB" />
            <BigSelect label="Status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} options={VEHICLE_STATUSES.map((s) => ({ value: s, label: statusLabel(s) }))} />
          </div>
          <div className="grid gap-5 sm:grid-cols-3">
            <BigInput label="Make" value={form.make} onChange={(e) => setForm({ ...form, make: e.target.value })} hint="e.g. Toyota, Sinotruk" />
            <BigInput label="Model" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
            <BigInput label="Year" type="number" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} />
          </div>
          <div className="grid gap-5 sm:grid-cols-3">
            <BigSelect label="Vehicle type" value={form.vehicle_type} onChange={(e) => setForm({ ...form, vehicle_type: e.target.value })} options={VEHICLE_TYPES.map((t) => ({ value: t, label: statusLabel(t) }))} />
            <BigInput label="Capacity" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} hint="e.g. 20 tons / 40ft flatbed" />
            <BigInput label="Odometer (km)" type="number" value={form.odometer_km} onChange={(e) => setForm({ ...form, odometer_km: e.target.value })} />
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <BigInput label="Insurance expires" type="date" value={form.insurance_expiry} onChange={(e) => setForm({ ...form, insurance_expiry: e.target.value })} />
            <BigInput label="Inspection expires" type="date" value={form.inspection_expiry} onChange={(e) => setForm({ ...form, inspection_expiry: e.target.value })} />
          </div>
          <BigTextarea label="Notes (optional)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          {error && <p className="text-lg text-danger-800">{error}</p>}
          <div className="flex justify-end gap-3">
            <BigButton variant="secondary" onClick={() => setOpen(false)}>Cancel</BigButton>
            <BigButton variant="success" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : editing ? "Save changes" : "Add vehicle"}</BigButton>
          </div>
          <Card>
            <p className="text-base text-ink-soft">
              Insurance and inspection dates drive the red warnings on the Status board and the expiry reminders.
            </p>
          </Card>
        </div>
      </Modal>

      <ConfirmDialog
        open={retiring !== null}
        title={`Retire ${retiring?.reg_no ?? ""}?`}
        message="A retired vehicle leaves the status board and cannot be allocated again. This keeps the history but takes it out of service."
        confirmWord="RETIRE"
        danger
        onCancel={() => setRetiring(null)}
        onConfirm={() => void retire()}
      />
    </div>
  );
}
