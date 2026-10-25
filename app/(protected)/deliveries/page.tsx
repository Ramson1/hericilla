"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BigButton,
  BigTextarea,
  EmptyState,
  HintCard,
  Modal,
  PageHeader,
  RowCard,
  Skeleton,
  StatusBadge,
} from "@hericilla/ui";
import { getSupabase } from "@hericilla/supabase-clients";
import { statusLabel } from "@hericilla/types";
import { useAuth } from "@/lib/auth";
import { money } from "@/lib/data";

type Tab = "pods" | "expenses";

const TABS: { key: Tab; label: string }[] = [
  { key: "pods", label: "POD verification" },
  { key: "expenses", label: "Trip expenses" },
];

interface PodRow {
  id: string;
  transport_job_id: string;
  photos: string[];
  recipient_name: string | null;
  recipient_signature_url: string | null;
  delivered_at: string;
  outcome: string;
  notes: string | null;
  verified_by: string | null;
  verified_at: string | null;
  job_ref: string | null;
  job_status: string | null;
  driver_name: string | null;
}

interface ExpenseRow {
  id: string;
  expense_type: string;
  amount: string | number;
  occurred_at: string;
  status: string;
  reject_reason: string | null;
  submitted_by: string | null;
  job_ref: string | null;
  driver_name: string | null;
}

export default function DeliveriesPage() {
  const [tab, setTab] = useState<Tab>("pods");

  return (
    <div>
      <PageHeader
        title="Deliveries & trip costs"
        purpose="Check the proof drivers sent for each delivery, and approve the fuel and toll money they spent on the road."
      />
      <HintCard
        steps={[
          "Open a delivered job, press “See photos” and check the receiver's name and the outcome.",
          "Press “Verify delivery” when everything looks right — the job moves to Verified.",
          "On Trip expenses, approve or reject each claim. Nobody can approve their own.",
        ]}
      />

      <div className="mt-6 flex gap-3 flex-wrap">
        {TABS.map((t) => (
          <BigButton key={t.key} variant={tab === t.key ? "primary" : "secondary"} onClick={() => setTab(t.key)}>
            {t.label}
          </BigButton>
        ))}
      </div>

      <div className="mt-6">{tab === "pods" ? <PodsPanel /> : <ExpensesPanel />}</div>
    </div>
  );
}

/* ---------- POD verification ---------- */

function PodsPanel() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: pods, isPending } = useQuery({
    queryKey: ["deliveries", "pods"],
    queryFn: async () => {
      const { data } = await getSupabase()
        .from("hericilla_proof_of_delivery")
        .select("*, transport_jobs:hericilla_transport_jobs(ref_no, status), driver:hericilla_profiles!proof_of_delivery_submitted_by_fkey(full_name)")
        .order("delivered_at", { ascending: false })
        .limit(150);
      return ((data as Record<string, unknown>[]) ?? []).map((raw) => {
        const job = raw.transport_jobs as { ref_no: string; status: string } | null;
        const driver = raw.driver as { full_name: string } | null;
        const { transport_jobs: _tj, driver: _d, ...rest } = raw;
        return {
          ...(rest as unknown as PodRow),
          job_ref: job?.ref_no ?? null,
          job_status: job?.status ?? null,
          driver_name: driver?.full_name ?? null,
        };
      });
    },
  });

  const verify = async (pod: PodRow) => {
    setBusyId(pod.id);
    setError(null);
    const sb = getSupabase();
    const { error: err1 } = await sb
      .from("hericilla_proof_of_delivery")
      .update({ verified_by: profile?.id, verified_at: new Date().toISOString() })
      .eq("id", pod.id)
      .is("verified_at", null);
    let err2 = null;
    if (!err1 && pod.job_status === "delivered") {
      // Verification moves the job itself forward (status history logs it).
      const res = await sb.from("hericilla_transport_jobs").update({ status: "verified" }).eq("id", pod.transport_job_id).eq("status", "delivered");
      err2 = res.error;
    }
    setBusyId(null);
    if (err1 || err2) setError((err1 ?? err2)?.message ?? "Could not verify.");
    else void qc.invalidateQueries({ queryKey: ["deliveries"] });
  };

  if (isPending) return <Skeleton className="h-40" />;
  const pendingList = (pods ?? []).filter((p) => !p.verified_at);
  const doneList = (pods ?? []).filter((p) => p.verified_at);

  return (
    <div className="space-y-4">
      {error ? <p className="rounded-xl bg-danger-100 p-4 font-semibold text-danger-800">{error}</p> : null}

      <h2 className="text-xl font-extrabold text-brand-950">Waiting for verification ({pendingList.length})</h2>
      {pendingList.length === 0 ? (
        <EmptyState
          title="No deliveries waiting for you"
          teach="When drivers send proof of delivery from their app, it appears here for you to check the photos and verify."
        />
      ) : (
        pendingList.map((pod) => <PodCard key={pod.id} pod={pod} onVerify={() => void verify(pod)} busy={busyId === pod.id} />)
      )}

      {doneList.length > 0 ? (
        <>
          <h2 className="pt-4 text-xl font-extrabold text-brand-950">Already verified ({doneList.length})</h2>
          {doneList.map((pod) => (
            <RowCard
              key={pod.id}
              title={`${pod.job_ref ?? "Job"} — ${pod.recipient_name ?? "receiver not stated"}`}
              subtitle={`Outcome: ${statusLabel(pod.outcome)} · Verified ${pod.verified_at ? new Date(pod.verified_at).toLocaleString() : ""}`}
              badge={<StatusBadge status="verified" />}
            />
          ))}
        </>
      ) : null}
    </div>
  );
}

