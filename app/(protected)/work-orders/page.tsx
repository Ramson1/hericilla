"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  PageHeader,
  HintCard,
  BigButton,
  RowCard,
  StatusBadge,
  Skeleton,
  EmptyState,
} from "@hericilla/ui";
import { getSupabase } from "@hericilla/supabase-clients";
import { SERVICE_LABELS, type ServiceType } from "@hericilla/types";

type WoRow = {
  id: string;
  wo_number: string;
  title: string;
  service_type: ServiceType;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  client_name: string | null;
  sr_ref: string | null;
  sr_id: string | null;
};

const FILTERS = [
  { key: "active", label: "Running now", match: (w: WoRow) => ["open", "in_progress"].includes(w.status) },
  { key: "done", label: "Finished", match: (w: WoRow) => ["completed", "closed"].includes(w.status) },
  { key: "all", label: "Everything", match: () => true },
] as const;

export default function WorkOrdersPage() {
  const search = useSearchParams();
  const focus = search.get("focus");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("active");

  const { data: rows, isPending } = useQuery({
    queryKey: ["work-orders"],
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from("work_orders")
        .select("*, clients(name), service_requests(id, ref_no)")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      const pick = <T,>(v: unknown): T | null =>
        v == null ? null : Array.isArray(v) ? ((v[0] as T) ?? null) : (v as T);
      return ((data as (WoRow & { clients?: unknown; service_requests?: unknown })[]) ?? []).map((r) => {
        const c = pick<{ name: string }>(r.clients);
        const sr = pick<{ id: string; ref_no: string }>(r.service_requests);
        return {
          ...r,
          client_name: c?.name ?? null,
          sr_ref: sr?.ref_no ?? null,
          sr_id: sr?.id ?? null,
        } as WoRow;
      });
    },
  });

  const visible = (rows ?? []).filter(FILTERS.find((f) => f.key === filter)!.match);

  return (
    <div>
      <PageHeader
        title="Work orders"
        purpose="Every approved job with its WO number. This number follows the work all the way to the invoice."
      />
      <HintCard
        steps={[
          "Work orders are created automatically when a quotation is approved.",
          "Tap a card to open the job it belongs to and add details.",
          "Phase 2 will add drivers, vehicles and stage tracking to these cards.",
        ]}
      />

      <div className="mt-6 flex flex-wrap gap-3">
        {FILTERS.map((f) => (
          <BigButton
            key={f.key}
            size="md"
            variant={filter === f.key ? "primary" : "secondary"}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
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
          <EmptyState
            title="No work orders in this view"
            teach="A work order is born when a client approves a quotation. Open a job under “Jobs”, add a quotation and press “Mark approved”."
          />
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {visible.map((w) => (
            <div key={w.id} className={w.id === focus ? "rounded-[var(--radius-card)] ring-4 ring-accent-400" : undefined}>
              <RowCard
                title={w.wo_number}
                subtitle={
                  <>
                    <span>{w.title}</span>
                    <span> · {SERVICE_LABELS[w.service_type]}</span>
                    {w.client_name && <span> · {w.client_name}</span>}
                  </>
                }
                badge={
                  <span className="flex gap-2 items-center">
                    <StatusBadge status={w.status} />
                    {w.completed_at && <span className="text-base text-ink-soft">done {new Date(w.completed_at).toLocaleDateString()}</span>}
                  </span>
                }
                actions={
                  w.sr_id ? (
                    <BigButton size="md" variant="secondary" onClick={() => (window.location.href = `/jobs/${w.sr_id}`)}>
                      Open job {w.sr_ref}
                    </BigButton>
                  ) : undefined
                }
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
