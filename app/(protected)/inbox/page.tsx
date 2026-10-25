"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  PageHeader,
  HintCard,
  BigButton,
  BigSelect,
  Card,
  RowCard,
  StatusBadge,
  Modal,
  Skeleton,
  EmptyState,
} from "@hericilla/ui";
import { getSupabase } from "@hericilla/supabase-clients";
import { SERVICE_LABELS, SERVICE_TYPES, statusLabel, type ServiceType } from "@hericilla/types";
import { useAuth } from "@/lib/auth";

type Enq = {
  id: string;
  ref_no: string;
  enquiry_type: string;
  service_type: ServiceType | null;
  name: string;
  company: string | null;
  email: string;
  phone: string | null;
  message: string;
  cargo_details: string | null;
  pickup_location: string | null;
  destination: string | null;
  needed_by: string | null;
  documents: string[];
  status: string;
  assigned_to: string | null;
  converted_to_service_request_id: string | null;
  created_at: string;
};

const ENQ_FLOW = ["new", "assigned", "in_progress", "responded", "closed"] as const;

export default function InboxPage() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: rows, isPending } = useQuery({
    queryKey: ["enquiries"],
    queryFn: async () => {
      let q = getSupabase().from("hericilla_enquiries").select("*").order("created_at", { ascending: false }).limit(200);
      const { data } = await q;
      return (data as Enq[]) ?? [];
    },
  });

  const { data: people } = useQuery({
    queryKey: ["profiles-mini"],
    queryFn: async () => {
      const { data } = await getSupabase().from("hericilla_profiles").select("id, full_name").in("role", ["admin", "super_admin", "supervisor", "procurement_officer", "logistics_officer", "finance_officer", "hr_officer"]).order("full_name");
      return (data as { id: string; full_name: string }[]) ?? [];
    },
  });

  const visible = (rows ?? []).filter((e) => (onlyOpen ? !["closed"].includes(e.status) : true));
  const selected = (rows ?? []).find((e) => e.id === openId) ?? null;

  async function patch(id: string, body: Partial<Enq>) {
    setBusy(true);
    await getSupabase().from("hericilla_enquiries").update(body).eq("id", id);
    setBusy(false);
    void qc.invalidateQueries({ queryKey: ["enquiries"] });
  }

  async function convertToSr(e: Enq, serviceType: ServiceType) {
    setBusy(true);
    const { data: sr, error } = await getSupabase()
      .from("hericilla_service_requests")
      .insert({
        enquiry_id: e.id,
        origin: "website",
        service_type: serviceType,
        title: `${e.ref_no}: ${e.company || e.name}`,
        description: e.message + (e.cargo_details ? `\n\nCargo: ${e.cargo_details}` : "") + (e.pickup_location ? `\nFrom ${e.pickup_location} to ${e.destination ?? "—"}` : ""),
        priority: "normal",
        deadline: e.needed_by,
        created_by: profile?.id,
      })
      .select("id")
      .single();
    if (!error && sr) {
      await getSupabase().from("hericilla_enquiries").update({ status: "in_progress", converted_to_service_request_id: sr.id }).eq("id", e.id);
    }
    setBusy(false);
    void qc.invalidateQueries({ queryKey: ["enquiries"] });
    void qc.invalidateQueries({ queryKey: ["service-requests"] });
    setOpenId(null);
  }

  return (
    <div>
      <PageHeader
        title="Inbox — enquiries"
        purpose="Every request that arrives from the website. Read it, reply, assign it, or turn it into a job."
        actions={
          <Link href="/inbox/chat">
            <BigButton variant="secondary">Live chat →</BigButton>
          </Link>
        }
      />
      <HintCard
        steps={[
          "Tap an enquiry to read the full message and attachments.",
          "Set the status as you work through it, and assign an officer.",
          "Press “Turn into a job” to send it to Service Requests with everything filled in.",
        ]}
      />

      <div className="mt-6 flex flex-wrap gap-3 items-center">
        <BigButton size="md" variant={onlyOpen ? "primary" : "secondary"} onClick={() => setOnlyOpen((v) => !v)}>
          {onlyOpen ? "Waiting for us" : "Showing everything"}
        </BigButton>
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
            title="No enquiries waiting"
            teach="When someone fills in the “Request a Quote” form on the website, it lands here with a reference number. Nothing to do right now — good news."
          />
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {visible.map((e) => (
            <RowCard
              key={e.id}
              title={`${e.ref_no} — ${e.company || e.name}`}
              subtitle={
                <>
                  <span>{statusLabel(e.enquiry_type)}</span>
                  {e.service_type && <span> · {SERVICE_LABELS[e.service_type]}</span>}
                  <span> · {new Date(e.created_at).toLocaleDateString()}</span>
                </>
              }
              badge={<StatusBadge status={e.status} />}
              onClick={() => setOpenId(e.id)}
            />
          ))}
        </div>
      )}

      <Modal open={!!selected} title={selected ? `Enquiry ${selected.ref_no}` : ""} onClose={() => setOpenId(null)} wide>
        {selected && (
          <div className="space-y-5">
            <div className="text-lg space-y-1">
              <p><strong>{selected.name}</strong>{selected.company ? ` — ${selected.company}` : ""}</p>
              <p>
                <a className="text-brand-700 underline" href={`mailto:${selected.email}`}>{selected.email}</a>
                {selected.phone && <> · <a className="text-brand-700 underline" href={`tel:${selected.phone}`}>{selected.phone}</a></>}
              </p>
            </div>
            <Card className="whitespace-pre-line text-lg">{selected.message}</Card>
            {(selected.cargo_details || selected.pickup_location) && (
              <Card className="text-lg bg-surface">
                {selected.cargo_details && <p><strong>Cargo:</strong> {selected.cargo_details}</p>}
                {selected.pickup_location && <p><strong>From:</strong> {selected.pickup_location}</p>}
                {selected.destination && <p><strong>To:</strong> {selected.destination}</p>}
                {selected.needed_by && <p><strong>Needed by:</strong> {new Date(selected.needed_by).toLocaleDateString()}</p>}
              </Card>
            )}
            {selected.documents.length > 0 && (
              <div>
                <p className="text-lg font-semibold">Attachments</p>
                <ul className="mt-2 space-y-1">
                  {selected.documents.map((d, i) => (
                    <li key={i}>
                      <a className="text-brand-700 underline break-all" href={d} target="_blank" rel="noopener noreferrer">
                        {d.split("/").pop() || d}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="grid gap-5 sm:grid-cols-2">
              <BigSelect
                label="Status"
                value={selected.status}
                onChange={(e) => void patch(selected.id, { status: e.target.value })}
                options={ENQ_FLOW.map((s) => ({ value: s, label: statusLabel(s) }))}
              />
              <BigSelect
                label="Assigned officer"
                value={selected.assigned_to ?? ""}
                onChange={(e) => void patch(selected.id, { assigned_to: e.target.value || null })}
                options={(people ?? []).map((p) => ({ value: p.id, label: p.full_name }))}
              />
            </div>

            <ConvertBlock enquiry={selected} onConvert={(st) => void convertToSr(selected, st)} busy={busy} />

            {selected.converted_to_service_request_id && (
              <Link href={`/jobs/${selected.converted_to_service_request_id}`} className="inline-block font-semibold text-brand-700 underline">
                Open the job created from this enquiry →
              </Link>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

function ConvertBlock({ enquiry, onConvert, busy }: { enquiry: Enq; onConvert: (s: ServiceType) => void; busy: boolean }) {
  const [choice, setChoice] = useState<ServiceType | "">(enquiry.service_type ?? "");
  if (enquiry.converted_to_service_request_id) {
    return <Card className="text-lg text-success-800 bg-success-100 border-success-600">Already turned into a service request.</Card>;
  }
  return (
    <Card className="space-y-4">
      <p className="text-lg font-bold text-brand-950">Turn into a job</p>
      <BigSelect
        label="What service is this?"
        value={choice}
        onChange={(e) => setChoice(e.target.value as ServiceType)}
        options={SERVICE_TYPES.map((s) => ({ value: s, label: SERVICE_LABELS[s] }))}
      />
      <BigButton
        variant="success"
        disabled={!choice || busy}
        onClick={() => choice && onConvert(choice)}
      >
        {busy ? "Creating…" : "Create service request"}
      </BigButton>
    </Card>
  );
}
