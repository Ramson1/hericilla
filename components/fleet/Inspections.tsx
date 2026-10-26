"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BigButton,
  BigInput,
  BigSelect,
  BigTextarea,
  Card,
  EmptyState,
  Modal,
  RowCard,
  Skeleton,
} from "@hericilla/ui";
import { getSupabase } from "@hericilla/supabase-clients";
import { fmtDateTime, pick, type ChecklistRow, type InspectionRow } from "./types";

export function InspectionsPanel() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", trip_phase: "pre", items: "Tyre pressure\nLights and indicators\nBrakes and air lines\nFluid levels (oil, fuel, coolant)\nBody, mirrors and load securing" });

  const { data: results, isPending } = useQuery({
    queryKey: ["fleet", "inspection-results"],
    queryFn: async () => {
      const { data } = await getSupabase()
        .from("hericilla_inspection_results")
        .select("*, vehicles:hericilla_vehicles(reg_no), driver:hericilla_profiles!inspection_results_driver_id_fkey(full_name), inspection_checklists:hericilla_inspection_checklists(name)")
        .order("submitted_at", { ascending: false })
        .limit(100);
      return ((data as InspectionRow[]) ?? []).map((r) => {
        const raw = r as unknown as Record<string, unknown>;
        return {
          ...r,
          reg_no: pick<{ reg_no: string }>(raw.vehicles)?.reg_no,
          driver_name: pick<{ full_name: string }>(raw.driver)?.full_name,
          checklist_name: pick<{ name: string }>(raw.inspection_checklists)?.name,
        };
      });
    },
  });

  const { data: checklists } = useQuery({
    queryKey: ["fleet", "inspection-checklists"],
    queryFn: async () => {
      const { data } = await getSupabase().from("hericilla_inspection_checklists").select("*").eq("is_active", true).order("trip_phase", { ascending: true }).order("name");
      return ((data as { id: string; name: string; trip_phase: string; items: unknown; is_active: boolean }[]) ?? []).map((c) => ({
        ...c,
        items: Array.isArray(c.items) ? (c.items as string[]) : [],
      }));
    },
  });

  async function createChecklist() {
    const items = form.items.split("\n").map((s) => s.trim()).filter(Boolean);
    if (!form.name.trim() || items.length === 0) {
      setError("Give the checklist a name and at least one item (one per line).");
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await getSupabase().from("hericilla_inspection_checklists").insert({
      name: form.name.trim(),
      trip_phase: form.trip_phase,
      items,
    });
    setBusy(false);
    if (err) {
      setError("Could not save: " + err.message);
      return;
    }
    setOpen(false);
    setForm({ ...form, name: "" });
    void qc.invalidateQueries({ queryKey: ["fleet", "inspection-checklists"] });
  }

  return (
    <div className="mt-6 space-y-8">
      <section>
        <div className="flex justify-end">
          <BigButton variant="secondary" onClick={() => { setError(null); setOpen(true); }}>+ New checklist</BigButton>
        </div>
        <h2 className="mt-2 text-xl font-bold text-brand-950">Checklist templates</h2>
        <p className="text-base text-ink-soft">Drivers work through these before (pre) and after (post) every trip in the driver app.</p>
        {(checklists ?? []).length === 0 ? (
          <EmptyState title="No checklists yet" teach="Press “+ New checklist” to build the first pre-trip check." />
        ) : (
          <div className="mt-3 space-y-3">
            {(checklists ?? []).map((c: ChecklistRow) => (
              <RowCard
                key={c.id}
                title={`${c.name} (${c.trip_phase === "pre" ? "before the trip" : "after the trip"})`}
                subtitle={c.items.join(" · ")}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-xl font-bold text-brand-950">Driver submissions ({results?.length ?? 0})</h2>
        {isPending ? (
          <div className="mt-3 space-y-3"><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
        ) : (results ?? []).length === 0 ? (
          <div className="mt-3">
            <EmptyState title="No inspections submitted yet" teach="When drivers file a pre-trip check in the driver app, it appears here — faults show up in red." />
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            {(results ?? []).map((r) => {
              const answers = r.answers ?? {};
              const nos = Object.entries(answers).filter(([, ok]) => ok === false);
              return (
                <RowCard
                  key={r.id}
                  title={`${r.reg_no ?? "Vehicle"} — ${r.checklist_name ?? "inspection"} by ${r.driver_name ?? "driver"}`}
                  subtitle={
                    <>
                      <span className="block">
                        {fmtDateTime(r.submitted_at)} · {Object.keys(answers).length} checks
                        {nos.length > 0 ? ` · ${nos.length} failed: ${nos.map(([k]) => k).join(", ")}` : " · all passed"}
                        {r.odometer_km ? ` · at ${Number(r.odometer_km).toLocaleString()} km` : ""}
                      </span>
                      {r.faults_reported && <span className="block font-semibold text-danger-800">Fault: {r.faults_reported}</span>}
                    </>
                  }
                />
              );
            })}
          </div>
        )}
        <Card className="mt-4">
          <p className="text-base text-ink-soft">
            A fault here means the vehicle needs attention — open the Maintenance tab and record the fix when it is done.
          </p>
        </Card>
      </section>

      <Modal open={open} title="New inspection checklist" onClose={() => setOpen(false)} wide>
        <div className="space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <BigInput label="Checklist name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} hint="e.g. Pre-trip long haul" />
            <BigSelect
              label="When is it used?"
              value={form.trip_phase}
              onChange={(e) => setForm({ ...form, trip_phase: e.target.value })}
              options={[
                { value: "pre", label: "Before the trip" },
                { value: "post", label: "After the trip" },
              ]}
            />
          </div>
          <BigTextarea label="Check items — one per line" rows={8} value={form.items} onChange={(e) => setForm({ ...form, items: e.target.value })} />
          {error && <p className="text-base text-danger-800">{error}</p>}
          <div className="flex justify-end gap-3">
            <BigButton variant="secondary" onClick={() => setOpen(false)}>Cancel</BigButton>
            <BigButton variant="success" disabled={busy} onClick={() => void createChecklist()}>{busy ? "Saving…" : "Save checklist"}</BigButton>
          </div>
        </div>
      </Modal>
    </div>
  );
}
