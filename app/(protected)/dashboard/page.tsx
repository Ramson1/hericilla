"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  PageHeader,
  HintCard,
  StatCard,
  Card,
  Skeleton,
  BigButton,
} from "@hericilla/ui";
import { ArrowRight, AlertTriangle, Boxes } from "lucide-react";
import { headCount, todayWat } from "@/lib/data";
import { useAuth } from "@/lib/auth";

export default function DashboardPage() {
  const { profile } = useAuth();

  const { data: kpis, isPending } = useQuery({
    queryKey: ["dashboard-kpis"],
    queryFn: async () => {
      const { start } = todayWat();
      const monthStart = start.slice(0, 8) + "01T00:00:00+01:00";
      const [
        srOpen,
        woActive,
        woDoneMonth,
        enqNew,
        chatsOpen,
        invOverdue,
        prPending,
        clockedToday,
      ] = await Promise.all([
        headCount("hericilla_service_requests", (q) => q.in("status", ["new", "quoted", "approved", "assigned", "in_progress"]).is("deleted_at", null)),
        headCount("hericilla_work_orders", (q) => q.in("status", ["open", "in_progress"])),
        headCount("hericilla_work_orders", (q) => q.in("status", ["completed", "closed"]).gte("completed_at", monthStart)),
        headCount("hericilla_enquiries", (q) => q.eq("status", "new")),
        headCount("hericilla_chat_threads", (q) => q.eq("status", "open")),
        headCount("hericilla_invoices", (q) => q.eq("status", "overdue")),
        headCount("hericilla_purchase_requests", (q) => q.eq("status", "pending_approval")),
        headCount("hericilla_attendance_events", (q) => q.eq("event_type", "clock_in").gte("event_time", start)),
      ]);
      return { srOpen, woActive, woDoneMonth, enqNew, chatsOpen, invOverdue, prPending, clockedToday };
    },
  });

  const firstName = (profile?.full_name || profile?.email || "").split(" ")[0];
  const attention = kpis
    ? [
        { n: kpis.enqNew, label: "website enquiries waiting for a first reply", href: "/inbox", word: "Waiting for response" },
        { n: kpis.chatsOpen, label: "live chats still open", href: "/inbox/chat", word: "Open chat" },
        { n: kpis.srOpen, label: "service requests not yet completed", href: "/jobs", word: "In progress" },
        { n: kpis.prPending, label: "purchase requests waiting for approval", href: "/procurement", word: "Waiting for approval" },
        { n: kpis.invOverdue, label: "invoices past their due date", href: "/money", word: "Overdue" },
      ].filter((x) => x.n > 0)
    : [];

  return (
    <div>
      <PageHeader
        title={`Good day, ${firstName || "team"}`}
        purpose="This page shows what is happening across the company today, and what needs you first."
        actions={
          <Link href="/jobs">
            <BigButton icon={<ArrowRight className="h-5 w-5" />}>+ New Job</BigButton>
          </Link>
        }
      />

      <HintCard
        steps={[
          "Look at the red numbers below first — they are things waiting on you.",
          "Tap a number or a red row to jump straight to those items.",
          "Everything else can wait until the urgent list is empty.",
        ]}
      />

      {isPending || !kpis ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mt-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : (
        <>
          {/* Today triage */}
          <section className="mt-6" aria-label="Today">
            <h2 className="text-lg font-bold text-brand-950 mb-3">Today</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Link href="/inbox" className="block">
                <StatCard label="Enquiries waiting" value={kpis.enqNew} hint="New website requests" />
              </Link>
              <Link href="/inbox/chat" className="block">
                <StatCard label="Open chats" value={kpis.chatsOpen} hint="Website live chat" />
              </Link>
              <Link href="/jobs" className="block">
                <StatCard label="Active jobs" value={kpis.woActive} hint="Work orders in progress" />
              </Link>
              <Link href="/attendance" className="block">
                <StatCard label="Clocked in today" value={kpis.clockedToday} hint="Staff who signed in" />
              </Link>
            </div>
          </section>

          <section className="mt-8" aria-label="Needs your attention">
            <h2 className="text-lg font-bold text-brand-950 mb-3 flex items-center gap-2">
              <AlertTriangle className="h-6 w-6 text-warning-600" /> Needs your attention
            </h2>
            <Card className="divide-y divide-[var(--color-line)] !p-0">
              {attention.length === 0 ? (
                <p className="p-6 text-base text-ink-soft">
                  Nothing urgent right now. When something waits on you, it appears here.
                </p>
              ) : (
                attention.map((a) => (
                  <Link key={a.label} href={a.href} className="flex items-center justify-between gap-4 p-5 hover:bg-brand-50">
                    <span className="text-base">
                      <strong className="text-brand-950">{a.n}</strong> {a.label}
                    </span>
                    <span className="rounded-full bg-danger-100 text-danger-800 px-4 py-1 font-bold text-base whitespace-nowrap">
                      {a.word}
                    </span>
                  </Link>
                ))
              )}
            </Card>
          </section>

          <section className="mt-8" aria-label="Everything else">
            <h2 className="text-lg font-bold text-brand-950 mb-3">Everything else</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Link href="/inventory" className="rounded-[var(--radius-card)] bg-white border border-[var(--color-line)] p-6 shadow-[var(--shadow-card)] hover:border-brand-400 hover:shadow-[var(--shadow-pop)] transition flex items-start gap-4">
                <span className="inline-flex rounded-2xl bg-brand-100 text-brand-800 p-3">
                  <Boxes className="h-8 w-8" aria-hidden />
                </span>
                <span>
                  <span className="block text-lg font-bold text-brand-950">Inventory</span>
                  <span className="block text-base text-ink-soft">Stock levels and reorder alerts</span>
                </span>
              </Link>
              <StatCard label="Requests being worked" value={kpis.srOpen} hint="Service requests open" />
              <StatCard label="Completed this month" value={kpis.woDoneMonth} hint="Work orders finished" />
              <StatCard label="POs awaiting approval" value={kpis.prPending} hint="Procurement queue" />
              <StatCard label="Overdue invoices" value={kpis.invOverdue} hint="Follow up on payment" />
            </div>
          </section>
        </>
      )}
    </div>
  );
}
