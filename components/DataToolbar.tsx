"use client";

import { useMemo, useState, type ReactNode } from "react";
import { FileText, FileSpreadsheet, FileType2, X } from "lucide-react";
import { BigButton } from "@hericilla/ui";
import { exportCsv, exportDocx, exportPdf, type ExportColumn } from "@/lib/export";

type DataToolbarProps<T> = {
  /** Doc heading inside the export and the base file name. */
  title: string;
  columns: ExportColumn<T>[];
  rows: T[];
  /** Column holding an ISO date/date string to filter by. When omitted, only export shows. */
  dateKey?: keyof T & string;
  /** Render-prop: the toolbar hands back the date-filtered rows so the page lists exactly what it exports. */
  children: (visibleRows: T[]) => ReactNode;
  className?: string;
};

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "export";
}

function dayStart(value: string): number {
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? NaN : t;
}

/**
 * Shared filter + export bar for the admin data pages.
 * - Optional From/To date range filters `rows` client-side on `dateKey`.
 * - PDF / CSV / DOCX export whatever is currently visible, using the given columns.
 */
export function DataToolbar<T>({ title, columns, rows, dateKey, children, className = "" }: DataToolbarProps<T>) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const visible = useMemo(() => {
    if (!dateKey || (!from && !to)) return rows;
    const fromT = from ? dayStart(`${from}T00:00:00`) : -Infinity;
    const toT = to ? dayStart(`${to}T23:59:59`) : Infinity;
    return rows.filter((r) => {
      const raw = (r as unknown as Record<string, unknown>)[dateKey];
      if (raw == null || raw === "") return true; // keep undated rows unless a range is set
      const t = dayStart(String(raw));
      if (Number.isNaN(t)) return true;
      return t >= fromT && t <= toT;
    });
  }, [rows, dateKey, from, to]);


  const filename = `${slugify(title)}-${new Date().toISOString().slice(0, 10)}`;
  const hasRows = visible.length > 0;

  return (
    <div className={`mb-6 rounded-[var(--radius-card)] border border-[var(--color-line)] bg-white p-4 ${className}`}>
      <div className="flex flex-wrap items-end gap-3">
        {dateKey && (
          <>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-brand-950">From date</span>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="rounded-xl border-2 border-[var(--color-line)] bg-white px-3 py-2.5 text-base focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-200"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-brand-950">To date</span>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="rounded-xl border-2 border-[var(--color-line)] bg-white px-3 py-2.5 text-base focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-200"
              />
            </label>
            {(from || to) && (
              <BigButton
                variant="ghost"
                icon={<X className="h-5 w-5" />}
                onClick={() => {
                  setFrom("");
                  setTo("");
                }}
              >
                Clear dates
              </BigButton>
            )}
          </>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span className="mr-1 text-sm text-ink-soft">{visible.length} record(s)</span>
          <BigButton variant="secondary" icon={<FileText className="h-5 w-5" />} disabled={!hasRows} onClick={() => exportPdf(title, columns, visible, filename)}>
            PDF
          </BigButton>
          <BigButton variant="secondary" icon={<FileSpreadsheet className="h-5 w-5" />} disabled={!hasRows} onClick={() => exportCsv(title, columns, visible, filename)}>
            CSV
          </BigButton>
          <BigButton variant="secondary" icon={<FileType2 className="h-5 w-5" />} disabled={!hasRows} onClick={() => exportDocx(title, columns, visible, filename)}>
            DOCX
          </BigButton>
        </div>
      </div>

      {children(visible)}
    </div>
  );
}
