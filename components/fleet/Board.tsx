"use client";

import { RowCard, StatusBadge, Card, EmptyState } from "@hericilla/ui";
import { statusLabel } from "@hericilla/types";
import { daysUntil, fmtDateTime, type FleetBoardRow } from "./types";

function ExpiryChips({ v }: { v: FleetBoardRow }) {
  const chips: string[] = [];
  const ins = daysUntil(v.insurance_expiry);
  const insp = daysUntil(v.inspection_expiry);
  if (ins !== null && ins <= 60) chips.push(ins < 0 ? `Insurance expired ${Math.abs(ins)} days ago` : `Insurance expires in ${ins} days`);
  if (insp !== null && insp <= 60) chips.push(insp < 0 ? `Inspection expired ${Math.abs(insp)} days ago` : `Inspection expires in ${insp} days`);
  if (chips.length === 0) return null;
  return (
    <span className="inline-block mt-1 px-3 py-1 rounded-full bg-danger-100 text-danger-800 text-base font-semibold">
      {chips.join(" · ")}
    </span>
  );
}

const GROUPS: { key: string; label: string; teach: string; statuses: string[] }[] = [
  { key: "out", label: "Out on the road", teach: "These vehicles are allocated or currently moving goods.", statuses: ["in_use", "allocated"] },
  { key: "yard", label: "At the yard", teach: "Ready to be allocated to a job.", statuses: ["available"] },
  { key: "shop", label: "At the workshop", teach: "Under maintenance — check the Maintenance tab.", statuses: ["maintenance"] },
];

export function BoardPanel({ board }: { board: FleetBoardRow[] }) {
  if (board.length === 0) {
    return (
      <div className="mt-6">
        <EmptyState
          title="No vehicles on the board yet"
          teach="Press “+ Add vehicle” in the Register tab to put the first truck on the board."
        />
      </div>
    );
  }
  return (
    <div className="mt-6 space-y-8">
      {GROUPS.map((g) => {
        const rows = board.filter((v) => g.statuses.includes(v.vehicle_status));
        return (
          <section key={g.key}>
            <div className="flex items-baseline gap-3">
              <h2 className="text-xl font-bold text-brand-950">{g.label}</h2>
              <span className="text-base text-ink-soft">{rows.length} vehicle{rows.length === 1 ? "" : "s"}</span>
            </div>
            <p className="text-base text-ink-soft">{g.teach}</p>
            {rows.length === 0 ? (
              <p className="mt-3 text-base text-ink-soft italic">None right now.</p>
            ) : (
              <div className="mt-3 space-y-3">
                {rows.map((v) => (
                  <RowCard
                    key={v.id}
                    title={`${v.reg_no} — ${[v.make, v.model].filter(Boolean).join(" ") || statusLabel(v.vehicle_type)}`}
                    subtitle={
                      <>
                        <span className="block">
                          {v.driver_name ? `Driver: ${v.driver_name}` : "No driver assigned"}
                          {v.wo_number ? ` · Work order ${v.wo_number}` : ""}
                          {" · "}
                          {Number(v.odometer_km ?? 0).toLocaleString()} km on the clock
                        </span>
                        <span className="block">
                          Last seen: {v.last_movement ? statusLabel(v.last_movement) : "no gate event yet"}
                          {v.last_movement_at ? ` · ${fmtDateTime(v.last_movement_at)}` : ""}
                          {v.last_location ? ` · ${v.last_location}` : ""}
                        </span>
                        <ExpiryChips v={v} />
                      </>
                    }
                    badge={<StatusBadge status={v.vehicle_status} />}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}
      <Card>
        <p className="text-base text-ink-soft">
          The board updates from gate movements logged here or in the driver app. Retired vehicles are hidden.
        </p>
      </Card>
    </div>
  );
}
