"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BigButton, BigInput, EmptyState, HintCard, PageHeader, Skeleton } from "@hericilla/ui";
import { getSupabase } from "@hericilla/supabase-clients";
import { statusLabel } from "@hericilla/types";
import { money } from "@/lib/data";

type ReportKey =
  | "margins"
  | "receivables"
  | "pipeline"
  | "attendance"
  | "payroll"
  | "stock"
  | "fleet"
  | "enquiries";

interface Col {
  key: string;
  label: string;
  kind?: "money" | "number" | "status" | "text";
}
interface ReportDef {
  key: ReportKey;
  title: string;
  purpose: string;
  dateFilter?: string; // column to gte/lte when a period is set
  cols: Col[];
  chart:
    | { type: "bar"; x: string; series: { key: string; label: string; color?: string }[] }
    | { type: "pie"; name: string; value: string }
    | null;
  fetch: (from: string, to: string) => Promise<Record<string, unknown>[]>;
}

const REPORTS: ReportDef[] = [
  {
    key: "margins",
    title: "Job revenue, cost & margin",
    purpose: "What each work order earned versus what it cost us to run.",
    cols: [
      { key: "wo_number", label: "Work order" },
      { key: "client_name", label: "Client" },
      { key: "service_type", label: "Service", kind: "status" },
      { key: "status", label: "Status", kind: "status" },
      { key: "revenue", label: "Revenue", kind: "money" },
      { key: "cost", label: "Cost", kind: "money" },
      { key: "margin", label: "Margin", kind: "money" },
    ],
    chart: {
      type: "bar",
      x: "wo_number",
      series: [
        { key: "revenue", label: "Revenue" },
        { key: "cost", label: "Cost", color: "#b45309" },
        { key: "margin", label: "Margin", color: "#15803d" },
      ],
    },
    fetch: async () => {
      const { data } = await getSupabase().from("v_job_margins").select("*").order("margin", { ascending: false }).limit(300);
      return (data as Record<string, unknown>[]) ?? [];
    },
  },
  {
    key: "receivables",
    title: "Receivables ageing",
    purpose: "Invoices the clients have not paid yet, grouped by how late they are.",
    dateFilter: "issue_date",
    cols: [
      { key: "ref_no", label: "Invoice" },
      { key: "client_name", label: "Client" },
      { key: "due_date", label: "Due date" },
      { key: "outstanding", label: "Outstanding", kind: "money" },
      { key: "ageing_bucket", label: "Ageing", kind: "status" },
    ],
    chart: { type: "pie", name: "ageing_bucket", value: "outstanding" },
    fetch: async (from, to) => {
      let q = getSupabase().from("v_receivables").select("*");
      if (from) q = q.gte("issue_date", from);
      if (to) q = q.lte("issue_date", to);
      const { data } = await q.order("due_date");
      return (data as Record<string, unknown>[]) ?? [];
    },
  },
  {
    key: "pipeline",
    title: "Job pipeline",
    purpose: "How many requests, work orders, deliveries and invoices sit in each status right now.",
    cols: [
      { key: "entity", label: "Entity", kind: "status" },
      { key: "state", label: "State", kind: "status" },
      { key: "n", label: "Count", kind: "number" },
    ],
    chart: { type: "bar", x: "state", series: [{ key: "n", label: "Count" }] },
    fetch: async () => {
      const { data } = await getSupabase().from("v_pipeline").select("*").order("entity").order("n", { ascending: false });
      return (data as Record<string, unknown>[]) ?? [];
    },
  },
  {
    key: "attendance",
    title: "Attendance — monthly hours",
    purpose: "Days present, late days and gross hours per employee for the chosen months.",
    dateFilter: "month",
    cols: [
      { key: "full_name", label: "Employee" },
      { key: "month", label: "Month" },
      { key: "days_present", label: "Days present", kind: "number" },
      { key: "days_late", label: "Days late", kind: "number" },
      { key: "gross_hours", label: "Gross hours", kind: "number" },
    ],
    chart: {
      type: "bar",
      x: "month",
      series: [
        { key: "days_present", label: "Days present" },
        { key: "days_late", label: "Days late", color: "#b45309" },
      ],
    },
    fetch: async (from, to) => {
      const sb = getSupabase();
      let q = sb.from("v_attendance_monthly").select("*");
      if (from) q = q.gte("month", from.slice(0, 7));
      if (to) q = q.lte("month", to.slice(0, 7));
      const [{ data }, { data: people }] = await Promise.all([q.order("month"), sb.from("profiles").select("id, full_name")]);
      const names = new Map((people as { id: string; full_name: string }[] ?? []).map((p) => [p.id, p.full_name]));
      return ((data as Record<string, unknown>[]) ?? []).map((r) => ({ ...r, full_name: names.get(r.employee_id as string) ?? "—" }));
    },
  },
  {
    key: "payroll",
    title: "Payroll runs & payment tracking",
    purpose: "Every payroll run: gross, net, and how many payslips have actually been paid.",
    cols: [
      { key: "period_month", label: "Period" },
      { key: "status", label: "Status", kind: "status" },
      { key: "payslip_count", label: "Payslips", kind: "number" },
      { key: "paid_count", label: "Paid", kind: "number" },
      { key: "total_gross", label: "Total gross", kind: "money" },
      { key: "total_net", label: "Total net", kind: "money" },
      { key: "paid_amount", label: "Paid out", kind: "money" },
    ],
    chart: {
      type: "bar",
      x: "period_month",
      series: [
        { key: "total_net", label: "Net" },
        { key: "paid_amount", label: "Paid", color: "#15803d" },
      ],
    },
    fetch: async () => {
      const { data } = await getSupabase().from("v_payroll_status").select("*").order("period_month", { ascending: false });
      return (data as Record<string, unknown>[]) ?? [];
    },
  },
  {
    key: "stock",
    title: "Stock valuation & reorder",
    purpose: "What is on the shelves, what it is worth, and what has fallen below the minimum.",
    cols: [
      { key: "sku", label: "SKU" },
      { key: "name", label: "Item" },
      { key: "location", label: "Location" },
      { key: "quantity_on_hand", label: "On hand", kind: "number" },
      { key: "stock_value", label: "Value", kind: "money" },
      { key: "needs_reorder", label: "Reorder?" },
    ],
    chart: { type: "bar", x: "sku", series: [{ key: "stock_value", label: "Value" }] },
    fetch: async () => {
      const { data } = await getSupabase().from("v_stock_valuation").select("*").order("stock_value", { ascending: false }).limit(200);
      return (data as Record<string, unknown>[]) ?? [];
    },
  },
  {
    key: "fleet",
    title: "Fleet utilisation",
    purpose: "Every running vehicle, its driver, last movement and odometer.",
    cols: [
      { key: "reg_no", label: "Plate" },
      { key: "vehicle_type", label: "Type", kind: "status" },
      { key: "vehicle_status", label: "Status", kind: "status" },
      { key: "driver_name", label: "Driver" },
      { key: "wo_number", label: "On job" },
      { key: "last_movement_at", label: "Last movement" },
      { key: "odometer_km", label: "Odometer", kind: "number" },
    ],
    chart: { type: "pie", name: "vehicle_status", value: "odometer_km" },
    fetch: async () => {
      const { data } = await getSupabase().from("v_fleet_board").select("*").order("reg_no");
      return ((data as Record<string, unknown>[]) ?? []).map((r) => ({
        ...r,
        last_movement_at: r.last_movement_at ? new Date(String(r.last_movement_at)).toLocaleString() : "—",
      }));
    },
  },
  {
    key: "enquiries",
    title: "Website enquiry conversion",
    purpose: " enquiries arrived each month and how many became real jobs.",
    cols: [
      { key: "month", label: "Month" },
      { key: "total", label: "Enquiries", kind: "number" },
      { key: "converted", label: "Converted to SR", kind: "number" },
      { key: "awaiting", label: "Still waiting", kind: "number" },
    ],
    chart: {
      type: "bar",
      x: "month",
      series: [
        { key: "total", label: "Enquiries" },
        { key: "converted", label: "Converted", color: "#15803d" },
      ],
    },
    fetch: async () => {
      const { data } = await getSupabase().from("v_enquiry_stats").select("*").order("month");
      return (data as Record<string, unknown>[]) ?? [];
    },
  },
];

