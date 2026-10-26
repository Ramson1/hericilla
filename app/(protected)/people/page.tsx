"use client";

import { useState } from "react";
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
} from "@hericilla/ui";
import { getSupabase } from "@hericilla/supabase-clients";
import { APP_ROLES, type Profile, statusLabel } from "@hericilla/types";
import { useAuth } from "@/lib/auth";

type CertRow = { id: string; profile_id: string; name: string; issued_by: string | null; expiry_date: string | null; status: string };
type Department = { id: string; name: string };

export default function PeoplePage() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const canHr = !!profile && ["super_admin", "admin", "hr_officer", "supervisor"].includes(profile.role);
  const [deptFilter, setDeptFilter] = useState("");
  const [detail, setDetail] = useState<Profile | null>(null);
  const [edit, setEdit] = useState({ role: "", department_id: "", status: "", employee_no: "", home_base: "", phone: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cert, setCert] = useState({ name: "", issued_by: "", expiry_date: "" });
  const [certOpen, setCertOpen] = useState(false);

  const { data: people, isPending } = useQuery({
    queryKey: ["profiles-register"],
    queryFn: async () => {
      const { data } = await getSupabase().from("hericilla_profiles").select("*").order("full_name");
      return (data as Profile[]) ?? [];
    },
  });

  const { data: departments } = useQuery({
    queryKey: ["departments"],
    queryFn: async () => {
      const { data } = await getSupabase().from("hericilla_departments").select("id, name").order("name");
      return (data as Department[]) ?? [];
    },
  });

  const { data: certs } = useQuery({
    queryKey: ["certs", detail?.id],
    queryFn: async () => {
      const { data } = await getSupabase().from("hericilla_staff_certifications").select("*").eq("profile_id", detail!.id).order("expiry_date", { ascending: true });
      return (data as CertRow[]) ?? [];
    },
    enabled: !!detail,
  });

  const deptName = (id: string | null | undefined) => (departments ?? []).find((d) => d.id === id)?.name ?? "No department";
  const shown = (people ?? []).filter((p) => !deptFilter || p.department_id === deptFilter);

  function openDetail(p: Profile) {
    setDetail(p);
    setEdit({ role: p.role, department_id: p.department_id ?? "", status: p.status, employee_no: p.employee_no ?? "", home_base: p.home_base ?? "", phone: p.phone ?? "" });
    setError(null);
  }

  async function savePerson() {
    if (!detail) return;
    setBusy(true);
    setError(null);
    const { error: err } = await getSupabase()
      .from("hericilla_profiles")
      .update({
        role: edit.role || detail.role,
        department_id: edit.department_id || null,
        status: edit.status || detail.status,
        employee_no: edit.employee_no || null,
        home_base: edit.home_base || null,
        phone: edit.phone || null,
      })
      .eq("id", detail.id);
    setBusy(false);
    if (err) {
      setError("Could not save: " + err.message);
      return;
    }
    void qc.invalidateQueries({ queryKey: ["profiles-register"] });
    setDetail(null);
  }

  async function addCert() {
    if (!detail || !cert.name.trim()) return;
    setBusy(true);
    await getSupabase().from("hericilla_staff_certifications").insert({
      profile_id: detail.id,
      name: cert.name.trim(),
      issued_by: cert.issued_by || null,
      expiry_date: cert.expiry_date || null,
    });
    setBusy(false);
    setCertOpen(false);
    setCert({ name: "", issued_by: "", expiry_date: "" });
    void qc.invalidateQueries({ queryKey: ["certs", detail.id] });
  }

  return (
    <div>
      <PageHeader
        title="Staff Register"
        purpose="Everyone on the Hericilla team: their department, their role in the system, and the licences they must keep valid."
      />
      <HintCard
        steps={[
          "Press a person to see and edit their record.",
          "Roles decide which portal they can open and what they see inside it.",
          "Add licences and training here so nothing expires by surprise.",
        ]}
      />

      <div className="mt-6 max-w-sm">
        <BigSelect
          label="Department"
          value={deptFilter}
          onChange={(e) => setDeptFilter(e.target.value)}
          options={[{ value: "", label: "All departments" }, ...(departments ?? []).map((d) => ({ value: d.id, label: d.name }))]}
        />
      </div>

      {isPending ? (
        <div className="mt-6 space-y-3"><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
      ) : shown.length === 0 ? (
        <div className="mt-6">
          <EmptyState title="No staff listed yet" teach="Accounts are created when someone is invited — then their department and role show up here." />
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {shown.map((p) => (
            <RowCard
              key={p.id}
              title={p.full_name}
              subtitle={`${p.email}${p.employee_no ? ` · ${p.employee_no}` : ""} · ${deptName(p.department_id)}`}
              badge={<StatusBadge status={p.status} />}
              actions={<span className="text-base text-brand-800 font-semibold self-center">{statusLabel(p.role)}</span>}
              onClick={() => openDetail(p)}
            />
          ))}
        </div>
      )}

      <Modal open={!!detail} title={detail?.full_name ?? ""} onClose={() => setDetail(null)} wide>
        {detail && (
          <div className="space-y-6">
            <Card className="!shadow-none bg-surface">
              <dl className="grid gap-2 sm:grid-cols-2 text-base">
                <div><dt className="text-ink-soft">Email</dt><dd className="font-semibold">{detail.email}</dd></div>
                <div><dt className="text-ink-soft">Joined</dt><dd className="font-semibold">{detail.employed_at ? new Date(detail.employed_at).toLocaleDateString() : "—"}</dd></div>
              </dl>
            </Card>

            <div className="grid gap-5 sm:grid-cols-2">
              <BigSelect
                label="Role in the system"
                value={edit.role}
                onChange={(e) => setEdit({ ...edit, role: e.target.value })}
                disabled={!canHr}
                options={APP_ROLES.map((r) => ({ value: r, label: statusLabel(r) }))}
              />
              <BigSelect
                label="Department"
                value={edit.department_id}
                onChange={(e) => setEdit({ ...edit, department_id: e.target.value })}
                disabled={!canHr}
                options={[{ value: "", label: "No department" }, ...(departments ?? []).map((d) => ({ value: d.id, label: d.name }))]}
              />
              <BigSelect
                label="Status"
                value={edit.status}
                onChange={(e) => setEdit({ ...edit, status: e.target.value })}
                disabled={!canHr}
                options={[{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }]}
              />
              <BigInput label="Staff number" value={edit.employee_no} onChange={(e) => setEdit({ ...edit, employee_no: e.target.value })} disabled={!canHr} />
              <BigInput label="Phone" value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} disabled={!canHr} />
              <BigInput label="Home base" value={edit.home_base} onChange={(e) => setEdit({ ...edit, home_base: e.target.value })} disabled={!canHr} />
            </div>
            {!canHr && <p className="text-base text-ink-soft">Only HR and admins can change these fields.</p>}

            <section>
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-brand-950">Licences & training</h3>
                <BigButton size="md" onClick={() => setCertOpen(true)}>+ Add</BigButton>
              </div>
              <div className="mt-3 space-y-2">
                {(certs ?? []).length === 0 && <p className="text-base text-ink-soft">Nothing recorded yet.</p>}
                {(certs ?? []).map((c) => {
                  const soon = c.expiry_date && new Date(c.expiry_date).getTime() - Date.now() < 60 * 86400000;
                  return (
                    <div key={c.id} className="flex items-center justify-between gap-3 border-b border-[var(--color-line)] last:border-0 py-2">
                      <div>
                        <p className="text-base font-semibold">{c.name}</p>
                        <p className="text-base text-ink-soft">{c.issued_by ?? ""}</p>
                      </div>
                      <p className={soon ? "text-base font-bold text-danger-800" : "text-base"}>
                        {c.expiry_date ? `expires ${c.expiry_date}` : "no expiry"}
                      </p>
                    </div>
                  );
                })}
              </div>
            </section>

            {error && <p className="text-base text-danger-800">{error}</p>}
            <div className="flex justify-end gap-3">
              <BigButton variant="secondary" onClick={() => setDetail(null)}>Close</BigButton>
              {canHr && <BigButton variant="success" disabled={busy} onClick={() => void savePerson()}>{busy ? "Saving…" : "Save changes"}</BigButton>}
            </div>
          </div>
        )}
      </Modal>

      <Modal open={certOpen} title="Add a licence or certificate" onClose={() => setCertOpen(false)}>
        <div className="space-y-5">
          <BigInput label="What is it?" required hint="e.g. Class 4 driving licence, IOSH Managing Safely" value={cert.name} onChange={(e) => setCert({ ...cert, name: e.target.value })} />
          <div className="grid gap-5 sm:grid-cols-2">
            <BigInput label="Issued by" value={cert.issued_by} onChange={(e) => setCert({ ...cert, issued_by: e.target.value })} />
            <BigInput label="Expires on (if it does)" type="date" value={cert.expiry_date} onChange={(e) => setCert({ ...cert, expiry_date: e.target.value })} />
          </div>
          <div className="flex justify-end gap-3">
            <BigButton variant="secondary" onClick={() => setCertOpen(false)}>Cancel</BigButton>
            <BigButton variant="success" disabled={busy} onClick={() => void addCert()}>Save</BigButton>
          </div>
        </div>
      </Modal>
    </div>
  );
}
