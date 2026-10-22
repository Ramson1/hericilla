"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  PageHeader,
  HintCard,
  BigButton,
  BigInput,
  BigSelect,
  RowCard,
  StatusBadge,
  Modal,
  Skeleton,
  EmptyState,
  StatCard,
  Wizard,
} from "@hericilla/ui";
import { getSupabase } from "@hericilla/supabase-clients";
import { useAuth } from "@/lib/auth";
import { money } from "@/lib/data";

type Invoice = {
  id: string;
  ref_no: string;
  issue_date: string;
  due_date: string | null;
  total: number;
  amount_paid: number;
  status: string;
  client_name: string | null;
};
type Expense = {
  id: string;
  category: string;
  amount: number;
  description: string | null;
  occurred_at: string;
  status: string;
  submitter_name: string | null;
};

const FINANCE_ROLES = ["super_admin", "admin", "finance_officer"];

export default function MoneyPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { profile } = useAuth();
  const [tab, setTab] = useState<"invoices" | "expenses">("invoices");
  const [creating, setCreating] = useState(false);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({ client_id: "", work_order_id: "", due_date: "", tax_rate: "7.5", notes: "" });
  const [lines, setLines] = useState<{ description: string; quantity: string; unit_price: string }[]>([
    { description: "", quantity: "1", unit_price: "" },
  ]);
  const [expense, setExpense] = useState({ category: "operational", amount: "", description: "", occurred_at: "" });

  const isFinance = !!profile && FINANCE_ROLES.includes(profile.role);

  const { data: invoices, isPending } = useQuery({
    queryKey: ["invoices"],
    queryFn: async () => {
      const { data } = await getSupabase()
        .from("invoices")
        .select("*, clients(name)")
        .is("deleted_at", null)
        .order("issue_date", { ascending: false })
        .limit(300);
      const pick = <T,>(v: unknown): T | null => (v == null ? null : Array.isArray(v) ? ((v[0] as T) ?? null) : (v as T));
      return ((data as Invoice[]) ?? []).map((r) => ({
        ...r,
        client_name: pick<{ name: string }>((r as unknown as { clients: unknown }).clients)?.name ?? null,
      }));
    },
  });

  const { data: expenses } = useQuery({
    queryKey: ["expenses"],
    queryFn: async () => {
      const { data } = await getSupabase()
        .from("expenses")
        .select("*, submitter:profiles!expenses_submitted_by_fkey(full_name)")
        .order("occurred_at", { ascending: false })
        .limit(300);
      const pick = <T,>(v: unknown): T | null => (v == null ? null : Array.isArray(v) ? ((v[0] as T) ?? null) : (v as T));
      return ((data as Expense[]) ?? []).map((r) => ({
        ...r,
        submitter_name: pick<{ full_name: string }>((r as unknown as { submitter: unknown }).submitter)?.full_name ?? null,
      }));
    },
  });

  const { data: clients } = useQuery({
    queryKey: ["clients-mini"],
    queryFn: async () => {
      const { data } = await getSupabase().from("clients").select("id, name").is("deleted_at", null).order("name");
      return (data as { id: string; name: string }[]) ?? [];
    },
    enabled: creating || expenseOpen,
  });

  const { data: wos } = useQuery({
    queryKey: ["work-orders-mini"],
    queryFn: async () => {
      const { data } = await getSupabase()
        .from("work_orders")
        .select("id, wo_number")
        .in("status", ["completed", "invoiced", "closed", "in_progress"])
        .order("created_at", { ascending: false })
        .limit(200);
      return (data as { id: string; wo_number: string }[]) ?? [];
    },
    enabled: creating,
  });

  const outstanding = (invoices ?? [])
    .filter((i) => i.status !== "void")
    .reduce((s, i) => s + (Number(i.total) - Number(i.amount_paid)), 0);
  const overdueCount = (invoices ?? []).filter((i) => i.status === "overdue" || (i.status === "sent" && i.due_date && new Date(i.due_date) < new Date())).length;
  const pendingExpenses = (expenses ?? []).filter((e) => e.status === "pending").length;

  const goodLines = lines.filter((l) => l.description.trim() && Number(l.unit_price) >= 0);
  const lineTotal = goodLines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unit_price) || 0), 0);
  const grossTotal = lineTotal * (1 + (Number(form.tax_rate) || 0) / 100);

  async function createInvoice() {
    if (!form.client_id) {
      setError("Pick the client being billed.");
      return;
    }
    if (goodLines.length === 0) {
      setError("Add at least one billing line.");
      return;
    }
    setBusy(true);
    setError(null);
    const { data: inv, error: insErr } = await getSupabase()
      .from("invoices")
      .insert({
        client_id: form.client_id,
        work_order_id: form.work_order_id || null,
        due_date: form.due_date || null,
        tax_rate: Number(form.tax_rate) || 0,
        notes: form.notes || null,
        status: "draft",
        created_by: profile?.id,
      })
      .select("id")
      .single();
    if (insErr || !inv) {
      setBusy(false);
      setError("Could not save: " + insErr?.message);
      return;
    }
    await getSupabase().from("invoice_items").insert(
      goodLines.map((l) => ({
        invoice_id: inv.id,
        description: l.description.trim(),
        quantity: Number(l.quantity) || 1,
        unit_price: Number(l.unit_price) || 0,
      })),
    );
    setBusy(false);
    setCreating(false);
    setForm({ client_id: "", work_order_id: "", due_date: "", tax_rate: "7.5", notes: "" });
    setLines([{ description: "", quantity: "1", unit_price: "" }]);
    void qc.invalidateQueries({ queryKey: ["invoices"] });
    router.push(`/money/invoice/${inv.id}`);
  }

  async function createExpense() {
    if (!(Number(expense.amount) > 0)) {
      setError("Enter the amount spent.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await getSupabase().from("expenses").insert({
      category: expense.category,
      amount: Number(expense.amount),
      description: expense.description || null,
      occurred_at: expense.occurred_at || new Date().toISOString().slice(0, 10),
      submitted_by: profile?.id,
    });
    setBusy(false);
    if (err) {
      setError("Could not save: " + err.message);
      return;
    }
    setExpenseOpen(false);
    setExpense({ category: "operational", amount: "", description: "", occurred_at: "" });
    void qc.invalidateQueries({ queryKey: ["expenses"] });
  }

  async function decideExpense(id: string, approved: boolean) {
    await getSupabase()
      .from("expenses")
      .update({ status: approved ? "approved" : "rejected", approved_by: profile?.id, approved_at: new Date().toISOString() })
      .eq("id", id);
    void qc.invalidateQueries({ queryKey: ["expenses"] });
  }

  return (
    <div>
      <PageHeader
        title="Finance & Billing"
        purpose="Money in and money out: invoices we sent to clients, payments received, and costs waiting for approval."
        actions={
          <div className="flex gap-3 flex-wrap">
            <BigButton variant="secondary" onClick={() => setExpenseOpen(true)}>+ Log expense</BigButton>
            {isFinance && <BigButton onClick={() => setCreating(true)}>+ New invoice</BigButton>}
          </div>
        }
      />
      <HintCard
        steps={[
          "Build an invoice from a finished work order, send it, then record payments as they arrive.",
          "Part-paid and overdue invoices update themselves — you never set those by hand.",
          "Costs (fuel, hires, materials) need a finance approval before they count.",
        ]}
      />

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Owed to us" value={money(outstanding)} tone={outstanding > 0 ? "warning" : "success"} />
        <StatCard label="Overdue invoices" value={String(overdueCount)} tone={overdueCount > 0 ? "danger" : "success"} />
        <StatCard label="Expenses waiting" value={String(pendingExpenses)} />
      </div>

      <div className="mt-6 flex gap-3">
        <BigButton variant={tab === "invoices" ? "primary" : "secondary"} size="md" onClick={() => setTab("invoices")}>
          Invoices ({invoices?.length ?? 0})
        </BigButton>
        <BigButton variant={tab === "expenses" ? "primary" : "secondary"} size="md" onClick={() => setTab("expenses")}>
          Expenses ({expenses?.length ?? 0})
        </BigButton>
      </div>

      {tab === "invoices" &&
        (isPending ? (
          <div className="mt-6 space-y-3"><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
        ) : (invoices ?? []).length === 0 ? (
          <div className="mt-6">
            <EmptyState title="No invoices yet" teach="When a job is done or a quotation approved, press “+ New invoice” to bill the client." />
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {(invoices ?? []).map((i) => (
              <RowCard
                key={i.id}
                title={`${i.ref_no} — ${i.client_name ?? "Client"}`}
                subtitle={`${money(i.total)}${i.amount_paid > 0 ? ` · ${money(i.amount_paid)} received` : ""}${i.due_date ? ` · due ${new Date(i.due_date).toLocaleDateString()}` : ""}`}
                badge={<StatusBadge status={i.status} />}
                onClick={() => router.push(`/money/invoice/${i.id}`)}
              />
            ))}
          </div>
        ))}

      {tab === "expenses" &&
        ((expenses ?? []).length === 0 ? (
          <div className="mt-6">
            <EmptyState title="No expenses logged" teach="Fuel, tolls, hires — press “+ Log expense” the day you spend it, with the receipt." />
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {(expenses ?? []).map((e) => (
              <RowCard
                key={e.id}
                title={`${money(e.amount)} — ${e.description || e.category.replace(/_/g, " ")}`}
                subtitle={`${new Date(e.occurred_at).toLocaleDateString()}${e.submitter_name ? ` · by ${e.submitter_name}` : ""}`}
                badge={<StatusBadge status={e.status === "pending" ? "pending" : e.status} />}
                actions={
                  isFinance && e.status === "pending" && e.submitter_name !== undefined ? (
                    <div className="flex gap-2">
                      <BigButton size="md" variant="success" onClick={() => void decideExpense(e.id, true)}>Approve</BigButton>
                      <BigButton size="md" variant="danger" onClick={() => void decideExpense(e.id, false)}>Reject</BigButton>
                    </div>
                  ) : undefined
                }
              />
            ))}
          </div>
        ))}

      <Modal open={creating} title="New invoice" onClose={() => { setCreating(false); setError(null); }} wide>
        <Wizard
          submitLabel="Save invoice"
          submitting={busy}
          onSubmit={() => void createInvoice()}
          steps={[
            {
              title: "Who and when",
              valid: !!form.client_id,
              content: (
                <div className="space-y-5">
                  <BigSelect
                    label="Client being billed"
                    required
                    value={form.client_id}
                    onChange={(e) => setForm({ ...form, client_id: e.target.value })}
                    options={[{ value: "", label: "Choose a client…" }, ...(clients ?? []).map((c) => ({ value: c.id, label: c.name }))]}
                  />
                  <BigSelect
                    label="For which work order (optional)"
                    value={form.work_order_id}
                    onChange={(e) => setForm({ ...form, work_order_id: e.target.value })}
                    options={[{ value: "", label: "Not tied to one job" }, ...(wos ?? []).map((w) => ({ value: w.id, label: w.wo_number }))]}
                  />
                  <div className="grid gap-5 sm:grid-cols-2">
                    <BigInput label="Payment due by (optional)" type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
                    <BigInput label="Tax rate (%)" type="number" value={form.tax_rate} onChange={(e) => setForm({ ...form, tax_rate: e.target.value })} />
                  </div>
                </div>
              ),
            },
            {
              title: "What you are charging for",
              valid: goodLines.length > 0,
              content: (
                <div className="space-y-5">
                  {lines.map((l, idx) => (
                    <div key={idx} className="grid gap-3 sm:grid-cols-[1fr_90px_140px_48px] items-end">
                      <BigInput label={idx === 0 ? "Line description" : " "} value={l.description} onChange={(e) => setLines(lines.map((x, i) => (i === idx ? { ...x, description: e.target.value } : x)))} />
                      <BigInput label={idx === 0 ? "Qty" : " "} type="number" value={l.quantity} onChange={(e) => setLines(lines.map((x, i) => (i === idx ? { ...x, quantity: e.target.value } : x)))} />
                      <BigInput label={idx === 0 ? "Unit price (₦)" : " "} type="number" value={l.unit_price} onChange={(e) => setLines(lines.map((x, i) => (i === idx ? { ...x, unit_price: e.target.value } : x)))} />
                      <BigButton size="md" variant="ghost" className="mb-1 text-danger-800" onClick={() => setLines(lines.length === 1 ? lines : lines.filter((_, i) => i !== idx))}>✕</BigButton>
                    </div>
                  ))}
                  <BigButton size="md" variant="secondary" onClick={() => setLines([...lines, { description: "", quantity: "1", unit_price: "" }])}>+ Add line</BigButton>
                  <div className="text-lg space-y-1">
                    <p>Subtotal: <strong>{money(lineTotal)}</strong></p>
                    <p>With {form.tax_rate}% tax: <strong>{money(grossTotal)}</strong></p>
                    <p className="text-base text-ink-soft">The invoice recalculates itself when you save — these figures are a preview.</p>
                  </div>
                </div>
              ),
            },
            {
              title: "Notes & finish",
              content: (
                <div className="space-y-5">
                  <BigInput label="Notes on the invoice (optional)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                  <p className="text-lg">The invoice saves as a draft — open it and press “Send to client” when ready.</p>
                  {error && <p className="text-lg text-danger-800">{error}</p>}
                </div>
              ),
            },
          ]}
        />
      </Modal>

      <Modal open={expenseOpen} title="Log an expense" onClose={() => { setExpenseOpen(false); setError(null); }}>
        <div className="space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <BigSelect
              label="What kind of cost?"
              value={expense.category}
              onChange={(e) => setExpense({ ...expense, category: e.target.value })}
              options={[
                { value: "operational", label: "Operational (day-to-day)" },
                { value: "job_cost", label: "Job cost (for a specific work)" },
                { value: "supplier_payment", label: "Supplier payment" },
              ]}
            />
            <BigInput label="Amount (₦)" required type="number" value={expense.amount} onChange={(e) => setExpense({ ...expense, amount: e.target.value })} />
          </div>
          <BigInput label="What was it for?" value={expense.description} onChange={(e) => setExpense({ ...expense, description: e.target.value })} />
          <BigInput label="Date spent" type="date" value={expense.occurred_at} onChange={(e) => setExpense({ ...expense, occurred_at: e.target.value })} />
          {error && <p className="text-lg text-danger-800">{error}</p>}
          <div className="flex justify-end gap-3">
            <BigButton variant="secondary" onClick={() => setExpenseOpen(false)}>Cancel</BigButton>
            <BigButton variant="success" disabled={busy} onClick={() => void createExpense()}>{busy ? "Saving…" : "Save expense"}</BigButton>
          </div>
        </div>
      </Modal>
    </div>
  );
}
