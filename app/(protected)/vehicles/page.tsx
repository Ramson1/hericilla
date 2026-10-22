"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader, HintCard, BigButton, StatCard, Skeleton } from "@hericilla/ui";
import { getSupabase } from "@hericilla/supabase-clients";
import { BoardPanel } from "@/components/fleet/Board";
import { RegisterPanel } from "@/components/fleet/Register";
import { AllocationsPanel } from "@/components/fleet/Allocations";
import { MovementsPanel } from "@/components/fleet/Movements";
import { MaintenancePanel } from "@/components/fleet/Maintenance";
import { InspectionsPanel } from "@/components/fleet/Inspections";
import { IncidentsPanel } from "@/components/fleet/Incidents";
import {
  daysUntil,
  type FleetBoardRow,
  type Mini,
  type MovementRow,
  type SiteMini,
  type VehicleRow,
  type WoMini,
} from "@/components/fleet/types";

type Tab = "board" | "register" | "allocations" | "movements" | "maintenance" | "inspections" | "incidents";

const TABS: { key: Tab; label: string }[] = [
  { key: "board", label: "Status board" },
  { key: "register", label: "Register" },
  { key: "allocations", label: "Allocations" },
  { key: "movements", label: "Gate movements" },
  { key: "maintenance", label: "Maintenance" },
  { key: "inspections", label: "Inspections" },
  { key: "incidents", label: "Incidents" },
];

export default function VehiclesPage() {
  const [tab, setTab] = useState<Tab>("board");

  const { data: board, isPending } = useQuery({
    queryKey: ["fleet", "board"],
    queryFn: async () => {
      const { data } = await getSupabase().from("v_fleet_board").select("*");
      return (data as FleetBoardRow[]) ?? [];
    },
  });

  const { data: vehicles } = useQuery({
    queryKey: ["fleet", "vehicles"],
    queryFn: async () => {
      const { data } = await getSupabase().from("vehicles").select("*").order("reg_no");
      return (data as VehicleRow[]) ?? [];
    },
  });

  const { data: drivers } = useQuery({
    queryKey: ["fleet", "drivers"],
    queryFn: async () => {
      const { data } = await getSupabase()
        .from("profiles")
        .select("id, full_name")
        .eq("role", "driver")
        .eq("status", "active")
        .order("full_name");
      return (data as Mini[]) ?? [];
    },
  });

  const { data: workOrders } = useQuery({
    queryKey: ["fleet", "open-wos"],
    queryFn: async () => {
      const { data } = await getSupabase()
        .from("work_orders")
        .select("id, wo_number")
        .not("status", "in", "('closed')")
        .order("created_at", { ascending: false })
        .limit(100);
      return (data as WoMini[]) ?? [];
    },
  });

  const { data: sites } = useQuery({
    queryKey: ["fleet", "sites"],
    queryFn: async () => {
      const { data } = await getSupabase().from("sites").select("id, name").order("name");
      return (data as SiteMini[]) ?? [];
    },
  });

  const { data: recentMovements } = useQuery({
    queryKey: ["fleet", "today-movements"],
    queryFn: async () => {
      const { data } = await getSupabase()
        .from("vehicle_movements")
        .select("id, movement_type")
        .gte("occurred_at", new Date(new Date().setHours(0, 0, 0, 0)).toISOString())
        .limit(500);
      return (data as Pick<MovementRow, "id" | "movement_type">[]) ?? [];
    },
  });

  const all = vehicles ?? [];
  const inService = all.filter((v) => v.status !== "retired");
  const outNow = (board ?? []).filter((v) => v.vehicle_status === "in_use" || v.vehicle_status === "allocated").length;
  const atShop = (board ?? []).filter((v) => v.vehicle_status === "maintenance").length;
  const docAlerts = inService.filter(
    (v) => (daysUntil(v.insurance_expiry) !== null && daysUntil(v.insurance_expiry)! <= 30) || (daysUntil(v.inspection_expiry) !== null && daysUntil(v.inspection_expiry)! <= 30),
  ).length;

  return (
    <div>
      <PageHeader
        title="Vehicles — Movement & Allocation"
        purpose="This page shows every truck, crane and van we own — who has it, where it is today, and when it needs service or papers."
        actions={
          <BigButton variant={tab === "register" ? "primary" : "secondary"} onClick={() => setTab("register")}>
            + Manage register
          </BigButton>
        }
      />
      <HintCard
        steps={[
          "Register each vehicle once — plate, type, insurance and inspection dates.",
          "Allocate a vehicle to a driver (and job); the board updates itself.",
          "Log gate-in / gate-out with the odometer so “where is it now” stays true.",
        ]}
      />

      {isPending ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-4"><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /></div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-4">
          <StatCard label="Vehicles we run" value={String(inService.length)} />
          <StatCard label="Out on the road" value={String(outNow)} tone="brand" />
          <StatCard label="At the workshop" value={String(atShop)} tone={atShop > 0 ? "warning" : "success"} />
          <StatCard label="Papers due within 30 days" value={String(docAlerts)} tone={docAlerts > 0 ? "danger" : "success"} />
        </div>
      )}

      <div className="mt-6 flex gap-3 flex-wrap">
        {TABS.map((t) => (
          <BigButton key={t.key} size="md" variant={tab === t.key ? "primary" : "secondary"} onClick={() => setTab(t.key)}>
            {t.label}
          </BigButton>
        ))}
      </div>

      {tab === "board" && <BoardPanel board={board ?? []} />}
      {tab === "register" && <RegisterPanel vehicles={all} />}
      {tab === "allocations" && <AllocationsPanel vehicles={all} drivers={drivers ?? []} workOrders={workOrders ?? []} sites={sites ?? []} />}
      {tab === "movements" && <MovementsPanel vehicles={all} />}
      {tab === "maintenance" && <MaintenancePanel vehicles={all} />}
      {tab === "inspections" && <InspectionsPanel />}
      {tab === "incidents" && <IncidentsPanel vehicles={all} />}

      {tab === "movements" && recentMovements && recentMovements.length > 0 && (
        <p className="mt-4 text-base text-ink-soft">Today so far: {recentMovements.length} movement event(s) logged.</p>
      )}
    </div>
  );
}
