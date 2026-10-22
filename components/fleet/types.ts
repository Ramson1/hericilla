import type { VehicleStatus, VehicleType } from "@hericilla/types";

/** Shared row shapes + helpers for the fleet panels (admin /vehicles). */

export type Mini = { id: string; full_name: string };
export type SiteMini = { id: string; name: string };
export type WoMini = { id: string; wo_number: string };

export type FleetBoardRow = {
  id: string;
  reg_no: string;
  make: string | null;
  model: string | null;
  vehicle_type: VehicleType;
  vehicle_status: VehicleStatus;
  odometer_km: number | null;
  insurance_expiry: string | null;
  inspection_expiry: string | null;
  driver_id: string | null;
  driver_name: string | null;
  work_order_id: string | null;
  wo_number: string | null;
  last_movement_at: string | null;
  last_movement: string | null;
  last_location: string | null;
};

export type VehicleRow = {
  id: string;
  reg_no: string;
  make: string | null;
  model: string | null;
  year: number | null;
  vehicle_type: VehicleType;
  capacity: string | null;
  status: VehicleStatus;
  odometer_km: number | null;
  insurance_expiry: string | null;
  inspection_expiry: string | null;
  notes: string | null;
};

export type AllocationRow = {
  id: string;
  vehicle_id: string;
  driver_id: string | null;
  work_order_id: string | null;
  site_id: string | null;
  valid_from: string;
  valid_to: string | null;
  released_at: string | null;
  notes: string | null;
  created_at: string;
  reg_no?: string;
  driver_name?: string;
  wo_number?: string;
  site_name?: string;
};

export type MovementRow = {
  id: number;
  vehicle_id: string;
  allocation_id: string | null;
  movement_type: string;
  odometer_km: number | null;
  location_note: string | null;
  recorded_by: string | null;
  occurred_at: string;
  reg_no?: string;
  recorder_name?: string;
};

export type ScheduleRow = {
  id: string;
  vehicle_id: string;
  service_type: string;
  every_km: number | null;
  every_days: number | null;
  last_done_at: string | null;
  last_done_km: number | null;
  next_due_date: string | null;
  next_due_km: number | null;
  is_active: boolean;
  reg_no?: string;
};

export type MaintRecordRow = {
  id: string;
  vehicle_id: string;
  service_type: string;
  cost: number;
  odometer_km: number | null;
  done_at: string;
  vendor: string | null;
  notes: string | null;
  created_at: string;
  reg_no?: string;
};

export type ChecklistRow = {
  id: string;
  name: string;
  trip_phase: string;
  items: string[];
  is_active: boolean;
};

export type InspectionRow = {
  id: string;
  checklist_id: string | null;
  vehicle_id: string;
  transport_job_id: string | null;
  driver_id: string | null;
  answers: Record<string, boolean>;
  faults_reported: string | null;
  odometer_km: number | null;
  submitted_at: string;
  source: string;
  reg_no?: string;
  driver_name?: string;
  checklist_name?: string;
};

export type IncidentRow = {
  id: string;
  vehicle_id: string | null;
  transport_job_id: string | null;
  incident_type: string;
  severity: string;
  description: string;
  location: string | null;
  occurred_at: string;
  reported_by: string | null;
  status: string;
  resolution_note: string | null;
  reg_no?: string;
  reporter_name?: string;
};

/** Embedded FKs may come back as object or single-element array — normalise. */
export const pick = <T,>(v: unknown): T | null =>
  v == null ? null : Array.isArray(v) ? ((v[0] as T) ?? null) : (v as T);

/** Days until a YYYY-MM-DD date; negative = already past. */
export function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr + (dateStr.length === 10 ? "T00:00:00" : ""));
  if (Number.isNaN(d.getTime())) return null;
  return Math.round((d.getTime() - Date.now()) / 86_400_000);
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

export function vehicleName(v: { reg_no: string; make?: string | null; model?: string | null } | undefined): string {
  if (!v) return "Unknown vehicle";
  return v.make || v.model ? `${v.reg_no} · ${[v.make, v.model].filter(Boolean).join(" ")}` : v.reg_no;
}
