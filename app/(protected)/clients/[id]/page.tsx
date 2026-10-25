"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  PageHeader,
  BigButton,
  BigInput,
  Card,
  RowCard,
  StatusBadge,
  Modal,
  Skeleton,
  EmptyState,
  ConfirmDialog,
} from "@hericilla/ui";
import { getSupabase } from "@hericilla/supabase-clients";
import { useAuth } from "@/lib/auth";

type Client = {
  id: string;
  name: string;
  rc_number: string | null;
  address: string | null;
  city: string | null;
  email: string | null;
  phone: string | null;
  billing_terms: string | null;
  notes: string | null;
};
type Contact = { id: string; full_name: string; job_title: string | null; email: string | null; phone: string | null; is_primary: boolean };
type Contract = { id: string; title: string; start_date: string | null; end_date: string | null; status: string; sla_terms: string | null };

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const { profile } = useAuth();
  const [editing, setEditing] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [form, setForm] = useState<Partial<Client>>({});
  const [contact, setContact] = useState({ full_name: "", job_title: "", email: "", phone: "", is_primary: false });
  const [contactBusy, setContactBusy] = useState(false);

  const { data: client, isPending } = useQuery({
    queryKey: ["client", id],
    queryFn: async () => {
      const { data, error } = await getSupabase().from("hericilla_clients").select("*").eq("id", id).single();
      if (error) throw error;
      return data as Client;
    },
  });

  const { data: contacts } = useQuery({
    queryKey: ["client-contacts", id],
    queryFn: async () => {
      const { data } = await getSupabase().from("hericilla_client_contacts").select("*").eq("client_id", id).order("is_primary", { ascending: false });
      return (data as Contact[]) ?? [];
    },
  });

  const { data: contracts } = useQuery({
    queryKey: ["client-contracts", id],
    queryFn: async () => {
      const { data } = await getSupabase().from("hericilla_client_contracts").select("*").eq("client_id", id).order("created_at", { ascending: false });
      return (data as Contract[]) ?? [];
    },
  });

  const { data: requests } = useQuery({
    queryKey: ["client-srs", id],
    queryFn: async () => {
      const { data } = await getSupabase()
        .from("hericilla_service_requests")
        .select("id, ref_no, title, status, created_at")
        .eq("client_id", id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(20);
      return (data as { id: string; ref_no: string; title: string; status: string; created_at: string }[]) ?? [];
    },
  });

  async function saveClient() {
    const { error } = await getSupabase().from("hericilla_clients").update(form).eq("id", id);
    if (!error) {
      setEditing(false);
      void qc.invalidateQueries({ queryKey: ["client", id] });
    }
  }

  async function addContact() {
    if (contact.full_name.trim().length < 2) return;
    setContactBusy(true);
    await getSupabase().from("hericilla_client_contacts").insert({
      client_id: id,
      full_name: contact.full_name.trim(),
      job_title: contact.job_title || null,
      email: contact.email || null,
      phone: contact.phone || null,
      is_primary: contact.is_primary,
    });
    setContactBusy(false);
    setContactOpen(false);
    setContact({ full_name: "", job_title: "", email: "", phone: "", is_primary: false });
    void qc.invalidateQueries({ queryKey: ["client-contacts", id] });
  }

  async function removeContact(c: Contact) {
    await getSupabase().from("hericilla_client_contacts").delete().eq("id", c.id);
    void qc.invalidateQueries({ queryKey: ["client-contacts", id] });
  }

  async function archiveClient() {
    await getSupabase().from("hericilla_clients").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    void qc.invalidateQueries({ queryKey: ["clients"] });
    setArchiving(false);
  }

  if (isPending || !client) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={client.name}
        purpose={`Everything about this client: who to call, what is signed and the jobs we have run for them.`}
        actions={
          <div className="flex gap-3 flex-wrap">
            <BigButton
              variant="secondary"
              onClick={() => {
                setForm(client);
                setEditing(true);
              }}
            >
              Edit details
            </BigButton>
            {["super_admin", "admin"].includes(profile?.role ?? "") && (
              <BigButton variant="danger" onClick={() => setArchiving(true)}>
                Archive client
              </BigButton>
            )}
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="text-xl font-bold text-brand-950">Company details</h2>
          <dl className="mt-4 space-y-3 text-lg">
            <Detail label="RC number" value={client.rc_number} />
            <Detail label="Address" value={[client.address, client.city].filter(Boolean).join(", ")} />
            <Detail label="Phone" value={client.phone} />
            <Detail label="Email" value={client.email} />
            <Detail label="Billing terms" value={client.billing_terms} />
            <Detail label="Notes" value={client.notes} />
          </dl>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-brand-950">Contacts</h2>
            <BigButton size="md" variant="secondary" onClick={() => setContactOpen(true)}>
              + Add contact
            </BigButton>
          </div>
          <div className="mt-4 space-y-3">
            {(contacts ?? []).length === 0 && (
              <p className="text-lg text-ink-soft">No contacts yet. Add the person who calls us — name, role and phone.</p>
            )}
            {(contacts ?? []).map((c) => (
              <RowCard
                key={c.id}
                title={c.full_name}
                subtitle={[c.job_title, c.phone, c.email].filter(Boolean).join(" · ")}
                badge={c.is_primary ? <StatusBadge status="approved" /> : undefined}
                actions={
                  <BigButton size="md" variant="ghost" onClick={() => void removeContact(c)}>
                    Remove
                  </BigButton>
                }
              />
            ))}
          </div>
        </Card>

        <Card>
          <h2 className="text-xl font-bold text-brand-950">Contracts</h2>
          <div className="mt-4 space-y-3">
            {(contracts ?? []).length === 0 && (
              <p className="text-lg text-ink-soft">No contracts recorded yet. Contracts appear here in the documents module (Phase 2).</p>
            )}
            {(contracts ?? []).map((k) => (
              <RowCard
                key={k.id}
                title={k.title}
                subtitle={[k.start_date, k.end_date].filter((d): d is string => !!d).map((d) => new Date(d).toLocaleDateString()).join(" → ")}
                badge={<StatusBadge status={k.status} />}
              />
            ))}
          </div>
        </Card>

        <Card>
          <h2 className="text-xl font-bold text-brand-950">Recent jobs (service requests)</h2>
          <div className="mt-4 space-y-3">
            {(requests ?? []).length === 0 && (
              <p className="text-lg text-ink-soft">No jobs yet. Start one with the “Jobs” button on the left.</p>
            )}
            {(requests ?? []).map((r) => (
              <RowCard
                key={r.id}
                title={`${r.ref_no} — ${r.title}`}
                subtitle={new Date(r.created_at).toLocaleDateString()}
                badge={<StatusBadge status={r.status} />}
                onClick={() => (window.location.href = `/jobs/${r.id}`)}
              />
            ))}
          </div>
          <Link href="/jobs" className="mt-4 inline-block font-semibold text-brand-700 underline">
            Go to all jobs →
          </Link>
        </Card>
      </div>

      <Modal open={editing} title={`Edit ${client.name}`} onClose={() => setEditing(false)} wide>
        <div className="grid gap-5 sm:grid-cols-2">
          <BigInput label="Company name" value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <BigInput label="RC number" value={form.rc_number ?? ""} onChange={(e) => setForm({ ...form, rc_number: e.target.value })} />
          <div className="sm:col-span-2">
            <BigInput label="Address" value={form.address ?? ""} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
          <BigInput label="City" value={form.city ?? ""} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          <BigInput label="Phone" value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <BigInput label="Email" value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <BigInput label="Billing terms" value={form.billing_terms ?? ""} onChange={(e) => setForm({ ...form, billing_terms: e.target.value })} />
          <div className="sm:col-span-2">
            <BigInput label="Notes" value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <BigButton variant="secondary" onClick={() => setEditing(false)}>
            Cancel
          </BigButton>
          <BigButton variant="success" onClick={() => void saveClient()}>
            Save changes
          </BigButton>
        </div>
      </Modal>

      <Modal open={contactOpen} title="Add contact" onClose={() => setContactOpen(false)}>
        <div className="space-y-5">
          <BigInput label="Full name" required value={contact.full_name} onChange={(e) => setContact({ ...contact, full_name: e.target.value })} />
          <BigInput label="Job title" value={contact.job_title} onChange={(e) => setContact({ ...contact, job_title: e.target.value })} />
          <BigInput label="Phone" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} />
          <BigInput label="Email" type="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} />
          <label className="flex items-center gap-3 text-lg">
            <input type="checkbox" checked={contact.is_primary} onChange={(e) => setContact({ ...contact, is_primary: e.target.checked })} className="h-6 w-6" />
            This is the main person we call
          </label>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <BigButton variant="secondary" onClick={() => setContactOpen(false)}>
            Cancel
          </BigButton>
          <BigButton variant="success" onClick={() => void addContact()} disabled={contactBusy}>
            {contactBusy ? "Saving…" : "Save contact"}
          </BigButton>
        </div>
      </Modal>

      <ConfirmDialog
        open={archiving}
        title="Archive this client?"
        message={`“${client.name}” will disappear from lists but nothing is deleted — history, jobs and invoices stay intact. An admin can restore it later.`}
        confirmWord="ARCHIVE"
        onConfirm={() => void archiveClient()}
        onCancel={() => setArchiving(false)}
      />
    </div>
  );
}

function Detail({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex flex-wrap justify-between gap-2 border-b border-[var(--color-line)] pb-2 last:border-0">
      <dt className="text-ink-soft">{label}</dt>
      <dd className="font-semibold text-brand-950 text-right">{value || "—"}</dd>
    </div>
  );
}
