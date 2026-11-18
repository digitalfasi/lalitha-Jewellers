"use client";

import { useEffect, useState } from "react";
import { Button, Field, Input, Notice, Select } from "@/_shared/components/ui";
import { inventoryService } from "@/modules/inventory/inventoryService";
import { comboService } from "./comboService";

const blank = () => ({ id: null, name: "", slots: [{ category_id: "", label: "" }, { category_id: "", label: "" }], is_active: true });

// Saved recipes for sets, e.g. "Chain + Pendant", "Necklace + 2 drops". Managers only.
export default function TemplatesManager({ onDone }) {
  const [templates, setTemplates] = useState([]);
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState(blank());
  const [notice, setNotice] = useState(null);

  const load = () => comboService.templates(true).then(setTemplates);
  useEffect(() => {
    load();
    inventoryService.listCategories().then((c) => setCategories(c.filter((x) => x.is_active)));
  }, []);

  const setSlot = (i, k, v) => setForm((f) => ({ ...f, slots: f.slots.map((s, j) => (j === i ? { ...s, [k]: v } : s)) }));

  const save = async (e) => {
    e.preventDefault();
    const body = { name: form.name, slots: form.slots.map((s) => ({ category_id: s.category_id, label: s.label || null })), is_active: form.is_active };
    try {
      if (form.id) await comboService.updateTemplate(form.id, body);
      else await comboService.createTemplate(body);
      setNotice({ tone: "ok", text: `Template “${form.name}” saved.` });
      setForm(blank());
      load();
    } catch (err) {
      setNotice({ tone: "error", text: err.message });
    }
  };

  const edit = (t) => setForm({ id: t.id, name: t.name, is_active: t.is_active,
    slots: t.slots.map((s) => ({ category_id: s.category_id, label: s.label === s.category_name ? "" : s.label })) });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <h2 className="font-semibold">Combo templates</h2>
        <Button variant="link" onClick={onDone}>Done</Button>
      </div>

      <ul className="divide-y divide-line rounded-xl border border-line text-sm">
        {templates.length === 0 && <li className="px-3 py-4 text-center text-muted">No templates yet.</li>}
        {templates.map((t) => (
          <li key={t.id} className={`flex items-center justify-between gap-3 px-3 py-2 ${t.is_active ? "" : "opacity-50"}`}>
            <div>
              <div className="font-medium">{t.name}</div>
              <div className="text-xs text-muted">{t.slots.map((s) => s.label).join(" + ")}</div>
            </div>
            <Button variant="link" onClick={() => edit(t)}>Edit</Button>
          </li>
        ))}
      </ul>

      <form onSubmit={save} className="flex flex-col gap-3 rounded-xl border border-line p-3">
        <h3 className="text-sm font-semibold">{form.id ? "Edit template" : "New template"}</h3>
        <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required minLength={2} placeholder="Chain + Pendant" /></Field>
        {form.slots.map((s, i) => (
          <div key={i} className="flex items-end gap-2">
            <Field label={`Slot ${i + 1}`} className="flex-1">
              <Select value={s.category_id} onChange={(e) => setSlot(i, "category_id", e.target.value)} required>
                <option value="">Category…</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="Label" className="w-32"><Input value={s.label} onChange={(e) => setSlot(i, "label", e.target.value)} placeholder="optional" maxLength={50} /></Field>
            {form.slots.length > 2 && (
              <button type="button" className="mb-2 text-xs text-muted hover:text-red-700" aria-label={`Remove slot ${i + 1}`}
                onClick={() => setForm((f) => ({ ...f, slots: f.slots.filter((_, j) => j !== i) }))}>✕</button>
            )}
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-3">
          {form.slots.length < 10 && (
            <Button type="button" variant="ghost" onClick={() => setForm((f) => ({ ...f, slots: [...f.slots, { category_id: "", label: "" }] }))}>+ Slot</Button>
          )}
          {form.id && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> In use
            </label>
          )}
        </div>
        {notice && <Notice tone={notice.tone} onClose={() => setNotice(null)}>{notice.text}</Notice>}
        <div className="flex gap-2">
          <Button type="submit">{form.id ? "Save template" : "Add template"}</Button>
          {form.id && <Button type="button" variant="ghost" onClick={() => setForm(blank())}>New instead</Button>}
        </div>
      </form>
    </div>
  );
}
