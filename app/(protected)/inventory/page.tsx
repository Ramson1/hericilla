"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  PageHeader,
  HintCard,
  BigButton,
  BigInput,
  BigSelect,
  Card,
  RowCard,
  StatusBadge,
  Modal,
  Skeleton,
  EmptyState,
  StatCard,
} from "@hericilla/ui";
import { getSupabase } from "@hericilla/supabase-clients";
import { STOCK_MOVEMENT_TYPES, statusLabel } from "@hericilla/types";
import { useAuth } from "@/lib/auth";
import { money } from "@/lib/data";

type StockRow = {
  id: string;
  sku: string;
  name: string;
  uom: string;
  location: string | null;
  unit_value: number;
  min_stock_level: number;
  quantity_on_hand: number;
  stock_value: number;
  needs_reorder: boolean;
};
type MovementRow = {
  id: number;
  item_id: string;
  movement_type: string;
  quantity: number;
  note: string | null;
  occurred_at: string;
  item_name?: string;
};
type AlertRow = { item_id: string; on_hand: number; min_level: number; alerted_at: string; item_name?: string };

const ADD_TYPES = new Set(["received", "returned"]);

export default function InventoryPage() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const [tab, setTab] = useState<"stock" | "movements" | "alerts">("stock");
  const [itemOpen, setItemOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [newItem, setNewItem] = useState({ sku: "", name: "", uom: "pcs", min_stock_level: "0", reorder_qty: "0", unit_value: "0", location: "" });
  const [move, setMove] = useState({ item_id: "", movement_type: "received", quantity: "1", note: "", to_location: "" });

  const { data: stock, isPending } = useQuery({
    queryKey: ["stock-levels"],
    queryFn: async () => {
      const { data } = await getSupabase().from("hericilla_stock_valuation").select("*").order("name");
      return (data as StockRow[]) ?? [];
    },
  });

  const { data: movements } = useQuery({
    queryKey: ["stock-movements"],
    queryFn: async () => {
      const { data } = await getSupabase()
        .from("hericilla_stock_movements")
        .select("*, inventory_items:hericilla_inventory_items(name)")
        .order("occurred_at", { ascending: false })
        .limit(200);
      const pick = <T,>(v: unknown): T | null => (v == null ? null : Array.isArray(v) ? ((v[0] as T) ?? null) : (v as T));
      return ((data as MovementRow[]) ?? []).map((r) => ({
        ...r,
        item_name: pick<{ name: string }>((r as unknown as { inventory_items: unknown }).inventory_items)?.name ?? "Item",
      }));
    },
  });

  const { data: alerts } = useQuery({
    queryKey: ["reorder-alerts"],
    queryFn: async () => {
      const { data } = await getSupabase().from("hericilla_reorder_alerts").select("*, inventory_items:hericilla_inventory_items(name)").order("alerted_at", { ascending: false });
      const pick = <T,>(v: unknown): T | null => (v == null ? null : Array.isArray(v) ? ((v[0] as T) ?? null) : (v as T));
      return ((data as AlertRow[]) ?? []).map((r) => ({
        ...r,
        item_name: pick<{ name: string }>((r as unknown as { inventory_items: unknown }).inventory_items)?.name ?? "Item",
      }));
    },
  });

  const totalValue = (stock ?? []).reduce((s, r) => s + Number(r.stock_value), 0);
  const lowCount = (stock ?? []).filter((r) => r.needs_reorder).length;

  async function createItem() {
    if (!newItem.sku.trim() || !newItem.name.trim()) {
      setError("An item needs at least a name and a code (SKU).");
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await getSupabase().from("hericilla_inventory_items").insert({
      sku: newItem.sku.trim().toUpperCase(),
      name: newItem.name.trim(),
      uom: newItem.uom,
      min_stock_level: Number(newItem.min_stock_level) || 0,
      reorder_qty: Number(newItem.reorder_qty) || 0,
      unit_value: Number(newItem.unit_value) || 0,
      location: newItem.location.trim() || null,
    });
    setBusy(false);
    if (err) {
      setError(err.message.includes("duplicate") ? "That code (SKU) is already taken." : "Could not save: " + err.message);
      return;
    }
    setItemOpen(false);
    setNewItem({ sku: "", name: "", uom: "pcs", min_stock_level: "0", reorder_qty: "0", unit_value: "0", location: "" });
    void qc.invalidateQueries({ queryKey: ["stock-levels"] });
  }

  async function recordMovement() {
    if (!move.item_id || !(Number(move.quantity) > 0)) {
      setError("Pick an item and a quantity bigger than zero.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await getSupabase().from("hericilla_stock_movements").insert({
      item_id: move.item_id,
      movement_type: move.movement_type,
      quantity: Number(move.quantity),
      note: move.note || null,
      to_location: move.movement_type === "transferred" ? move.to_location || null : null,
      actor_id: profile?.id,
    });
    setBusy(false);
    if (err) {
      setError("Could not save: " + err.message);
      return;
    }
    setMoveOpen(false);
    setMove({ item_id: "", movement_type: "received", quantity: "1", note: "", to_location: "" });
    void qc.invalidateQueries({ queryKey: ["stock-levels"] });
    void qc.invalidateQueries({ queryKey: ["stock-movements"] });
  }

  async function checkShortages() {
    setRefreshing(true);
    try {
      await getSupabase().rpc("hericilla_refresh_reorder_alerts");
      void qc.invalidateQueries({ queryKey: ["reorder-alerts"] });
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Inventory"
        purpose="Everything we keep in the store: what is on the shelf, what came in, what went out, and what is running low."
        actions={
          <div className="flex gap-3">
            <BigButton variant="secondary" onClick={() => setMoveOpen(true)}>+ Record movement</BigButton>
            <BigButton onClick={() => setItemOpen(true)}>+ New item</BigButton>
          </div>
        }
      />
      <HintCard
        steps={[
          "Add each material once — then every movement picks it from the list.",
          "Received and returned go up; issued, transfers and losses go down.",
          "Items under their minimum show a red “Low” badge — order more in Procurement.",
        ]}
      />

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Items in the store" value={String((stock ?? []).length)} />
        <StatCard label="Stock value" value={money(totalValue)} />
        <StatCard label="Running low" value={String(lowCount)} tone={lowCount > 0 ? "danger" : "success"} />
      </div>

      <div className="mt-6 flex gap-3 flex-wrap">
        <BigButton variant={tab === "stock" ? "primary" : "secondary"} size="md" onClick={() => setTab("stock")}>
          Stock ({stock?.length ?? 0})
        </BigButton>
        <BigButton variant={tab === "movements" ? "primary" : "secondary"} size="md" onClick={() => setTab("movements")}>
          Movements ({movements?.length ?? 0})
        </BigButton>
        <BigButton variant={tab === "alerts" ? "primary" : "secondary"} size="md" onClick={() => setTab("alerts")}>
          Low-stock alerts ({alerts?.length ?? 0})
        </BigButton>
      </div>

      {tab === "stock" &&
        (isPending ? (
          <div className="mt-6 space-y-3"><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
        ) : (stock ?? []).length === 0 ? (
          <div className="mt-6">
            <EmptyState title="The store list is empty" teach="Press “+ New item” to add the first material you keep count of." />
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {(stock ?? []).map((r) => (
              <RowCard
                key={r.id}
                title={`${r.name} (${r.sku})`}
                subtitle={`${Number(r.quantity_on_hand)} ${r.uom} on hand${r.location ? ` · ${r.location}` : ""} · worth ${money(r.stock_value)}`}
                badge={r.needs_reorder ? <StatusBadge status="low" /> : undefined}
                onClick={() => { setMove({ ...move, item_id: r.id }); setMoveOpen(true); }}
              />
            ))}
          </div>
        ))}

      {tab === "movements" && (
        (movements ?? []).length === 0 ? (
          <div className="mt-6">
            <EmptyState title="No movements yet" teach="Every time something arrives or leaves the store, press “+ Record movement”." />
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {(movements ?? []).map((m) => (
              <RowCard
                key={m.id}
                title={`${m.item_name} — ${statusLabel(m.movement_type)} ${ADD_TYPES.has(m.movement_type) ? "+" : "−"}${Number(m.quantity)}`}
                subtitle={`${new Date(m.occurred_at).toLocaleString()}${m.note ? ` · ${m.note}` : ""}`}
                badge={<StatusBadge status={m.movement_type} />}
              />
            ))}
          </div>
        )
      )}

      {tab === "alerts" && (
        <div className="mt-6">
          <Card>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-lg">Alerts are worked out from the stock ledger. Press the button to check for shortages now.</p>
              <BigButton size="md" variant="secondary" disabled={refreshing} onClick={() => void checkShortages()}>
                {refreshing ? "Checking…" : "Check for shortages"}
              </BigButton>
            </div>
          </Card>
          {(alerts ?? []).length === 0 ? (
            <div className="mt-4">
              <EmptyState title="Nothing is running low" teach="When an item drops to its minimum level it will appear here with a red badge." />
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {(alerts ?? []).map((a) => (
                <RowCard
                  key={a.item_id}
                  title={a.item_name ?? "Item"}
                  subtitle={`${Number(a.on_hand)} on hand · minimum ${Number(a.min_level)} · flagged ${new Date(a.alerted_at).toLocaleDateString()}`}
                  badge={<StatusBadge status="low" />}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <Modal open={itemOpen} title="New stock item" onClose={() => { setItemOpen(false); setError(null); }}>
        <div className="space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <BigInput label="Name" required value={newItem.name} onChange={(e) => setNewItem({ ...newItem, name: e.target.value })} />
            <BigInput label="Code (SKU)" required hint="Short and unique, e.g. BOX-CARTON-A4" value={newItem.sku} onChange={(e) => setNewItem({ ...newItem, sku: e.target.value })} />
          </div>
          <div className="grid gap-5 sm:grid-cols-3">
            <BigSelect label="Unit" value={newItem.uom} onChange={(e) => setNewItem({ ...newItem, uom: e.target.value })} options={["pcs", "kg", "litre", "metre", "set"].map((u) => ({ value: u, label: u }))} />
            <BigInput label="Kept in (location)" value={newItem.location} onChange={(e) => setNewItem({ ...newItem, location: e.target.value })} />
            <BigInput label="Value each (₦)" type="number" value={newItem.unit_value} onChange={(e) => setNewItem({ ...newItem, unit_value: e.target.value })} />
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <BigInput label="Warn me when below" type="number" value={newItem.min_stock_level} onChange={(e) => setNewItem({ ...newItem, min_stock_level: e.target.value })} />
            <BigInput label="Order this much" type="number" value={newItem.reorder_qty} onChange={(e) => setNewItem({ ...newItem, reorder_qty: e.target.value })} />
          </div>
          {error && <p className="text-lg text-danger-800">{error}</p>}
          <div className="flex justify-end gap-3">
            <BigButton variant="secondary" onClick={() => setItemOpen(false)}>Cancel</BigButton>
            <BigButton variant="success" disabled={busy} onClick={() => void createItem()}>{busy ? "Saving…" : "Save item"}</BigButton>
          </div>
        </div>
      </Modal>

      <Modal open={moveOpen} title="Record a stock movement" onClose={() => { setMoveOpen(false); setError(null); }}>
        <div className="space-y-5">
          <BigSelect
            label="Which item?"
            required
            value={move.item_id}
            onChange={(e) => setMove({ ...move, item_id: e.target.value })}
            options={[{ value: "", label: "Choose an item…" }, ...(stock ?? []).map((s) => ({ value: s.id, label: `${s.name} (${Number(s.quantity_on_hand)} ${s.uom})` }))]}
          />
          <div className="grid gap-5 sm:grid-cols-2">
            <BigSelect
              label="What happened?"
              value={move.movement_type}
              onChange={(e) => setMove({ ...move, movement_type: e.target.value })}
              options={STOCK_MOVEMENT_TYPES.map((t) => ({ value: t, label: statusLabel(t) }))}
            />
            <BigInput label="Quantity" required type="number" value={move.quantity} onChange={(e) => setMove({ ...move, quantity: e.target.value })} />
          </div>
          {move.movement_type === "transferred" && (
            <BigInput label="Transferred to (location)" value={move.to_location} onChange={(e) => setMove({ ...move, to_location: e.target.value })} />
          )}
          <BigInput label="Why / for which job (optional)" value={move.note} onChange={(e) => setMove({ ...move, note: e.target.value })} />
          {error && <p className="text-lg text-danger-800">{error}</p>}
          <div className="flex justify-end gap-3">
            <BigButton variant="secondary" onClick={() => setMoveOpen(false)}>Cancel</BigButton>
            <BigButton variant="success" disabled={busy} onClick={() => void recordMovement()}>{busy ? "Saving…" : "Save movement"}</BigButton>
          </div>
        </div>
      </Modal>
    </div>
  );
}
