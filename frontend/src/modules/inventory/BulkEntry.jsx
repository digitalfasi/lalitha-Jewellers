"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button, Card, Field, Input, Notice, Select } from "@/_shared/components/ui";
import { FEATURES } from "@/_shared/features";
import { useT } from "@/_shared/i18n/LanguageProvider";
import { PURITIES, grams, inventoryService } from "./inventoryService";

const COLUMNS = "Category, Sub-category, Name, Purity, Gross, Less, %, HUID";
const TEMPLATE = `${COLUMNS}\nStone set,Dollar,,22K,15.84,2.14,103,\nStone set,Dollar,,22K,18.96,2.61,103,\n`;

let nextKey = 1;
const num = (v) => (v === "" || v === null || v === undefined ? NaN : parseFloat(v));
const netOf = (r) => {
  const g = num(r.gross);
  const s = num(r.less);
  return Number.isFinite(g) ? g - (Number.isFinite(s) ? s : 0) : NaN;
};
const fineOf = (r) => {
  const n = netOf(r);
  const p = num(r.touch);
  return Number.isFinite(n) && Number.isFinite(p) ? (n * p) / 100 : NaN;
};
const sum = (rows, f) => rows.reduce((a, r) => a + (Number.isFinite(f(r)) ? f(r) : 0), 0);
const g3 = (n) => (Number.isFinite(n) && n !== 0 ? grams(n) : "");

// Split one pasted / CSV line: tabs from Excel, otherwise commas.
const cells = (line) => (line.includes("\t") ? line.split("\t") : line.split(",")).map((c) => c.trim());

