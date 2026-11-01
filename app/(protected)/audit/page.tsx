"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  PageHeader,
  HintCard,
  Skeleton,
  EmptyState,
  StatusBadge,
  BigSelect,
  BigInput,
  BigButton,
  RowCard,
  Modal,
} from "@hericilla/ui";
import { getSupabase } from "@hericilla/supabase-clients";
import { useAuth } from "@/lib/auth";
import { ChevronLeft, ChevronRight } from "lucide-react";

const MANAGE_ROLES = ["super_admin", "admin", "hr_officer", "auditor"];
const PAGE_SIZE = 50;

const AUDITED_ENTITIES = [
  "hericilla_enquiries",
  "hericilla_job_applications",
  "hericilla_service_requests",
  "hericilla_work_orders",
  "hericilla_invoices",
  "hericilla_purchase_requests",
  "hericilla_attendance_events",
  "hericilla_vehicles",
];

const ACTIONS = ["insert", "update", "delete", "approve", "correct"];

type AuditRow = {
  id: number;
  actor_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  at: string;
};

type ProfileLite = { id: string; full_name: string };

export default function AuditPage() {
  const { profile } = useAuth();
  const canView = !!profile && MANAGE_ROLES.includes(profile.role);

  const [entity, setEntity] = useState("");
  const [action, setAction] = useState("");
  const [actorId, setActorId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(0);
  const [detail, setDetail] = useState<AuditRow | null>(null);

  // Fetch profiles for actor filter
  const { data: profiles } = useQuery({
    queryKey: ["audit-profiles"],
    queryFn: async () => {
      const { data } = await getSupabase()
        .from("hericilla_profiles")
        .select("id,full_name")
        .order("full_name");
      return (data as ProfileLite[]) ?? [];
    },
    enabled: canView,
  });

  const actorOptions = useMemo(() => {
    const opts = [{ value: "", label: "All actors" }];
    for (const p of profiles ?? []) opts.push({ value: p.id, label: p.full_name });
    return opts;
  }, [profiles]);

  const { data, isPending } = useQuery({
    queryKey: ["audit-logs", entity, action, actorId, dateFrom, dateTo, page],
    queryFn: async () => {
      let q = getSupabase()
        .from("hericilla_audit_logs")
        .select("*", { count: "exact" })
        .order("at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (entity) q = q.eq("entity", entity);
      if (action) q = q.eq("action", action);
      if (actorId) q = q.eq("actor_id", actorId);
      if (dateFrom) q = q.gte("at", `${dateFrom}T00:00:00+01:00`);
      if (dateTo) q = q.lte("at", `${dateTo}T23:59:59+01:00`);
      const { data: rows, count } = await q;
      return { rows: (rows as AuditRow[]) ?? [], total: count ?? 0 };
    },
    enabled: canView,
  });

  const actorName = (id: string | null) => {
    if (!id) return "System";
    const p = (profiles ?? []).find((x) => x.id === id);
    return p?.full_name ?? id.slice(0, 8);
  };

  const formatTime = (iso: string) => {
    const d = new Date(new Date(iso).getTime() + 1 * 3600_000); // WAT
    return d.toISOString().replace("T", " ").slice(0, 16);
  };

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;

  if (!canView) {
    return (
      <div>
        <PageHeader title="Audit Log" purpose="Who changed what and when." />
        <div className="mt-8">
          <EmptyState title="Access restricted" teach="Only admins, HR officers and auditors can view the audit log." />
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Audit Log"
        purpose="Every write to a tracked table is recorded here — who did it, what changed, and when."
      />
      <HintCard
        steps={[
          "Use the filters to narrow down the list.",
          "Click 'View' to see the before/after data for any entry.",
          "The log is read-only — nothing can be edited or deleted here.",
        ]}
      />

      {/* Filters */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <BigSelect
          label="Entity"
          value={entity}
          onChange={(e) => { setEntity(e.target.value); setPage(0); }}
          options={[{ value: "", label: "All entities" }, ...AUDITED_ENTITIES.map((x) => ({ value: x, label: x.replace("hericilla_", "") }))]}
        />
        <BigSelect
          label="Action"
          value={action}
          onChange={(e) => { setAction(e.target.value); setPage(0); }}
          options={[{ value: "", label: "All actions" }, ...ACTIONS.map((x) => ({ value: x, label: x }))]}
        />
        <BigSelect
          label="Actor"
          value={actorId}
          onChange={(e) => { setActorId(e.target.value); setPage(0); }}
          options={actorOptions}
        />
        <BigInput label="From (date)" type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(0); }} />
        <BigInput label="To (date)" type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(0); }} />
      </div>

      {/* Results */}
      {isPending ? (
        <div className="mt-6 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : (data?.rows.length ?? 0) === 0 ? (
        <div className="mt-6">
          <EmptyState title="No audit entries" teach="Once tracked tables are written to, entries will appear here." />
        </div>
      ) : (
        <>
          <p className="mt-6 text-sm text-ink-soft">{data!.total} entries · page {page + 1} of {totalPages || 1}</p>
          <div className="mt-3 space-y-3">
            {data!.rows.map((r) => (
              <RowCard
                key={r.id}
                title={`${r.action.toUpperCase()} · ${r.entity.replace("hericilla_", "")}`}
                subtitle={`${formatTime(r.at)} WAT · ${actorName(r.actor_id)} · id: ${r.entity_id ?? "—"}`}
                badge={<StatusBadge status={r.action} />}
                actions={
                  <BigButton size="md" variant="secondary" onClick={() => setDetail(r)}>View</BigButton>
                }
              />
            ))}
          </div>

          {/* Pagination */}
          <div className="mt-6 flex items-center justify-between">
            <BigButton
              variant="secondary"
              size="md"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              icon={<ChevronLeft className="h-5 w-5" />}
            >
              Previous
            </BigButton>
            <BigButton
              variant="secondary"
              size="md"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              Next <ChevronRight className="h-5 w-5 inline" />
            </BigButton>
          </div>
        </>
      )}

      {/* Detail modal */}
      <Modal open={!!detail} title={detail ? `${detail.action} — ${detail.entity.replace("hericilla_", "")}` : ""} onClose={() => setDetail(null)} wide>
        {detail && (
          <div className="space-y-4">
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt className="font-bold text-ink-soft">Time (WAT)</dt><dd>{formatTime(detail.at)}</dd>
              <dt className="font-bold text-ink-soft">Actor</dt><dd>{actorName(detail.actor_id)}</dd>
              <dt className="font-bold text-ink-soft">Action</dt><dd>{detail.action}</dd>
              <dt className="font-bold text-ink-soft">Entity</dt><dd>{detail.entity}</dd>
              <dt className="font-bold text-ink-soft">Entity ID</dt><dd>{detail.entity_id ?? "—"}</dd>
            </dl>
            <div>
              <p className="text-sm font-bold text-ink-soft mb-1">Before data</p>
              <pre className="rounded-lg bg-gray-50 border border-[var(--color-line)] p-4 text-xs overflow-x-auto max-h-60 whitespace-pre-wrap">
                {detail.before_data ? JSON.stringify(detail.before_data, null, 2) : "(null)"}
              </pre>
            </div>
            <div>
              <p className="text-sm font-bold text-ink-soft mb-1">After data</p>
              <pre className="rounded-lg bg-gray-50 border border-[var(--color-line)] p-4 text-xs overflow-x-auto max-h-60 whitespace-pre-wrap">
                {detail.after_data ? JSON.stringify(detail.after_data, null, 2) : "(null)"}
              </pre>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
