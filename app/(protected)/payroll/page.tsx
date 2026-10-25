"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BigButton,
  BigInput,
  BigSelect,
  Card,
  ConfirmDialog,
  EmptyState,
  HintCard,
  Modal,
  PageHeader,
  RowCard,
  Skeleton,
  StatCard,
  StatusBadge,
  Wizard,
} from "@hericilla/ui";
import { getSupabase } from "@hericilla/supabase-clients";
import { statusLabel, type PayrollRunStatus } from "@hericilla/types";
import { useAuth } from "@/lib/auth";
import { money } from "@/lib/data";

/* ---------- row shapes ---------- */

type RunRow = {
  id: string;
  period_month: string;
  status: PayrollRunStatus;
  generated_at: string | null;
  approved_at: string | null;
  paid_at: string | null;
  total_gross: number;
  total_net: number;
  notes: string | null;
};
type RunStatusRow = {
  run_id: string;
  period_month: string;
  status: PayrollRunStatus;
  total_gross: number;
  total_net: number;
  payslip_count: number;
  paid_count: number;
  paid_amount: number;
};
type PayslipRow = {
  id: string;
  payroll_run_id: string;
  employee_id: string;
  base_salary: number;
  hours_worked: number;
  overtime_hours: number;
  overtime_amount: number;
  allowances_amount: number;
  deductions_amount: number;
  adjustment_amount: number;
  adjustment_reason: string | null;
  gross: number;
  net: number;
  payment_status: string;
  paid_at: string | null;
  payment_method: string | null;
  payment_reference: string | null;
  employee_name?: string;
};
type Allowance = { name: string; amount: string };
type Deduction = { name: string; mode: "amount" | "percent"; value: string };
type StructRow = {
  id: string;
  employee_id: string;
  base_salary: number;
  allowances: Allowance[];
  deductions: (Deduction & { amount?: number; percent?: number })[];
  pay_cycle: string;
  effective_from: string;
  effective_to: string | null;
  is_current: boolean;
  employee_name?: string;
  employee_role?: string;
};
type EmployeeMini = { id: string; full_name: string; role: string };

const pick = <T,>(v: unknown): T | null => (v == null ? null : Array.isArray(v) ? ((v[0] as T) ?? null) : (v as T));

const CAN_MANAGE = ["super_admin", "admin", "finance_officer"];
const CAN_STRUCTURE = ["super_admin", "admin", "finance_officer", "hr_officer"];

