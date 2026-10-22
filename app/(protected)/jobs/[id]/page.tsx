"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  PageHeader,
  BigButton,
  BigInput,
  BigSelect,
  Card,
  RowCard,
  StatusBadge,
  Modal,
  Skeleton,
  EmptyState,
  HintCard,
} from "@hericilla/ui";
import { getSupabase } from "@hericilla/supabase-clients";
import { SERVICE_LABELS, statusLabel, type ServiceType } from "@hericilla/types";
import { useAuth } from "@/lib/auth";
import { money } from "@/lib/data";

const SR_FLOW = ["new", "quoted", "approved", "assigned", "in_progress", "completed", "invoiced", "closed"] as const;
const SR_DEADENDS = ["rejected", "cancelled"] as const;

type Sr = {
  id: string;
  ref_no: string;
  title: string;
  description: string | null;
  service_type: ServiceType;
  priority: string;
  status: string;
  deadline: string | null;
  sla_days: number | null;
  origin: string;
  client_id: string | null;
  client_name: string | null;
  assigned_department_id: string | null;
  assigned_to: string | null;
  created_at: string;
};
type QuoteItem = { id: string; description: string; quantity: number; unit_price: number; amount: number };
type Quote = {
  id: string;
  ref_no: string;
  status: string;
  valid_until: string | null;
  subtotal: number;
  tax_rate: number;
  total: number;
  notes: string | null;
  quotation_items?: QuoteItem[];
};
type Wo = { id: string; wo_number: string; status: string; title: string; started_at: string | null; completed_at: string | null };
type Feedback = { id: string; kind: string; message: string; rating: number | null; raised_by: string | null; created_at: string };
type Person = { id: string; full_name: string | null };

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { profile } = useAuth();

  const [quoteOpen, setQuoteOpen] = useState(false);
  const [quote, setQuote] = useState({ valid_until: "", notes: "" });
  const [items, setItems] = useState<{ description: string; quantity: string; unit_price: string }[]>([
    { description: "", quantity: "1", unit_price: "" },
  ]);
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedback, setFeedback] = useState({ kind: "feedback", message: "", raised_by: "", rating: "" });

  const { data: sr, isPending } = useQuery({
    queryKey: ["sr", id],
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from("service_requests")
        .select("*, clients(name)")
        .eq("id", id)
        .single();
      if (error) throw error;
      const row = data as Sr & { clients: { name: string } | null };
      return { ...row, client_name: row.clients?.name ?? null } as Sr;
    },
  });

  const { data: quotes } = useQuery({
    queryKey: ["quotes", id],
    queryFn: async () => {
      const { data } = await getSupabase()
        .from("quotations")
        .select("*, quotation_items(*)")
        .eq("service_request_id", id)
        .order("created_at", { ascending: false });
      return (data as Quote[]) ?? [];
    },
  });

  const { data: workOrders } = useQuery({
    queryKey: ["wos", id],
    queryFn: async () => {
      const { data } = await getSupabase().from("work_orders").select("*").eq("service_request_id", id);
      return (data as Wo[]) ?? [];
    },
  });

  const { data: feedbackRows } = useQuery({
    queryKey: ["feedback", id],
    queryFn: async () => {
      const { data } = await getSupabase().from("request_feedback").select("*").eq("service_request_id", id).order("created_at", { ascending: false });
      return (data as Feedback[]) ?? [];
    },
  });

  const { data: people } = useQuery({
    queryKey: ["profiles-mini"],
    queryFn: async () => {
      const { data } = await getSupabase().from("profiles").select("id, full_name").eq("status", "active").order("full_name");
      return (data as Person[]) ?? [];
    },
    enabled: assignOpen,
  });

  const assigneeName = (people ?? []).find((p) => p.id === sr?.assigned_to)?.full_name;

  async function setStatus(status: string) {
    const { error } = await getSupabase().from("service_requests").update({ status }).eq("id", id);
    if (!error) void qc.invalidateQueries({ queryKey: ["sr", id] });
  }

  async function saveAssignee(profileId: string) {
    const { error } = await getSupabase().from("service_requests").update({ assigned_to: profileId || null }).eq("id", id);
    if (!error) {
      void qc.invalidateQueries({ queryKey: ["sr", id] });
      setAssignOpen(false);
    }
  }

  async function createQuote() {
    const goodItems = items.filter((i) => i.description.trim() && Number(i.unit_price) > 0);
    if (goodItems.length === 0) {
      setQuoteError("Add at least one line with a description and a price.");
      return;
    }
    setQuoteBusy(true);
    setQuoteError(null);
    const { data: created, error } = await getSupabase()
      .from("quotations")
      .insert({
        service_request_id: id,
        client_id: sr?.client_id,
        valid_until: quote.valid_until || null,
        notes: quote.notes || null,
        created_by: profile?.id,
      })
      .select()
      .single();
    if (error || !created) {
      setQuoteBusy(false);
      setQuoteError("Could not save: " + error?.message);
      return;
    }
    const { error: itemsErr } = await getSupabase().from("quotation_items").insert(
      goodItems.map((i) => ({
        quotation_id: created.id,
        description: i.description.trim(),
        quantity: Number(i.quantity) || 1,
        unit_price: Number(i.unit_price),
      })),
    );
    setQuoteBusy(false);
    if (itemsErr) {
      setQuoteError("Quotation saved but lines failed: " + itemsErr.message);
      return;
    }
    setQuoteOpen(false);
    setQuote({ valid_until: "", notes: "" });
    setItems([{ description: "", quantity: "1", unit_price: "" }]);
    void qc.invalidateQueries({ queryKey: ["quotes", id] });
    void qc.invalidateQueries({ queryKey: ["sr", id] });
  }

  async function setQuoteStatus(q: Quote, status: string) {
    // Approving fires the DB trigger: work order created + SR flips to 'approved'.
    await getSupabase()
      .from("quotations")
      .update({ status, approved_by: status === "approved" ? profile?.id : undefined, approved_at: status === "approved" ? new Date().toISOString() : undefined })
      .eq("id", q.id);
    void qc.invalidateQueries({ queryKey: ["quotes", id] });
    void qc.invalidateQueries({ queryKey: ["sr", id] });
    void qc.invalidateQueries({ queryKey: ["wos", id] });
  }

  async function addFeedback() {
    if (feedback.message.trim().length < 3) return;
    await getSupabase().from("request_feedback").insert({
      service_request_id: id,
      kind: feedback.kind,
      message: feedback.message.trim(),
      rating: feedback.rating ? Number(feedback.rating) : null,
      raised_by: feedback.raised_by || profile?.full_name || null,
    });
    setFeedbackOpen(false);
    setFeedback({ kind: "feedback", message: "", raised_by: "", rating: "" });
    void qc.invalidateQueries({ queryKey: ["feedback", id] });
  }

  if (isPending || !sr) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-72" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  const draftQuote = (items ?? []).reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unit_price) || 0), 0);

  return (
    <div>
      <PageHeader
        title={`${sr.ref_no} — ${sr.title}`}
        purpose={`This job is ${statusLabel(sr.status).toLowerCase()}. Below: the details, the quotation, the work order and what the client said.`}
        actions={
          <BigButton variant="secondary" onClick={() => router.push("/jobs")}>
            ← All jobs
          </BigButton>
        }
      />
      <HintCard
        steps={[
          "Move the job forward with the big status button.",
          "Add a quotation with its price lines, then press “Mark approved” — the work order is created by itself.",
          "Log any complaint or praise from the client in Feedback.",
        ]}
      />

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* The job itself */}
        <Card>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="text-base text-ink-soft">Status</p>
              <StatusBadge status={sr.status} />
            </div>
            <div className="text-right">
              <p className="text-base text-ink-soft">Priority</p>
              <p className="text-lg font-bold">{sr.priority}</p>
            </div>
          </div>
          <dl className="mt-4 space-y-2 text-lg">
            <Row label="Service" value={SERVICE_LABELS[sr.service_type]} />
            <Row label="Client" value={sr.client_name ? <Link className="text-brand-700 underline" href={`/clients/${sr.client_id}`}>{sr.client_name}</Link> : "—"} />
            <Row label="Deadline" value={sr.deadline ? new Date(sr.deadline).toLocaleDateString() : "Not set"} />
            <Row label="Our promise" value={sr.sla_days ? `${sr.sla_days} working days` : "Standard"} />
            <Row label="Came from" value={sr.origin} />
            <Row label="Officer" value={assigneeName ?? "Not assigned"} />
          </dl>
          {sr.description && <p className="mt-4 text-lg text-ink-soft">{sr.description}</p>}

          <div className="mt-6 flex flex-wrap gap-3">
            <BigSelect
              label="Change status"
              value=""
              onChange={(e) => e.target.value && void setStatus(e.target.value)}
              options={[...SR_FLOW, ...SR_DEADENDS].filter((s) => s !== sr.status).map((s) => ({ value: s, label: statusLabel(s) }))}
            />
            <BigButton variant="secondary" size="md" onClick={() => setAssignOpen(true)}>
              Assign officer
            </BigButton>
          </div>
        </Card>

        {/* Quotations */}
        <Card>
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-brand-950">Quotations</h2>
            <BigButton size="md" onClick={() => setQuoteOpen(true)}>
              + New quotation
            </BigButton>
          </div>
          <div className="mt-4 space-y-4">
            {(quotes ?? []).length === 0 && (
              <p className="text-lg text-ink-soft">No quotation yet. Price the job with “+ New quotation” — send it to the client, then approve it when they say yes.</p>
            )}
            {(quotes ?? []).map((q) => (
              <div key={q.id} className="rounded-2xl border border-[var(--color-line)] p-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <p className="text-lg font-bold">{q.ref_no}</p>
                  <StatusBadge status={q.status} />
                </div>
                <table className="mt-3 w-full text-base">
                  <tbody>
                    {(q.quotation_items ?? []).map((li) => (
                      <tr key={li.id} className="border-b border-[var(--color-line)] last:border-0">
                        <td className="py-1.5 pr-2">{li.description}</td>
                        <td className="py-1.5 text-right whitespace-nowrap">{Number(li.quantity)} × {money(li.unit_price)}</td>
                        <td className="py-1.5 pl-3 text-right font-semibold whitespace-nowrap">{money(li.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-2 text-right text-lg font-bold">{money(q.total)} <span className="text-base font-normal text-ink-soft">incl. {q.tax_rate}% VAT</span></p>
                {q.status === "draft" && (
                  <div className="mt-3 flex flex-wrap gap-3">
                    <BigButton size="md" variant="secondary" onClick={() => void setQuoteStatus(q, "sent")}>
                      Send to client
                    </BigButton>
                    <BigButton size="md" variant="success" onClick={() => void setQuoteStatus(q, "approved")}>
                      Mark approved
                    </BigButton>
                    <BigButton size="md" variant="ghost" onClick={() => void setQuoteStatus(q, "rejected")}>
                      Client said no
                    </BigButton>
                  </div>
                )}
                {q.status === "sent" && (
                  <div className="mt-3 flex flex-wrap gap-3">
                    <BigButton size="md" variant="success" onClick={() => void setQuoteStatus(q, "approved")}>
                      Mark approved
                    </BigButton>
                    <BigButton size="md" variant="ghost" onClick={() => void setQuoteStatus(q, "rejected")}>
                      Client said no
                    </BigButton>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>

        {/* Work orders */}
        <Card>
          <h2 className="text-xl font-bold text-brand-950">Work orders</h2>
          <div className="mt-4 space-y-3">
            {(workOrders ?? []).length === 0 && (
              <p className="text-lg text-ink-soft">None yet — a work order appears here the moment a quotation is approved.</p>
            )}
            {(workOrders ?? []).map((w) => (
              <RowCard
                key={w.id}
                title={w.wo_number}
                subtitle={w.title}
                badge={<StatusBadge status={w.status} />}
                onClick={() => router.push(`/work-orders?focus=${w.id}`)}
              />
            ))}
          </div>
          <Link href="/work-orders" className="mt-4 inline-block font-semibold text-brand-700 underline">
            See all work orders →
          </Link>
        </Card>

        {/* Feedback */}
        <Card>
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-brand-950">Client feedback</h2>
            <BigButton size="md" variant="secondary" onClick={() => setFeedbackOpen(true)}>
              + Record feedback
            </BigButton>
          </div>
          <div className="mt-4 space-y-3">
            {(feedbackRows ?? []).length === 0 && (
              <p className="text-lg text-ink-soft">Nothing recorded. When the client calls with praise or a complaint, write it down here.</p>
            )}
            {(feedbackRows ?? []).map((f) => (
              <div key={f.id} className="rounded-2xl border border-[var(--color-line)] p-4">
                <div className="flex items-center justify-between gap-2">
                  <StatusBadge status={f.kind} />
                  <span className="text-base text-ink-soft">{new Date(f.created_at).toLocaleDateString()}</span>
                </div>
                <p className="mt-2 text-lg">{f.message}</p>
                <p className="mt-1 text-base text-ink-soft">
                  {f.raised_by ?? "Unknown"}{f.rating ? ` · ${f.rating}/5 stars` : ""}
                </p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* New quotation modal */}
      <Modal open={quoteOpen} title="New quotation" onClose={() => setQuoteOpen(false)} wide>
        <div className="space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <BigInput label="Valid until" type="date" value={quote.valid_until} onChange={(e) => setQuote({ ...quote, valid_until: e.target.value })} />
            <BigInput label="Notes for the client" value={quote.notes} onChange={(e) => setQuote({ ...quote, notes: e.target.value })} />
          </div>
          <h3 className="text-lg font-bold text-brand-950">Price lines</h3>
          {items.map((li, idx) => (
            <div key={idx} className="grid gap-3 sm:grid-cols-[1fr_110px_150px_48px] items-end">
              <BigInput
                label={idx === 0 ? "What are we charging for?" : " "}
                value={li.description}
                onChange={(e) => setItems(items.map((x, i) => (i === idx ? { ...x, description: e.target.value } : x)))}
              />
              <BigInput
                label={idx === 0 ? "Quantity" : " "}
                type="number"
                value={li.quantity}
                onChange={(e) => setItems(items.map((x, i) => (i === idx ? { ...x, quantity: e.target.value } : x)))}
              />
              <BigInput
                label={idx === 0 ? "Unit price (₦)" : " "}
                type="number"
                value={li.unit_price}
                onChange={(e) => setItems(items.map((x, i) => (i === idx ? { ...x, unit_price: e.target.value } : x)))}
              />
              <BigButton
                size="md"
                variant="ghost"
                className="mb-1 text-danger-800"
                onClick={() => setItems(items.length === 1 ? [{ description: "", quantity: "1", unit_price: "" }] : items.filter((_, i) => i !== idx))}
              >
                ✕
              </BigButton>
            </div>
          ))}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <BigButton size="md" variant="secondary" onClick={() => setItems([...items, { description: "", quantity: "1", unit_price: "" }])}>
              + Add another line
            </BigButton>
            <p className="text-lg font-bold">Subtotal so far: {money(draftQuote)} · with VAT ≈ {money(Math.round(draftQuote * 1.075))}</p>
          </div>
          {quoteError && <Card className="border-danger-600 text-danger-800">{quoteError}</Card>}
          <div className="flex justify-end gap-3">
            <BigButton variant="secondary" onClick={() => setQuoteOpen(false)}>
              Cancel
            </BigButton>
            <BigButton variant="success" onClick={() => void createQuote()} disabled={quoteBusy}>
              {quoteBusy ? "Saving…" : "Save quotation"}
            </BigButton>
          </div>
        </div>
      </Modal>

      {/* Assign officer */}
      <Modal open={assignOpen} title="Assign officer" onClose={() => setAssignOpen(false)}>
        <div className="space-y-5">
          <BigSelect
            label="Who is responsible for this job?"
            value={sr.assigned_to ?? ""}
            onChange={(e) => void saveAssignee(e.target.value)}
            options={(people ?? []).map((p) => ({ value: p.id, label: p.full_name ?? "" }))}
          />
          <p className="text-lg text-ink-soft">Pick a name and it saves straight away. The officer will see the job under “Jobs”.</p>
        </div>
      </Modal>

      {/* Feedback */}
      <Modal open={feedbackOpen} title="Record client feedback" onClose={() => setFeedbackOpen(false)}>
        <div className="space-y-5">
          <BigSelect
            label="What is it?"
            value={feedback.kind}
            onChange={(e) => setFeedback({ ...feedback, kind: e.target.value })}
            options={[
              { value: "feedback", label: "Feedback / praise" },
              { value: "complaint", label: "Complaint" },
              { value: "issue", label: "Problem on the job" },
            ]}
          />
          <BigInput label="In the client’s words" required value={feedback.message} onChange={(e) => setFeedback({ ...feedback, message: e.target.value })} />
          <div className="grid gap-5 sm:grid-cols-2">
            <BigInput label="Who said it?" value={feedback.raised_by} onChange={(e) => setFeedback({ ...feedback, raised_by: e.target.value })} />
            <BigSelect
              label="Stars (optional)"
              value={feedback.rating}
              onChange={(e) => setFeedback({ ...feedback, rating: e.target.value })}
              options={["5", "4", "3", "2", "1"].map((n) => ({ value: n, label: `${n} / 5` }))}
            />
          </div>
          <div className="flex justify-end gap-3">
            <BigButton variant="secondary" onClick={() => setFeedbackOpen(false)}>
              Cancel
            </BigButton>
            <BigButton variant="success" onClick={() => void addFeedback()}>
              Save feedback
            </BigButton>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-ink-soft">{label}</dt>
      <dd className="font-semibold text-right">{value}</dd>
    </div>
  );
}