function PodCard({ pod, onVerify, busy }: { pod: PodRow; onVerify: () => void; busy: boolean }) {
  const [open, setOpen] = useState(false);
  const [urls, setUrls] = useState<string[]>([]);
  const [sigUrl, setSigUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    const sb = getSupabase();
    void (async () => {
      const signed = await Promise.all(
        pod.photos.map(async (p) => {
          const { data } = await sb.storage.from("hericilla-pod-evidence").createSignedUrl(p, 3600);
          return data?.signedUrl ?? p;
        }),
      );
      let sig: string | null = null;
      if (pod.recipient_signature_url) {
        const { data } = await sb.storage.from("hericilla-pod-evidence").createSignedUrl(pod.recipient_signature_url, 3600);
        sig = data?.signedUrl ?? null;
      }
      if (alive) {
        setUrls(signed);
        setSigUrl(sig);
      }
    })();
    return () => {
      alive = false;
    };
  }, [open, pod.photos, pod.recipient_signature_url]);

  const problem = pod.outcome !== "delivered";

  return (
    <div className={`rounded-2xl border-2 p-5 space-y-3 ${problem ? "border-danger-300 bg-danger-100/40" : "border-[var(--color-line)] bg-white"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-lg font-extrabold text-brand-950">{pod.job_ref ?? "Unknown job"}</p>
          <p className="text-base text-ink-soft">
            Received by <span className="font-bold">{pod.recipient_name ?? "not stated"}</span> on {new Date(pod.delivered_at).toLocaleString()}
            {pod.driver_name ? ` · delivered by ${pod.driver_name}` : ""}
          </p>
        </div>
        <StatusBadge status={pod.outcome} />
      </div>
      {pod.notes ? <p className="rounded-xl bg-brand-50 p-3 text-base">{pod.notes}</p> : null}
      {problem ? (
        <p className="font-semibold text-danger-800">
          This delivery was flagged as “{statusLabel(pod.outcome)}”. Check with the client before verifying.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <BigButton variant="secondary" onClick={() => setOpen((o) => !o)}>
          {open ? "Hide photos" : "See photos & signature"}
        </BigButton>
        <BigButton variant="success" onClick={onVerify} disabled={busy}>
          {busy ? "Verifying…" : "Verify delivery"}
        </BigButton>
      </div>
      {open ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {urls.length === 0 && pod.photos.length === 0 ? <p className="col-span-full text-ink-soft">No photos were attached.</p> : null}
          {urls.map((u, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={u} src={u} alt={`Proof ${i + 1}`} className="h-40 w-full rounded-xl border border-[var(--color-line)] object-cover" />
          ))}
          {sigUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={sigUrl} alt="Receiver signature" className="h-40 w-full rounded-xl border border-brand-300 bg-white object-contain" />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/* ---------- Trip expense approvals ---------- */

function ExpensesPanel() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<ExpenseRow | null>(null);
  const [reason, setReason] = useState("");

  const { data: expenses, isPending } = useQuery({
    queryKey: ["deliveries", "expenses", filter],
    queryFn: async () => {
      let q = getSupabase()
        .from("hericilla_trip_expenses")
        .select("*, transport_jobs:hericilla_transport_jobs(ref_no), driver:hericilla_profiles!trip_expenses_submitted_by_fkey(full_name)")
        .order("occurred_at", { ascending: false })
        .limit(200);
      if (filter === "pending") q = q.eq("status", "pending");
      const { data } = await q;
      return ((data as Record<string, unknown>[]) ?? []).map((raw) => {
        const job = raw.transport_jobs as { ref_no: string } | null;
        const driver = raw.driver as { full_name: string } | null;
        const { transport_jobs: _tj, driver: _d, ...rest } = raw;
        return {
          ...(rest as unknown as ExpenseRow),
          job_ref: job?.ref_no ?? null,
          driver_name: driver?.full_name ?? null,
        };
      });
    },
  });

  const decide = async (e: ExpenseRow, next: "approved" | "rejected", why?: string) => {
    setBusy(true);
    setError(null);
    const { error: err } = await getSupabase()
      .from("hericilla_trip_expenses")
      .update({
        status: next,
        approved_by: profile?.id,
        approved_at: new Date().toISOString(),
        ...(why ? { reject_reason: why } : {}),
      })
      .eq("id", e.id)
      .eq("status", "pending");
    setBusy(false);
    if (err) setError(err.message);
    else void qc.invalidateQueries({ queryKey: ["deliveries"] });
  };

  if (isPending) return <Skeleton className="h-40" />;

  return (
    <div className="space-y-4">
      {error ? <p className="rounded-xl bg-danger-100 p-4 font-semibold text-danger-800">{error}</p> : null}
      <div className="flex gap-3">
        <BigButton variant={filter === "pending" ? "primary" : "secondary"} onClick={() => setFilter("pending")}>
          Waiting for approval
        </BigButton>
        <BigButton variant={filter === "all" ? "primary" : "secondary"} onClick={() => setFilter("all")}>
          All claims
        </BigButton>
      </div>

      {(expenses ?? []).length === 0 ? (
        <EmptyState
          title={filter === "pending" ? "No expenses waiting" : "No expenses recorded yet"}
          teach="Drivers photograph fuel and toll receipts in their app. Each claim lands here for finance to approve or reject."
        />
      ) : (
        (expenses ?? []).map((e) => {
          const own = e.submitted_by != null && e.submitted_by === profile?.id;
          return (
            <RowCard
              key={e.id}
              title={`${statusLabel(e.expense_type)} — ${money(Number(e.amount))}`}
              subtitle={
                <>
                  <span>
                    {e.driver_name ?? "Driver"} · {e.job_ref ?? "no job"} · {e.occurred_at}
                  </span>
                  {e.reject_reason ? <span className="mt-1 block font-semibold text-danger-800">Reason: {e.reject_reason}</span> : null}
                </>
              }
              badge={<StatusBadge status={e.status} />}
              actions={
                e.status === "pending" ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <BigButton variant="success" onClick={() => void decide(e, "approved")} disabled={busy || own}>
                      {busy ? "Working…" : "Approve"}
                    </BigButton>
                    <BigButton variant="danger" onClick={() => setRejecting(e)} disabled={own}>
                      Reject
                    </BigButton>
                    {own ? <p className="text-base font-semibold text-warning-800">You submitted this claim — another officer must decide.</p> : null}
                  </div>
                ) : undefined
              }
            />
          );
        })
      )}

      <Modal open={rejecting != null} title={`Reject ${statusLabel(rejecting?.expense_type ?? "")} of ${money(Number(rejecting?.amount ?? 0))}?`} onClose={() => setRejecting(null)}>
        <div className="space-y-4">
          <p className="text-lg text-ink-soft">Tell the driver why — they will see this on their phone when it syncs.</p>
          <BigTextarea label="Reason (required)" value={reason} onChange={(ev) => setReason(ev.target.value)} />
          <BigButton
            variant="danger"
            onClick={() => {
              if (rejecting) void decide(rejecting, "rejected", reason.trim());
              setRejecting(null);
              setReason("");
            }}
            disabled={reason.trim().length < 5 || busy}
          >
            {busy ? "Working…" : "Reject this claim"}
          </BigButton>
        </div>
      </Modal>
    </div>
  );
}
