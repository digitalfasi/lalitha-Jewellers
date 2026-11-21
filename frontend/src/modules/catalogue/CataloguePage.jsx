"use client";

import { useEffect, useMemo, useState } from "react";
import { mediaUrl } from "@/_shared/api/client";
import { Button, Card, Input, Notice, Select } from "@/_shared/components/ui";
import { PURITIES, grams } from "@/modules/inventory/inventoryService";
import { comboService } from "@/modules/combos/comboService";
import { settingsService } from "@/modules/settings/settingsService";

// What's available to sell right now: active combos (sets) and free pieces,
// with photos and weights. Tick items to print or share just those.
export default function CataloguePage() {
  const [combos, setCombos] = useState([]);
  const [pieces, setPieces] = useState([]);
  const [biz, setBiz] = useState(null);
  const [show, setShow] = useState("sets"); // sets | pieces | both
  const [q, setQ] = useState("");
  const [purity, setPurity] = useState("");
  const [picked, setPicked] = useState(new Set());
  const [error, setError] = useState(null);

  useEffect(() => {
    comboService.list({ status: "ACTIVE", limit: 200 }).then((r) => setCombos(r.items)).catch((e) => setError(e.message));
    comboService.availablePieces("", 100).then(setPieces).catch((e) => setError(e.message));
    settingsService.business().then(setBiz).catch(() => {});
  }, []);

  const items = useMemo(() => {
    const sets = combos.map((c) => ({
      key: c.combo_code, code: c.combo_code, kind: "SET", photo: c.photo_url,
      title: c.name || c.suggested_name, sub: c.pieces.map((p) => p.item_code).join(" + "),
      purity: [...new Set(c.pieces.map((p) => p.purity))].join(" / "),
      gross: c.totals.gross_weight, net: c.totals.net_weight, text: `${c.combo_code} ${c.name || ""} ${c.pieces.map((p) => `${p.item_code} ${p.name}`).join(" ")}`,
    }));
    const singles = pieces.map((p) => ({
      key: p.item_code, code: p.item_code, kind: "PIECE", photo: p.photo_url, title: p.name,
      sub: `${p.category_name}${p.huid ? ` · HUID ${p.huid}` : ""}`, purity: p.purity, gross: p.gross_weight, net: p.net_weight,
      text: `${p.item_code} ${p.name} ${p.category_name}`,
    }));
    const all = show === "sets" ? sets : show === "pieces" ? singles : [...sets, ...singles];
    const needle = q.trim().toLowerCase();
    return all.filter((i) => (!needle || i.text.toLowerCase().includes(needle)) && (!purity || i.purity.split(" / ").includes(purity)));
  }, [combos, pieces, show, q, purity]);

  const toggle = (key) => setPicked((s) => {
    const n = new Set(s);
    n.has(key) ? n.delete(key) : n.add(key);
    return n;
  });
  const chosen = picked.size ? items.filter((i) => picked.has(i.key)) : items;

  const share = () => {
    const lines = chosen.slice(0, 60).map((i) => `${i.code} – ${i.title} – ${i.purity} – net ${grams(i.net)} g`);
    const text = `${biz?.name ? `${biz.name}\n` : ""}Available now:\n${lines.join("\n")}${chosen.length > 60 ? `\n…and ${chosen.length - 60} more` : ""}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="no-print flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Catalogue</h1>
          <p className="text-sm text-muted">What's available now. Tick items to print or share only those.</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => window.print()}>Print {picked.size ? `${picked.size} selected` : "all"}</Button>
          <Button variant="ghost" onClick={share}>Share list on WhatsApp</Button>
        </div>
      </div>

      <div className="no-print flex flex-wrap gap-2">
        <Select value={show} onChange={(e) => setShow(e.target.value)} className="w-40" aria-label="Show">
          <option value="sets">Combos</option>
          <option value="pieces">Single pieces</option>
          <option value="both">Both</option>
        </Select>
        <Select value={purity} onChange={(e) => setPurity(e.target.value)} className="w-32" aria-label="Purity">
          <option value="">Any purity</option>
          {PURITIES.map((p) => <option key={p}>{p}</option>)}
        </Select>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="w-56" aria-label="Search" />
        {picked.size > 0 && <Button variant="link" onClick={() => setPicked(new Set())}>Clear {picked.size} selected</Button>}
      </div>
      {error && <Notice tone="error" onClose={() => setError(null)}>{error}</Notice>}

      <div className="print-only mb-4">
        <h1 className="text-xl font-bold">{biz?.name || "Catalogue"}</h1>
        <p className="text-sm">{biz?.phone ? `Phone ${biz.phone} · ` : ""}{new Date().toLocaleDateString("en-IN", { dateStyle: "long" })}</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 print:grid-cols-3">
        {items.length === 0 && <p className="col-span-full py-10 text-center text-muted">Nothing available matches.</p>}
        {items.map((i) => (
          <Card key={i.key}
            className={`relative flex flex-col overflow-hidden break-inside-avoid ${picked.size && !picked.has(i.key) ? "print:hidden" : ""} ${picked.has(i.key) ? "ring-2 ring-accent" : ""}`}>
            <label className="no-print absolute right-2 top-2 z-10 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-surface/90 shadow">
              <input type="checkbox" checked={picked.has(i.key)} onChange={() => toggle(i.key)} aria-label={`Select ${i.code}`} />
            </label>
            {i.photo ? (
              <img src={mediaUrl(i.photo)} alt={i.title} className="aspect-square w-full object-cover" loading="lazy" />
            ) : (
              <div className="flex aspect-square w-full items-center justify-center bg-canvas text-xs text-muted">No photo</div>
            )}
            <div className="flex flex-1 flex-col gap-0.5 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-sm font-bold text-accent">{i.code}</span>
                <span className="rounded-full bg-canvas px-2 py-0.5 text-xs">{i.purity}</span>
              </div>
              <div className="text-sm font-medium leading-snug">{i.title}</div>
              <div className="truncate text-xs text-muted">{i.sub}</div>
              <div className="mt-auto pt-1 text-xs tabular-nums">Gross {grams(i.gross)} · <b>Net {grams(i.net)} g</b></div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
