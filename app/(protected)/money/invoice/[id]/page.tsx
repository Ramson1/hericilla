"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  PageHeader,
  BigButton,
  BigInput,
  BigSelect,
  Card,
  StatusBadge,
  Modal,
  Skeleton,
  HintCard,
} from "@hericilla/ui";
import { getSupabase } from "@hericilla/supabase-clients";
import { statusLabel } from "@hericilla/types";
import { useAuth } from "@/lib/auth";
import { money } from "@/lib/data";

type Invoice = {
  id: string;
  ref_no: string;
  issue_date: string;
  due_date: string | null;
  subtotal: number;
  tax_rate: number;
  total: number;
  amount_paid: number;
  status: string;
  notes: string | null;
  work_order_id: string | null;
  client_name: string | null;
};
type InvItem = { id: string; description: string; quantity: number; unit_price: number; amount: number };
type Payment = { id: string; amount: number; method: string; paid_at: string; reference: string | null };
type Adjustment = { id: number; kind: string; amount: number; reason: string; created_at: string };

const FINANCE_ROLES = ["super_admin", "admin", "finance_officer"];

export default function InvoicePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { profile } = useAuth();
  const [busy, setBusy] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [adjOpen, setAdjOpen] = useState(false);
  const [lineOpen, setLineOpen] = useState(false);
  const [pay, setPay] = useState({ amount: "", method: "transfer", reference: "", paid_at: "" });
  const [adj, setAdj] = useState({ kind: "discount", amount: "", reason: "" });
  const [line, setLine] = useState({ description: "", quantity: "1", unit_price: "" });
  const [error, setError] = useState<string | null>(null);

  const isFinance = !!profile && FINANCE_ROLES.includes(profile.role);

  const { data: invoice, isPending } = useQuery({
    queryKey: ["invoice", id],
    queryFn: async () => {
      const { data, error: err } = await getSupabase().from("hericilla_invoices").select("*, clients:hericilla_clients(name)").eq("id", id).single();
      if (err) throw err;
      const row = data as Omit<Invoice, "client_name"> & { clients?: unknown };
      const c = row.clients;
      const client = Array.isArray(c) ? c[0] : c;
      return { ...row, client_name: (client as { name: string } | null | undefined)?.name ?? null } as Invoice;
    },
  });

  const { data: items } = useQuery({
    queryKey: ["invoice-items", id],
    queryFn: async () => {
      const { data } = await getSupabase().from("hericilla_invoice_items").select("*").eq("invoice_id", id).order("id");
      return (data as InvItem[]) ?? [];
    },
  });

  const { data: payments } = useQuery({
    queryKey: ["invoice-payments", id],
    queryFn: async () => {
      const { data } = await getSupabase().from("hericilla_invoice_payments").select("*").eq("invoice_id", id).order("paid_at", { ascending: false });
      return (data as Payment[]) ?? [];
    },
  });

  const { data: adjustments } = useQuery({
    queryKey: ["invoice-adjustments", id],
    queryFn: async () => {
      const { data } = await getSupabase().from("hericilla_invoice_adjustments").select("*").eq("invoice_id", id).order("created_at", { ascending: false });
      return (data as Adjustment[]) ?? [];
    },
  });

  async function refresh() {
    void qc.invalidateQueries({ queryKey: ["invoice", id] });
    void qc.invalidateQueries({ queryKey: ["invoice-items", id] });
    void qc.invalidateQueries({ queryKey: ["invoice-payments", id] });
    void qc.invalidateQueries({ queryKey: ["invoice-adjustments", id] });
    void qc.invalidateQueries({ queryKey: ["invoices"] });
  }

  async function setStatus(status: string) {
    setBusy(true);
    await getSupabase().from("hericilla_invoices").update({ status }).eq("id", id);
    setBusy(false);
    refresh();
  }

  async function addLine() {
    if (!line.description.trim() || !(Number(line.unit_price) >= 0)) {
      setError("A line needs a description and a unit price.");
      return;
    }
    setBusy(true);
    setError(null);
    await getSupabase().from("hericilla_invoice_items").insert({
      invoice_id: id,
      description: line.description.trim(),
      quantity: Number(line.quantity) || 1,
      unit_price: Number(line.unit_price) || 0,
    });
    setBusy(false);
    setLineOpen(false);
    setLine({ description: "", quantity: "1", unit_price: "" });
    refresh();
  }

  async function removeLine(itemId: string) {
    await getSupabase().from("hericilla_invoice_items").delete().eq("id", itemId);
    refresh();
  }

  async function recordPayment() {
    if (!(Number(pay.amount) > 0)) {
      setError("Enter how much was received.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await getSupabase().from("hericilla_invoice_payments").insert({
      invoice_id: id,
      amount: Number(pay.amount),
      method: pay.method,
      reference: pay.reference || null,
      paid_at: pay.paid_at || new Date().toISOString().slice(0, 10),
      recorded_by: profile?.id,
    });
    setBusy(false);
    if (err) {
      setError("Could not save: " + err.message);
      return;
    }
    setPayOpen(false);
    setPay({ amount: "", method: "transfer", reference: "", paid_at: "" });
    refresh();
  }

  async function removePayment(pid: string) {
    await getSupabase().from("hericilla_invoice_payments").delete().eq("id", pid);
    refresh();
  }

  async function addAdjustment() {
    if (!adj.reason.trim() || !adj.amount.trim()) {
      setError("An adjustment needs an amount and a reason — it must be traceable.");
      return;
    }
    setBusy(true);
    setError(null);
    const signed = adj.kind === "discount" || adj.kind === "waiver" ? -Math.abs(Number(adj.amount)) : Number(adj.amount);
    const { error: err } = await getSupabase().from("hericilla_invoice_adjustments").insert({
      invoice_id: id,
      kind: adj.kind,
      amount: signed,
      reason: adj.reason.trim(),
      made_by: profile?.id,
    });
    setBusy(false);
    if (err) {
      setError("Could not save: " + err.message);
      return;
    }
    setAdjOpen(false);
    setAdj({ kind: "discount", amount: "", reason: "" });
    refresh();
  }

  if (isPending || !invoice) return <div className="space-y-4"><Skeleton className="h-12 w-72" /><Skeleton className="h-48" /></div>;

  const outstanding = Number(invoice.total) - Number(invoice.amount_paid);

  return (
    <div>
      <PageHeader
        title={invoice.ref_no}
        purpose={`Bill for ${invoice.client_name ?? "the client"}. Totals and status update themselves as you add lines and payments.`}
        actions={<BigButton variant="secondary" onClick={() => router.push("/money")}>← Finance</BigButton>}
      />
      {isFinance && (
        <HintCard
          steps={[
            "Check the lines, then press “Send to client”.",
            "Record each payment the day it arrives — the badge turns to “Partly paid” or “Paid” on its own.",
            "Never change a sent total by hand; use an adjustment so the reason is kept.",
          ]}
        />
      )}

      <Card className="mt-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <StatusBadge status={invoice.status} />
          <p className="text-base font-bold">Total: {money(invoice.total)}</p>
        </div>
        <dl className="mt-3 grid gap-2 sm:grid-cols-3 text-base">
          <div><dt className="text-ink-soft">Issued</dt><dd className="font-semibold">{new Date(invoice.issue_date).toLocaleDateString()}</dd></div>
          <div><dt className="text-ink-soft">Due by</dt><dd className="font-semibold">{invoice.due_date ? new Date(invoice.due_date).toLocaleDateString() : "—"}</dd></div>
          <div><dt className="text-ink-soft">Outstanding</dt><dd className={"font-bold " + (outstanding > 0 ? "text-danger-800" : "text-success-800")}>{money(outstanding)}</dd></div>
        </dl>
        {invoice.notes && <p className="mt-3 text-base rounded-xl bg-surface p-4">{invoice.notes}</p>}
        <div className="mt-5 flex flex-wrap gap-3">
          {isFinance && invoice.status === "draft" && <BigButton variant="success" disabled={busy} onClick={() => void setStatus("sent")}>Send to client</BigButton>}
          {isFinance && ["sent", "partial", "overdue"].includes(invoice.status) && <BigButton variant="primary" onClick={() => setPayOpen(true)}>Record payment</BigButton>}
          {isFinance && invoice.status !== "void" && invoice.status !== "paid" && <BigButton variant="ghost" className="text-danger-800" disabled={busy} onClick={() => void setStatus("void")}>Void invoice</BigButton>}
          {invoice.work_order_id && <BigButton variant="ghost" onClick={() => router.push(`/jobs/${invoice.work_order_id}`)}>Open linked job</BigButton>}
        </div>
      </Card>

      {/* Lines */}
      <Card className="mt-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-brand-950">Charges</h2>
          {isFinance && invoice.status === "draft" && <BigButton size="md" onClick={() => setLineOpen(true)}>+ Add line</BigButton>}
        </div>
        <div className="mt-3 space-y-2">
          {(items ?? []).length === 0 && <p className="text-base text-ink-soft">No lines yet.</p>}
          {(items ?? []).map((l) => (
            <div key={l.id} className="flex items-center justify-between gap-3 border-b border-[var(--color-line)] last:border-0 py-2">
              <div>
                <p className="text-base font-semibold">{l.description}</p>
                <p className="text-base text-ink-soft">{Number(l.quantity)} × {money(l.unit_price)}</p>
              </div>
              <div className="flex items-center gap-3">
                <p className="text-base font-bold">{money(l.amount)}</p>
                {isFinance && invoice.status === "draft" && (
                  <BigButton size="md" variant="ghost" className="text-danger-800" onClick={() => void removeLine(l.id)}>✕</BigButton>
                )}
              </div>
            </div>
          ))}
          <p className="text-base pt-2 text-right">Subtotal {money(invoice.subtotal)} + {invoice.tax_rate}% tax = <strong>{money(invoice.total)}</strong></p>
        </div>
      </Card>

      {/* Payments */}
      <Card className="mt-6">
        <h2 className="text-lg font-bold text-brand-950">Payments received</h2>
        <div className="mt-3 space-y-2">
          {(payments ?? []).length === 0 && <p className="text-base text-ink-soft">Nothing received yet.</p>}
          {(payments ?? []).map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-3 border-b border-[var(--color-line)] last:border-0 py-2">
              <div>
                <p className="text-base font-semibold">{money(p.amount)} — {statusLabel(p.method) || p.method}</p>
                <p className="text-base text-ink-soft">{new Date(p.paid_at).toLocaleDateString()}{p.reference ? ` · ref ${p.reference}` : ""}</p>
              </div>
              {isFinance && <BigButton size="md" variant="ghost" className="text-danger-800" onClick={() => void removePayment(p.id)}>Undo</BigButton>}
            </div>
          ))}
        </div>
      </Card>

      {/* Adjustments */}
      <Card className="mt-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-brand-950">Adjustments (traceable)</h2>
          {isFinance && <BigButton size="md" variant="secondary" onClick={() => setAdjOpen(true)}>+ Adjustment</BigButton>}
        </div>
        <div className="mt-3 space-y-2">
          {(adjustments ?? []).length === 0 && <p className="text-base text-ink-soft">No discounts, credits or corrections recorded.</p>}
          {(adjustments ?? []).map((a) => (
            <div key={a.id} className="border-b border-[var(--color-line)] last:border-0 py-2">
              <p className="text-base font-semibold">{statusLabel(a.kind) || a.kind}: {money(a.amount)}</p>
              <p className="text-base text-ink-soft">{a.reason} · {new Date(a.created_at).toLocaleDateString()}</p>
            </div>
          ))}
        </div>
      </Card>

      <Modal open={lineOpen} title="Add a charge line" onClose={() => { setLineOpen(false); setError(null); }}>
        <div className="space-y-5">
          <BigInput label="What are we charging for?" required value={line.description} onChange={(e) => setLine({ ...line, description: e.target.value })} />
          <div className="grid gap-5 sm:grid-cols-2">
            <BigInput label="Quantity" type="number" value={line.quantity} onChange={(e) => setLine({ ...line, quantity: e.target.value })} />
            <BigInput label="Unit price (₦)" required type="number" value={line.unit_price} onChange={(e) => setLine({ ...line, unit_price: e.target.value })} />
          </div>
          {error && <p className="text-base text-danger-800">{error}</p>}
          <div className="flex justify-end gap-3">
            <BigButton variant="secondary" onClick={() => setLineOpen(false)}>Cancel</BigButton>
            <BigButton variant="success" disabled={busy} onClick={() => void addLine()}>{busy ? "Saving…" : "Add line"}</BigButton>
          </div>
        </div>
      </Modal>

      <Modal open={payOpen} title="Record a payment" onClose={() => { setPayOpen(false); setError(null); }}>
        <div className="space-y-5">
          <p className="text-base">Outstanding on this invoice: <strong>{money(outstanding)}</strong></p>
          <div className="grid gap-5 sm:grid-cols-2">
            <BigInput label="Amount received (₦)" required type="number" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} />
            <BigSelect
              label="How was it paid?"
              value={pay.method}
              onChange={(e) => setPay({ ...pay, method: e.target.value })}
              options={["transfer", "cash", "cheque", "other"].map((m) => ({ value: m, label: m === "transfer" ? "Bank transfer" : m[0]!.toUpperCase() + m.slice(1) }))}
            />
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <BigInput label="Date received" type="date" value={pay.paid_at} onChange={(e) => setPay({ ...pay, paid_at: e.target.value })} />
            <BigInput label="Bank/reference no. (optional)" value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} />
          </div>
          {error && <p className="text-base text-danger-800">{error}</p>}
          <div className="flex justify-end gap-3">
            <BigButton variant="secondary" onClick={() => setPayOpen(false)}>Cancel</BigButton>
            <BigButton variant="success" disabled={busy} onClick={() => void recordPayment()}>{busy ? "Saving…" : "Save payment"}</BigButton>
          </div>
        </div>
      </Modal>

      <Modal open={adjOpen} title="Invoice adjustment" onClose={() => { setAdjOpen(false); setError(null); }}>
        <div className="space-y-5">
          <p className="text-base">Adjustments are permanent entries in a ledger — nothing is edited away. Discounts and waivers reduce the total.</p>
          <div className="grid gap-5 sm:grid-cols-2">
            <BigSelect
              label="Kind"
              value={adj.kind}
              onChange={(e) => setAdj({ ...adj, kind: e.target.value })}
              options={["discount", "credit_note", "correction", "waiver"].map((k) => ({ value: k, label: statusLabel(k) }))}
            />
            <BigInput label="Amount (₦)" required type="number" value={adj.amount} onChange={(e) => setAdj({ ...adj, amount: e.target.value })} />
          </div>
          <BigInput label="Reason (required)" required value={adj.reason} onChange={(e) => setAdj({ ...adj, reason: e.target.value })} />
          {error && <p className="text-base text-danger-800">{error}</p>}
          <div className="flex justify-end gap-3">
            <BigButton variant="secondary" onClick={() => setAdjOpen(false)}>Cancel</BigButton>
            <BigButton variant="success" disabled={busy} onClick={() => void addAdjustment()}>{busy ? "Saving…" : "Record adjustment"}</BigButton>
          </div>
        </div>
      </Modal>
    </div>
  );
}
