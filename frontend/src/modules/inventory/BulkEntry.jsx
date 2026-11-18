"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button, Card, Field, Input, Notice, Select } from "@/_shared/components/ui";
import { PURITIES, grams, inventoryService } from "./inventoryService";

const COLUMNS = "Category, Design, Name, Purity, Gross, Stone, Touch, HUID";
const TEMPLATE = `${COLUMNS}\nCH,Rope,Rope chain 20in,22K,12.45,0,92,\nPD,Lakshmi,Lakshmi pendant,22K,4.82,0.36,103,\n`;

let nextKey = 1;
const blankRow = (defaults) => ({ key: nextKey++, category_id: defaults.category_id || "", design_id: "", name: "", purity: defaults.purity || "22K",
  gross: "", stone: "", touch: defaults.touch || "", huid: "" });

// Split one pasted / CSV line: tabs from Excel, otherwise commas.
const cells = (line) => (line.includes("\t") ? line.split("\t") : line.split(",")).map((c) => c.trim());

// Many pieces in one go: type rows, paste from Excel, or open a CSV.
// Saved all together - if one row is wrong, nothing is saved and the row is named.
export default function BulkEntry() {
  const params = useSearchParams();
  const [categories, setCategories] = useState([]);
  const [designs, setDesigns] = useState([]);
  const [lots, setLots] = useState([]);
  const [lotId, setLotId] = useState(params.get("lot") || "");
  const [defaults, setDefaults] = useState({ category_id: "", purity: "22K", touch: "" });
  const [rows, setRows] = useState(() => [1, 2, 3, 4, 5].map(() => blankRow({})));
  const [paste, setPaste] = useState("");
  const [notice, setNotice] = useState(null);
  const [saved, setSaved] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    inventoryService.listCategories().then((c) => setCategories(c.filter((x) => x.is_active)));
    inventoryService.listDesigns().then((d) => setDesigns(d.filter((x) => x.is_active)));
    inventoryService.listLots({ limit: 100 }).then(setLots);
  }, []);

  const designsFor = useMemo(() => {
    const m = {};
    designs.forEach((d) => (m[d.category_id] ||= []).push(d));
    return m;
  }, [designs]);

  const setRow = (key, k, v) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, [k]: v, ...(k === "category_id" ? { design_id: "" } : {}) } : r)));
  const filled = rows.filter((r) => r.category_id || r.name || r.gross);

  const parse = (text) => {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const out = [];
    const problems = [];
    lines.forEach((line, i) => {
      const [cat, design, name, purity, gross, stone, touch, huid] = cells(line);
      if (i === 0 && /^category$/i.test(cat)) return; // header row
      const c = categories.find((x) => x.code_prefix === cat?.toUpperCase() || x.name.toLowerCase() === cat?.toLowerCase());
      if (!c) return problems.push(`line ${i + 1}: no category "${cat}"`);
      const d = design ? (designsFor[c.id] || []).find((x) => x.name.toLowerCase() === design.toLowerCase()) : null;
      if (design && !d) problems.push(`line ${i + 1}: no design "${design}" in ${c.name} (left blank)`);
      out.push({ ...blankRow({}), category_id: c.id, design_id: d?.id || "", name: name || "", purity: PURITIES.includes(purity?.toUpperCase()) ? purity.toUpperCase() : "22K",
        gross: gross || "", stone: stone || "", touch: touch || "", huid: (huid || "").toUpperCase() });
    });
    return { out, problems };
  };

  const addPasted = (text) => {
    const { out, problems } = parse(text);
    if (out.length) setRows((rs) => [...rs.filter((r) => r.category_id || r.name || r.gross), ...out]);
    setNotice(
      out.length
        ? { tone: problems.length ? "error" : "ok", text: `${out.length} rows added.${problems.length ? ` Check: ${problems.join("; ")}` : ""}` }
        : { tone: "error", text: problems.length ? problems.join("; ") : "Nothing to add." },
    );
    setPaste("");
  };

  const openCsv = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) addPasted(await file.text());
  };

  const save = async () => {
    setNotice(null);
    setBusy(true);
    try {
      const pieces = filled.map((r) => ({
        category_id: r.category_id, design_id: r.design_id || null, name: r.name, purity: r.purity,
        gross_weight: parseFloat(r.gross), stone_weight: r.stone ? parseFloat(r.stone) : 0,
        touch_percent: r.touch ? parseFloat(r.touch) : null, huid: r.huid || null,
      }));
      const res = await inventoryService.createPiecesBulk({ lot_id: lotId || null, pieces });
      setSaved(res.items);
      setRows([1, 2, 3, 4, 5].map(() => blankRow(defaults)));
    } catch (err) {
      setNotice({ tone: "error", text: err.message });
    } finally {
      setBusy(false);
    }
  };

  const net = (r) => {
    const g = parseFloat(r.gross);
    const s = parseFloat(r.stone || "0");
    return Number.isFinite(g) ? grams(g - (Number.isFinite(s) ? s : 0)) : "";
  };

  if (saved) {
    const codes = saved.map((p) => p.item_code);
    return (
      <div className="flex flex-col gap-5">
        <h1 className="text-2xl font-bold">Bulk entry</h1>
        <Card className="p-5">
          <Notice>{saved.length} pieces saved: {codes[0]} … {codes[codes.length - 1]}.</Notice>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href={`/tags?codes=${codes.join(",")}`} className="inline-flex h-9 items-center rounded-lg bg-accent px-3.5 text-sm font-medium text-white">
              Print all {saved.length} tags
            </Link>
            <Button variant="ghost" onClick={() => setSaved(null)}>Enter more</Button>
            <Link href="/inventory" className="inline-flex h-9 items-center px-3 text-sm text-accent hover:underline">Back to inventory</Link>
          </div>
          <p className="mt-4 font-mono text-xs text-muted">{codes.join("  ")}</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href="/inventory" className="text-sm text-muted hover:text-ink">← Inventory</Link>
        <h1 className="text-2xl font-bold">Bulk entry</h1>
        <p className="text-sm text-muted">Enter a whole delivery at once. Codes are given when you save; all rows save together or not at all.</p>
      </div>

      <Card className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Lot" hint="All rows go into this lot">
          <Select value={lotId} onChange={(e) => setLotId(e.target.value)}>
            <option value="">No lot</option>
            {lots.map((l) => <option key={l.id} value={l.id}>{l.lot_no}{l.karigar_name ? ` · ${l.karigar_name}` : ""}</option>)}
          </Select>
        </Field>
        <Field label="New rows: category">
          <Select value={defaults.category_id} onChange={(e) => setDefaults({ ...defaults, category_id: e.target.value })}>
            <option value="">—</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.code_prefix})</option>)}
          </Select>
        </Field>
        <Field label="New rows: purity">
          <Select value={defaults.purity} onChange={(e) => setDefaults({ ...defaults, purity: e.target.value })}>
            {PURITIES.map((p) => <option key={p}>{p}</option>)}
          </Select>
        </Field>
        <Field label="New rows: touch %">
          <Input type="number" step="0.01" value={defaults.touch} onChange={(e) => setDefaults({ ...defaults, touch: e.target.value })} />
        </Field>
      </Card>

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[1000px] text-sm">
          <thead className="bg-canvas text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-2 py-2">#</th>
              <th className="px-2 py-2">Category</th>
              <th className="px-2 py-2">Design</th>
              <th className="px-2 py-2">Name</th>
              <th className="px-2 py-2">Purity</th>
              <th className="px-2 py-2 text-right">Gross g</th>
              <th className="px-2 py-2 text-right">Stone g</th>
              <th className="px-2 py-2 text-right">Net g</th>
              <th className="px-2 py-2 text-right">Touch %</th>
              <th className="px-2 py-2">HUID</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.key} className="border-t border-line">
                <td className="px-2 py-1 text-muted">{i + 1}</td>
                <td className="px-2 py-1">
                  <Select value={r.category_id} onChange={(e) => setRow(r.key, "category_id", e.target.value)} className="h-8 w-32" aria-label={`Row ${i + 1} category`}>
                    <option value="">—</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Select>
                </td>
                <td className="px-2 py-1">
                  <Select value={r.design_id} onChange={(e) => setRow(r.key, "design_id", e.target.value)} className="h-8 w-32" disabled={!r.category_id} aria-label={`Row ${i + 1} design`}>
                    <option value="">—</option>
                    {(designsFor[r.category_id] || []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </Select>
                </td>
                <td className="px-2 py-1"><Input value={r.name} onChange={(e) => setRow(r.key, "name", e.target.value)} className="h-8 w-44" aria-label={`Row ${i + 1} name`} /></td>
                <td className="px-2 py-1">
                  <Select value={r.purity} onChange={(e) => setRow(r.key, "purity", e.target.value)} className="h-8 w-20" aria-label={`Row ${i + 1} purity`}>
                    {PURITIES.map((p) => <option key={p}>{p}</option>)}
                  </Select>
                </td>
                <td className="px-2 py-1"><Input type="number" step="0.001" value={r.gross} onChange={(e) => setRow(r.key, "gross", e.target.value)} className="ml-auto h-8 w-24 text-right" aria-label={`Row ${i + 1} gross`} /></td>
                <td className="px-2 py-1"><Input type="number" step="0.001" value={r.stone} onChange={(e) => setRow(r.key, "stone", e.target.value)} className="ml-auto h-8 w-20 text-right" placeholder="0" aria-label={`Row ${i + 1} stone`} /></td>
                <td className="px-2 py-1 text-right tabular-nums text-muted">{net(r)}</td>
                <td className="px-2 py-1"><Input type="number" step="0.01" value={r.touch} onChange={(e) => setRow(r.key, "touch", e.target.value)} className="ml-auto h-8 w-20 text-right" aria-label={`Row ${i + 1} touch`} /></td>
                <td className="px-2 py-1"><Input value={r.huid} onChange={(e) => setRow(r.key, "huid", e.target.value.toUpperCase())} maxLength={6} className="h-8 w-24 font-mono" aria-label={`Row ${i + 1} HUID`} /></td>
                <td className="px-2 py-1">
                  <button onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} className="text-xs text-muted hover:text-red-700" aria-label={`Remove row ${i + 1}`}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line p-3">
          <Button variant="ghost" onClick={() => setRows((rs) => [...rs, ...[1, 2, 3, 4, 5].map(() => blankRow(defaults))])}>+ 5 rows</Button>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted">{filled.length} row{filled.length === 1 ? "" : "s"} to save</span>
            <Button onClick={save} disabled={busy || filled.length === 0}>{busy ? "Saving…" : `Save ${filled.length} pieces`}</Button>
          </div>
        </div>
      </Card>
      {notice && <Notice tone={notice.tone} onClose={() => setNotice(null)}>{notice.text}</Notice>}

      <Card className="flex flex-col gap-3 p-5">
        <h2 className="font-semibold">Paste from Excel or open a CSV</h2>
        <p className="text-sm text-muted">
          Columns in this order: <span className="font-mono text-xs">{COLUMNS}</span>. Category can be its name or prefix (CH).
          Design and HUID may be blank.
        </p>
        <textarea
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          rows={4}
          placeholder="Copy the rows in Excel and paste them here"
          className="w-full rounded-lg border border-line bg-surface px-3 py-2 font-mono text-xs outline-none focus:border-accent"
        />
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={() => addPasted(paste)} disabled={!paste.trim()}>Add pasted rows</Button>
          <label className="inline-flex h-9 cursor-pointer items-center rounded-lg border border-line px-3.5 text-sm font-medium hover:bg-canvas">
            Open CSV…
            <input type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={openCsv} />
          </label>
          <a href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE)}`} download="pieces-template.csv"
            className="inline-flex h-9 items-center px-2 text-sm text-accent hover:underline">Download a template</a>
        </div>
      </Card>
    </div>
  );
}
