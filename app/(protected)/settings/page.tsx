"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BigButton,
  BigCheckbox,
  BigInput,
  BigSelect,
  EmptyState,
  HintCard,
  Modal,
  PageHeader,
  RowCard,
  Skeleton,
  StatusBadge,
} from "@hericilla/ui";
import { getSupabase } from "@hericilla/supabase-clients";
import { APP_ROLES, statusLabel, type AppRole } from "@hericilla/types";
import { useAuth } from "@/lib/auth";
import { money } from "@/lib/data";

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  supervisor: "Supervisor",
  procurement_officer: "Procurement Officer",
  finance_officer: "Finance Officer",
  logistics_officer: "Logistics Officer",
  warehouse_agent: "Warehouse Agent",
  hr_officer: "HR Officer",
  staff: "Staff",
  driver: "Driver",
  auditor: "Auditor",
};

type TabKey = "users" | "permissions" | "limits" | "rules" | "app" | "audit";

const TABS: { key: TabKey; label: string }[] = [
  { key: "users", label: "Users & Invites" },
  { key: "permissions", label: "Permission Matrix" },
  { key: "limits", label: "Approval Limits" },
  { key: "rules", label: "Attendance Rules" },
  { key: "app", label: "App Settings" },
  { key: "audit", label: "Audit Log" },
];

