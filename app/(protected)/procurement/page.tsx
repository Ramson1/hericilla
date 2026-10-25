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
  Card,
  RowCard,
  StatusBadge,
  Modal,
  Skeleton,
  EmptyState,
  Wizard,
} from "@hericilla/ui";
import { getSupabase } from "@hericilla/supabase-clients";
import { useAuth } from "@/lib/auth";
import { money } from "@/lib/data";

type PR = {
  id: string;
  ref_no: string;
  description: string | null;
  estimated_cost: number | null;
  need_by_date: string | null;
  status: string;
  required_approver_role: string;
  created_at: string;
  client_name: string | null;
};
type PO = {
  id: string;
  ref_no: string;
  total_amount: number;
  status: string;
  expected_delivery_date: string | null;
  created_at: string;
  supplier_name: string | null;
};

export default function ProcurementPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { profile } = useAuth();
  const [tab, setTab] = useState<"requests" | "orders">("requests");
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ client_id: "", description: "", need_by_date: "", approver: "admin" });
  const [items, setItems] = useState<{ material: string; quantity: string; unit: string; estimated_unit_cost: string }[]>([
    { material: "", quantity: "1", unit: "pcs", estimated_unit_cost: "" },
  ]);

  const { data: prs, isPending: prPending } = useQuery({
    queryKey: ["purchase-requests"],
    queryFn: async () => {
      const { data } = await getSupabase()
        .from("hericilla_purchase_requests")
        .select("*, clients:hericilla_clients(name)")
        .order("created_at", { ascending: false })
        .limit(200);
      const pick = <T,>(v: unknown): T | null => (v == null ? null : Array.isArray(v) ? ((v[0] as T) ?? null) : (v as T));
      return ((data as PR[]) ?? []).map((r) => ({ ...r, client_name: pick<{ name: string }>((r as unknown as { clients: unknown }).clients)?.name ?? null }));
    },
  });

  const { data: pos, isPending: poPending } = useQuery({
    queryKey: ["purchase-orders"],
    queryFn: async () => {
      const { data } = await getSupabase()
        .from("hericilla_purchase_orders")
        .select("*, suppliers:hericilla_suppliers(name)")
        .order("created_at", { ascending: false })
        .limit(200);
      const pick = <T,>(v: unknown): T | null => (v == null ? null : Array.isArray(v) ? ((v[0] as T) ?? null) : (v as T));
      return ((data as PO[]) ?? []).map((r) => ({ ...r, supplier_name: pick<{ name: string }>((r as unknown as { suppliers: unknown }).suppliers)?.name ?? null }));
    },
  });

  const { data: clients } = useQuery({
    queryKey: ["clients-mini"],
    queryFn: async () => {
      const { data } = await getSupabase().from("hericilla_clients").select("id, name").is("deleted_at", null).order("name");
      return (data as { id: string; name: string }[]) ?? [];
    },
    enabled: creating,
  });

  const goodItems = items.filter((i) => i.material.trim() && Number(i.estimated_unit_cost) >= 0);
  const estTotal = goodItems.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.estimated_unit_cost) || 0), 0);

  async function createPr() {
    if (goodItems.length === 0) {
      setError("List at least one material with its cost.");
      return;
    }
    setBusy(true);
    setError(null);
    const { data: pr, error: err } = await getSupabase()
      .from("hericilla_purchase_requests")
      .insert({
        client_id: form.client_id || null,
        description: form.description || null,
        need_by_date: form.need_by_date || null,
        estimated_cost: estTotal,
        required_approver_role: form.approver,
        status: "draft",
        requested_by: profile?.id,
      })
      .select("id")
      .single();
    if (err || !pr) {
      setBusy(false);
      setError("Could not save: " + err?.message);
      return;
    }
    await getSupabase().from("hericilla_purchase_request_items").insert(
      goodItems.map((i) => ({
        purchase_request_id: pr.id,
        material: i.material.trim(),
        quantity: Number(i.quantity) || 1,
        unit: i.unit || "pcs",
        estimated_unit_cost: Number(i.estimated_unit_cost) || 0,
      })),
    );
    setBusy(false);
    setCreating(false);
    setForm({ client_id: "", description: "", need_by_date: "", approver: "admin" });
    setItems([{ material: "", quantity: "1", unit: "pcs", estimated_unit_cost: "" }]);
    void qc.invalidateQueries({ queryKey: ["purchase-requests"] });
  }

  return (
    <div>
      <PageHeader
        title="Procurement"
        purpose="Buying for jobs: raise a request, compare supplier quotes, get it approved, then issue the purchase order."
        actions={<BigButton onClick={() => setCreating(true)}>+ New purchase request</BigButton>}
      />
      <HintCard
        steps={[
          "A request lists what is needed and roughly what it will cost.",
          "Add supplier quotes on the request page and pick the best one.",
          "Once approved, turn it into a purchase order in one tap.",
        ]}
      />

      <div className="mt-6 flex gap-3">
        <BigButton variant={tab === "requests" ? "primary" : "secondary"} size="md" onClick={() => setTab("requests")}>
          Requests ({prs?.length ?? 0})
        </BigButton>
        <BigButton variant={tab === "orders" ? "primary" : "secondary"} size="md" onClick={() => setTab("orders")}>
          Purchase orders ({pos?.length ?? 0})
        </BigButton>
      </div>

      {tab === "requests" ? (
        prPending ? (
          <SkeletonList />
        ) : (prs ?? []).length === 0 ? (
          <div className="mt-6">
            <EmptyState title="No purchase requests" teach="When a job needs materials or a service bought in, press “+ New purchase request”." />
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {(prs ?? []).map((r) => (
              <RowCard
                key={r.id}
                title={`${r.ref_no} — ${r.description || "Purchase request"}`}
                subtitle={`${r.client_name ?? "Internal"} · ${r.estimated_cost ? money(r.estimated_cost) : "cost TBD"}`}
                badge={<StatusBadge status={r.status} />}
                onClick={() => router.push(`/procurement/pr/${r.id}`)}
              />
            ))}
          </div>
        )
      ) : poPending ? (
        <SkeletonList />
      ) : (pos ?? []).length === 0 ? (
        <div className="mt-6">
          <EmptyState title="No purchase orders yet" teach="Orders appear here after an approved request is turned into a PO." />
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {(pos ?? []).map((o) => (
            <RowCard
              key={o.id}
              title={`${o.ref_no} — ${o.supplier_name ?? "Supplier"}`}
              subtitle={`${money(o.total_amount)}${o.expected_delivery_date ? ` · due ${new Date(o.expected_delivery_date).toLocaleDateString()}` : ""}`}
              badge={<StatusBadge status={o.status} />}
              onClick={() => router.push(`/procurement/po/${o.id}`)}
            />
          ))}
        </div>
      )}

      <Modal open={creating} title="New purchase request" onClose={() => setCreating(false)} wide>
        <Wizard
          submitLabel="Save request"
          submitting={busy}
          onSubmit={() => void createPr()}
          steps={[
            {
              title: "What and when",
              valid: goodItems.length > 0,
              content: (
                <div className="space-y-5">
                  <BigInput label="Short reason / description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                  <div className="grid gap-5 sm:grid-cols-2">
                    <BigSelect
                      label="For which client (optional)"
                      value={form.client_id}
                      onChange={(e) => setForm({ ...form, client_id: e.target.value })}
                      options={(clients ?? []).map((c) => ({ value: c.id, label: c.name }))}
                    />
                    <BigInput label="Needed by" type="date" value={form.need_by_date} onChange={(e) => setForm({ ...form, need_by_date: e.target.value })} />
                  </div>
                  <h3 className="text-lg font-bold text-brand-950">Materials needed</h3>
                  {items.map((li, idx) => (
                    <div key={idx} className="grid gap-3 sm:grid-cols-[1fr_90px_90px_130px_48px] items-end">
                      <BigInput label={idx === 0 ? "Material" : " "} value={li.material} onChange={(e) => setItems(items.map((x, i) => (i === idx ? { ...x, material: e.target.value } : x)))} />
                      <BigInput label={idx === 0 ? "Qty" : " "} type="number" value={li.quantity} onChange={(e) => setItems(items.map((x, i) => (i === idx ? { ...x, quantity: e.target.value } : x)))} />
                      <BigInput label={idx === 0 ? "Unit" : " "} value={li.unit} onChange={(e) => setItems(items.map((x, i) => (i === idx ? { ...x, unit: e.target.value } : x)))} />
                      <BigInput label={idx === 0 ? "Est. unit cost (₦)" : " "} type="number" value={li.estimated_unit_cost} onChange={(e) => setItems(items.map((x, i) => (i === idx ? { ...x, estimated_unit_cost: e.target.value } : x)))} />
                      <BigButton size="md" variant="ghost" className="mb-1 text-danger-800" onClick={() => setItems(items.length === 1 ? items : items.filter((_, i) => i !== idx))}>✕</BigButton>
                    </div>
                  ))}
                  <BigButton size="md" variant="secondary" onClick={() => setItems([...items, { material: "", quantity: "1", unit: "pcs", estimated_unit_cost: "" }])}>
                    + Add material
                  </BigButton>
                  <p className="text-lg font-bold">Estimated total: {money(estTotal)}</p>
                </div>
              ),
            },
            {
              title: "Approval",
              content: (
                <div className="space-y-5">
                  <BigSelect
                    label="Who must approve this spend?"
                    hint="Bigger amounts need a more senior approver."
                    value={form.approver}
                    onChange={(e) => setForm({ ...form, approver: e.target.value })}
                    options={[
                      { value: "procurement_officer", label: "Procurement Officer (up to ₦1m)" },
                      { value: "supervisor", label: "Supervisor (up to ₦2m)" },
                      { value: "finance_officer", label: "Finance Officer (up to ₦3m)" },
                      { value: "admin", label: "Admin (up to ₦100m)" },
                    ]}
                  />
                  <Card className="text-lg bg-surface">
                    {goodItems.length} material line(s), estimated {money(estTotal)}. Press “Save request” to keep it as a draft — add quotes and submit for approval on the next screen.
                  </Card>
                  {error && <Card className="border-danger-600 text-danger-800">{error}</Card>}
                </div>
              ),
            },
          ]}
        />
      </Modal>
    </div>
  );
}

function SkeletonList() {
  return (
    <div className="mt-6 space-y-3">
      {[...Array(4)].map((_, i) => (
        <Skeleton key={i} className="h-20" />
      ))}
    </div>
  );
}
