"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, Field, Input, Notice, Select } from "@/_shared/components/ui";
import { inventoryService } from "./inventoryService";

// Designs group physical pieces of the same model, so "another one of these"
// is easy to find when building a combo.
export default function DesignsTab({ categories }) {
  const active = categories.filter((c) => c.is_active);
  const [filter, setFilter] = useState("");
  const [designs, setDesigns] = useState([]);
  const [form, setForm] = useState({ category_id: "", name: "", design_no: "" });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);

  const load = useCallback(() => {
    inventoryService.listDesigns(filter).then(setDesigns).catch((e) => setNotice({ tone: "error", text: e.message }));
  }, [filter]);
  useEffect(load, [load]);

  const add = async (e) => {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      const d = await inventoryService.createDesign({ ...form, design_no: form.design_no || null });
      setForm({ ...form, name: "", design_no: "" });
      setNotice({ tone: "ok", text: `${d.name} added to ${d.category_name}.` });
      load();
    } catch (err) {
      setNotice({ tone: "error", text: err.message });
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (d) => {
    try {
      await inventoryService.updateDesign(d.id, { is_active: !d.is_active });
      load();
    } catch (err) {
      setNotice({ tone: "error", text: err.message });
    }
  };

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[1fr_320px]">
      <div className="flex flex-col gap-3">
        <Select value={filter} onChange={(e) => setFilter(e.target.value)} className="w-56" aria-label="Filter by category">
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-canvas text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-2.5">Design</th>
                <th className="px-4 py-2.5">Design no.</th>
                <th className="px-4 py-2.5">Category</th>
                <th className="px-4 py-2.5 text-right">In stock</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {designs.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted">No designs yet.</td>
                </tr>
              )}
              {designs.map((d) => (
                <tr key={d.id} className={`border-t border-line ${d.is_active ? "" : "text-muted"}`}>
                  <td className="px-4 py-2.5 font-medium">
                    {d.name}
                    {!d.is_active && <span className="ml-2 text-xs">(inactive)</span>}
                  </td>
                  <td className="px-4 py-2.5 font-mono">{d.design_no || "—"}</td>
                  <td className="px-4 py-2.5">{d.category_name}</td>
                  <td className="px-4 py-2.5 text-right">{d.in_stock_count}</td>
                  <td className="px-4 py-2.5 text-right">
                    <Button variant="link" onClick={() => toggle(d)}>{d.is_active ? "Deactivate" : "Activate"}</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <Card className="p-5">
        <h2 className="font-semibold">Add design</h2>
        <form onSubmit={add} className="mt-4 flex flex-col gap-3">
          <Field label="Category">
            <Select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })} required>
              <option value="">Choose…</option>
              {active.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Design name">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Rope chain 18in" required minLength={2} />
          </Field>
          <Field label="Design no." hint="Optional — the supplier's or your own number.">
            <Input value={form.design_no} onChange={(e) => setForm({ ...form, design_no: e.target.value })} />
          </Field>
          <Button type="submit" disabled={busy}>{busy ? "Adding…" : "Add design"}</Button>
          {notice && <Notice tone={notice.tone} onClose={() => setNotice(null)}>{notice.text}</Notice>}
        </form>
      </Card>
    </div>
  );
}