function monthLabel(iso: string): string {
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export default function PayrollPage() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const canManage = CAN_MANAGE.includes(profile?.role ?? "");
  const canStructure = CAN_STRUCTURE.includes(profile?.role ?? "");

  const [tab, setTab] = useState<"runs" | "structures">("runs");
  const [error, setError] = useState<string | null>(null);

  /* ---------- queries ---------- */

  const { data: runs, isPending } = useQuery({
    queryKey: ["payroll", "runs"],
    queryFn: async () => {
      const { data } = await getSupabase().from("hericilla_payroll_runs").select("*").order("period_month", { ascending: false });
      return (data as RunRow[]) ?? [];
    },
  });

  const { data: runStatus } = useQuery({
    queryKey: ["payroll", "status"],
    queryFn: async () => {
      const { data } = await getSupabase().from("hericilla_payroll_status").select("*");
      return (data as RunStatusRow[]) ?? [];
    },
  });

  const { data: structures } = useQuery({
    queryKey: ["payroll", "structures"],
    queryFn: async () => {
      const { data } = await getSupabase()
        .from("hericilla_salary_structures")
        .select("*, employee:hericilla_profiles!salary_structures_employee_id_fkey(full_name, role)")
        .order("is_current", { ascending: false })
        .order("effective_from", { ascending: false })
        .limit(300);
      return ((data as StructRow[]) ?? []).map((r) => {
        const emp = pick<{ full_name: string; role: string }>((r as unknown as Record<string, unknown>).employee);
        return { ...r, employee_name: emp?.full_name, employee_role: emp?.role };
      });
    },
  });

  const { data: employees } = useQuery({
    queryKey: ["payroll", "employees"],
    queryFn: async () => {
      const { data } = await getSupabase()
        .from("hericilla_profiles")
        .select("id, full_name, role")
        .eq("status", "active")
        .order("full_name");
      return (data as EmployeeMini[]) ?? [];
    },
  });

  /* ---------- run wizard ---------- */

  const [wizardOpen, setWizardOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [period, setPeriod] = useState(() => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 7);
  });
  const [runNotes, setRunNotes] = useState("");

  async function generateRun() {
    setBusy(true);
    setError(null);
    const sb = getSupabase();
    const { data: runId, error: err } = await sb.rpc("hericilla_generate_payroll_run", { period: `${period}-01` });
    if (!err && runId && runNotes.trim()) {
      await sb.from("hericilla_payroll_runs").update({ notes: runNotes.trim() }).eq("id", runId as string);
    }
    setBusy(false);
    if (err) {
      setError(
        err.message.toLowerCase().includes("duplicate") || err.message.toLowerCase().includes("already")
          ? `There is already a payroll run for ${monthLabel(`${period}-01`)}. Delete the draft or open the existing run.`
          : "Could not generate: " + err.message,
      );
      return;
    }
    setWizardOpen(false);
    setRunNotes("");
    void qc.invalidateQueries({ queryKey: ["payroll"] });
  }

  async function submitRun(run: RunRow) {
    setError(null);
    const { error: err } = await getSupabase()
      .from("hericilla_payroll_runs")
      .update({ status: "pending_approval", submitted_by: profile?.id })
      .eq("id", run.id)
      .eq("status", "draft");
    if (err) setError("Could not submit: " + err.message);
    void qc.invalidateQueries({ queryKey: ["payroll"] });
  }

  async function approveRun(run: RunRow) {
    setError(null);
    const { error: err } = await getSupabase().rpc("hericilla_approve_payroll_run", { run: run.id });
    if (err) {
      setError(
        err.message.includes("own payroll")
          ? "You appear on this payroll — a super admin or another approver must sign it off."
          : "Could not approve: " + err.message,
      );
      return;
    }
    void qc.invalidateQueries({ queryKey: ["payroll"] });
  }

  const [deleting, setDeleting] = useState<RunRow | null>(null);
  async function deleteRun() {
    if (!deleting) return;
    const { error: err } = await getSupabase().from("hericilla_payroll_runs").delete().eq("id", deleting.id);
    if (err) setError("Could not delete: " + err.message);
    setDeleting(null);
    void qc.invalidateQueries({ queryKey: ["payroll"] });
  }

  /* ---------- run detail (payslips + payment tracking) ---------- */

  const [openRun, setOpenRun] = useState<RunRow | null>(null);
  const [paying, setPaying] = useState<PayslipRow | null>(null);
  const [pay, setPay] = useState({ method: "Bank transfer", reference: "", paid_at: new Date().toISOString().slice(0, 10) });

  const { data: payslips } = useQuery({
    queryKey: ["payroll", "payslips", openRun?.id],
    enabled: openRun !== null,
    queryFn: async () => {
      const { data } = await getSupabase()
        .from("hericilla_payslips")
        .select("*, employee:hericilla_profiles!payslips_employee_id_fkey(full_name)")
        .eq("payroll_run_id", openRun?.id)
        .order("net", { ascending: false });
      return ((data as PayslipRow[]) ?? []).map((r) => ({
        ...r,
        employee_name: pick<{ full_name: string }>((r as unknown as Record<string, unknown>).employee)?.full_name,
      }));
    },
  });

  async function markPaid() {
    if (!paying || !openRun) return;
    const { error: err } = await getSupabase()
      .from("hericilla_payslips")
      .update({
        payment_status: "paid",
        paid_at: pay.paid_at,
        payment_method: pay.method,
        payment_reference: pay.reference.trim() || null,
      })
      .eq("id", paying.id);
    if (err) {
      setError("Could not record payment: " + err.message);
      return;
    }
    setPaying(null);
    setError(null);
    void qc.invalidateQueries({ queryKey: ["payroll"] });
  }

  async function closeRunAsPaid(run: RunRow) {
    setError(null);
    const { error: err } = await getSupabase()
      .from("hericilla_payroll_runs")
      .update({ status: "paid", paid_at: new Date().toISOString() })
      .eq("id", run.id)
      .eq("status", "approved");
    if (err) setError("Could not close the run: " + err.message);
    void qc.invalidateQueries({ queryKey: ["payroll"] });
  }

  /* ---------- salary structures ---------- */

  const [structOpen, setStructOpen] = useState(false);
  const [editing, setEditing] = useState<StructRow | null>(null);
  const [form, setForm] = useState({
    employee_id: "",
    base_salary: "",
    pay_cycle: "monthly",
    effective_from: new Date().toISOString().slice(0, 10),
    allowances: [{ name: "Housing", amount: "" }] as Allowance[],
    deductions: [{ name: "Pension", mode: "percent" as const, value: "8" }] as Deduction[],
  });

  function startAddStructure() {
    setEditing(null);
    setForm({
      employee_id: "",
      base_salary: "",
      pay_cycle: "monthly",
      effective_from: new Date().toISOString().slice(0, 10),
      allowances: [{ name: "Housing", amount: "" }],
      deductions: [{ name: "Pension", mode: "percent", value: "8" }],
    });
    setError(null);
    setStructOpen(true);
  }
  function startEditStructure(s: StructRow) {
    setEditing(s);
    setForm({
      employee_id: s.employee_id,
      base_salary: String(s.base_salary),
      pay_cycle: s.pay_cycle,
      effective_from: s.effective_from,
      allowances: (s.allowances ?? []).map((a) => ({ name: a.name, amount: String(a.amount) })),
      deductions: (s.deductions ?? []).map((d) => ({
        name: d.name,
        mode: d.percent != null ? ("percent" as const) : ("amount" as const),
        value: String(d.percent ?? d.amount ?? ""),
      })),
    });
    setError(null);
    setStructOpen(true);
  }

  async function saveStructure() {
    if (!form.employee_id) {
      setError("Choose whose salary this is.");
      return;
    }
    if (!(Number(form.base_salary) > 0)) {
      setError("Enter the base salary in naira.");
      return;
    }
    setBusy(true);
    setError(null);
    const sb = getSupabase();
    const allowances = form.allowances
      .filter((a) => a.name.trim() && Number(a.amount) > 0)
      .map((a) => ({ name: a.name.trim(), amount: Number(a.amount) }));
    const deductions = form.deductions
      .filter((d) => d.name.trim() && Number(d.value) > 0)
      .map((d) => (d.mode === "percent" ? { name: d.name.trim(), percent: Number(d.value) } : { name: d.name.trim(), amount: Number(d.value) }));
    const payload = {
      base_salary: Number(form.base_salary),
      allowances,
      deductions,
      pay_cycle: form.pay_cycle,
      effective_from: form.effective_from,
    };
    let err: { message: string } | null = null;
    if (editing) {
      const res = await sb.from("hericilla_salary_structures").update(payload).eq("id", editing.id);
      err = res.error;
    } else {
      // retire the old current structure first (partial unique index allows one)
      await sb.from("hericilla_salary_structures").update({ is_current: false, effective_to: form.effective_from }).eq("employee_id", form.employee_id).eq("is_current", true);
      const res = await sb.from("hericilla_salary_structures").insert({ ...payload, employee_id: form.employee_id, is_current: true, created_by: profile?.id });
      err = res.error;
    }
    setBusy(false);
    if (err) {
      setError("Could not save: " + err.message);
      return;
    }
    setStructOpen(false);
    void qc.invalidateQueries({ queryKey: ["payroll"] });
  }

  /* ---------- derived header stats ---------- */

  const status = runStatus ?? [];
  const pendingRun = (runs ?? []).find((r) => r.status === "draft" || r.status === "pending_approval");
  const lastPaid = (runs ?? []).find((r) => r.status === "paid");
  const noStructure = (employees ?? []).filter((e) => !(structures ?? []).some((s) => s.is_current && s.employee_id === e.id)).length;

  return (
    <div>
      <PageHeader
        title="Salary Allocator & Tracking"
        purpose="Payroll pulls approved attendance and each person’s salary structure into one monthly run — draft, approve, pay, trace."
        actions={
          <div className="flex gap-3 flex-wrap">
            {canManage && <BigButton onClick={() => { setError(null); setWizardOpen(true); }}>+ New payroll run</BigButton>}
            {canStructure && <BigButton variant="secondary" onClick={startAddStructure}>+ Salary structure</BigButton>}
          </div>
        }
      />
      <HintCard
        steps={[
          "Set each employee’s salary structure (base, allowances, deductions).",
          "Run payroll for last month — hours come from approved attendance only.",
          "Submit for approval, approve, then tick each person off as paid.",
        ]}
      />

      <div className="mt-6 grid gap-4 sm:grid-cols-4">
        <StatCard label="Salary structures set" value={String((structures ?? []).filter((s) => s.is_current).length)} />
        <StatCard label="Active staff without a structure" value={String(noStructure)} tone={noStructure > 0 ? "warning" : "success"} />
        <StatCard label="Runs waiting for approval" value={pendingRun ? "1" : "0"} tone={pendingRun ? "warning" : "brand"} />
        <StatCard label="Last fully paid month" value={lastPaid ? monthLabel(lastPaid.period_month) : "None yet"} />
      </div>

      <div className="mt-6 flex gap-3 flex-wrap">
        <BigButton size="md" variant={tab === "runs" ? "primary" : "secondary"} onClick={() => setTab("runs")}>Payroll runs ({runs?.length ?? 0})</BigButton>
        <BigButton size="md" variant={tab === "structures" ? "primary" : "secondary"} onClick={() => setTab("structures")}>Salary structures ({(structures ?? []).filter((s) => s.is_current).length})</BigButton>
      </div>

      {error && <p className="mt-4 text-lg font-semibold text-danger-800">{error}</p>}

      {tab === "runs" &&
        (isPending ? (
          <div className="mt-6 space-y-3"><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
        ) : (runs ?? []).length === 0 ? (
          <div className="mt-6">
            <EmptyState
              title="No payroll run yet"
              teach="Press “+ New payroll run” at the top. It drafts payslips from attendance and salary structures — nothing is paid until you approve and tick it."
            />
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {(runs ?? []).map((r) => {
              const st = status.find((s) => s.run_id === r.id);
              return (
                <RowCard
                  key={r.id}
                  title={monthLabel(r.period_month)}
                  subtitle={
                    <>
                      <span className="block">
                        {st?.payslip_count ?? 0} payslips · gross {money(r.total_gross)} · net {money(r.total_net)}
                        {st ? ` · ${st.paid_count}/${st.payslip_count} paid (${money(st.paid_amount)})` : ""}
                      </span>
                      {r.approved_at && <span className="block">Approved {new Date(r.approved_at).toLocaleString()}</span>}
                      {r.notes && <span className="block">{r.notes}</span>}
                    </>
                  }
                  badge={<StatusBadge status={r.status} />}
                  onClick={() => setOpenRun(r)}
                  actions={
                    canManage ? (
                      <>
                        {r.status === "draft" && (
                          <BigButton size="md" onClick={(e) => { e.stopPropagation(); void submitRun(r); }}>Submit for approval</BigButton>
                        )}
                        {r.status === "pending_approval" && (
                          <BigButton size="md" variant="success" onClick={(e) => { e.stopPropagation(); void approveRun(r); }}>Approve run</BigButton>
                        )}
                        {r.status === "approved" && (
                          <BigButton size="md" variant="success" onClick={(e) => { e.stopPropagation(); void closeRunAsPaid(r); }}>Close as fully paid</BigButton>
                        )}
                        {r.status === "draft" && (
                          <BigButton size="md" variant="danger" onClick={(e) => { e.stopPropagation(); setDeleting(r); }}>Delete draft</BigButton>
                        )}
                      </>
                    ) : undefined
                  }
                />
              );
            })}
          </div>
        ))}

      {tab === "structures" && (
        (structures ?? []).length === 0 ? (
          <div className="mt-6">
            <EmptyState
              title="No salary structures yet"
              teach="Press “+ Salary structure” to set base pay, allowances and deductions. Payroll cannot run for anyone without one."
            />
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {(structures ?? []).map((s) => (
              <RowCard
                key={s.id}
                title={`${s.employee_name ?? "Employee"} — ${money(s.base_salary)} base`}
                subtitle={
                  <>
                    <span className="block">
                      {statusLabel(s.pay_cycle)} · {(s.allowances ?? []).map((a) => `${a.name} ${money(a.amount)}`).join(", ") || "no allowances"}
                      {" · "}
                      {(s.deductions ?? []).map((d) => `${d.name} ${d.percent != null ? `${d.percent}%` : money(Number(d.amount ?? 0))}`).join(", ") || "no deductions"}
                    </span>
                    <span className="block">Effective from {s.effective_from}{s.effective_to ? ` until ${s.effective_to}` : ""}</span>
                  </>
                }
                badge={s.is_current ? <StatusBadge status="active" /> : <span className="px-3 py-1 rounded-full bg-gray-100 text-gray-700 text-base font-semibold">Replaced</span>}
                actions={canStructure && s.is_current ? <BigButton size="md" variant="secondary" onClick={() => startEditStructure(s)}>Edit</BigButton> : undefined}
              />
            ))}
          </div>
        )
      )}

      {/* New payroll run wizard */}
      <Modal open={wizardOpen} title="New payroll run" onClose={() => setWizardOpen(false)} wide>
        <Wizard
          steps={[
            {
              title: "Choose the month",
              valid: /^\d{4}-\d{2}$/.test(period),
              content: (
                <div className="space-y-5">
                  <BigInput label="Which month are we paying for?" type="month" required value={period} onChange={(e) => setPeriod(e.target.value)} />
                  <Card>
                    <p className="text-base text-ink-soft">
                      The draft pulls each person’s hours from approved attendance for {monthLabel(`${period}-01`)}, adds overtime per the
                      company rules, and applies their current salary structure. You can still change anything before submitting.
                    </p>
                  </Card>
                </div>
              ),
            },
            {
              title: "Review & create",
              valid: true,
              content: (
                <div className="space-y-5">
                  <p className="text-lg">
                    Creating a <strong>draft</strong> run for <strong>{monthLabel(`${period}-01`)}</strong> for{" "}
                    {(structures ?? []).filter((s) => s.is_current).length} people with salary structures.
                  </p>
                  <BigInput label="Notes for the approver (optional)" value={runNotes} onChange={(e) => setRunNotes(e.target.value)} />
                  <Card>
                    <p className="text-base text-ink-soft">The run starts in Draft — it is only approved and paid in the next steps.</p>
                  </Card>
                </div>
              ),
            },
          ]}
          submitLabel="Create draft run"
          submitting={busy}
          onSubmit={() => void generateRun()}
        />
      </Modal>

      {/* Run detail: payslips + payment tracking */}
      <Modal open={openRun !== null} title={openRun ? `Payslips — ${monthLabel(openRun.period_month)}` : ""} onClose={() => setOpenRun(null)} wide>
        <div className="space-y-4">
          {openRun && (
            <div className="flex items-center gap-3 flex-wrap">
              <StatusBadge status={openRun.status} />
              <p className="text-lg">
                {money(openRun.total_net)} net for {(payslips ?? []).length} people
                {openRun.status === "paid" && openRun.paid_at ? ` · closed ${new Date(openRun.paid_at).toLocaleDateString()}` : ""}
              </p>
            </div>
          )}
          {(payslips ?? []).length === 0 ? (
            <p className="text-lg text-ink-soft">No payslips in this run yet.</p>
          ) : (
            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
              {(payslips ?? []).map((p) => (
                <RowCard
                  key={p.id}
                  title={p.employee_name ?? "Employee"}
                  subtitle={
                    <>
                      <span className="block">
                        {Number(p.hours_worked).toFixed(1)} h ({Number(p.overtime_hours).toFixed(1)} overtime = {money(p.overtime_amount)}) ·
                        allowances {money(p.allowances_amount)} · deductions {money(p.deductions_amount)}
                      </span>
                      <span className="block font-semibold">Take home {money(p.net)}</span>
                      {p.payment_status === "paid" && (
                        <span className="block text-success-800">
                          Paid {p.paid_at ?? ""}{p.payment_method ? ` · ${p.payment_method}` : ""}{p.payment_reference ? ` · ref ${p.payment_reference}` : ""}
                        </span>
                      )}
                    </>
                  }
                  badge={p.payment_status === "paid" ? <StatusBadge status="paid" /> : <span className="px-3 py-1 rounded-full bg-warning-100 text-warning-800 text-base font-semibold">Not yet paid</span>}
                  actions={
                    openRun && openRun.status === "approved" && p.payment_status !== "paid" && canManage ? (
                      <BigButton size="md" variant="success" onClick={() => { setPaying(p); setPay({ method: "Bank transfer", reference: "", paid_at: new Date().toISOString().slice(0, 10) }); setError(null); }}>
                        Mark paid
                      </BigButton>
                    ) : undefined
                  }
                />
              ))}
            </div>
          )}
          <p className="text-base text-ink-soft">Payslip PDF downloads arrive with the PDF export module (Phase 4).</p>
        </div>
      </Modal>

      {/* Mark payslip paid */}
      <Modal open={paying !== null} title={`Record payment for ${paying?.employee_name ?? "employee"}`} onClose={() => setPaying(null)}>
        <div className="space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <BigSelect
              label="How was it paid?"
              value={pay.method}
              onChange={(e) => setPay({ ...pay, method: e.target.value })}
              options={["Bank transfer", "Cash", "Cheque"].map((m) => ({ value: m, label: m }))}
            />
            <BigInput label="Date paid" type="date" value={pay.paid_at} onChange={(e) => setPay({ ...pay, paid_at: e.target.value })} />
          </div>
          <BigInput label="Transfer / receipt reference (optional)" value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} />
          {error && <p className="text-lg text-danger-800">{error}</p>}
          <div className="flex justify-end gap-3">
            <BigButton variant="secondary" onClick={() => setPaying(null)}>Cancel</BigButton>
            <BigButton variant="success" onClick={() => void markPaid()}>Save payment</BigButton>
          </div>
        </div>
      </Modal>

      {/* Salary structure editor */}
      <Modal open={structOpen} title={editing ? `Salary — ${editing.employee_name ?? "employee"}` : "New salary structure"} onClose={() => setStructOpen(false)} wide>
        <div className="space-y-5">
          {editing ? (
            <p className="text-lg">{editing.employee_name} · {statusLabel(editing.employee_role ?? "")}</p>
          ) : (
            <BigSelect
              label="Which employee?"
              required
              value={form.employee_id}
              onChange={(e) => setForm({ ...form, employee_id: e.target.value })}
              options={[{ value: "", label: "Choose an employee…" }, ...employeesAsOptions(employees ?? [], structures ?? [])]}
            />
          )}
          <div className="grid gap-5 sm:grid-cols-3">
            <BigInput label="Base salary (₦ / month)" type="number" required value={form.base_salary} onChange={(e) => setForm({ ...form, base_salary: e.target.value })} />
            <BigSelect label="Pay cycle" value={form.pay_cycle} onChange={(e) => setForm({ ...form, pay_cycle: e.target.value })} options={["monthly", "biweekly", "weekly"].map((c) => ({ value: c, label: c }))} />
            <BigInput label="Effective from" type="date" value={form.effective_from} onChange={(e) => setForm({ ...form, effective_from: e.target.value })} />
          </div>

          <Card>
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold text-brand-950">Allowances</h3>
              <BigButton size="md" variant="secondary" onClick={() => setForm({ ...form, allowances: [...form.allowances, { name: "", amount: "" }] })}>+ Add allowance</BigButton>
            </div>
            <div className="mt-3 space-y-3">
              {form.allowances.map((a, i) => (
                <div key={i} className="flex gap-3 items-end flex-wrap">
                  <div className="flex-1 min-w-48"><BigInput label="Name" value={a.name} onChange={(e) => setForm({ ...form, allowances: form.allowances.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} /></div>
                  <div className="w-48"><BigInput label="Amount (₦)" type="number" value={a.amount} onChange={(e) => setForm({ ...form, allowances: form.allowances.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)) })} /></div>
                  <BigButton size="md" variant="ghost" onClick={() => setForm({ ...form, allowances: form.allowances.filter((_, j) => j !== i) })}>Remove</BigButton>
                </div>
              ))}
              {form.allowances.length === 0 && <p className="text-base text-ink-soft">No allowances — every pay adds up from base only.</p>}
            </div>
          </Card>

          <Card>
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold text-brand-950">Deductions</h3>
              <BigButton size="md" variant="secondary" onClick={() => setForm({ ...form, deductions: [...form.deductions, { name: "", mode: "amount", value: "" }] })}>+ Add deduction</BigButton>
            </div>
            <div className="mt-3 space-y-3">
              {form.deductions.map((d, i) => (
                <div key={i} className="flex gap-3 items-end flex-wrap">
                  <div className="flex-1 min-w-48"><BigInput label="Name" value={d.name} onChange={(e) => setForm({ ...form, deductions: form.deductions.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} /></div>
                  <div className="w-40"><BigSelect
                    label="Type"
                    value={d.mode}
                    onChange={(e) => setForm({ ...form, deductions: form.deductions.map((x, j) => (j === i ? { ...x, mode: e.target.value as "amount" | "percent" } : x)) })}
                    options={[{ value: "amount", label: "Fixed ₦" }, { value: "percent", label: "% of base" }]}
                  /></div>
                  <div className="w-40"><BigInput label="Value" type="number" value={d.value} onChange={(e) => setForm({ ...form, deductions: form.deductions.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })} /></div>
                  <BigButton size="md" variant="ghost" onClick={() => setForm({ ...form, deductions: form.deductions.filter((_, j) => j !== i) })}>Remove</BigButton>
                </div>
              ))}
              {form.deductions.length === 0 && <p className="text-base text-ink-soft">No deductions recorded.</p>}
            </div>
          </Card>

          {error && <p className="text-lg text-danger-800">{error}</p>}
          <div className="flex justify-end gap-3">
            <BigButton variant="secondary" onClick={() => setStructOpen(false)}>Cancel</BigButton>
            <BigButton variant="success" disabled={busy} onClick={() => void saveStructure()}>{busy ? "Saving…" : editing ? "Save changes" : "Save structure"}</BigButton>
          </div>
          <Card>
            <p className="text-base text-ink-soft">
              Saving a new structure for someone who already has one replaces it from the effective date — old runs keep the old figures.
            </p>
          </Card>
        </div>
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        title={`Delete the ${deleting ? monthLabel(deleting.period_month) : ""} draft?`}
        message="This removes the draft run and all its draft payslips. Approved or paid runs can never be deleted."
        confirmWord="DELETE"
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={() => void deleteRun()}
      />
    </div>
  );
}

function employeesAsOptions(employees: EmployeeMini[], structures: StructRow[]) {
  const current = new Set(structures.filter((s) => s.is_current).map((s) => s.employee_id));
  return employees
    .filter((e) => e.role !== "auditor")
    .map((e) => ({ value: e.id, label: current.has(e.id) ? `${e.full_name} (has a structure — will be replaced)` : e.full_name }));
}