// A whole delivery at once, laid out like the trade's own slip: pick the category,
// sub-category, purity and % once, say how many pieces, then type gross and less
// for each. Rows are grouped with a subtotal per group, and saved all together.
export default function BulkEntry() {
  const { t } = useT();
  const params = useSearchParams();
  const [categories, setCategories] = useState([]);
  const [designs, setDesigns] = useState([]);
  const [lots, setLots] = useState([]);
  const [lotId, setLotId] = useState(params.get("lot") || "");
  const [pick, setPick] = useState({ category_id: "", design_id: "", purity: "22K", touch: "", count: "10" });
  const [rows, setRows] = useState([]); // {key, gid, category_id, design_id, purity, touch, name, gross, less, huid}
  const [paste, setPaste] = useState("");
  const [notice, setNotice] = useState(null);
  const [saved, setSaved] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    inventoryService.listCategories().then((c) => setCategories(c.filter((x) => x.is_active)));
    inventoryService.listDesigns().then((d) => setDesigns(d.filter((x) => x.is_active)));
    if (FEATURES.lots) inventoryService.listLots({ limit: 100 }).then(setLots);
  }, []);

  const designsFor = useMemo(() => {
    const m = {};
    designs.forEach((d) => (m[d.category_id] ||= []).push(d));
    return m;
  }, [designs]);
  const catName = (id) => categories.find((c) => c.id === id)?.name || "—";
  const subOf = (id) => designs.find((d) => d.id === id);
  const usualOf = (d) => d?.default_percent ?? d?.usual_touch ?? null;

  const pickSub = (id) => {
    const d = subOf(id);
    setPick((p) => ({ ...p, design_id: id, touch: usualOf(d) != null ? String(usualOf(d)) : p.touch }));
  };

  const groupKey = (r) => `${r.category_id}|${r.design_id}|${r.purity}`;
  const addRows = () => {
    const n = Math.min(Math.max(parseInt(pick.count, 10) || 1, 1), 200);
    const gid = groupKey(pick);
    setRows((rs) => [...rs, ...Array.from({ length: n }, () => ({
      key: nextKey++, gid, category_id: pick.category_id, design_id: pick.design_id, purity: pick.purity,
      touch: pick.touch, name: "", gross: "", less: "", huid: "",
    }))]);
    setNotice(null);
  };

  // Groups in the order they were first added, like headings on the slip.
  const groups = useMemo(() => {
    const order = [];
    const by = {};
    rows.forEach((r) => {
      if (!by[r.gid]) {
        by[r.gid] = [];
        order.push(r.gid);
      }
      by[r.gid].push(r);
    });
    return order.map((gid) => ({ gid, rows: by[gid] }));
  }, [rows]);

  const setRow = (key, k, v) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, [k]: v } : r)));
  const setGroupTouch = (gid, v) => setRows((rs) => rs.map((r) => (r.gid === gid ? { ...r, touch: v } : r)));
  const filled = rows.filter((r) => r.gross);

  // Enter jumps to the same box on the next row, so a column can be typed straight down.
  const onEnter = (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const all = [...document.querySelectorAll(`input[data-col="${e.currentTarget.dataset.col}"]`)];
    all[all.indexOf(e.currentTarget) + 1]?.focus();
  };

  const parse = (text) => {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const out = [];
    const problems = [];
    lines.forEach((line, i) => {
      const [cat, sub, name, purity, gross, less, touch, huid] = cells(line);
      if (i === 0 && /^category$/i.test(cat)) return; // header row
      const c = categories.find((x) => x.code_prefix === cat?.toUpperCase() || x.name.toLowerCase() === cat?.toLowerCase());
      if (!c) return problems.push(t("line {n}: no category \"{c}\"", { n: i + 1, c: cat }));
      const d = sub ? (designsFor[c.id] || []).find((x) => x.name.toLowerCase() === sub.toLowerCase()) : null;
      if (sub && !d) problems.push(t("line {n}: no sub-category \"{s}\" in {c} (left blank)", { n: i + 1, s: sub, c: c.name }));
      const r = { key: nextKey++, category_id: c.id, design_id: d?.id || "", name: name || "",
        purity: PURITIES.includes(purity?.toUpperCase()) ? purity.toUpperCase() : "22K",
        gross: gross || "", less: less || "", touch: touch || (usualOf(d) != null ? String(usualOf(d)) : ""), huid: (huid || "").toUpperCase() };
      out.push({ ...r, gid: groupKey(r) });
    });
    return { out, problems };
  };

  const addPasted = (text) => {
    const { out, problems } = parse(text);
    if (out.length) setRows((rs) => [...rs, ...out]);
    setNotice(
      out.length
        ? { tone: problems.length ? "error" : "ok", text: t("{n} rows added.", { n: out.length }) + (problems.length ? ` ${t("Check:")} ${problems.join("; ")}` : "") }
        : { tone: "error", text: problems.length ? problems.join("; ") : t("Nothing to add.") },
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
    const bad = filled.findIndex((r) => !(netOf(r) > 0));
    if (bad >= 0) return setNotice({ tone: "error", text: t("Row {n}: less must be under the gross weight.", { n: rows.indexOf(filled[bad]) + 1 }) });
    setBusy(true);
    try {
      const pieces = filled.map((r) => ({
        category_id: r.category_id, design_id: r.design_id || null, name: r.name.trim() || null, purity: r.purity,
        gross_weight: num(r.gross), stone_weight: r.less ? num(r.less) : 0,
        touch_percent: r.touch ? num(r.touch) : null, huid: r.huid || null,
      }));
      const res = await inventoryService.createPiecesBulk({ lot_id: (FEATURES.lots && lotId) || null, pieces });
      setSaved(res.items);
      setRows([]);
    } catch (err) {
      setNotice({ tone: "error", text: err.message });
    } finally {
      setBusy(false);
    }
  };

  if (saved) {
    const codes = saved.map((p) => p.item_code);
    return (
      <div className="flex flex-col gap-5">
        <h1 className="text-2xl font-bold">{t("Bulk entry")}</h1>
        <Card className="p-5">
          <Notice>{t("{n} pieces saved: {a} … {b}.", { n: saved.length, a: codes[0], b: codes[codes.length - 1] })}</Notice>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href={`/tags?codes=${codes.join(",")}`} className="inline-flex h-9 items-center rounded-lg bg-accent px-3.5 text-sm font-medium text-white">
              {t("Print all {n} tags", { n: saved.length })}
            </Link>
            <Button variant="ghost" onClick={() => setSaved(null)}>{t("Enter more")}</Button>
            <Link href="/inventory" className="inline-flex h-9 items-center px-3 text-sm text-accent hover:underline">{t("Back to stock")}</Link>
          </div>
          <p className="mt-4 font-mono text-xs text-muted">{codes.join("  ")}</p>
        </Card>
      </div>
    );
  }

  const th = "px-2 py-2";
  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href="/inventory" className="text-sm text-muted hover:text-ink">← {t("Stock")}</Link>
        <h1 className="text-2xl font-bold">{t("Bulk entry")}</h1>
        <p className="text-sm text-muted">{t("Pick what came in and how many, then type each piece's gross and less. Codes are given when you save.")}</p>
      </div>

      <Card className="p-5">
        <div className="grid items-end gap-3 sm:grid-cols-3 lg:grid-cols-[1.2fr_1.2fr_0.7fr_0.7fr_0.6fr_auto]">
          <Field label={t("Category")}>
            <Select value={pick.category_id} onChange={(e) => setPick({ ...pick, category_id: e.target.value, design_id: "" })}>
              <option value="">{t("Choose…")}</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.code_prefix})</option>)}
            </Select>
          </Field>
          <Field label={t("Sub-category")}>
            <Select value={pick.design_id} onChange={(e) => pickSub(e.target.value)} disabled={!pick.category_id}>
              <option value="">{t("None")}</option>
              {(designsFor[pick.category_id] || []).map((d) => <option key={d.id} value={d.id}>{d.name}{usualOf(d) != null ? ` · ${usualOf(d)}%` : ""}</option>)}
            </Select>
          </Field>
          <Field label={t("Purity")}>
            <Select value={pick.purity} onChange={(e) => setPick({ ...pick, purity: e.target.value })}>
              {PURITIES.map((p) => <option key={p}>{p}</option>)}
            </Select>
          </Field>
          <Field label="%">
            <Input type="number" step="0.01" value={pick.touch} onChange={(e) => setPick({ ...pick, touch: e.target.value })} placeholder="103" />
          </Field>
          <Field label={t("How many")}>
            <Input type="number" min="1" max="200" value={pick.count} onChange={(e) => setPick({ ...pick, count: e.target.value })} />
          </Field>
          <Button onClick={addRows} disabled={!pick.category_id} className="h-9">{t("Add {n} rows", { n: parseInt(pick.count, 10) || 1 })}</Button>
        </div>
        {FEATURES.lots && (
          <Field label={t("Lot")} className="mt-3 max-w-xs">
            <Select value={lotId} onChange={(e) => setLotId(e.target.value)}>
              <option value="">{t("No lot")}</option>
              {lots.map((l) => <option key={l.id} value={l.id}>{l.lot_no}{l.karigar_name ? ` · ${l.karigar_name}` : ""}</option>)}
            </Select>
          </Field>
        )}
      </Card>

      {rows.length > 0 && (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[760px] table-fixed text-sm tabular-nums">
            {/* Fixed widths, so every number column lines up with its heading; Product takes the rest. */}
            <colgroup>
              <col className="w-10" /><col /><col className="w-28" /><col className="w-24" /><col className="w-24" />
              <col className="w-24" /><col className="w-24" /><col className="w-28" /><col className="w-10" />
            </colgroup>
            <thead className="bg-canvas text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className={th}>#</th>
                <th className={th}>{t("Product")}</th>
                <th className={`${th} text-right`}>{t("Gross")}</th>
                <th className={`${th} text-right`}>{t("Less")}</th>
                <th className={`${th} text-right`}>{t("Net")}</th>
                <th className={`${th} text-right`}>%</th>
                <th className={`${th} text-right`}>{t("Fine")}</th>
                <th className={th}>HUID</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => {
                const first = g.rows[0];
                const sub = subOf(first.design_id);
                return (
                  <Fragment key={g.gid}>
                    <tr className="border-t border-line bg-accent-soft/30">
                      <td colSpan={5} className="px-2 py-1.5 font-semibold">
                        {catName(first.category_id)}{sub ? ` · ${sub.name}` : ""} <span className="font-normal text-muted">· {first.purity}</span>
                      </td>
                      <td className="px-2 py-1">
                        <Input type="number" step="0.01" value={first.touch} onChange={(e) => setGroupTouch(g.gid, e.target.value)}
                          className="ml-auto block h-8 w-20 text-right" title={t("Set % for every row in this group")} aria-label={t("Group %")} />
                      </td>
                      <td colSpan={3} className="px-2 text-right">
                        <button onClick={() => setRows((rs) => rs.filter((x) => x.gid !== g.gid))} className="text-xs text-muted hover:text-red-700">{t("Remove group")}</button>
                      </td>
                    </tr>
                    {g.rows.map((r) => {
                      const i = rows.indexOf(r);
                      return (
                        <tr key={r.key} className="border-t border-line">
                          <td className="px-2 py-1 text-muted">{i + 1}</td>
                          <td className="px-2 py-1">
                            <Input value={r.name} onChange={(e) => setRow(r.key, "name", e.target.value)} placeholder={sub?.name || catName(r.category_id)}
                              className="h-8 w-full max-w-56" aria-label={t("Row {n} name", { n: i + 1 })} />
                          </td>
                          <td className="px-2 py-1"><Input data-col="gross" onKeyDown={onEnter} type="number" inputMode="decimal" step="0.001" value={r.gross} onChange={(e) => setRow(r.key, "gross", e.target.value)} className="ml-auto block h-8 w-24 text-right" aria-label={t("Row {n} gross", { n: i + 1 })} /></td>
                          <td className="px-2 py-1"><Input data-col="less" onKeyDown={onEnter} type="number" inputMode="decimal" step="0.001" value={r.less} onChange={(e) => setRow(r.key, "less", e.target.value)} className="ml-auto block h-8 w-20 text-right" placeholder="0" aria-label={t("Row {n} less", { n: i + 1 })} /></td>
                          <td className={`px-2 py-1 text-right ${netOf(r) <= 0 ? "text-red-600" : ""}`}>{g3(netOf(r))}</td>
                          <td className="px-2 py-1"><Input data-col="touch" onKeyDown={onEnter} type="number" step="0.01" value={r.touch} onChange={(e) => setRow(r.key, "touch", e.target.value)} className="ml-auto block h-8 w-20 text-right" aria-label={t("Row {n} %", { n: i + 1 })} /></td>
                          <td className="px-2 py-1 text-right font-semibold">{g3(fineOf(r))}</td>
                          <td className="px-2 py-1"><Input data-col="huid" onKeyDown={onEnter} value={r.huid} onChange={(e) => setRow(r.key, "huid", e.target.value.toUpperCase())} maxLength={6} className="h-8 w-full font-mono" aria-label={t("Row {n} HUID", { n: i + 1 })} /></td>
                          <td className="px-2 py-1">
                            <button onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} className="text-xs text-muted hover:text-red-700" aria-label={t("Remove row {n}", { n: i + 1 })}>✕</button>
                          </td>
                        </tr>
                      );
                    })}
                    <tr className="border-t border-line text-muted">
                      <td />
                      <td className="px-2 py-1 text-xs">{t("{n} pieces", { n: g.rows.filter((r) => r.gross).length })}</td>
                      <td className="px-2 py-1 text-right">{g3(sum(g.rows, (r) => num(r.gross)))}</td>
                      <td className="px-2 py-1 text-right">{g3(sum(g.rows, (r) => num(r.less)))}</td>
                      <td className="px-2 py-1 text-right">{g3(sum(g.rows, netOf))}</td>
                      <td />
                      <td className="px-2 py-1 text-right font-semibold text-ink">{g3(sum(g.rows, fineOf))}</td>
                      <td colSpan={2} />
                    </tr>
                  </Fragment>
                );
              })}
              <tr className="border-t-2 border-ink/70 bg-canvas font-semibold">
                <td />
                <td className="px-2 py-2">{t("Total")} · {filled.length}</td>
                <td className="px-2 py-2 text-right">{g3(sum(rows, (r) => num(r.gross)))}</td>
                <td className="px-2 py-2 text-right">{g3(sum(rows, (r) => num(r.less)))}</td>
                <td className="px-2 py-2 text-right">{g3(sum(rows, netOf))}</td>
                <td />
                <td className="px-2 py-2 text-right">{g3(sum(rows, fineOf))}</td>
                <td colSpan={2} />
              </tr>
            </tbody>
          </table>
          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-line p-3">
            <span className="text-sm text-muted">{t("Rows without a gross weight are skipped.")}</span>
            <Button onClick={save} disabled={busy || filled.length === 0}>{busy ? t("Saving…") : t("Save {n} pieces", { n: filled.length })}</Button>
          </div>
        </Card>
      )}
      {notice && <Notice tone={notice.tone} onClose={() => setNotice(null)}>{notice.text}</Notice>}

      <Card className="flex flex-col gap-3 p-5">
        <h2 className="font-semibold">{t("Paste from Excel or open a CSV")}</h2>
        <p className="text-sm text-muted">
          {t("Columns in this order:")} <span className="font-mono text-xs">{COLUMNS}</span>. {t("Category can be its name or prefix (CH). Sub-category, name, % and HUID may be blank.")}
        </p>
        <textarea
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          rows={4}
          placeholder={t("Copy the rows in Excel and paste them here")}
          className="w-full rounded-lg border border-line bg-surface px-3 py-2 font-mono text-xs outline-none focus:border-accent"
        />
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={() => addPasted(paste)} disabled={!paste.trim()}>{t("Add pasted rows")}</Button>
          <label className="inline-flex h-9 cursor-pointer items-center rounded-lg border border-line px-3.5 text-sm font-medium hover:bg-canvas">
            {t("Open CSV…")}
            <input type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={openCsv} />
          </label>
          <a href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE)}`} download="pieces-template.csv"
            className="inline-flex h-9 items-center px-2 text-sm text-accent hover:underline">{t("Download a template")}</a>
        </div>
      </Card>
    </div>
  );
}
