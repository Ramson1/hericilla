"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  PageHeader,
  HintCard,
  BigButton,
  BigInput,
  BigSelect,
  Card,
  RowCard,
  StatusBadge,
  Modal,
  Skeleton,
  EmptyState,
  StatCard,
} from "@hericilla/ui";
import { getSupabase } from "@hericilla/supabase-clients";
import { statusLabel } from "@hericilla/types";
import { useAuth } from "@/lib/auth";
import { todayWat } from "@/lib/data";

type Daily = {
  employee_id: string;
  work_date: string;
  first_in: string | null;
  last_out: string | null;
  gross_hours: number | null;
  day_status: string;
  is_late: boolean;
  start_time: string | null;
  end_time: string | null;
  full_name?: string;
};
type Shift = { id: string; name: string; start_time: string; end_time: string; break_mins: number };
type Assignment = {
  id: string;
  employee_id: string;
  work_date: string;
  shift_id: string;
  note: string | null;
  shift_name?: string;
  full_name?: string;
};
type Correction = {
  id: string;
  employee_id: string;
  work_date: string;
  kind: string;
  requested_event_type: string;
  requested_time: string;
  reason: string;
  status: string;
  requested_by: string | null;
  full_name?: string;
};
type LeaveRow = {
  id: string;
  employee_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  status: string;
  full_name?: string;
};

const MANAGE_ROLES = ["super_admin", "admin", "hr_officer", "supervisor"];

function weekStartIso(): string {
  const d = new Date();
  const day = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - day);
  return d.toISOString().slice(0, 10);
}

