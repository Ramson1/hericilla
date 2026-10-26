"use client";

import { useRef, useState } from "react";
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
  ConfirmDialog,
} from "@hericilla/ui";
import { getSupabase } from "@hericilla/supabase-clients";
import { DOC_TYPES, statusLabel } from "@hericilla/types";
import { useAuth } from "@/lib/auth";

type DocRow = {
  id: string;
  title: string;
  doc_type: string;
  file_path: string;
  storage_bucket: string;
  sensitivity: string;
  expiry_date: string | null;
  reminder_days: number | null;
  status: string;
  client_id: string | null;
  work_order_id: string | null;
  created_at: string;
  client_name?: string | null;
};

function daysUntil(dateStr: string): number {
  return Math.ceil((new Date(dateStr + "T00:00:00").getTime() - Date.now()) / 86_400_000);
}

export default function DocumentsPage() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [typeFilter, setTypeFilter] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", doc_type: "contract", expiry_date: "", sensitivity: "internal", client_id: "" });

  const { data: docs, isPending } = useQuery({
    queryKey: ["documents"],
    queryFn: async () => {
      const { data } = await getSupabase()
        .from("hericilla_documents")
        .select("*, clients:hericilla_clients(name)")
        .order("created_at", { ascending: false })
        .limit(300);
      const pick = <T,>(v: unknown): T | null => (v == null ? null : Array.isArray(v) ? ((v[0] as T) ?? null) : (v as T));
      return ((data as DocRow[]) ?? []).map((r) => ({
        ...r,
        client_name: pick<{ name: string }>((r as unknown as { clients: unknown }).clients)?.name ?? null,
      }));
    },
  });

  const { data: clients } = useQuery({
    queryKey: ["clients-mini"],
    queryFn: async () => {
      const { data } = await getSupabase().from("hericilla_clients").select("id, name").is("deleted_at", null).order("name");
      return (data as { id: string; name: string }[]) ?? [];
    },
    enabled: uploadOpen,
  });

  const expiring = (docs ?? [])
    .filter((d) => d.expiry_date && d.status === "active" && daysUntil(d.expiry_date) <= 60)
    .sort((a, b) => (a.expiry_date! < b.expiry_date! ? -1 : 1));
  const shown = typeFilter ? (docs ?? []).filter((d) => d.doc_type === typeFilter) : (docs ?? []);

  async function upload() {
    const file = fileRef.current?.files?.[0];
    if (!form.title.trim()) {
      setError("Give the document a clear title.");
      return;
    }
    if (!file) {
      setError("Choose the file to attach.");
      return;
    }
    setBusy(true);
    setError(null);
    const path = `${profile?.id}/${crypto.randomUUID()}-${file.name}`;
    const { error: upErr } = await getSupabase().storage.from("hericilla-documents").upload(path, file, { upsert: false });
    if (upErr) {
      setBusy(false);
      setError("Could not upload the file: " + upErr.message);
      return;
    }
    const { error: insErr } = await getSupabase().from("hericilla_documents").insert({
      title: form.title.trim(),
      doc_type: form.doc_type,
      storage_bucket: "hericilla-documents",
      file_path: path,
      sensitivity: form.sensitivity,
      expiry_date: form.expiry_date || null,
      client_id: form.client_id || null,
      uploaded_by: profile?.id,
    });
    setBusy(false);
    if (insErr) {
      setError("The file uploaded but saving failed: " + insErr.message);
      return;
    }
    setUploadOpen(false);
    setForm({ title: "", doc_type: "contract", expiry_date: "", sensitivity: "internal", client_id: "" });
    if (fileRef.current) fileRef.current.value = "";
    void qc.invalidateQueries({ queryKey: ["documents"] });
  }

  async function openFile(d: DocRow) {
    setBusy(true);
    const { data, error: err } = await getSupabase().storage.from(d.storage_bucket).createSignedUrl(d.file_path, 600);
    setBusy(false);
    if (err || !data?.signedUrl) {
      setError("Could not open the file: " + err?.message);
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener");
  }

  async function setStatus(id: string, status: string) {
    await getSupabase().from("hericilla_documents").update({ status }).eq("id", id);
    void qc.invalidateQueries({ queryKey: ["documents"] });
  }

  async function confirmDelete() {
    if (!deleteId) return;
    const doc = (docs ?? []).find((d) => d.id === deleteId);
    await getSupabase().from("hericilla_documents").delete().eq("id", deleteId);
    if (doc) void getSupabase().storage.from(doc.storage_bucket).remove([doc.file_path]);
    setDeleteId(null);
    void qc.invalidateQueries({ queryKey: ["documents"] });
  }

  return (
    <div>
      <PageHeader
        title="Contracts & Documents"
        purpose="Every contract, permit, invoice copy and certificate in one safe place — with expiry dates you will not miss."
        actions={<BigButton onClick={() => setUploadOpen(true)}>+ Upload document</BigButton>}
      />
      <HintCard
        steps={[
          "Upload the file and give it a type so it can be found again.",
          "Add an expiry date for anything that runs out — licences, insurance, contracts.",
          "Documents nearing expiry are listed first, in the red box below.",
        ]}
      />

      {expiring.length > 0 && (
        <div className="mt-6 rounded-[var(--radius-card)] border-2 border-danger-600 bg-white p-5">
          <h2 className="text-lg font-bold text-danger-800">Expiring soon</h2>
          <div className="mt-3 space-y-2">
            {expiring.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-3 text-base py-1 border-b border-[var(--color-line)] last:border-0">
                <span>{d.title}</span>
                <span className={daysUntil(d.expiry_date!) < 0 ? "font-bold text-danger-800" : "font-bold text-warning-800"}>
                  {daysUntil(d.expiry_date!) < 0 ? `expired ${d.expiry_date}` : `${daysUntil(d.expiry_date!)} days left (${d.expiry_date})`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 max-w-sm">
        <BigSelect
          label="Filter by type"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          options={[{ value: "", label: "All types" }, ...DOC_TYPES.map((t) => ({ value: t, label: statusLabel(t) }))]}
        />
      </div>

      {isPending ? (
        <div className="mt-6 space-y-3"><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
      ) : shown.length === 0 ? (
        <div className="mt-6">
          <EmptyState title="No documents here yet" teach="Press “+ Upload document” to file a contract, permit, receipt or certificate." />
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {shown.map((d) => (
            <RowCard
              key={d.id}
              title={d.title}
              subtitle={`${statusLabel(d.doc_type)}${d.client_name ? ` · ${d.client_name}` : ""}${d.expiry_date ? ` · expires ${d.expiry_date}` : ""}${d.sensitivity !== "internal" ? ` · ${d.sensitivity}` : ""}`}
              badge={<StatusBadge status={d.status} />}
              actions={
                <div className="flex gap-2 flex-wrap justify-end">
                  <BigButton size="md" variant="secondary" disabled={busy} onClick={() => void openFile(d)}>Open</BigButton>
                  {d.status === "active" && (
                    <BigButton size="md" variant="ghost" onClick={() => void setStatus(d.id, "archived")}>Archive</BigButton>
                  )}
                  {d.status !== "active" && (
                    <BigButton size="md" variant="ghost" onClick={() => void setStatus(d.id, "active")}>Re-activate</BigButton>
                  )}
                  <BigButton size="md" variant="ghost" className="text-danger-800" onClick={() => setDeleteId(d.id)}>Delete</BigButton>
                </div>
              }
            />
          ))}
        </div>
      )}

      <Modal open={uploadOpen} title="Upload a document" onClose={() => { setUploadOpen(false); setError(null); }}>
        <div className="space-y-5">
          <BigInput label="Title" required hint="What is this document called? e.g. “Best Land & Sea — 2026 SLA”" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <div className="grid gap-5 sm:grid-cols-2">
            <BigSelect label="Type" value={form.doc_type} onChange={(e) => setForm({ ...form, doc_type: e.target.value })} options={DOC_TYPES.map((t) => ({ value: t, label: statusLabel(t) }))} />
            <BigSelect
              label="Belongs to client (optional)"
              value={form.client_id}
              onChange={(e) => setForm({ ...form, client_id: e.target.value })}
              options={[{ value: "", label: "Not client-specific" }, ...(clients ?? []).map((c) => ({ value: c.id, label: c.name }))]}
            />
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <BigInput label="Expiry date (if it runs out)" type="date" value={form.expiry_date} onChange={(e) => setForm({ ...form, expiry_date: e.target.value })} />
            <BigSelect
              label="Who may see it?"
              value={form.sensitivity}
              onChange={(e) => setForm({ ...form, sensitivity: e.target.value })}
              options={[
                { value: "internal", label: "Staff only (default)" },
                { value: "restricted", label: "Restricted — management" },
                { value: "public", label: "Public" },
              ]}
            />
          </div>
          <div>
            <p className="text-base font-semibold mb-2">The file itself</p>
            <input
              ref={fileRef}
              type="file"
              className="text-base"
            />
          </div>
          {error && <p className="text-base text-danger-800">{error}</p>}
          <div className="flex justify-end gap-3">
            <BigButton variant="secondary" onClick={() => setUploadOpen(false)}>Cancel</BigButton>
            <BigButton variant="success" disabled={busy} onClick={() => void upload()}>{busy ? "Uploading…" : "Upload & save"}</BigButton>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteId}
        title="Delete this document?"
        message="The file and its record are removed for good. Type delete to confirm."
        confirmWord="delete"
        danger
        onCancel={() => setDeleteId(null)}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
