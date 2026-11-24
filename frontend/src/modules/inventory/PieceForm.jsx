"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import ScaleButton from "@/_shared/components/ScaleButton";
import { Button, Field, Input, Notice, Select } from "@/_shared/components/ui";
import { FEATURES } from "@/_shared/features";
import { useT } from "@/_shared/i18n/LanguageProvider";
import { PURITIES, grams, inventoryService } from "./inventoryService";
import { PurityPicker, weightWarnings } from "./pieceHelpers";
import SetForm from "./SetForm";

const PRINT_KEY = "inventory.printAfterSave";
const readPrintPref = () => {
  try {
    return localStorage.getItem(PRINT_KEY) !== "0";
  } catch {
    return true;
  }
};

const EMPTY = { category_id: "", design_id: "", name: "", purity: "22K", gross_weight: "", stone_weight: "", touch_percent: "", cost_touch: "", remarks: "", huid: "", lot_id: "" };

const fromPiece = (p) => ({
  category_id: p.category_id,
  design_id: p.design_id || "",
  name: p.name,
  purity: p.purity,
  gross_weight: String(p.gross_weight),
  stone_weight: p.stone_weight ? String(p.stone_weight) : "",
  touch_percent: p.touch_percent != null ? String(p.touch_percent) : "",
  cost_touch: p.cost_touch != null ? String(p.cost_touch) : "",
  remarks: p.remarks || "",
  huid: p.huid || "",
  lot_id: p.lot_id || "",
});

