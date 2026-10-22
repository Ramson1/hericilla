"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  PageHeader,
  BigButton,
  BigInput,
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

type PoItem = { id: string; material: string; quantity: number; unit: string; unit_cost: number; tax: number; line_total: number };
type PO = {
  id: string;
  ref_no: string;
  supplier_id: string;
  total_amount: number;
  tax_amount: number;
  status: string;
  expected_delivery_date: string | null;
  work_order_id: string | null;
};

export default function PurchaseOrderPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { profile } = useAuth();
  const [grnOpen, setGrnOpen] = useState(false);
  const [grn, setGrn] = useState({ condition_ok: "yes", notes: "" });
  const [busy, setBusy] = useState(false);

  const { data: po, isPending } = useQuery({
    queryKey: ["po", id],
    queryFn: async () => {
      const { data, error } = await getSupabase().from("purchase_orders").select("*").eq("id", id).single();
      if (error) throw error;
      return data as PO;
    },
  });

  const { data: items } = useQuery({
    queryKey: ["po-items", id],
    queryFn: async () => {
      const { data } = await getSupabase().from("po_items").select("*").eq("purchase_order_id", id);
      return (data as PoItem[]) ?? [];
    },
  });

  const { data: supplier } = useQuery({
    queryKey: ["po-supplier", po?.supplier_id],
    queryFn: async () => {
      const { data } = await getSupabase().from("suppliers").select("id, name, phone, payment_terms").eq("id", po!.supplier_id).single();
      return data as { id: string; name: string; phone: string | null; payment_terms: string | null } | null;
    },
    enabled: !!po?.supplier_id,
  });

  async function updateItem(itemId: string, patch: Partial<PoItem>) {
    await getSupabase().from("po_items").update(patch).eq("id", itemId);
    void qc.invalidateQueries({ queryKey: ["po-items", id] });
    void qc.invalidateQueries({ queryKey: ["po", id] });
  }

  async function setStatus(status: string) {
    setBusy(true);
    await getSupabase().from("purchase_orders").update({ status }).eq("id", id);
    setBusy(false);
    void qc.invalidateQueries({ queryKey: ["po", id] });
    void qc.invalidateQueries({ queryKey: ["purchase-orders"] });
  }

  async function recordGrn() {
    setBusy(true);
    await getSupabase().from("goods_received_notes").insert({
      purchase_order_id: id,
      verified_by: profile?.id,
      condition_ok: grn.condition_ok === "yes",
      notes: grn.notes || null,
    });
    await getSupabase().from("purchase_orders").update({ status: "received" }).eq("id", id);
    // Reflect delivery on the supplier’s score (simple running average toward 5 or 2).
    if (supplier) {
      const bump = grn.condition_ok === "yes" ? 5 : 2;
      const cur = supplier ? Number(await scoreOf(supplier.id)) : 0;
      const next = Math.min(5, Math.max(0, (cur * 0.8 + bump * 0.2)));
      await getSupabase().from("suppliers").update({ delivery_score: next }).eq("id", supplier.id);
    }
    setBusy(false);
    setGrnOpen(false);
    void qc.invalidateQueries({ queryKey: ["po", id] });
  }

  async function scoreOf(supplierId: string) {
    const { data } = await getSupabase().from("suppliers").select("delivery_score").eq("id", supplierId).single();
    return (data as { delivery_score: number })?.delivery_score ?? 0;
  }

  if (isPending || !po) return <div className="space-y-4"><Skeleton className="h-12 w-72" /><Skeleton className="h-48" /></div>;

  const grand = (items ?? []).reduce((s, i) => s + Number(i.line_total), 0);

  return (
    <div>
      <PageHeader
        title={po.ref_no}
        purpose={`Order to ${supplier?.name ?? "the supplier"}. Check the lines, send it, then record what arrived.`}
        actions={<BigButton variant="secondary" onClick={() => router.push("/procurement")}>← Procurement</BigButton>}
      />
      <HintCard
        steps={[
          "Fix any unit costs before sending — the total updates itself.",
          "Press “Send to supplier” once it is correct.",
          "When goods arrive, press “Goods received” so stock and scores update.",
        ]}
      />

      <Card className="mt-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <StatusBadge status={po.status} />
          <p className="text-lg font-bold">Total: {money(grand)}</p>
        </div>
        <p className="mt-2 text-lg text-ink-soft">
          {supplier?.name}{supplier?.phone ? ` · ${supplier.phone}` : ""}{po.expected_delivery_date ? ` · expected ${new Date(po.expected_delivery_date).toLocaleDateString()}` : ""}
        </p>

        <div className="mt-4 space-y-2">
          {(items ?? []).map((it) => (
            <div key={it.id} className="grid gap-2 sm:grid-cols-[1fr_90px_140px_auto] items-end">
              <div>
                <p className="text-lg font-semibold">{it.material}</p>
                <p className="text-base text-ink-soft">{Number(it.quantity)} {it.unit} · line {money(it.line_total)}</p>
              </div>
              <div />
              <BigInput
                label="Unit cost (₦)"
                type="number"
                defaultValue={it.unit_cost}
                onBlur={(e) => Number(e.target.value) !== it.unit_cost && void updateItem(it.id, { unit_cost: Number(e.target.value) })}
              />
            </div>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          {po.status === "draft" && <BigButton variant="success" disabled={busy} onClick={() => void setStatus("sent")}>Send to supplier</BigButton>}
          {["sent", "partial"].includes(po.status) && <BigButton variant="primary" disabled={busy} onClick={() => setGrnOpen(true)}>Goods received</BigButton>}
          {po.status === "received" && <BigButton variant="secondary" disabled={busy} onClick={() => void setStatus("closed")}>Close order</BigButton>}
          {po.work_order_id && (
            <BigButton variant="ghost" onClick={() => router.push(`/jobs/${po.work_order_id}`)}>Open linked job</BigButton>
          )}
        </div>
        <p className="mt-3 text-base text-ink-soft">Status can also be set to: {["draft", "sent", "partial", "received", "closed"].map(statusLabel).join(" · ")}</p>
      </Card>

      <Modal open={grnOpen} title="Record goods received" onClose={() => setGrnOpen(false)}>
        <div className="space-y-5">
          <p className="text-lg">Did everything arrive in good condition?</p>
          <div className="grid gap-5 sm:grid-cols-2">
            <BigInput label="Condition" value={grn.condition_ok === "yes" ? "All good" : "Issues"} onChange={() => undefined} />
            <BigInput label="Notes" value={grn.notes} onChange={(e) => setGrn({ ...grn, notes: e.target.value })} />
          </div>
          <div className="flex gap-3">
            <BigButton variant={grn.condition_ok === "yes" ? "success" : "secondary"} onClick={() => setGrn({ ...grn, condition_ok: "yes" })}>All arrived fine</BigButton>
            <BigButton variant={grn.condition_ok === "no" ? "danger" : "secondary"} onClick={() => setGrn({ ...grn, condition_ok: "no" })}>Something wrong</BigButton>
          </div>
          <div className="flex justify-end gap-3">
            <BigButton variant="secondary" onClick={() => setGrnOpen(false)}>Cancel</BigButton>
            <BigButton variant="success" disabled={busy} onClick={() => void recordGrn()}>{busy ? "Saving…" : "Save receipt"}</BigButton>
          </div>
        </div>
      </Modal>
    </div>
  );
}
