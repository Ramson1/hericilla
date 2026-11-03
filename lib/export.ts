"use client";

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { statusLabel } from "@hericilla/types";

/** A column shared by CSV, PDF and DOCX export so every page declares it once. */
export type ExportColumn<T = Record<string, unknown>> = {
  key: string;
  label: string;
  kind?: "text" | "money" | "number" | "date" | "status";
  /** Overrides `kind` for computed cells (e.g. a joined name). */
  format?: (row: T) => string;
};

const moneyFmt = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 0,
});

/** Resolve one cell to a printable string. */
function cellText<T>(col: ExportColumn<T>, row: T): string {
  if (col.format) return col.format(row) ?? "";
  const raw = (row as unknown as Record<string, unknown>)[col.key];
  if (raw == null || raw === "") return "";
  switch (col.kind) {
    case "money": {
      const v = typeof raw === "string" ? Number(raw) : (raw as number);
      return moneyFmt.format(Number.isFinite(v) ? v : 0);
    }
    case "number": {
      const v = typeof raw === "string" ? Number(raw) : (raw as number);
      return Number.isFinite(v) ? v.toLocaleString() : String(raw);
    }
    case "date": {
      const d = new Date(String(raw));
      return Number.isNaN(d.getTime()) ? String(raw) : d.toLocaleDateString();
    }
    case "status":
      return statusLabel(String(raw));
    default:
      if (typeof raw === "boolean") return raw ? "Yes" : "No";
      if (typeof raw === "object") return JSON.stringify(raw);
      return String(raw);
  }
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** yyyy-mm-dd stamp used for every exported file name. */
function dateStamp(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Build a plain 2-D matrix (header + rows) once and reuse it for CSV/PDF/DOCX. */
function buildMatrix<T>(columns: ExportColumn<T>[], rows: T[]): string[][] {
  const head = columns.map((c) => c.label);
  const body = rows.map((r) => columns.map((c) => cellText(c, r)));
  return [head, ...body];
}

/** CSV export (comma separated, all cells quoted). */
export function exportCsv<T>(
  title: string,
  columns: ExportColumn<T>[],
  rows: T[],
  filename: string,
): void {
  const matrix = buildMatrix(columns, rows);
  const csv = matrix
    .map((line) => line.map((cell) => `"${(cell ?? "").replaceAll('"', '""')}"`).join(","))
    .join("\n");
  download(new Blob([csv], { type: "text/csv;charset=utf-8;" }), `${filename}.csv`);
  void title;
}

/** PDF export via jsPDF + autotable, with a title block and page numbers. */
export function exportPdf<T>(
  title: string,
  columns: ExportColumn<T>[],
  rows: T[],
  filename: string,
): void {
  const matrix = buildMatrix(columns, rows);
  const head = [matrix[0] ?? []];
  const body = matrix.slice(1);
  const doc = new jsPDF({ orientation: columns.length > 5 ? "landscape" : "portrait", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFontSize(15);
  doc.text(title, 40, 36);
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`${rows.length} record(s) · exported ${dateStamp()}`, 40, 52);
  doc.setTextColor(0);

  autoTable(doc, {
    head,
    body,
    startY: 66,
    styles: { fontSize: 8, cellPadding: 4, overflow: "linebreak" },
    headStyles: { fillColor: [29, 119, 145] as [number, number, number], textColor: 255 },
    alternateRowStyles: { fillColor: [245, 247, 250] },
  });

  // Footer page numbers on every page.
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(`Page ${i} of ${pages}`, pageWidth - 40, doc.internal.pageSize.getHeight() - 20, { align: "right" });
  }

  doc.save(`${filename}.pdf`);
}

/** DOCX export: a heading plus a bordered table with a shaded header row. */
export function exportDocx<T>(
  title: string,
  columns: ExportColumn<T>[],
  rows: T[],
  filename: string,
): void {
  const matrix = buildMatrix(columns, rows);
  const head = matrix[0] ?? [];
  const body = matrix.slice(1);

  const headRow = new TableRow({
    tableHeader: true,
    children: head.map(
      (text) =>
        new TableCell({
          shading: { fill: "1D7791", type: ShadingType.CLEAR, color: "auto" },
          margins: { top: 60, bottom: 60, left: 100, right: 100 },
          children: [new Paragraph({ children: [new TextRun({ text, bold: true, color: "FFFFFF" })] })],
        }),
    ),
  });

  const dataRows = body.map(
    (cells) =>
      new TableRow({
        children: cells.map(
          (text) =>
            new TableCell({
              margins: { top: 40, bottom: 40, left: 100, right: 100 },
              children: [new Paragraph({ children: [new TextRun({ text })] })],
            }),
        ),
      }),
  );

  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 2, color: "CCCCCC" },
      bottom: { style: BorderStyle.SINGLE, size: 2, color: "CCCCCC" },
      left: { style: BorderStyle.SINGLE, size: 2, color: "CCCCCC" },
      right: { style: BorderStyle.SINGLE, size: 2, color: "CCCCCC" },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "DDDDDD" },
      insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "DDDDDD" },
    },
    rows: [headRow, ...dataRows],
  });

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({ text: title, heading: HeadingLevel.HEADING_2 }),
          new Paragraph({
            alignment: AlignmentType.LEFT,
            children: [new TextRun({ text: `${rows.length} record(s) · exported ${dateStamp()}`, italics: true, size: 18 })],
          }),
          new Paragraph({ children: [new TextRun("")] }),
          table,
        ],
      },
    ],
  });

  void Packer.toBlob(doc).then((blob) => download(blob, `${filename}.docx`));
}