export default function AttendancePage() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const canManage = !!profile && MANAGE_ROLES.includes(profile.role);
  const [tab, setTab] = useState<"today" | "schedule" | "corrections" | "leave">("today");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [weekStart, setWeekStart] = useState(weekStartIso());
  const [shiftOpen, setShiftOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [shift, setShift] = useState({ name: "", start_time: "08:00", end_time: "17:00", break_mins: "60" });
  const [assign, setAssign] = useState({ employee_id: "", shift_id: "", work_date: weekStartIso(), note: "" });

  const today = todayWat().date;

  const { data: daily, isPending } = useQuery({
    queryKey: ["attendance-today"],
    queryFn: async () => {
      const { data } = await getSupabase().from("attendance_daily").select("*").eq("work_date", today);
      return (data as Daily[]) ?? [];
    },
  });

  const { data: names } = useQuery({
    queryKey: ["profiles-mini"],
    queryFn: async () => {
      const { data } = await getSupabase().from("profiles").select("id, full_name").eq("status", "active").order("full_name");
      return (data as { id: string; full_name: string }[]) ?? [];
    },
  });
  const nameOf = (id: string) => (names ?? []).find((p) => p.id === id)?.full_name ?? "Someone";

  const { data: stale } = useQuery({
    queryKey: ["attendance-stale"],
    queryFn: async () => {
      const { data } = await getSupabase().from("attendance_daily").select("*").eq("day_status", "on_duty").lt("work_date", today);
      return (data as Daily[]) ?? [];
    },
  });

  const { data: shifts } = useQuery({
    queryKey: ["shifts"],
    queryFn: async () => {
      const { data } = await getSupabase().from("shifts").select("*").order("start_time");
      return (data as Shift[]) ?? [];
    },
  });

  const { data: assignments } = useQuery({
    queryKey: ["shift-assignments", weekStart],
    queryFn: async () => {
      const end = new Date(weekStart);
      end.setDate(end.getDate() + 6);
      const { data } = await getSupabase()
        .from("shift_assignments")
        .select("*, shift:shifts!shift_assignments_shift_id_fkey(name)")
        .gte("work_date", weekStart)
        .lte("work_date", end.toISOString().slice(0, 10))
        .order("work_date");
      const pick = <T,>(v: unknown): T | null => (v == null ? null : Array.isArray(v) ? ((v[0] as T) ?? null) : (v as T));
      return ((data as Assignment[]) ?? []).map((r) => ({
        ...r,
        shift_name: pick<{ name: string }>((r as unknown as { shift: unknown }).shift)?.name ?? "Shift",
        full_name: nameOf(r.employee_id),
      }));
    },
  });

  const { data: corrections } = useQuery({
    queryKey: ["corrections"],
    queryFn: async () => {
      const { data } = await getSupabase().from("attendance_corrections").select("*").order("created_at", { ascending: false }).limit(200);
      return (data as Correction[]) ?? [];
    },
  });

  const { data: leaves } = useQuery({
    queryKey: ["leave-requests"],
    queryFn: async () => {
      const { data } = await getSupabase().from("leave_requests").select("*").order("created_at", { ascending: false }).limit(200);
      return (data as LeaveRow[]) ?? [];
    },
  });

  async function createShift() {
    if (!shift.name.trim()) return;
    setBusy(true);
    await getSupabase().from("shifts").insert({
      name: shift.name.trim(),
      start_time: shift.start_time + ":00",
      end_time: shift.end_time + ":00",
      break_mins: Number(shift.break_mins) || 0,
    });
    setBusy(false);
    setShiftOpen(false);
    setShift({ name: "", start_time: "08:00", end_time: "17:00", break_mins: "60" });
    void qc.invalidateQueries({ queryKey: ["shifts"] });
  }

  async function createAssignment() {
    if (!assign.employee_id || !assign.shift_id) {
      setError("Pick the person and the shift.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await getSupabase().from("shift_assignments").insert({
      employee_id: assign.employee_id,
      shift_id: assign.shift_id,
      work_date: assign.work_date,
      note: assign.note || null,
      created_by: profile?.id,
    });
    setBusy(false);
    if (err) {
      setError(err.message.includes("duplicate") ? "That person already has this shift on that day." : "Could not save: " + err.message);
      return;
    }
    setAssignOpen(false);
    setAssign({ ...assign, note: "" });
    void qc.invalidateQueries({ queryKey: ["shift-assignments", weekStart] });
  }

  async function approveCorrection(id: string) {
    setBusy(true);
    const { error: err } = await getSupabase().rpc("approve_attendance_correction", { c_id: id });
    setBusy(false);
    if (err) setError(err.message);
    void qc.invalidateQueries({ queryKey: ["corrections"] });
    void qc.invalidateQueries({ queryKey: ["attendance-today"] });
  }

  async function rejectCorrection(id: string) {
    await getSupabase()
      .from("attendance_corrections")
      .update({ status: "rejected", decided_by: profile?.id, decided_at: new Date().toISOString() })
      .eq("id", id);
    void qc.invalidateQueries({ queryKey: ["corrections"] });
  }

  async function decideLeave(id: string, approved: boolean) {
    await getSupabase()
      .from("leave_requests")
      .update({ status: approved ? "approved" : "rejected", decided_by: profile?.id, decided_at: new Date().toISOString() })
      .eq("id", id);
    void qc.invalidateQueries({ queryKey: ["leave-requests"] });
  }

  const onDuty = (daily ?? []).filter((d) => d.day_status === "on_duty");
  const finished = (daily ?? []).filter((d) => d.day_status === "clocked_out");
  const late = (daily ?? []).filter((d) => d.is_late);
  const pendingCorrections = (corrections ?? []).filter((c) => c.status === "pending");
  const pendingLeaves = (leaves ?? []).filter((l) => l.status === "pending");

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d.toISOString().slice(0, 10);
  });

  return (
    <div>
      <PageHeader
        title="Attendance & Shifts"
        purpose="Who is on duty right now, next week’s shifts, and the exception requests waiting for a decision."
      />
      <HintCard
        steps={[
          "Build shift types once (Day, Night…), then assign people to days.",
          "Staff clock in from their portal — this board updates live.",
          "Check the exception queue daily: missed clock-outs and correction requests.",
        ]}
      />

      <div className="mt-6 grid gap-4 sm:grid-cols-4">
        <StatCard label="On duty now" value={String(onDuty.length)} tone="brand" />
        <StatCard label="Finished today" value={String(finished.length)} tone="success" />
        <StatCard label="Late arrivals" value={String(late.length)} tone={late.length > 0 ? "warning" : "success"} />
        <StatCard label="Awaiting decision" value={String(pendingCorrections.length + pendingLeaves.length)} tone={pendingCorrections.length + pendingLeaves.length > 0 ? "danger" : "success"} />
      </div>

      <div className="mt-6 flex gap-3 flex-wrap">
        <BigButton variant={tab === "today" ? "primary" : "secondary"} size="md" onClick={() => setTab("today")}>Today</BigButton>
        <BigButton variant={tab === "schedule" ? "primary" : "secondary"} size="md" onClick={() => setTab("schedule")}>Schedule</BigButton>
        <BigButton variant={tab === "corrections" ? "primary" : "secondary"} size="md" onClick={() => setTab("corrections")}>
          Corrections ({pendingCorrections.length})
        </BigButton>
        <BigButton variant={tab === "leave" ? "primary" : "secondary"} size="md" onClick={() => setTab("leave")}>
          Leave ({pendingLeaves.length})
        </BigButton>
      </div>

      {tab === "today" && (
        isPending ? (
          <div className="mt-6 space-y-3"><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
        ) : (
          <div className="mt-6 space-y-6">
            {(daily ?? []).length === 0 ? (
              <EmptyState title="Nobody has clocked in today yet" teach="When staff open their portal and press Clock in, they appear here with their times." />
            ) : (
              <div className="space-y-3">
                {(daily ?? []).map((d) => (
                  <RowCard
                    key={d.employee_id}
                    title={nameOf(d.employee_id)}
                    subtitle={`${d.first_in ? "In " + new Date(d.first_in).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "No clock-in"}${d.last_out ? ` · Out ${new Date(d.last_out).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}${d.gross_hours ? ` · ${Number(d.gross_hours).toFixed(1)} h` : ""}`}
                    badge={<StatusBadge status={d.day_status} />}
                    actions={d.is_late ? <span className="text-lg font-bold text-warning-800 self-center">Late</span> : undefined}
                  />
                ))}
              </div>
            )}
            {(stale ?? []).length > 0 && (
              <Card>
                <h2 className="text-xl font-bold text-danger-800">Still on duty from earlier days</h2>
                <p className="text-lg text-ink-soft mt-1">These people clocked in but never clocked out. Ask them to submit a correction, or record the event for them.</p>
                <div className="mt-3 space-y-2">
                  {(stale ?? []).map((s) => (
                    <div key={s.employee_id + s.work_date} className="flex justify-between text-lg py-1 border-b border-[var(--color-line)] last:border-0">
                      <span>{nameOf(s.employee_id)}</span>
                      <span className="text-ink-soft">since {new Date(s.work_date).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        )
      )}

      {tab === "schedule" && (
        <div className="mt-6 space-y-6">
          <Card>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h2 className="text-xl font-bold text-brand-950">Shift types</h2>
              {canManage && <BigButton size="md" onClick={() => setShiftOpen(true)}>+ New shift</BigButton>}
            </div>
            <div className="mt-3 space-y-2">
              {(shifts ?? []).length === 0 && <p className="text-lg text-ink-soft">No shift types yet — create “Day shift”, “Night shift”, etc.</p>}
              {(shifts ?? []).map((s) => (
                <div key={s.id} className="flex justify-between text-lg py-1 border-b border-[var(--color-line)] last:border-0">
                  <span className="font-semibold">{s.name}</span>
                  <span className="text-ink-soft">{s.start_time.slice(0, 5)} – {s.end_time.slice(0, 5)} · {s.break_mins} min break</span>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-bold text-brand-950">Week of</h2>
                <BigInput label=" " type="date" value={weekStart} onChange={(e) => setWeekStart(e.target.value)} />
              </div>
              {canManage && <BigButton size="md" onClick={() => { setAssign({ employee_id: "", shift_id: "", work_date: today, note: "" }); setAssignOpen(true); }}>+ Assign someone</BigButton>}
            </div>
            <div className="mt-4 space-y-4">
              {weekDays.map((day) => {
                const dayRows = (assignments ?? []).filter((a) => a.work_date === day);
                if (dayRows.length === 0) return null;
                return (
                  <div key={day}>
                    <h3 className="text-lg font-bold text-brand-950">{new Date(day + "T12:00:00").toLocaleDateString("en-NG", { weekday: "long", day: "numeric", month: "short" })}</h3>
                    <div className="mt-2 space-y-2">
                      {dayRows.map((a) => (
                        <div key={a.id} className="flex items-center justify-between gap-3 text-lg py-1 border-b border-[var(--color-line)] last:border-0">
                          <span>{a.full_name} — <strong>{a.shift_name}</strong>{a.note ? ` · ${a.note}` : ""}</span>
                          {canManage && (
                            <BigButton
                              size="md"
                              variant="ghost"
                              className="text-danger-800"
                              onClick={async () => {
                                await getSupabase().from("shift_assignments").delete().eq("id", a.id);
                                void qc.invalidateQueries({ queryKey: ["shift-assignments", weekStart] });
                              }}
                            >
                              Remove
                            </BigButton>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
              {(assignments ?? []).length === 0 && (
                <p className="text-lg text-ink-soft">Nothing scheduled this week yet. Press “+ Assign someone”.</p>
              )}
            </div>
          </Card>
        </div>
      )}

      {tab === "corrections" && (
        <div className="mt-6 space-y-3">
          {error && <p className="text-lg text-danger-800">{error}</p>}
          {(corrections ?? []).length === 0 ? (
            <EmptyState title="No correction requests" teach="When staff miss a clock-in or clock-out, they request a correction — it lands here for a decision." />
          ) : (
            (corrections ?? []).map((c) => (
              <RowCard
                key={c.id}
                title={`${nameOf(c.employee_id)} — ${statusLabel(c.kind)}`}
                subtitle={`${new Date(c.work_date).toLocaleDateString()} · wants a “${statusLabel(c.requested_event_type)}” at ${new Date(c.requested_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · reason: ${c.reason}`}
                badge={<StatusBadge status={c.status} />}
                actions={
                  canManage && c.status === "pending" && c.requested_by !== profile?.id ? (
                    <div className="flex gap-2">
                      <BigButton size="md" variant="success" disabled={busy} onClick={() => void approveCorrection(c.id)}>Approve</BigButton>
                      <BigButton size="md" variant="danger" disabled={busy} onClick={() => void rejectCorrection(c.id)}>Reject</BigButton>
                    </div>
                  ) : undefined
                }
              />
            ))
          )}
          <p className="text-base text-ink-soft">You cannot approve a correction you submitted yourself — ask another manager.</p>
        </div>
      )}

      {tab === "leave" && (
        <div className="mt-6 space-y-3">
          {(leaves ?? []).length === 0 ? (
            <EmptyState title="No leave requests" teach="Staff apply for leave from their own portal; requests appear here for approval." />
          ) : (
            (leaves ?? []).map((l) => (
              <RowCard
                key={l.id}
                title={`${nameOf(l.employee_id)} — ${statusLabel(l.leave_type)} leave`}
                subtitle={`${new Date(l.start_date).toLocaleDateString()} → ${new Date(l.end_date).toLocaleDateString()}${l.reason ? ` · ${l.reason}` : ""}`}
                badge={<StatusBadge status={l.status} />}
                actions={
                  canManage && l.status === "pending" ? (
                    <div className="flex gap-2">
                      <BigButton size="md" variant="success" onClick={() => void decideLeave(l.id, true)}>Approve</BigButton>
                      <BigButton size="md" variant="danger" onClick={() => void decideLeave(l.id, false)}>Reject</BigButton>
                    </div>
                  ) : undefined
                }
              />
            ))
          )}
        </div>
      )}

      <Modal open={shiftOpen} title="New shift type" onClose={() => setShiftOpen(false)}>
        <div className="space-y-5">
          <BigInput label="Name" required hint="e.g. Day shift, Night shift" value={shift.name} onChange={(e) => setShift({ ...shift, name: e.target.value })} />
          <div className="grid gap-5 sm:grid-cols-3">
            <BigInput label="Starts" type="time" value={shift.start_time} onChange={(e) => setShift({ ...shift, start_time: e.target.value })} />
            <BigInput label="Ends" type="time" value={shift.end_time} onChange={(e) => setShift({ ...shift, end_time: e.target.value })} />
            <BigInput label="Break (minutes)" type="number" value={shift.break_mins} onChange={(e) => setShift({ ...shift, break_mins: e.target.value })} />
          </div>
          <div className="flex justify-end gap-3">
            <BigButton variant="secondary" onClick={() => setShiftOpen(false)}>Cancel</BigButton>
            <BigButton variant="success" disabled={busy} onClick={() => void createShift()}>Save shift</BigButton>
          </div>
        </div>
      </Modal>

      <Modal open={assignOpen} title="Assign a shift" onClose={() => { setAssignOpen(false); setError(null); }}>
        <div className="space-y-5">
          <BigSelect
            label="Who?"
            required
            value={assign.employee_id}
            onChange={(e) => setAssign({ ...assign, employee_id: e.target.value })}
            options={[{ value: "", label: "Choose a person…" }, ...(names ?? []).map((p) => ({ value: p.id, label: p.full_name }))]}
          />
          <div className="grid gap-5 sm:grid-cols-2">
            <BigSelect
              label="Which shift?"
              required
              value={assign.shift_id}
              onChange={(e) => setAssign({ ...assign, shift_id: e.target.value })}
              options={[{ value: "", label: "Choose a shift…" }, ...(shifts ?? []).map((s) => ({ value: s.id, label: `${s.name} (${s.start_time.slice(0, 5)}–${s.end_time.slice(0, 5)})` }))]}
            />
            <BigInput label="On which day?" type="date" value={assign.work_date} onChange={(e) => setAssign({ ...assign, work_date: e.target.value })} />
          </div>
          <BigInput label="Note (optional)" value={assign.note} onChange={(e) => setAssign({ ...assign, note: e.target.value })} />
          {error && <p className="text-lg text-danger-800">{error}</p>}
          <div className="flex justify-end gap-3">
            <BigButton variant="secondary" onClick={() => setAssignOpen(false)}>Cancel</BigButton>
            <BigButton variant="success" disabled={busy} onClick={() => void createAssignment()}>Save assignment</BigButton>
          </div>
        </div>
      </Modal>
    </div>
  );
}
