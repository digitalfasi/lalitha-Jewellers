"use client";

import { useEffect, useMemo, useState } from "react";
import ScaleButton from "@/_shared/components/ScaleButton";
import { Button, Field, Input, Notice, Select } from "@/_shared/components/ui";
import { useT } from "@/_shared/i18n/LanguageProvider";
import { comboService } from "@/modules/combos/comboService";
import { PURITIES, grams, inventoryService } from "./inventoryService";

const row = (category_id = "", purity = "22K", touch = "") =>
  ({ category_id, design_id: "", name: "", purity, gross: "", stone: "", touch, huid: "" });

// New stock that arrives as a set (chain + pendant, necklace + drops...):
// enter its pieces, press Save once - the pieces get their codes and the combo
// its CB code in one go. All or nothing.
export default function SetForm({ categories, onSaved, footer }) {
  const { t } = useT();
  const [templates, setTemplates] = useState([]);
  const [designs, setDesigns] = useState([]);
  const [lots, setLots] = useState([]);
  const [rows, setRows] = useState([row(), row()]);
  const [lotId, setLotId] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    comboService.templates().then(setTemplates).catch(() => {});
    inventoryService.listDesigns().then((d) => setDesigns(d.filter((x) => x.is_active))).catch(() => {});
    inventoryService.listLots({ limit: 50 }).then(setLots).catch(() => {});
  }, []);

  const designsFor = useMemo(() => {
    const m = {};
    designs.forEach((d) => (m[d.category_id] ||= []).push(d));
    return m;
  }, [designs]);
  const catName = (id) => categories.find((c) => c.id === id)?.name || "";

  const applyTemplate = (id) => {
    const t = templates.find((x) => x.id === id);
    if (t) setRows(t.slots.map((s) => row(s.category_id, rows[0]?.purity, rows[0]?.touch)));
  };

  const set = (i, k, v) =>
    setRows((rs) => rs.map((r, j) => {
      if (j !== i) return r;
      const next = { ...r, [k]: v, ...(k === "category_id" ? { design_id: "" } : {}) };
      // Picking a design names the piece, e.g. "Rope chain", if no name was typed.
      if (k === "design_id" && v) {
        const d = designs.find((x) => x.id === v);
        if (d && !r.name) next.name = `${d.name} ${catName(r.category_id).toLowerCase()}`;
        if (d?.usual_touch != null && !r.touch) next.touch = String(d.usual_touch);
      }
      return next;
    }));

  const suggested = rows.filter((r) => r.name).map((r) => r.name).join(" + ");

  const save = async (e) => {
    e.preventDefault();
    setError(null);
    const bad = rows.findIndex((r) => !r.category_id || r.name.trim().length < 2 || !(parseFloat(r.gross) > 0));
    if (bad >= 0) return setError(t("Piece {n}: choose the category, and enter a name and the gross weight.", { n: bad + 1 }));
    setBusy(true);
    try {
      const combo = await comboService.createSet({
        lot_id: lotId || null,
        name: name || suggested || null,
        pieces: rows.map((r) => ({
          category_id: r.category_id, design_id: r.design_id || null, name: r.name.trim(), purity: r.purity,
          gross_weight: parseFloat(r.gross), stone_weight: r.stone ? parseFloat(r.stone) : 0,
          touch_percent: r.touch ? parseFloat(r.touch) : null, huid: r.huid || null,
        })),
      });
      setRows([row(rows[0].category_id, rows[0].purity, rows[0].touch), row(rows[1]?.category_id, rows[0].purity, rows[0].touch)]);
      setName("");
      onSaved(combo);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} className="flex flex-col gap-3">
      {templates.length > 0 && (
        <Field label={t("Kind of combo")} hint={t("Fills in the categories")}>
          <Select defaultValue="" onChange={(e) => applyTemplate(e.target.value)}>
            <option value="">{t("Choose…")}</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </Field>
      )}

      {rows.map((r, i) => (
        <fieldset key={i} className="flex flex-col gap-2 rounded-xl border border-line p-3">
          <legend className="flex w-full items-center justify-between px-1 text-xs font-semibold uppercase tracking-wide text-muted">
            <span>{t("Piece {n}", { n: i + 1 })}{r.category_id ? ` · ${catName(r.category_id)}` : ""}</span>
            {rows.length > 2 && (
              <button type="button" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} className="font-normal normal-case hover:text-red-700">{t("Remove")}</button>
            )}
          </legend>
          <div className="grid grid-cols-2 gap-2">
            <Select value={r.category_id} onChange={(e) => set(i, "category_id", e.target.value)} required aria-label={`Piece ${i + 1} category`}>
              <option value="">{t("Category…")}</option>
              {categories.filter((c) => c.is_active).map((c) => <option key={c.id} value={c.id}>{c.name} ({c.code_prefix})</option>)}
            </Select>
            <Select value={r.design_id} onChange={(e) => set(i, "design_id", e.target.value)} disabled={!r.category_id} aria-label={`Piece ${i + 1} design`}>
              <option value="">{t("Design (optional)")}</option>
              {(designsFor[r.category_id] || []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
          </div>
          <Input value={r.name} onChange={(e) => set(i, "name", e.target.value)} placeholder={t("Name, e.g. Rope chain")} aria-label={`Piece ${i + 1} name`} />
          <div className="grid grid-cols-2 gap-2">
            <Select value={r.purity} onChange={(e) => set(i, "purity", e.target.value)} aria-label={`Piece ${i + 1} purity`}>
              {PURITIES.map((p) => <option key={p}>{p}</option>)}
            </Select>
            <div className="flex gap-1">
              <Input type="number" inputMode="decimal" step="0.001" min="0.001" value={r.gross} onChange={(e) => set(i, "gross", e.target.value)} placeholder={t("Gross g")} aria-label={`Piece ${i + 1} gross`} />
              <ScaleButton onWeight={(g) => set(i, "gross", String(g))} />
            </div>
            <Input type="number" inputMode="decimal" step="0.001" min="0" value={r.stone} onChange={(e) => set(i, "stone", e.target.value)} placeholder={t("Stone g")} aria-label={`Piece ${i + 1} stone`} />
            <Input type="number" inputMode="decimal" step="0.01" value={r.touch} onChange={(e) => set(i, "touch", e.target.value)} placeholder={t("Touch %")} aria-label={`Piece ${i + 1} touch`} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <Input value={r.huid} onChange={(e) => set(i, "huid", e.target.value.toUpperCase())} maxLength={6} placeholder={t("HUID (optional)")} className="w-40 font-mono" aria-label={`Piece ${i + 1} HUID`} />
            {parseFloat(r.gross) > 0 && <span className="text-xs tabular-nums text-muted">{t("net")} {grams(parseFloat(r.gross) - (parseFloat(r.stone) || 0))} g</span>}
          </div>
        </fieldset>
      ))}
      {rows.length < 10 && (
        <Button type="button" variant="ghost" onClick={() => setRows((rs) => [...rs, row("", rs[0].purity, rs[0].touch)])}>{t("+ Another piece")}</Button>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label={t("Combo name")} hint={t("Optional")}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={suggested || "Rope chain + Lakshmi pendant"} maxLength={150} />
        </Field>
        <Field label={t("Lot")}>
          <Select value={lotId} onChange={(e) => setLotId(e.target.value)}>
            <option value="">{t("None")}</option>
            {lots.map((l) => <option key={l.id} value={l.id}>{l.lot_no}{l.karigar_name ? ` · ${l.karigar_name}` : ""}</option>)}
          </Select>
        </Field>
      </div>

      {error && <Notice tone="error" onClose={() => setError(null)}>{error}</Notice>}
      {footer}
      <Button type="submit" disabled={busy}>{busy ? t("Saving…") : t("Save combo of {n} pieces", { n: rows.length })}</Button>
    </form>
  );
}