export default function SettingsPage() {
  const { profile } = useAuth();
  const [tab, setTab] = useState<TabKey>("users");

  const role = profile?.role ?? "";
  const canManageUsers = ["super_admin", "admin", "hr_officer"].includes(role);
  const canAdmin = ["super_admin", "admin"].includes(role);
  const canSeeAudit = ["super_admin", "admin", "auditor"].includes(role);

  const visibleTabs = TABS.filter((t) => {
    if (t.key === "users") return canManageUsers;
    if (t.key === "audit") return canSeeAudit;
    // RLS: matrix/limits/app settings are admin-write; rules also allow hr_officer.
    if (t.key === "rules") return canAdmin || canManageUsers;
    return canAdmin || canManageUsers; // managers see the rest read-only (saves disabled)
  });

  const active = visibleTabs.find((t) => t.key === tab) ?? visibleTabs[0];

  if (visibleTabs.length === 0) {
    return (
      <div>
        <PageHeader
          title="Settings & Permissions"
          purpose="This page is only for admins, HR and auditors — your office work lives in the other pages."
        />
        <EmptyState
          title="Nothing to set here for your role"
          teach="Settings are managed by the admins and HR. If you need something changed, please speak with them."
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Settings & Permissions"
        purpose="This page controls who can use the system, what each role may do, spending limits and company rules."
      />
      <HintCard
        steps={[
          "Pick the area you want to change from the buttons below.",
          "Make your changes on the big toggles or fields.",
          "Press Save — the system checks your permission before applying.",
        ]}
      />
      <div className="mt-6 flex flex-wrap gap-3">
        {visibleTabs.map((t) => (
          <BigButton
            key={t.key}
            variant={active?.key === t.key ? "primary" : "secondary"}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </BigButton>
        ))}
      </div>

      <div className="mt-6">
        {active?.key === "users" && <UsersPanel canManage={canManageUsers} />}
        {active?.key === "permissions" && <PermissionsPanel canEdit={canAdmin} />}
        {active?.key === "limits" && <LimitsPanel canEdit={canAdmin} />}
        {active?.key === "rules" && <RulesPanel canEdit={canAdmin || role === "hr_officer"} />}
        {active?.key === "app" && <AppSettingsPanel canEdit={canAdmin} />}
        {active?.key === "audit" && <AuditPanel />}
      </div>
    </div>
  );
}

// ── Users & invites ──────────────────────────────────────────────────────────

interface UserRow {
  id: string;
  full_name: string;
  email: string | null;
  role: string;
  status: string;
  department_id: string | null;
}

function UsersPanel({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invited, setInvited] = useState<{ email: string; password: string } | null>(null);

  const { data: users, isPending } = useQuery({
    queryKey: ["settings", "users"],
    queryFn: async () => {
      const { data } = await getSupabase()
        .from("hericilla_profiles")
        .select("id, full_name, email, role, status, department_id")
        .order("full_name");
      return (data as UserRow[]) ?? [];
    },
  });
  const { data: departments } = useQuery({
    queryKey: ["settings", "departments"],
    queryFn: async () => {
      const { data } = await getSupabase().from("hericilla_departments").select("id, name").order("name");
      return (data as { id: string; name: string }[]) ?? [];
    },
  });
  const deptName = (id: string | null) => departments?.find((d) => d.id === id)?.name ?? "—";
  const deptOptions = (departments ?? []).map((d) => ({ value: d.id, label: d.name }));
  const roleOptions = APP_ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }));

  const [draft, setDraft] = useState<Record<string, { role?: string; status?: string; department_id?: string | null }>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  async function saveUser(u: UserRow) {
    const changes = draft[u.id];
    if (!changes) return;
    setSavingId(u.id);
    const { error } = await getSupabase().from("hericilla_profiles").update(changes).eq("id", u.id);
    setSavingId(null);
    if (!error) {
      setDraft((d) => ({ ...d, [u.id]: {} }));
      void qc.invalidateQueries({ queryKey: ["settings", "users"] });
    } else {
      alert(`Could not save: ${error.message}`);
    }
  }

  if (isPending) return <Skeleton className="h-64" />;
  if (!users || users.length === 0)
    return <EmptyState title="No users yet" teach="Invite your first office member with the button below — they get a temporary password to sign in." />;

  return (
    <div>
      {canManage && (
        <BigButton variant="primary" className="mb-6" onClick={() => { setInvited(null); setInviteOpen(true); }}>
          + Invite a new user
        </BigButton>
      )}
      <div className="space-y-3">
        {users.map((u) => {
          const d = draft[u.id] ?? {};
          const dirty = Object.values(d).some((v) => v !== undefined && v !== null && v !== "");
          return (
            <RowCard
              key={u.id}
              title={u.full_name || u.email || "Unnamed"}
              subtitle={
                <span className="flex flex-wrap gap-x-4 gap-y-1">
                  <span>{u.email}</span>
                  <span>Department: {deptName(u.department_id)}</span>
                </span>
              }
              badge={<StatusBadge status={u.status} />}
              actions={
                canManage ? (
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <BigSelect
                      label="Role"
                      options={roleOptions}
                      value={d.role ?? u.role}
                      onChange={(e) => setDraft((s) => ({ ...s, [u.id]: { ...d, role: e.target.value } }))}
                    />
                    <BigSelect
                      label="Department"
                      options={deptOptions}
                      value={d.department_id ?? u.department_id ?? ""}
                      onChange={(e) => setDraft((s) => ({ ...s, [u.id]: { ...d, department_id: e.target.value || null } }))}
                    />
                    <BigSelect
                      label="Status"
                      options={[
                        { value: "active", label: "Active" },
                        { value: "inactive", label: "Inactive (no sign-in)" },
                      ]}
                      value={d.status ?? u.status}
                      onChange={(e) => setDraft((s) => ({ ...s, [u.id]: { ...d, status: e.target.value } }))}
                    />
                    <div className="sm:col-span-3">
                      <BigButton
                        variant={dirty ? "primary" : "ghost"}
                        disabled={!dirty || savingId === u.id}
                        onClick={() => saveUser(u)}
                      >
                        {savingId === u.id ? "Saving…" : dirty ? "Save changes" : "No changes"}
                      </BigButton>
                    </div>
                  </div>
                ) : undefined
              }
            />
          );
        })}
      </div>

      <InviteModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        roleOptions={roleOptions}
        deptOptions={deptOptions}
        onDone={(email, password) => {
          setInvited({ email, password });
          void qc.invalidateQueries({ queryKey: ["settings", "users"] });
        }}
        invited={invited}
      />
    </div>
  );
}

