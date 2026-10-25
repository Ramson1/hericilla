"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  PageHeader,
  HintCard,
  BigButton,
  BigInput,
  Modal,
  RowCard,
  StatusBadge,
  EmptyState,
  Skeleton,
  Card,
} from "@hericilla/ui";
import { getSupabase } from "@hericilla/supabase-clients";
import { useAuth } from "@/lib/auth";
import { money } from "@/lib/data";

type ClientRow = {
  id: string;
  name: string;
  rc_number: string | null;
  city: string | null;
  email: string | null;
  phone: string | null;
  deleted_at: string | null;
};

export default function ClientsPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { profile } = useAuth();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", rc_number: "", address: "", city: "Port Harcourt", email: "", phone: "", billing_terms: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: clients, isPending } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error: err } = await getSupabase()
        .from("hericilla_clients")
        .select("id, name, rc_number, city, email, phone, deleted_at")
        .is("deleted_at", null)
        .order("name");
      if (err) throw err;
      return (data as ClientRow[]) ?? [];
    },
  });

  const { data: revenueRows } = useQuery({
    queryKey: ["client-revenue"],
    queryFn: async () => {
      // Outstanding totals per client from the receivables view
      const { data } = await getSupabase().from("hericilla_receivables").select("id, client_name, outstanding");
      const map: Record<string, number> = {};
      for (const r of (data as { client_name: string; outstanding: number }[]) ?? []) {
        map[r.client_name] = (map[r.client_name] ?? 0) + Number(r.outstanding ?? 0);
      }
      return map;
    },
    enabled: (clients?.length ?? 0) > 0,
  });

  async function create() {
    if (form.name.trim().length < 2) {
      setError("Please type the client’s company name.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await getSupabase().from("hericilla_clients").insert({
      ...form,
      created_by: profile?.id,
    });
    setBusy(false);
    if (err) {
      setError("Could not save: " + err.message);
      return;
    }
    setCreating(false);
    setForm({ name: "", rc_number: "", address: "", city: "Port Harcourt", email: "", phone: "", billing_terms: "", notes: "" });
    void qc.invalidateQueries({ queryKey: ["clients"] });
  }

  return (
    <div>
      <PageHeader
        title="Clients"
        purpose="Every company we serve. Tap a client to see their contacts, contracts and jobs."
        actions={<BigButton onClick={() => setCreating(true)}>+ New client</BigButton>}
      />
      <HintCard
        steps={[
          "Use + New client when a company first engages us.",
          "Tap any client card to open their full record.",
          "The red number shows money still owed by that client.",
        ]}
      />

      {isPending ? (
        <div className="mt-6 space-y-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : (clients?.length ?? 0) === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No clients yet"
            teach="When you win your first contract, press “+ New client” and type the company name. Everything else hangs off that record."
          />
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {clients!.map((c) => {
            const owed = revenueRows?.[c.name] ?? 0;
            return (
              <RowCard
                key={c.id}
                title={c.name}
                subtitle={
                  <>
                    {c.rc_number && <span>RC {c.rc_number}</span>}
                    {c.city && <span> · {c.city}</span>}
                    {c.phone && <span> · {c.phone}</span>}
                  </>
                }
                badge={owed > 0 ? <StatusBadge status="overdue" /> : undefined}
                actions={
                  owed > 0 ? (
                    <span className="text-base font-bold text-danger-800">{money(owed)} owing</span>
                  ) : undefined
                }
                onClick={() => router.push(`/clients/${c.id}`)}
              />
            );
          })}
        </div>
      )}

      <Modal open={creating} title="New client" onClose={() => setCreating(false)} wide>
        <div className="grid gap-5 sm:grid-cols-2">
          <BigInput label="Company name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <BigInput label="RC number" hint="Corporate Affairs Commission" value={form.rc_number} onChange={(e) => setForm({ ...form, rc_number: e.target.value })} />
          <div className="sm:col-span-2">
            <BigInput label="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
          <BigInput label="City" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          <BigInput label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <BigInput label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <BigInput label="Billing terms" hint="e.g. Net 30 days" value={form.billing_terms} onChange={(e) => setForm({ ...form, billing_terms: e.target.value })} />
          <div className="sm:col-span-2">
            <BigInput label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        {error && (
          <Card className="mt-4 border-danger-600 text-danger-800">{error}</Card>
        )}
        <div className="mt-6 flex justify-end gap-3">
          <BigButton variant="secondary" onClick={() => setCreating(false)}>
            Cancel
          </BigButton>
          <BigButton variant="success" onClick={() => void create()} disabled={busy}>
            {busy ? "Saving…" : "Save client"}
          </BigButton>
        </div>
      </Modal>
    </div>
  );
}
