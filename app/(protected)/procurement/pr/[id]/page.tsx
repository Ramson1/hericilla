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
  RowCard,
  StatusBadge,
  Modal,
  Skeleton,
  HintCard,
} from "@hericilla/ui";
import { getSupabase } from "@hericilla/supabase-clients";
import { statusLabel } from "@hericilla/types";
import { useAuth } from "@/lib/auth";
import { money } from "@/lib/data";

type PrItem = { id: string; material: string; quantity: number; unit: string; estimated_unit_cost: number };
type SupQuote = { id: string; supplier_id: string; total_amount: number; lead_time_days: number | null; valid_until: string | null; is_selected: boolean; supplier_name?: string };
type PR = {
  id: string;
  ref_no: string;
  description: string | null;
  estimated_cost: number | null;
  need_by_date: string | null;
  status: string;
  required_approver_role: string;
  work_order_id: string | null;
  client_id: string | null;
  requested_by: string | null;
};

export default function PurchaseRequestPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { profile } = useAuth();

  const [quoteOpen, setQuoteOpen] = useState(false);
  const [quote, setQuote] = useState({ supplier_id: "", total_amount: "", lead_time_days: "", valid_until: "" });
  const [quoteBusy, setQuoteBusy] = useState(false);

  const { data: pr, isPending } = useQuery({
    queryKey: ["pr", id],
    queryFn: async () => {
      const { data, error } = await getSupabase().from("hericilla_purchase_requests").select("*").eq("id", id).single();
      if (error) throw error;
      return data as PR;
    },
  });

  const { data: items } = useQuery({
    queryKey: ["pr-items", id],
    queryFn: async () => {
      const { data } = await getSupabase().from("hericilla_purchase_request_items").select("*").eq("purchase_request_id", id);
      return (data as PrItem[]) ?? [];
    },
  });

  const { data: quotes } = useQuery({
    queryKey: ["pr-quotes", id],
    queryFn: async () => {
      const { data } = await getSupabase().from("hericilla_supplier_quotations").select("*").eq("purchase_request_id", id).order("total_amount");
      return (data as SupQuote[]) ?? [];
    },
  });

  const { data: suppliers } = useQuery({
    queryKey: ["approved-suppliers"],
    queryFn: async () => {
      const { data } = await getSupabase().from("hericilla_suppliers").select("id, name").eq("status", "approved").is("deleted_at", null).order("name");
      return (data as { id: string; name: string }[]) ?? [];
    },
    enabled: quoteOpen,
  });

  const canApprove =
    !!profile &&
    pr?.status === "pending_approval" &&
    profile.role === pr?.required_approver_role &&
    pr?.requested_by !== profile.id;

  async function submitForApproval() {
    await getSupabase().from("hericilla_purchase_requests").update({ status: "pending_approval" }).eq("id", id);
    await getSupabase().from("hericilla_approvals").insert({
      entity_type: "purchase_request",
      entity_id: id,
      required_role: pr?.required_approver_role ?? "admin",
      requested_by: profile?.id,
      status: "pending",
    });
    void qc.invalidateQueries({ queryKey: ["pr", id] });
  }

  async function decide(approved: boolean) {
    await getSupabase().from("hericilla_approvals").update({ status: approved ? "approved" : "rejected", decided_by: profile?.id, decided_at: new Date().toISOString() }).eq("entity_type", "purchase_request").eq("entity_id", id);
    await getSupabase().from("hericilla_purchase_requests").update({ status: approved ? "approved" : "rejected" }).eq("id", id);
    void qc.invalidateQueries({ queryKey: ["pr", id] });
  }

  async function addQuote() {
    if (!quote.supplier_id || !Number(quote.total_amount)) return;
    setQuoteBusy(true);
    await getSupabase().from("hericilla_supplier_quotations").insert({
      purchase_request_id: id,
      supplier_id: quote.supplier_id,
      total_amount: Number(quote.total_amount),
      lead_time_days: quote.lead_time_days ? Number(quote.lead_time_days) : null,
      valid_until: quote.valid_until || null,
    });
    setQuoteBusy(false);
    setQuoteOpen(false);
    setQuote({ supplier_id: "", total_amount: "", lead_time_days: "", valid_until: "" });
    void qc.invalidateQueries({ queryKey: ["pr-quotes", id] });
  }

  async function selectQuote(q: SupQuote) {
    await getSupabase().from("hericilla_supplier_quotations").update({ is_selected: false }).eq("purchase_request_id", id);
    await getSupabase().from("hericilla_supplier_quotations").update({ is_selected: true }).eq("id", q.id);
    void qc.invalidateQueries({ queryKey: ["pr-quotes", id] });
  }

  async function createPo() {
    const chosen = (quotes ?? []).find((q) => q.is_selected);
    if (!chosen) return;
    const { data: po, error } = await getSupabase()
      .from("hericilla_purchase_orders")
      .insert({
        purchase_request_id: id,
        supplier_id: chosen.supplier_id,
        client_id: pr?.client_id,
        work_order_id: pr?.work_order_id,
        status: "draft",
        created_by: profile?.id,
      })
      .select("id")
      .single();
    if (error || !po) return;
    const src = (items ?? []).map((i) => ({
      purchase_order_id: po.id,
      material: i.material,
      quantity: i.quantity,
      unit: i.unit,
      unit_cost: i.estimated_unit_cost,
      tax: 0,
    }));
    if (src.length) await getSupabase().from("hericilla_po_items").insert(src);
    await getSupabase().from("hericilla_purchase_requests").update({ status: "ordered" }).eq("id", id);
    void qc.invalidateQueries({ queryKey: ["purchase-orders"] });
    router.push(`/procurement/po/${po.id}`);
  }

  if (isPending || !pr) return <div className="space-y-4"><Skeleton className="h-12 w-72" /><Skeleton className="h-48" /></div>;

  const statusSteps = ["draft", "submitted", "quoting", "pending_approval", "approved", "ordered", "received", "closed"];

  return (
    <div>
      <PageHeader
        title={`${pr.ref_no}`}
        purpose={pr.description || "Purchase request detail — add supplier quotes, get approval, then raise the order."}
        actions={<BigButton variant="secondary" onClick={() => router.push("/procurement")}>← Procurement</BigButton>}
      />
      <HintCard
        steps={[
          "Add each supplier’s price, then choose the best one.",
          `An approver with the “${statusLabel(pr.required_approver_role)}” role must approve before ordering.`,
          "After approval, “Create purchase order” copies the list into a PO.",
        ]}
      />

      <Card className="mt-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <StatusBadge status={pr.status} />
          <p className="text-base">Estimated total: <strong>{money(pr.estimated_cost ?? 0)}</strong></p>
        </div>
        <div className="mt-3 flex flex-wrap gap-1 text-base text-ink-soft">
          {statusSteps.map((s, i) => (
            <span key={s} className={pr.status === s ? "font-bold text-brand-800" : ""}>
              {statusLabel(s)}{i < statusSteps.length - 1 ? " →" : ""}
            </span>
          ))}
        </div>
        <dl className="mt-3 grid gap-2 sm:grid-cols-2 text-base">
          <div><dt className="text-ink-soft">Needed by</dt><dd className="font-semibold">{pr.need_by_date ? new Date(pr.need_by_date).toLocaleDateString() : "—"}</dd></div>
          <div><dt className="text-ink-soft">Approver needed</dt><dd className="font-semibold">{statusLabel(pr.required_approver_role)}</dd></div>
        </dl>
      </Card>

      {/* Items */}
      <Card className="mt-6">
        <h2 className="text-lg font-bold text-brand-950">What we need to buy</h2>
        <div className="mt-3 space-y-2">
          {(items ?? []).map((it) => (
            <div key={it.id} className="flex justify-between text-base border-b border-[var(--color-line)] last:border-0 py-2">
              <span>{it.material}</span>
              <span className="text-ink-soft">{Number(it.quantity)} {it.unit} × {money(it.estimated_unit_cost)}</span>
            </div>
          ))}
          {(items ?? []).length === 0 && <p className="text-base text-ink-soft">No lines recorded.</p>}
        </div>
      </Card>

      {/* Supplier quotes */}
      <Card className="mt-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-brand-950">Supplier quotations</h2>
          <BigButton size="md" onClick={() => setQuoteOpen(true)}>+ Add quote</BigButton>
        </div>
        <div className="mt-3 space-y-3">
          {(quotes ?? []).length === 0 && <p className="text-base text-ink-soft">No quotes yet. Add what each supplier charges so you can compare.</p>}
          {(quotes ?? []).map((q) => (
            <RowCard
              key={q.id}
              title={suppliers?.find((s) => s.id === q.supplier_id)?.name ?? "Supplier"}
              subtitle={`${money(q.total_amount)}${q.lead_time_days ? ` · ${q.lead_time_days}d lead` : ""}${q.valid_until ? ` · valid to ${new Date(q.valid_until).toLocaleDateString()}` : ""}`}
              badge={q.is_selected ? <StatusBadge status="approved" /> : undefined}
              actions={
                <BigButton size="md" variant={q.is_selected ? "secondary" : "success"} onClick={() => void selectQuote(q)}>
                  {q.is_selected ? "Chosen" : "Choose this"}
                </BigButton>
              }
            />
          ))}
        </div>
      </Card>

      {/* Actions */}
      <div className="mt-6 flex flex-wrap gap-3">
        {pr.status === "draft" && (
          <BigButton variant="success" onClick={() => void submitForApproval()}>Submit for approval</BigButton>
        )}
        {canApprove && (
          <>
            <BigButton variant="success" onClick={() => void decide(true)}>Approve spend</BigButton>
            <BigButton variant="danger" onClick={() => void decide(false)}>Reject</BigButton>
          </>
        )}
        {pr.status === "approved" && (quotes ?? []).some((q) => q.is_selected) && (
          <BigButton variant="primary" onClick={() => void createPo()}>Create purchase order</BigButton>
        )}
        {pr.status === "approved" && !(quotes ?? []).some((q) => q.is_selected) && (
          <p className="text-base text-warning-800 self-center">Choose a supplier quote first, then you can create the order.</p>
        )}
      </div>

      <Modal open={quoteOpen} title="Add supplier quote" onClose={() => setQuoteOpen(false)}>
        <div className="space-y-5">
          <BigSelect
            label="Supplier"
            required
            value={quote.supplier_id}
            onChange={(e) => setQuote({ ...quote, supplier_id: e.target.value })}
            options={(suppliers ?? []).map((s) => ({ value: s.id, label: s.name }))}
          />
          <BigInput label="Total price (₦)" type="number" required value={quote.total_amount} onChange={(e) => setQuote({ ...quote, total_amount: e.target.value })} />
          <div className="grid gap-5 sm:grid-cols-2">
            <BigInput label="Lead time (days)" type="number" value={quote.lead_time_days} onChange={(e) => setQuote({ ...quote, lead_time_days: e.target.value })} />
            <BigInput label="Valid until" type="date" value={quote.valid_until} onChange={(e) => setQuote({ ...quote, valid_until: e.target.value })} />
          </div>
          <div className="flex justify-end gap-3">
            <BigButton variant="secondary" onClick={() => setQuoteOpen(false)}>Cancel</BigButton>
            <BigButton variant="success" onClick={() => void addQuote()} disabled={quoteBusy}>{quoteBusy ? "Saving…" : "Add quote"}</BigButton>
          </div>
        </div>
      </Modal>
    </div>
  );
}
