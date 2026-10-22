"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  PageHeader,
  HintCard,
  BigButton,
  BigInput,
  BigTextarea,
  BigSelect,
  Card,
  RowCard,
  StatusBadge,
  Modal,
  Skeleton,
  EmptyState,
} from "@hericilla/ui";
import { getSupabase } from "@hericilla/supabase-clients";
import {
  SUPPLIER_CATEGORIES,
  SUPPLIER_CATEGORY_LABELS,
  statusLabel,
  type SupplierCategory,
} from "@hericilla/types";
import { useAuth } from "@/lib/auth";

type Supplier = {
  id: string;
  name: string;
  rc_number: string | null;
  category: SupplierCategory;
  products_services: string | null;
  email: string | null;
  phone: string | null;
  payment_terms: string | null;
  lead_time_days: number | null;
  status: string;
  delivery_score: number;
  quality_score: number;
  reliability_score: number;
  notes: string | null;
};

const BLANK = {
  name: "",
  rc_number: "",
  category: "other" as SupplierCategory,
  products_services: "",
  address: "",
  email: "",
  phone: "",
  payment_terms: "",
  lead_time_days: "",
  notes: "",
};

export default function SuppliersPage() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const [filter, setFilter] = useState("approved");
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(BLANK);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: rows, isPending } = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => {
      const { data } = await getSupabase().from("suppliers").select("*").is("deleted_at", null).order("name");
      return (data as Supplier[]) ?? [];
    },
  });

  const visible = (rows ?? []).filter((s) => (filter === "all" ? true : s.status === filter));

  function startCreate() {
    setForm(BLANK);
    setEditId(null);
    setOpen(true);
    setError(null);
  }
  function startEdit(s: Supplier) {
    setForm({
      name: s.name,
      rc_number: s.rc_number ?? "",
      category: s.category,
      products_services: s.products_services ?? "",
      address: "",
      email: s.email ?? "",
      phone: s.phone ?? "",
      payment_terms: s.payment_terms ?? "",
      lead_time_days: s.lead_time_days ? String(s.lead_time_days) : "",
      notes: s.notes ?? "",
    });
    setEditId(s.id);
    setOpen(true);
    setError(null);
  }

  async function save() {
    if (form.name.trim().length < 2) {
      setError("Please type the supplier name.");
      return;
    }
    setBusy(true);
    setError(null);
    const payload = {
      name: form.name.trim(),
      rc_number: form.rc_number || null,
      category: form.category,
      products_services: form.products_services || null,
      address: form.address || null,
      email: form.email || null,
      phone: form.phone || null,
      payment_terms: form.payment_terms || null,
      lead_time_days: form.lead_time_days ? Number(form.lead_time_days) : null,
      notes: form.notes || null,
    };
    const { error: err } = editId
      ? await getSupabase().from("suppliers").update(payload).eq("id", editId)
      : await getSupabase().from("suppliers").insert({ ...payload, status: "prospective", created_by: profile?.id });
    setBusy(false);
    if (err) {
      setError("Could not save: " + err.message);
      return;
    }
    setOpen(false);
    void qc.invalidateQueries({ queryKey: ["suppliers"] });
  }

  async function setStatus(s: Supplier, status: string) {
    await getSupabase().from("suppliers").update({ status }).eq("id", s.id);
    void qc.invalidateQueries({ queryKey: ["suppliers"] });
  }

  return (
    <div>
      <PageHeader
        title="Suppliers"
        purpose="Who we buy from — trucking, materials, fuel and services — and how reliable they are."
        actions={<BigButton onClick={startCreate}>+ New supplier</BigButton>}
      />
      <HintCard
        steps={[
          "Add a supplier as “Prospective”, then Approve once you trust them.",
          "Scores (out of 5) update themselves when goods are received in Procurement.",
          "Only approved suppliers can be chosen for a purchase order.",
        ]}
      />

      <div className="mt-6 flex flex-wrap gap-3">
        {["approved", "prospective", "suspended", "all"].map((f) => (
          <BigButton key={f} size="md" variant={filter === f ? "primary" : "secondary"} onClick={() => setFilter(f)}>
            {f === "all" ? "All" : statusLabel(f)}
          </BigButton>
        ))}
      </div>

      {isPending ? (
        <div className="mt-6 space-y-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="mt-6">
          <EmptyState title="No suppliers here yet" teach="Press “+ New supplier” for the trucking company or materials vendor you buy from most." />
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {visible.map((s) => (
            <RowCard
              key={s.id}
              title={s.name}
              subtitle={
                <>
                  <span>{SUPPLIER_CATEGORY_LABELS[s.category]}</span>
                  {s.phone && <span> · {s.phone}</span>}
                  {s.lead_time_days != null && <span> · {s.lead_time_days}d lead time</span>}
                </>
              }
              badge={<StatusBadge status={s.status} />}
              actions={
                <span className="flex gap-2 items-center">
                  <span className="text-base text-ink-soft" title="Delivery / Quality / Reliability">
                    ★ {Number(s.delivery_score).toFixed(1)}/{Number(s.quality_score).toFixed(1)}/{Number(s.reliability_score).toFixed(1)}
                  </span>
                  {s.status !== "approved" && (
                    <BigButton size="md" variant="success" onClick={() => void setStatus(s, "approved")}>
                      Approve
                    </BigButton>
                  )}
                  {s.status !== "suspended" && s.status === "approved" && (
                    <BigButton size="md" variant="ghost" onClick={() => void setStatus(s, "suspended")}>
                      Suspend
                    </BigButton>
                  )}
                  <BigButton size="md" variant="secondary" onClick={() => startEdit(s)}>
                    Edit
                  </BigButton>
                </span>
              }
            />
          ))}
        </div>
      )}

      <Modal open={open} title={editId ? "Edit supplier" : "New supplier"} onClose={() => setOpen(false)} wide>
        <div className="space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <BigInput label="Supplier name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <BigInput label="RC number" value={form.rc_number} onChange={(e) => setForm({ ...form, rc_number: e.target.value })} />
            <BigSelect
              label="Category"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value as SupplierCategory })}
              options={SUPPLIER_CATEGORIES.map((c) => ({ value: c, label: SUPPLIER_CATEGORY_LABELS[c] }))}
            />
            <BigInput label="Lead time (days)" type="number" value={form.lead_time_days} onChange={(e) => setForm({ ...form, lead_time_days: e.target.value })} />
          </div>
          <BigTextarea label="What they supply" value={form.products_services} onChange={(e) => setForm({ ...form, products_services: e.target.value })} />
          <div className="grid gap-5 sm:grid-cols-2">
            <BigInput label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <BigInput label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <BigInput label="Payment terms" hint="e.g. 50% before delivery" value={form.payment_terms} onChange={(e) => setForm({ ...form, payment_terms: e.target.value })} />
            <BigInput label="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
          <BigTextarea label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          {error && <Card className="border-danger-600 text-danger-800">{error}</Card>}
          <div className="flex justify-end gap-3">
            <BigButton variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </BigButton>
            <BigButton variant="success" onClick={() => void save()} disabled={busy}>
              {busy ? "Saving…" : "Save supplier"}
            </BigButton>
          </div>
        </div>
      </Modal>

      <p className="mt-6 text-lg">
        Need to raise a purchase?{" "}
        <Link href="/procurement" className="font-semibold text-brand-700 underline">
          Go to Procurement →
        </Link>
      </p>
    </div>
  );
}
