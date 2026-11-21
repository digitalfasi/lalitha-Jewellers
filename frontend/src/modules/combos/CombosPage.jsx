"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button, Card, Input, Notice, Select } from "@/_shared/components/ui";
import { grams } from "@/modules/inventory/inventoryService";
import ComboBuilder from "./ComboBuilder";
import ComboDetail from "./ComboDetail";
import { COMBO_STATUS_LABEL, comboService } from "./comboService";

export default function CombosPage() {
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ACTIVE");
  const [data, setData] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null); // a combo, or "new"
  const [error, setError] = useState(null);

  // ?code=CB0001 (from a tag lookup or an inventory badge) opens that combo.
  const params = useSearchParams();
  const wanted = params.get("code");
  useEffect(() => {
    if (!wanted) return;
    comboService
      .getByCode(wanted)
      .then((c) => {
        setSelected(c);
        if (c.status !== "ACTIVE") setStatus("");
      })
      .catch((e) => setError(e.message));
  }, [wanted]);

  useEffect(() => {
    const t = setTimeout(() => setQuery(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(() => {
    setLoading(true);
    comboService
      .list({ q: query, status, limit: 100 })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [query, status]);
  useEffect(load, [load]);

  const changed = (combo) => {
    setSelected(combo);
    load();
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Combos</h1>
          <p className="text-sm text-muted">Link pieces into a combo with its own CB code. Swap or unlink any time; every change is kept.</p>
        </div>
        <Button onClick={() => setSelected("new")}>+ New combo</Button>
      </div>

      {error && <Notice tone="error" onClose={() => setError(null)}>{error}</Notice>}

      <div className="grid items-start gap-5 lg:grid-cols-[1fr_440px]">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Combo code, name or piece code" className="w-64" aria-label="Search combos" />
            <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-36" aria-label="Status">
              <option value="ACTIVE">Active</option>
              <option value="DISSOLVED">Dissolved</option>
              <option value="SOLD">Sold</option>
              <option value="">Any status</option>
            </Select>
          </div>

          <Card className="divide-y divide-line">
            {!loading && data.items.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-muted">
                {query || status !== "ACTIVE" ? "No combos match." : "No combos yet. Click “New combo” to link pieces."}
              </p>
            )}
            {data.items.map((c) => {
              const isSel = selected && selected !== "new" && selected.id === c.id;
              const codes = (c.pieces.length ? c.pieces : c.past_pieces).map((p) => p.item_code);
              return (
                <button
                  key={c.id}
                  onClick={() => setSelected(c)}
                  className={`flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-canvas ${isSel ? "bg-accent-soft/50" : ""}`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold">{c.combo_code}</span>
                      {c.name && <span className="truncate text-sm">{c.name}</span>}
                      {c.status !== "ACTIVE" && <span className="rounded-full bg-line px-2 py-0.5 text-xs text-muted">{COMBO_STATUS_LABEL[c.status]}</span>}
                    </div>
                    <div className="mt-0.5 font-mono text-xs text-muted">{codes.join(" + ")}</div>
                  </div>
                  <div className="text-right text-sm tabular-nums">
                    <div className="font-medium">{grams(c.totals.net_weight)} g</div>
                    <div className="text-xs text-muted">{c.totals.pieces} pieces</div>
                  </div>
                </button>
              );
            })}
          </Card>
          <span className="text-sm text-muted">{loading ? "Loading…" : `${data.total} combo${data.total === 1 ? "" : "s"}`}</span>
        </div>

        <Card className="p-5 lg:sticky lg:top-6">
          {selected === "new" ? (
            <ComboBuilder onCreated={changed} onCancel={() => setSelected(null)} />
          ) : selected ? (
            <ComboDetail combo={selected} onChanged={changed} />
          ) : (
            <p className="py-8 text-center text-sm text-muted">Pick a combo to see its pieces and history, or start a new one.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