// Add a piece, or edit one (piece prop set). The Item Code is never typed:
// the server gives the next code for the category's prefix.
export default function PieceForm({ categories, piece, onSaved, onSetSaved, onCancel, hideTitle = false }) {
  const { t } = useT();
  const editing = Boolean(piece);
  const [mode, setMode] = useState("piece"); // piece | set
  const [printAfter, setPrintAfter] = useState(true);
  useEffect(() => setPrintAfter(readPrintPref()), []);
  const togglePrint = (v) => {
    setPrintAfter(v);
    try {
      localStorage.setItem(PRINT_KEY, v ? "1" : "0");
    } catch {}
  };
  const [form, setForm] = useState(piece ? fromPiece(piece) : EMPTY);
  useEffect(() => {
    if (piece) return;
    try {
      const kept = JSON.parse(localStorage.getItem("pieceform.autosave"));
      if (kept?.category_id) setForm({ ...EMPTY, ...kept });
    } catch {}
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (piece) return;
    try {
      localStorage.setItem("pieceform.autosave", JSON.stringify(form));
    } catch {}
  }, [form, piece]);
  const [designs, setDesigns] = useState([]);
  const [lots, setLots] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [warned, setWarned] = useState(null); // warnings shown once; a second Save goes ahead
  const [lastSaved, setLastSaved] = useState(null); // "Saved CH0012" confirmation, shown in the form

  useEffect(() => {
    setForm(piece ? fromPiece(piece) : EMPTY);
    setError(null);
    setWarned(null);
  }, [piece]);

  useEffect(() => {
    if (FEATURES.lots) inventoryService.listLots({ limit: 50 }).then(setLots).catch(() => setLots([]));
  }, []);

  useEffect(() => {
    if (!form.category_id) return setDesigns([]);
    inventoryService.listDesigns(form.category_id).then((list) => setDesigns(list.filter((d) => d.is_active || d.id === form.design_id)));
  }, [form.category_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k) => (e) => {
    setWarned(null);
    setForm((f) => ({ ...f, [k]: e.target.value }));
  };
  const category = categories.find((c) => c.id === form.category_id);
  const design = designs.find((d) => d.id === form.design_id);

  // Picking a sub-category fills its usual %. The name, when left blank, is the sub-category's.
  const usualOf = (d) => d?.default_percent ?? d?.usual_touch ?? null;
  const pickDesign = (e) => {
    const id = e.target.value;
    const d = designs.find((x) => x.id === id);
    setWarned(null);
    setForm((f) => ({
      ...f,
      design_id: id,
      touch_percent: usualOf(d) == null ? f.touch_percent : String(usualOf(d)),
    }));
  };

  // Shown live; the server computes the stored value the same way.
  const net = useMemo(() => {
    const g = parseFloat(form.gross_weight);
    const s = parseFloat(form.stone_weight || "0");
    return Number.isFinite(g) && Number.isFinite(s) ? Math.round((g - s) * 1000) / 1000 : null;
  }, [form.gross_weight, form.stone_weight]);
  const netBad = net !== null && net <= 0;
  const fine = net !== null && form.touch_percent ? Math.round(net * parseFloat(form.touch_percent) * 10) / 1000 : null;

  const submit = async (e) => {
    e.preventDefault();
    if (netBad) return setError(t("Less must be under the gross weight."));
    // "Does this look right?" - once. Pressing Save again goes ahead.
    const warnings = weightWarnings({ gross: parseFloat(form.gross_weight), stone: parseFloat(form.stone_weight || "0"),
      touch: form.touch_percent ? parseFloat(form.touch_percent) : null, design, t });
    if (warnings.length && !warned) return setWarned(warnings);
    setBusy(true);
    setError(null);
    const body = {
      design_id: form.design_id || null,
      name: form.name.trim() || null,
      purity: form.purity,
      gross_weight: parseFloat(form.gross_weight),
      stone_weight: form.stone_weight ? parseFloat(form.stone_weight) : 0,
      touch_percent: form.touch_percent ? parseFloat(form.touch_percent) : null,
      remarks: form.remarks || null,
      huid: form.huid || null,
    };
    if (FEATURES.lots) Object.assign(body, { cost_touch: form.cost_touch ? parseFloat(form.cost_touch) : null, lot_id: form.lot_id || null });
    try {
      const saved = editing
        ? await inventoryService.updatePiece(piece.id, body)
        : await inventoryService.createPiece({ ...body, category_id: form.category_id });
      // Keep what the next piece of the delivery probably shares.
      if (!editing) setForm((f) => ({ ...EMPTY, category_id: f.category_id, design_id: f.design_id, purity: f.purity, lot_id: f.lot_id, touch_percent: f.touch_percent }));
      setWarned(null);
      if (!editing) setLastSaved(saved);
      onSaved(saved, editing, printAfter);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const printBox = (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={printAfter} onChange={(e) => togglePrint(e.target.checked)} className="h-4 w-4" />
      {mode === "set" ? t("Print the tags after saving") : t("Print the tag after saving")}
    </label>
  );

  const toggle = !editing && (
    <div className="flex rounded-lg border border-line bg-canvas p-0.5 text-sm" role="tablist" aria-label={t("What are you adding?")}>
      {[["piece", "One piece"], ["set", "A combo"]].map(([id, label]) => (
        <button key={id} type="button" role="tab" aria-selected={mode === id} onClick={() => setMode(id)}
          className={`flex-1 rounded-md px-3 py-1.5 ${mode === id ? "bg-surface font-medium shadow-sm" : "text-muted"}`}>
          {t(label)}
        </button>
      ))}
    </div>
  );

  if (!editing && mode === "set") {
    return (
      <div className="flex flex-col gap-3">
        {!hideTitle && <h2 className="font-semibold">{t("Add stock")}</h2>}
        {toggle}
        {lastSaved?.combo_code && (
          <Notice onClose={() => setLastSaved(null)}>{t("Saved combo {set}: {codes}", { set: lastSaved.combo_code, codes: lastSaved.pieces.map((x) => x.item_code).join(" + ") })}</Notice>
        )}
        <SetForm categories={categories} footer={printBox} onSaved={(combo) => { setLastSaved(combo); onSetSaved(combo, printAfter); }} />
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      {!hideTitle && (
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="font-semibold">{editing ? t("Edit piece") : t("Add stock")}</h2>
          {editing && <span className="font-mono text-sm font-semibold text-accent">{piece.item_code}</span>}
        </div>
      )}
      {toggle}
      {lastSaved && !lastSaved.combo_code && (
        <Notice onClose={() => setLastSaved(null)}>
          {t("Saved {code} — {name}, net {net} g. Enter the next piece.", { code: lastSaved.item_code, name: lastSaved.name, net: grams(lastSaved.net_weight) })}
        </Notice>
      )}

      <Field
        label={t("Category")}
        hint={editing ? t("Fixed: the Item Code already carries its prefix.") : category ? t("Next code will start with {p}", { p: category.code_prefix }) : undefined}
      >
        <Select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value, design_id: "" })} required disabled={editing}>
          <option value="">{t("Choose…")}</option>
          {categories
            .filter((c) => c.is_active || c.id === form.category_id)
            .map((c) => (
              <option key={c.id} value={c.id}>{c.name} ({c.code_prefix})</option>
            ))}
        </Select>
      </Field>

      <Field label={t("Sub-category")} hint={usualOf(design) != null ? t("Usually {p}%", { p: usualOf(design) }) : t("Optional")}>
        <Select value={form.design_id} onChange={pickDesign} disabled={!form.category_id}>
          <option value="">{t("None")}</option>
          {designs.map((d) => (
            <option key={d.id} value={d.id}>{d.name}{usualOf(d) != null ? ` · ${usualOf(d)}%` : ""}</option>
          ))}
        </Select>
      </Field>

      <Field label={t("Purity")}>
        <PurityPicker value={form.purity} onChange={(p) => setForm({ ...form, purity: p })} options={PURITIES} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label={t("Gross (g)")}>
          <div className="flex gap-1">
            <Input type="number" inputMode="decimal" step="0.001" min="0.001" value={form.gross_weight} onChange={set("gross_weight")} required className="text-base" />
            <ScaleButton onWeight={(g) => { setWarned(null); setForm((f) => ({ ...f, gross_weight: String(g) })); }} />
          </div>
        </Field>
        <Field label={t("Less (g)")} hint={t("Stones and other non-gold")}>
          <div className="flex gap-1">
            <Input type="number" inputMode="decimal" step="0.001" min="0" value={form.stone_weight} onChange={set("stone_weight")} placeholder="0" className="text-base" />
            <ScaleButton onWeight={(g) => { setWarned(null); setForm((f) => ({ ...f, stone_weight: String(g) })); }} />
          </div>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label={t("Net (g)")} error={netBad ? t("Must be above 0") : undefined}>
          <div className="flex h-9 items-center rounded-lg bg-canvas px-3 text-base font-semibold tabular-nums" aria-label={t("Net weight")}>
            {net === null ? "—" : grams(net)}
          </div>
        </Field>
        <Field label="%" hint={t("Fine = net x % / 100")}>
          <Input type="number" inputMode="decimal" step="0.01" min="0" max="200" value={form.touch_percent} onChange={set("touch_percent")} placeholder="103" className="text-base" />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label={t("Fine (g)")}>
          <div className="flex h-9 items-center rounded-lg bg-canvas px-3 text-base font-semibold tabular-nums">{fine === null ? "—" : grams(fine)}</div>
        </Field>
        <Field label="HUID" hint={t("Hallmark ID, 6 characters")}>
          <Input value={form.huid} onChange={(e) => setForm({ ...form, huid: e.target.value.toUpperCase() })} maxLength={6}
            pattern="[A-Za-z0-9]{6}" className="font-mono uppercase" placeholder={t("Optional")} />
        </Field>
      </div>

      {FEATURES.lots && (
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("Cost touch % (karigar)")}>
            <Input type="number" inputMode="decimal" step="0.01" min="0" max="200" value={form.cost_touch} onChange={set("cost_touch")} className="text-base" />
          </Field>
          <Field label={t("Lot")}>
            <Select value={form.lot_id} onChange={set("lot_id")}>
              <option value="">{t("None")}</option>
              {lots.map((l) => (
                <option key={l.id} value={l.id}>{l.lot_no}{l.karigar_name ? ` · ${l.karigar_name}` : ""}</option>
              ))}
            </Select>
          </Field>
        </div>
      )}

      <details className="text-sm" open={Boolean(form.remarks) || (editing && form.name !== (design?.name || category?.name))}>
        <summary className="cursor-pointer text-muted">{t("More (name, remarks)")}</summary>
        <Field label={t("Name")} hint={t("Blank = the sub-category name, e.g. {n}", { n: design?.name || category?.name || "Dollar" })} className="mt-2">
          <Input value={form.name} onChange={set("name")} maxLength={150} />
        </Field>
        <Field label={t("Remarks")} hint={t("Optional")} className="mt-2">
          <Input value={form.remarks} onChange={set("remarks")} maxLength={1000} />
        </Field>
      </details>

      {warned && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900" role="alert">
          <div className="flex items-center gap-2 font-semibold"><AlertTriangle size={16} aria-hidden /> {t("Does this look right?")}</div>
          <ul className="mt-1 list-disc pl-5">{warned.map((w) => <li key={w}>{w}</li>)}</ul>
          <p className="mt-1">{t("Check the weights. If they are correct, press Save again.")}</p>
        </div>
      )}
      {error && <Notice tone="error" onClose={() => setError(null)}>{error}</Notice>}
      {!editing && printBox}

      <div className="flex gap-2">
        <Button type="submit" disabled={busy} className="h-11 flex-1 text-base">
          {busy ? t("Saving…") : warned ? t("Yes, save it") : editing ? t("Save changes") : t("Save piece")}
        </Button>
        {editing && (
          <Button type="button" variant="ghost" onClick={onCancel} className="h-11">{t("Cancel")}</Button>
        )}
      </div>
    </form>
  );
}