function InviteModal({
  open,
  onClose,
  roleOptions,
  deptOptions,
  onDone,
  invited,
}: {
  open: boolean;
  onClose: () => void;
  roleOptions: { value: string; label: string }[];
  deptOptions: { value: string; label: string }[];
  onDone: (email: string, password: string) => void;
  invited: { email: string; password: string } | null;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [dept, setDept] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function invite() {
    setBusy(true);
    setError(null);
    const { data, error: fnErr } = await getSupabase().functions.invoke("admin-invite", {
      body: { full_name: fullName, email, role, department_id: dept || null, phone: phone || null },
    });
    setBusy(false);
    if (fnErr || !data) {
      setError(fnErr?.message ?? "The invite could not be sent. Check the details and try again.");
      return;
    }
    const res = data as { temp_password?: string };
    onDone(email, res.temp_password ?? "");
  }

  return (
    <Modal open={open} title="Invite a new user" onClose={onClose}>
      {invited ? (
        <div className="space-y-4">
          <p className="text-lg font-semibold text-success-700">
            Account created for {invited.email}.
          </p>
          <div className="rounded-xl bg-brand-50 p-4">
            <p className="text-base text-ink-soft">Temporary password — share it once, in person or by phone:</p>
            <p className="select-all text-2xl font-bold tracking-wide">{invited.password}</p>
          </div>
          <p className="text-base text-ink-soft">
            Ask them to sign in with this password and immediately use “Forgot password” to set their own.
          </p>
          <BigButton variant="secondary" onClick={onClose}>Done</BigButton>
        </div>
      ) : (
        <div className="space-y-1">
          <BigInput label="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          <BigInput label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <BigSelect label="Role" options={roleOptions} value={role} onChange={(e) => setRole(e.target.value)} required />
          <BigSelect label="Department (optional)" options={deptOptions} value={dept} onChange={(e) => setDept(e.target.value)} />
          <BigInput label="Phone (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} />
          {error && <p className="mb-3 text-base font-semibold text-danger-600">{error}</p>}
          <BigButton
            variant="primary"
            disabled={busy || fullName.trim().length < 2 || !email.includes("@") || !role}
            onClick={invite}
          >
            {busy ? "Creating account…" : "Create account"}
          </BigButton>
        </div>
      )}
    </Modal>
  );
}

// ── Permission matrix ────────────────────────────────────────────────────────

const RESOURCES: { key: string; label: string }[] = [
  { key: "clients", label: "Clients" },
  { key: "suppliers", label: "Suppliers" },
  { key: "service_requests", label: "Service Requests" },
  { key: "work_orders", label: "Work Orders" },
  { key: "transport_jobs", label: "Transport Jobs" },
  { key: "purchase_requests", label: "Purchase Requests" },
  { key: "purchase_orders", label: "Purchase Orders" },
  { key: "packing_jobs", label: "Packing & Removal" },
  { key: "inventory", label: "Inventory" },
  { key: "documents", label: "Documents" },
  { key: "invoices", label: "Invoices" },
  { key: "expenses", label: "Expenses" },
  { key: "attendance", label: "Attendance" },
  { key: "payroll", label: "Payroll" },
  { key: "vehicles", label: "Vehicles" },
  { key: "enquiries", label: "Enquiries & Chat" },
  { key: "cms", label: "Website Content" },
  { key: "reports", label: "Reports" },
];

const FLAGS = [
  { key: "can_view", label: "View" },
  { key: "can_create", label: "Create" },
  { key: "can_edit", label: "Edit" },
  { key: "can_approve", label: "Approve" },
  { key: "can_export", label: "Export" },
  { key: "can_delete", label: "Delete" },
] as const;

interface PermRow {
  role: string;
  resource: string;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_approve: boolean;
  can_export: boolean;
  can_delete: boolean;
}
const DEFAULT_PERM: Omit<PermRow, "role" | "resource"> = {
  can_view: true, can_create: false, can_edit: false, can_approve: false, can_export: false, can_delete: false,
};

function PermissionsPanel({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const [role, setRole] = useState<AppRole>("staff");
  const { data: rows, isPending } = useQuery({
    queryKey: ["settings", "perms"],
    queryFn: async () => {
      const { data } = await getSupabase().from("hericilla_role_permissions").select("*");
      return (data as PermRow[]) ?? [];
    },
  });
  const [draft, setDraft] = useState<PermRow | null>(null);

  const stored = rows?.find((r) => r.role === role && r.resource === draft?.resource);
  const current: PermRow | null = draft
    ? { ...draft, ...(stored ? { can_view: stored.can_view, can_create: stored.can_create, can_edit: stored.can_edit, can_approve: stored.can_approve, can_export: stored.can_export, can_delete: stored.can_delete } : DEFAULT_PERM), role, resource: draft.resource }
    : null;

  async function save() {
    if (!current) return;
    const { error } = await getSupabase()
      .from("hericilla_role_permissions")
      .upsert(current, { onConflict: "role,resource" });
    if (error) { alert(`Could not save: ${error.message}`); return; }
    setDraft(null);
    void qc.invalidateQueries({ queryKey: ["settings", "perms"] });
  }

  return (
    <div>
      <BigSelect
        label="Choose the role to edit"
        options={APP_ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
        value={role}
        onChange={(e) => { setRole(e.target.value as AppRole); setDraft(null); }}
      />
      {isPending ? (
        <Skeleton className="mt-6 h-64" />
      ) : (
        <div className="mt-6 space-y-3">
          {RESOURCES.map((res) => {
            const row = rows?.find((r) => r.role === role && r.resource === res.key);
            const editing = current && current.resource === res.key;
            const p = editing ? current! : (row ?? { role, resource: res.key, ...DEFAULT_PERM });
            return (
              <div key={res.key} className="rounded-[var(--radius-card)] border border-[var(--color-line)] bg-white p-4">
                <p className="text-lg font-bold">{res.label}</p>
                <p className="mb-3 text-base text-ink-soft">
                  {row
                    ? FLAGS.filter((f) => row[f.key]).map((f) => f.label).join(" · ") || "Nothing allowed"
                    : "No rule saved yet — default: View only"}
                </p>
                {editing ? (
                  <div className="grid gap-x-6 sm:grid-cols-3">
                    {FLAGS.map((f) => (
                      <BigCheckbox
                        key={f.key}
                        label={f.label}
                        checked={current![f.key]}
                        onChange={(v) => setDraft({ ...current!, [f.key]: v })}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {FLAGS.map((f) => (
                      <span
                        key={f.key}
                        className={`rounded-full px-3 py-1 text-sm font-bold ${p[f.key] ? "bg-success-100 text-success-700" : "bg-neutral-100 text-neutral-400 line-through"}`}
                      >
                        {f.label}
                      </span>
                    ))}
                  </div>
                )}
                {canEdit && (
                  <div className="mt-3 flex gap-2">
                    {editing ? (
                      <>
                        <BigButton variant="primary" onClick={save}>Save</BigButton>
                        <BigButton variant="ghost" onClick={() => setDraft(null)}>Cancel</BigButton>
                      </>
                    ) : (
                      <BigButton variant="secondary" onClick={() => setDraft({ ...p, role, resource: res.key })}>
                        Edit permissions
                      </BigButton>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Approval limits ──────────────────────────────────────────────────────────

function LimitsPanel({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const { data: rows, isPending } = useQuery({
    queryKey: ["settings", "limits"],
    queryFn: async () => {
      const { data } = await getSupabase().from("hericilla_approval_limits").select("*");
      return (data as { role: string; max_amount: number; notes: string | null }[]) ?? [];
    },
  });
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  async function save(roleName: string) {
    const amount = Number(draft[roleName]);
    if (!Number.isFinite(amount) || amount < 0) { alert("Enter a valid amount in naira."); return; }
    setSaving(roleName);
    const { error } = await getSupabase()
      .from("hericilla_approval_limits")
      .upsert({ role: roleName, max_amount: amount }, { onConflict: "role" });
    setSaving(null);
    if (error) { alert(`Could not save: ${error.message}`); return; }
    setDraft((d) => { const n = { ...d }; delete n[roleName]; return n; });
    void qc.invalidateQueries({ queryKey: ["settings", "limits"] });
  }

  if (isPending) return <Skeleton className="h-64" />;
  return (
    <div className="space-y-3">
      <p className="text-lg text-ink-soft">
        The highest purchase value each role may approve on its own. Bigger amounts move up the chain.
      </p>
      {APP_ROLES.map((r) => {
        const row = rows?.find((x) => x.role === r);
        const value = draft[r] ?? String(row?.max_amount ?? 0);
        return (
          <div key={r} className="flex flex-wrap items-end gap-3 rounded-[var(--radius-card)] border border-[var(--color-line)] bg-white p-4">
            <p className="min-w-48 flex-1 text-lg font-bold">{ROLE_LABELS[r]}</p>
            <p className="text-base text-ink-soft">{row ? `Currently ${money(row.max_amount)}` : "No limit saved — treated as 0"}</p>
            {canEdit && (
              <>
                <BigInput
                  label="Maximum (naira)"
                  type="number"
                  className="w-48"
                  value={value}
                  onChange={(e) => setDraft((d) => ({ ...d, [r]: e.target.value }))}
                />
                <BigButton
                  variant="primary"
                  disabled={saving === r || draft[r] === undefined || draft[r] === String(row?.max_amount ?? 0)}
                  onClick={() => save(r)}
                >
                  {saving === r ? "Saving…" : "Save"}
                </BigButton>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Attendance rules ─────────────────────────────────────────────────────────

interface RuleRow {
  id: string;
  name: string;
  grace_minutes: number;
  early_departure_minutes: number;
  overtime_multiplier: number;
  weekly_overtime_cap_hours: number;
  is_active: boolean;
}

function RulesPanel({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const { data: rows, isPending } = useQuery({
    queryKey: ["settings", "rules"],
    queryFn: async () => {
      const { data } = await getSupabase().from("hericilla_attendance_rules").select("*").order("created_at");
      return (data as RuleRow[]) ?? [];
    },
  });
  const [draft, setDraft] = useState<Partial<RuleRow> | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(id: string) {
    if (!draft) return;
    setSaving(true);
    const { error } = await getSupabase().from("hericilla_attendance_rules").update(draft).eq("id", id);
    setSaving(false);
    if (error) { alert(`Could not save: ${error.message}`); return; }
    setDraft(null);
    void qc.invalidateQueries({ queryKey: ["settings", "rules"] });
  }

  if (isPending) return <Skeleton className="h-40" />;
  if (!rows || rows.length === 0)
    return <EmptyState title="No attendance rules yet" teach="The default rule arrives with the database seed — add more here when management approves new working rules." />;

  return (
    <div className="space-y-3">
      <p className="text-lg text-ink-soft">
        These numbers decide who is late, how overtime is paid, and feed directly into payroll. Only HR and admins may change them — every change is written to the audit log.
      </p>
      {rows.map((rule) => {
        const d = draft?.id === rule.id ? draft : rule;
        return (
          <div key={rule.id} className="rounded-[var(--radius-card)] border border-[var(--color-line)] bg-white p-4">
            <p className="text-lg font-bold">{rule.name} {rule.is_active ? "" : "(inactive)"} <StatusBadge status={rule.is_active ? "active" : "inactive"} /></p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <BigInput label="Grace minutes late" type="number" value={String(d.grace_minutes)} disabled={!canEdit}
                onChange={(e) => draft?.id === rule.id && setDraft({ ...draft, grace_minutes: Number(e.target.value) })} />
              <BigInput label="Early departure minutes" type="number" value={String(d.early_departure_minutes)} disabled={!canEdit}
                onChange={(e) => draft?.id === rule.id && setDraft({ ...draft, early_departure_minutes: Number(e.target.value) })} />
              <BigInput label="Overtime multiplier (×)" type="number" step="0.1" value={String(d.overtime_multiplier)} disabled={!canEdit}
                onChange={(e) => draft?.id === rule.id && setDraft({ ...draft, overtime_multiplier: Number(e.target.value) })} />
              <BigInput label="Weekly overtime cap (hours)" type="number" step="0.5" value={String(d.weekly_overtime_cap_hours)} disabled={!canEdit}
                onChange={(e) => draft?.id === rule.id && setDraft({ ...draft, weekly_overtime_cap_hours: Number(e.target.value) })} />
            </div>
            {canEdit && (
              <div className="mt-3 flex gap-2">
                <BigButton
                  variant="primary"
                  disabled={saving || draft?.id !== rule.id}
                  onClick={() => save(rule.id)}
                >
                  {saving ? "Saving…" : "Save changes"}
                </BigButton>
                {draft?.id === rule.id && <BigButton variant="ghost" onClick={() => setDraft(null)}>Cancel</BigButton>}
                {draft?.id !== rule.id && (
                  <BigButton variant="secondary" onClick={() => setDraft({ ...rule })}>Edit this rule</BigButton>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── App settings (key / jsonb value) ─────────────────────────────────────────

interface SettingRow {
  key: string;
  value: unknown;
  description: string | null;
  updated_at: string;
}

function AppSettingsPanel({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const { data: rows, isPending } = useQuery({
    queryKey: ["settings", "app"],
    queryFn: async () => {
      const { data } = await getSupabase().from("hericilla_app_settings").select("*").order("key");
      return (data as SettingRow[]) ?? [];
    },
  });
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [newKey, setNewKey] = useState("");
  const [newVal, setNewVal] = useState("");

  async function save(key: string, raw: string) {
    let value: unknown = raw;
    try {
      value = JSON.parse(raw); // numbers, booleans, arrays and objects keep their type
    } catch {
      value = raw; // plain text stays a string
    }
    setSaving(key);
    const { error } = await getSupabase()
      .from("hericilla_app_settings")
      .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
    setSaving(null);
    if (error) { alert(`Could not save: ${error.message}`); return; }
    setDraft((d) => { const n = { ...d }; delete n[key]; return n; });
    void qc.invalidateQueries({ queryKey: ["settings", "app"] });
  }

  if (isPending) return <Skeleton className="h-64" />;
  return (
    <div className="space-y-3">
      <p className="text-lg text-ink-soft">
        Company-wide switches and numbers. Values may be text like 300, true/false, or lists in square brackets.
      </p>
      {(rows ?? []).map((s) => {
        const asText = draft[s.key] ?? (typeof s.value === "string" ? s.value : JSON.stringify(s.value));
        return (
          <div key={s.key} className="rounded-[var(--radius-card)] border border-[var(--color-line)] bg-white p-4">
            <p className="text-lg font-bold">{s.key.replaceAll("_", " ")}</p>
            {s.description && <p className="text-base text-ink-soft">{s.description}</p>}
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <BigInput label="Value" value={asText} disabled={!canEdit} className="min-w-64 flex-1"
                onChange={(e) => canEdit && setDraft((d) => ({ ...d, [s.key]: e.target.value }))} />
              {canEdit && (
                <BigButton variant="primary" disabled={saving === s.key || draft[s.key] === undefined} onClick={() => save(s.key, asText)}>
                  {saving === s.key ? "Saving…" : "Save"}
                </BigButton>
              )}
            </div>
          </div>
        );
      })}
      {canEdit && (
        <div className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-line)] bg-white p-4">
          <p className="text-lg font-bold">Add a new setting</p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <BigInput label="Key (lower_case_no_spaces)" value={newKey} onChange={(e) => setNewKey(e.target.value)} className="min-w-56 flex-1" />
            <BigInput label="Value (text or JSON)" value={newVal} onChange={(e) => setNewVal(e.target.value)} className="min-w-56 flex-1" />
            <BigButton
              variant="primary"
              disabled={newKey.trim().length < 3 || newVal.trim().length === 0}
              onClick={async () => {
                await save(newKey.trim(), newVal.trim());
                setNewKey(""); setNewVal("");
              }}
            >
              Add
            </BigButton>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Audit log viewer ─────────────────────────────────────────────────────────

interface AuditRow {
  id: number;
  actor_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  at: string;
}

function changedKeys(a: AuditRow): string {
  const b = a.before_data ?? {};
  const f = a.after_data ?? {};
  const keys = new Set([...Object.keys(b), ...Object.keys(f)]);
  const diff = [...keys].filter((k) => JSON.stringify(b[k]) !== JSON.stringify(f[k]) && k !== "updated_at");
  if (diff.length === 0) return "no field changes recorded";
  return diff.slice(0, 8).map((k) => k.replaceAll("_", " ")).join(", ");
}

/** Audit rows store the table name, which now carries the hericilla_ namespace prefix. */
function entityLabel(entity: string): string {
  return entity.replace(/^hericilla_/, "").replaceAll("_", " ");
}

function AuditPanel() {
  const [entity, setEntity] = useState("");
  const { data: rows, isPending } = useQuery({
    queryKey: ["settings", "audit", entity],
    queryFn: async () => {
      let q = getSupabase().from("hericilla_audit_logs").select("*").order("at", { ascending: false }).limit(200);
      if (entity) q = q.eq("entity", entity);
      const [{ data }, { data: people }] = await Promise.all([
        q,
        getSupabase().from("hericilla_profiles").select("id, full_name"),
      ]);
      const names = new Map((people as { id: string; full_name: string }[] ?? []).map((p) => [p.id, p.full_name]));
      return (((data as AuditRow[]) ?? []).map((r) => ({
        ...r,
        actor: r.actor_id ? (names.get(r.actor_id) ?? "Unknown user") : "System",
      })));
    },
  });
  const enriched = rows ?? [];
  const entities = [...new Set(enriched.map((r) => r.entity))].sort();

  const exportCsv = () => {
    const head = "When,Who,Action,Record,Changed fields";
    const body = enriched.map((r) =>
      [`"${r.at}"`, `"${r.actor}"`, `"${r.action}"`, `"${entityLabel(r.entity)}/${r.entity_id ?? ""}"`, `"${changedKeys(r)}"`].join(","),
    );
    const blob = new Blob([[head, ...body].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "audit-log.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3">
        <BigSelect
          label="Filter by record type"
          options={entities.map((e) => ({ value: e, label: statusLabel(entityLabel(e)) }))}
          value={entity}
          onChange={(e) => setEntity(e.target.value)}
        />
        <BigButton variant="secondary" onClick={exportCsv} disabled={enriched.length === 0}>Export CSV</BigButton>
      </div>
      <p className="mt-3 text-lg text-ink-soft">
        Every sensitive change — attendance corrections, payroll approvals, payments, permissions — is stamped here with who did it and when. Nothing can be edited away.
      </p>
      {isPending ? (
        <Skeleton className="mt-6 h-64" />
      ) : enriched.length === 0 ? (
        <EmptyState title="No audit entries yet" teach="The moment someone corrects attendance, approves a payroll run or changes a payment, it appears here automatically." />
      ) : (
        <div className="mt-6 overflow-x-auto rounded-[var(--radius-card)] border border-[var(--color-line)] bg-white">
          <table className="w-full text-left text-base">
            <thead className="border-b-2 border-[var(--color-line)] bg-brand-50">
              <tr>
                <th className="px-4 py-3 font-extrabold text-brand-950">When</th>
                <th className="px-4 py-3 font-extrabold text-brand-950">Who</th>
                <th className="px-4 py-3 font-extrabold text-brand-950">Action</th>
                <th className="px-4 py-3 font-extrabold text-brand-950">Record</th>
                <th className="px-4 py-3 font-extrabold text-brand-950">What changed</th>
              </tr>
            </thead>
            <tbody>
              {enriched.map((r) => (
                <tr key={r.id} className="border-b border-[var(--color-line)] last:border-0">
                  <td className="whitespace-nowrap px-4 py-3">{new Date(r.at).toLocaleString()}</td>
                  <td className="px-4 py-3 font-semibold">{r.actor}</td>
                  <td className="px-4 py-3"><StatusBadge status={r.action} /></td>
                  <td className="px-4 py-3">{entityLabel(r.entity)}{r.entity_id ? ` · ${String(r.entity_id).slice(0, 8)}` : ""}</td>
                  <td className="px-4 py-3 text-ink-soft">{changedKeys(r)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-base text-ink-soft">Showing the newest {enriched.length} entries (max 200).</p>
    </div>
  );
}
