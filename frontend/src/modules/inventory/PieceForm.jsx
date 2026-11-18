"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Field, Input, Notice, Select } from "@/_shared/components/ui";
import { PURITIES, grams, inventoryService } from "./inventoryService";
import SetForm from "./SetForm";

const PRINT_KEY = "inventory.printAfterSave";
const readPrintPref = () => {
  try {
    return localStorage.getItem(PRINT_KEY) !== "0";
  } catch {
    return true;
  }
};

const EMPTY = { category_id: "", design_id: "", name: "", purity: "22K", gross_weight: "", stone_weight: "", touch_percent: "", remarks: "", huid: "", lot_id: "" };

const fromPiece = (p) => ({
  category_id: p.category_id,
  design_id: p.design_id || "",
  name: p.name,
  purity: p.purity,
  gross_weight: String(p.gross_weight),
  stone_weight: p.stone_weight ? String(p.stone_weight) : "",
  touch_percent: p.touch_percent != null ? String(p.touch_percent) : "",
  remarks: p.remarks || "",
  huid: p.huid || "",
  lot_id: p.lot_id || "",
});

// Add a piece, or edit one (piece prop set). The Item Code is never typed:
// the server gives the next code for the category's prefix.
export default function PieceForm({ categories, piece, onSaved, onSetSaved, onCancel }) {
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
  const [designs, setDesigns] = useState([]);
  const [lots, setLots] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setForm(piece ? fromPiece(piece) : EMPTY);
    setError(null);
  }, [piece]);

  useEffect(() => {
    inventoryService.listLots({ limit: 50 }).then(setLots).catch(() => setLots([]));
  }, []);

  useEffect(() => {
    if (!form.category_id) return setDesigns([]);
    inventoryService.listDesigns(form.category_id).then((list) => setDesigns(list.filter((d) => d.is_active || d.id === form.design_id)));
  }, [form.category_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  // Picking a design names the piece ("Rope chain") if no name was typed yet.
  const pickDesign = (e) => {
    const id = e.target.value;
    const d = designs.find((x) => x.id === id);
    setForm((f) => ({ ...f, design_id: id, name: f.name || !d ? f.name : `${d.name} ${(category?.name || "").toLowerCase()}` }));
  };
  const category = categories.find((c) => c.id === form.category_id);

  // Shown live; the server computes the stored value the same way.
  const net = useMemo(() => {
    const g = parseFloat(form.gross_weight);
    const s = parseFloat(form.stone_weight || "0");
    return Number.isFinite(g) && Number.isFinite(s) ? Math.round((g - s) * 1000) / 1000 : null;
  }, [form.gross_weight, form.stone_weight]);
  const netBad = net !== null && net <= 0;

  const submit = async (e) => {
    e.preventDefault();
    if (netBad) return setError("Stone weight must be less than gross weight.");
    setBusy(true);
    setError(null);
    const body = {
      design_id: form.design_id || null,
      name: form.name,
      purity: form.purity,
      gross_weight: parseFloat(form.gross_weight),
      stone_weight: form.stone_weight ? parseFloat(form.stone_weight) : 0,
      touch_percent: form.touch_percent ? parseFloat(form.touch_percent) : null,
      remarks: form.remarks || null,
      huid: form.huid || null,
      lot_id: form.lot_id || null,
    };
    try {
      const saved = editing
        ? await inventoryService.updatePiece(piece.id, body)
        : await inventoryService.createPiece({ ...body, category_id: form.category_id });
      // Keep what the next piece of the delivery probably shares.
      if (!editing) setForm((f) => ({ ...EMPTY, category_id: f.category_id, design_id: f.design_id, purity: f.purity, lot_id: f.lot_id, touch_percent: f.touch_percent }));
      onSaved(saved, editing, printAfter);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const printBox = (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={printAfter} onChange={(e) => togglePrint(e.target.checked)} />
      Print the tag{mode === "set" ? "s" : ""} after saving
    </label>
  );

  const toggle = !editing && (
    <div className="flex rounded-lg border border-line bg-canvas p-0.5 text-sm" role="tablist" aria-label="What are you adding?">
      {[["piece", "One piece"], ["set", "A set"]].map(([id, label]) => (
        <button key={id} type="button" role="tab" aria-selected={mode === id} onClick={() => setMode(id)}
          className={`flex-1 rounded-md px-3 py-1 ${mode === id ? "bg-surface font-medium shadow-sm" : "text-muted"}`}>
          {label}
        </button>
      ))}
    </div>
  );

  if (!editing && mode === "set") {
    return (
      <div className="flex flex-col gap-3">
        <h2 className="font-semibold">Add stock</h2>
        {toggle}
        <SetForm categories={categories} footer={printBox} onSaved={(combo) => onSetSaved(combo, printAfter)} />
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-semibold">{editing ? "Edit piece" : "Add stock"}</h2>
        {editing && <span className="font-mono text-sm font-semibold text-accent">{piece.item_code}</span>}
      </div>
      {toggle}

      <Field
        label="Category"
        hint={editing ? "Fixed: the Item Code already carries its prefix." : category ? `Next code will start with ${category.code_prefix}` : undefined}
      >
        <Select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value, design_id: "" })} required disabled={editing}>
          <option value="">Choose…</option>
          {categories
            .filter((c) => c.is_active || c.id === form.category_id)
            .map((c) => (
              <option key={c.id} value={c.id}>{c.name} ({c.code_prefix})</option>
            ))}
        </Select>
      </Field>

      <Field label="Design" hint="Optional">
        <Select value={form.design_id} onChange={pickDesign} disabled={!form.category_id}>
          <option value="">None</option>
          {designs.map((d) => (
            <option key={d.id} value={d.id}>{d.name}{d.design_no ? ` · ${d.design_no}` : ""}</option>
          ))}
        </Select>
      </Field>

      <Field label="Name">
        <Input value={form.name} onChange={set("name")} placeholder="Rope chain" required minLength={2} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Purity">
          <Select value={form.purity} onChange={set("purity")}>
            {PURITIES.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </Select>
        </Field>
        <Field label="Touch %" hint="Optional">
          <Input type="number" step="0.01" min="0" max="200" value={form.touch_percent} onChange={set("touch_percent")} placeholder="103" />
        </Field>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Field label="Gross (g)">
          <Input type="number" step="0.001" min="0.001" value={form.gross_weight} onChange={set("gross_weight")} required className="num" />
        </Field>
        <Field label="Stone (g)">
          <Input type="number" step="0.001" min="0" value={form.stone_weight} onChange={set("stone_weight")} placeholder="0" />
        </Field>
        <Field label="Net (g)" error={netBad ? "Must be above 0" : undefined}>
          <Input value={net === null ? "" : grams(net)} disabled aria-label="Net weight" />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="HUID" hint="Hallmark ID, 6 characters">
          <Input value={form.huid} onChange={(e) => setForm({ ...form, huid: e.target.value.toUpperCase() })} maxLength={6}
            pattern="[A-Za-z0-9]{6}" className="font-mono uppercase" placeholder="Optional" />
        </Field>
        <Field label="Lot" hint="Delivery it came in">
          <Select value={form.lot_id} onChange={set("lot_id")}>
            <option value="">None</option>
            {lots.map((l) => (
              <option key={l.id} value={l.id}>{l.lot_no}{l.karigar_name ? ` · ${l.karigar_name}` : ""}</option>
            ))}
          </Select>
        </Field>
      </div>

      <details className="text-sm" open={Boolean(form.remarks)}>
        <summary className="cursor-pointer text-muted">More (remarks)</summary>
        <Field label="Remarks" hint="Optional" className="mt-2">
          <Input value={form.remarks} onChange={set("remarks")} maxLength={1000} />
        </Field>
      </details>

      {error && <Notice tone="error" onClose={() => setError(null)}>{error}</Notice>}
      {!editing && printBox}

      <div className="flex gap-2">
        <Button type="submit" disabled={busy} className="flex-1">
          {busy ? "Saving…" : editing ? "Save changes" : "Add piece"}
        </Button>
        {editing && (
          <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        )}
      </div>
    </form>
  );
}
