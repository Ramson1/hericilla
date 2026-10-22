"use client";

import { getSupabase } from "@hericilla/supabase-clients";

// Loose alias for the chainable PostgREST filter builder (avoids pinning supabase-js internal generics).
/* eslint-disable @typescript-eslint/no-explicit-any */
type CountBuilder = any;
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Head-count query that tolerates missing tables (returns 0 instead of throwing). */
export async function headCount(
  table: string,
  build?: (q: CountBuilder) => CountBuilder,
): Promise<number> {
  try {
    const base = getSupabase().from(table).select("*", { count: "exact", head: true });
    const { count, error } = await (build ? build(base) : base);
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

/** Start-of-today in West Africa Time as an ISO string (server runs UTC). */
export function todayWat(): { start: string; date: string } {
  const now = new Date(Date.now() + 1 * 60 * 60 * 1000); // WAT = UTC+1
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return { start: `${y}-${m}-${d}T00:00:00+01:00`, date: `${y}-${m}-${d}` };
}

export function money(n: number | string | null | undefined): string {
  const v = typeof n === "string" ? Number(n) : (n ?? 0);
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(
    Number.isFinite(v) ? v : 0,
  );
}
