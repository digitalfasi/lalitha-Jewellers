"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, Field, Input, Notice, Select } from "@/_shared/components/ui";
import { useT } from "@/_shared/i18n/LanguageProvider";
import { inventoryService } from "./inventoryService";

// Sub-categories (stored as designs): Chain → Singapore, Stone set → Dollar…
// Each can carry its usual %, which fills in on new stock and on bills.
export default function DesignsTab({ categories }) {
  const { t } = useT();
  const active = categories.filter((c) => c.is_active);
  const [filter, setFilter] = useState("");
  const [subs, setSubs] = useState([]);
  const [form, setForm] = useState({ category_id: "", name: "", default_percent: "" });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [editing, setEditing] = useState(null); // {id, name, default_percent}

  const load = useCallback(() => {
    inventoryService.listDesigns(filter).then(setSubs).catch((e) => setNotice({ tone: "error", text: e.message }));
  }, [filter]);
  useEffect(load, [load]);

  const num = (v) => (v === "" || v === null || v === undefined ? null : Number(v));

  const add = async (e) => {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      const d = await inventoryService.createDesign({ ...form, default_percent: num(form.default_percent) });
      setForm({ ...form, name: "", default_percent: "" });
      setNotice({ tone: "ok", text: t("{s} added to {c}.", { s: d.name, c: d.category_name }) });
      load();
    } catch (err) {
      setNotice({ tone: "error", text: err.message });
    } finally {
      setBusy(false);
    }
  };

  const update = async (d, body) => {
    try {
      await inventoryService.updateDesign(d.id, body);
      setEditing(null);
      load();
    } catch (err) {
      setNotice({ tone: "error", text: err.message });
    }
  };

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[1fr_320px]">
      <div className="flex flex-col gap-3">
        <Select value={filter} onChange={(e) => setFilter(e.target.value)} className="w-56" aria-label={t("Filter by category")}>
          <option value="">{t("All categories")}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-canvas text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-2.5">{t("Sub-category")}</th>
                <th className="px-4 py-2.5">{t("Category")}</th>
                <th className="px-4 py-2.5 text-right">{t("In stock")}</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {subs.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-muted">{t("No sub-categories yet.")}</td>
                </tr>
              )}
              {subs.map((d) =>
                editing?.id === d.id ? (
                  <tr key={d.id} className="border-t border-line bg-accent-soft/30">
                    <td className="px-4 py-2">
                      <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} aria-label={t("Sub-category")} />
                    </td>
                    <td className="px-4 py-2">{d.category_name}</td>
                    <td />
                    <td className="space-x-2 whitespace-nowrap px-4 py-2 text-right">
                      <Button onClick={() => update(d, { name: editing.name })}>{t("Save")}</Button>
                      <Button variant="ghost" onClick={() => setEditing(null)}>{t("Cancel")}</Button>
                    </td>
                  </tr>
                ) : (
                  <tr key={d.id} className={`border-t border-line ${d.is_active ? "" : "text-muted"}`}>
                    <td className="px-4 py-2.5 font-medium">
                      {d.name}
                      {!d.is_active && <span className="ml-2 text-xs">({t("inactive")})</span>}
                    </td>
                    <td className="px-4 py-2.5">{d.category_name}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{d.in_stock_count}</td>
                    <td className="space-x-3 whitespace-nowrap px-4 py-2.5 text-right">
                      <Button variant="link" onClick={() => setEditing({ id: d.id, name: d.name, default_percent: d.default_percent ?? "" })}>{t("Edit")}</Button>
                      <Button variant="link" onClick={() => update(d, { is_active: !d.is_active })}>{d.is_active ? t("Deactivate") : t("Activate")}</Button>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </Card>
      </div>

      <Card className="p-5">
        <h2 className="font-semibold">{t("Add sub-category")}</h2>
        <form onSubmit={add} className="mt-4 flex flex-col gap-3">
          <Field label={t("Category")}>
            <Select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })} required>
              <option value="">{t("Choose…")}</option>
              {active.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
          <Field label={t("Sub-category name")}>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Dollar" required minLength={2} />
          </Field>
          <Button type="submit" disabled={busy}>{busy ? t("Adding…") : t("Add sub-category")}</Button>
          {notice && <Notice tone={notice.tone} onClose={() => setNotice(null)}>{notice.text}</Notice>}
        </form>
      </Card>
    </div>
  );
}