const PIE_COLORS = ["#1d7791", "#15803d", "#b45309", "#dc2626", "#1e40af", "#6b7280"];
const BUCKET_LABELS: Record<string, string> = {
  current: "Not yet due",
  overdue_1_30: "1–30 days late",
  overdue_31_60: "31–60 days late",
  overdue_61_90: "61–90 days late",
  overdue_90plus: "More than 90 days late",
  no_due_date: "No due date",
};

export default function ReportsPage() {
  const [key, setKey] = useState<ReportKey>("margins");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const report = REPORTS.find((r) => r.key === key)!;

  const { data: rows, isPending } = useQuery({
    queryKey: ["reports", key, from, to],
    queryFn: () => report.fetch(from, to),
  });

  const list = rows ?? [];

  const chartData = useMemo(() => {
    if (report.chart?.type === "pie") {
      const agg = new Map<string, number>();
      for (const r of list) {
        const name = String(r[report.chart.name] ?? "—");
        agg.set(name, (agg.get(name) ?? 0) + Number(r[report.chart.value] ?? 0));
      }
      return Array.from(agg, ([name, value]) => ({ name: statusLabel(name), value })).filter((d) => d.value > 0);
    }
    return list.slice(0, 14);
  }, [list, report]);

  const exportCsv = () => {
    const header = report.cols.map((c) => c.label).join(",");
    const lines = list.map((r) =>
      report.cols
        .map((c) => {
          const v = r[c.key];
          const s = c.kind === "status" ? statusLabel(String(v ?? "")) : String(v ?? "");
          return `"${s.replaceAll('"', '""')}"`;
        })
        .join(","),
    );
    const blob = new Blob([`${header}\n${lines.join("\n")}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${key}-report.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <PageHeader
        title="Reports & Analytics"
        purpose="The eight report families of the operation — pick one, set the period if needed, then read the chart or export it."
        actions={
          <BigButton variant="secondary" onClick={exportCsv} disabled={list.length === 0}>
            Export CSV
          </BigButton>
        }
      />
      <HintCard
        steps={[
          "Choose a report from the tiles below.",
          "Set the period (optional) to narrow down the numbers.",
          "Look at the chart first — the table underneath has every detail.",
        ]}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {REPORTS.map((r) => (
          <BigButton
            key={r.key}
            variant={r.key === key ? "primary" : "secondary"}
            className="text-left"
            onClick={() => setKey(r.key)}
          >
            {r.title}
          </BigButton>
        ))}
      </div>

      {report.dateFilter ? (
        <div className="mt-6 flex flex-wrap items-end gap-3">
          <BigInput label="From (date or month)" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <BigInput label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          {(from || to) && (
            <BigButton
              variant="ghost"
              onClick={() => {
                setFrom("");
                setTo("");
              }}
            >
              Clear period
            </BigButton>
          )}
        </div>
      ) : null}

      <p className="mt-6 text-lg text-ink-soft">{report.purpose}</p>

      {isPending ? (
        <Skeleton className="mt-6 h-72" />
      ) : list.length === 0 ? (
        <EmptyState
          title="Nothing to report yet"
          teach="This report fills itself as the business works — jobs, invoices and attendance feed it every day."
        />
      ) : (
        <>
          {report.chart ? (
            <div className="mt-6 h-80 w-full rounded-[var(--radius-card)] border border-[var(--color-line)] bg-white p-4">
              <ResponsiveContainer width="100%" height="100%">
                {report.chart.type === "bar" ? (
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey={report.chart.x} tickFormatter={(v: string) => statusLabel(v).slice(0, 14)} fontSize={14} />
                    <YAxis fontSize={14} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 16 }} />
                    {report.chart.series.map((s, i) => (
                      <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color ?? PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </BarChart>
                ) : (
                  <PieChart>
                    <Pie data={chartData} dataKey="value" nameKey="name" outerRadius={110} label>
                      {chartData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number, name: string) => (name === "Odometer" ? `${Number(v).toLocaleString()} km` : money(v))} />
                    <Legend wrapperStyle={{ fontSize: 16 }} />
                  </PieChart>
                )}
              </ResponsiveContainer>
            </div>
          ) : null}

          <div className="mt-6 overflow-x-auto rounded-[var(--radius-card)] border border-[var(--color-line)] bg-white">
            <table className="w-full text-left text-base">
              <thead className="border-b-2 border-[var(--color-line)] bg-brand-50">
                <tr>
                  {report.cols.map((c) => (
                    <th key={c.key} className="px-4 py-3 font-extrabold text-brand-950">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {list.map((r, i) => (
                  <tr key={i} className="border-b border-[var(--color-line)] last:border-0">
                    {report.cols.map((c) => {
                      const v = r[c.key];
                      return (
                        <td key={c.key} className="px-4 py-3">
                          {c.kind === "money" ? (
                            money(Number(v ?? 0))
                          ) : c.kind === "status" ? (
                            <span className="font-semibold">{statusLabel(String(v ?? ""))}</span>
                          ) : c.kind === "number" ? (
                            Number(v ?? 0).toLocaleString()
                          ) : typeof v === "boolean" ? (
                            v ? (
                              <span className="font-bold text-danger-600">Reorder now</span>
                            ) : (
                              "OK"
                            )
                          ) : (
                            <>{renderCell(v)}</>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-base text-ink-soft">{list.length} row(s).</p>
        </>
      )}
    </div>
  );
}

function renderCell(v: unknown): string {
  if (v == null) return "—";
  const s = String(v);
  return BUCKET_LABELS[s] ?? s;
}
