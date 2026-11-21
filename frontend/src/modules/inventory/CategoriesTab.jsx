"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, Field, Input, Notice } from "@/_shared/components/ui";
import { useT } from "@/_shared/i18n/LanguageProvider";
import { inventoryService } from "./inventoryService";

// Categories own the code prefix (CH -> CH0001). Once a piece is coded the
// prefix is locked, because printed tags already carry it. Sub-categories
// (Singapore, Dollar, Adigai…) sit under a category and carry the usual %.
// HSN is set once in Settings → Bill settings; a category can override it in Edit.
export default function CategoriesTab({ categories, onChanged }) {
  const { t } = useT();
  const [form, setForm] = useState({ name: "", code_prefix: "" });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [editing, setEditing] = useState(null); // {id, name, code_prefix, hsn_code}
  const [subs, setSubs] = useState([]);

  const loadSubs = useCallback(() => {
    inventoryService.listDesigns("").then(setSubs).catch(() => {});
  }, []);
  useEffect(loadSubs, [loadSubs, categories]);

  const add = async (e) => {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      const cat = await inventoryService.createCategory(form);
      setForm({ name: "", code_prefix: "" });
      setNotice({ tone: "ok", text: t("{c} added. Its pieces will be coded {p}0001, {p}0002…", { c: cat.name, p: cat.code_prefix }) });
      onChanged();
    } catch (err) {
      setNotice({ tone: "error", text: err.message });
    } finally {
      setBusy(false);
    }
  };

  const save = async (cat, body) => {
    setNotice(null);
    try {
      await inventoryService.updateCategory(cat.id, body);
      setEditing(null);
      onChanged();
    } catch (err) {
      setNotice({ tone: "error", text: err.message });
    }
  };

  const subsOf = (id) => subs.filter((s) => s.category_id === id && s.is_active);

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[1fr_320px]">
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-canvas text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-2.5">{t("Category")}</th>
              <th className="px-4 py-2.5">{t("Sub-categories")}</th>
              <th className="px-4 py-2.5">{t("Prefix")}</th>
              <th className="px-4 py-2.5 text-right">{t("Pieces")}</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {categories.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted">
                  {t("No categories yet. Add Chain, Pendant, Ring… on the right.")}
                </td>
              </tr>
            )}
            {categories.map((c) =>
              editing?.id === c.id ? (
                <tr key={c.id} className="border-t border-line bg-accent-soft/30">
                  <td className="px-4 py-2">
                    <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} aria-label={t("Category name")} />
                  </td>
                  <td className="px-4 py-2">
                    <label className="flex items-center gap-2 text-xs text-muted">
                      {t("HSN")}
                      <Input value={editing.hsn_code} onChange={(e) => setEditing({ ...editing, hsn_code: e.target.value.replace(/\D/g, "") })}
                        maxLength={8} className="w-24 font-mono" title={t("Only if this category's HSN differs from the one in Settings")} />
                    </label>
                  </td>
                  <td className="px-4 py-2">
                    <Input
                      value={editing.code_prefix}
                      maxLength={3}
                      disabled={c.prefix_locked}
                      title={c.prefix_locked ? t("Locked: pieces already carry this prefix") : undefined}
                      onChange={(e) => setEditing({ ...editing, code_prefix: e.target.value.toUpperCase() })}
                      className="w-20 font-mono"
                      aria-label={t("Code prefix")}
                    />
                  </td>
                  <td />
                  <td className="space-x-2 whitespace-nowrap px-4 py-2 text-right">
                    <Button
                      onClick={() =>
                        save(c, c.prefix_locked
                          ? { name: editing.name, hsn_code: editing.hsn_code }
                          : { name: editing.name, code_prefix: editing.code_prefix, hsn_code: editing.hsn_code })
                      }
                    >
                      {t("Save")}
                    </Button>
                    <Button variant="ghost" onClick={() => setEditing(null)}>{t("Cancel")}</Button>
                  </td>
                </tr>
              ) : (
                <tr key={c.id} className={`border-t border-line align-top ${c.is_active ? "" : "text-muted"}`}>
                  <td className="px-4 py-2.5 font-medium">
                    {c.name}
                    {!c.is_active && <span className="ml-2 text-xs">({t("inactive")})</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {subsOf(c.id).map((s) => (
                        <span key={s.id} className="rounded-full bg-canvas px-2 py-0.5 text-xs">
                          {s.name}{s.default_percent ? <span className="text-muted"> · {s.default_percent}%</span> : null}
                        </span>
                      ))}
                      {subsOf(c.id).length === 0 && <span className="text-xs text-muted">—</span>}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 font-mono">
                    {c.code_prefix}
                    {c.prefix_locked && <span className="ml-1.5 text-xs text-muted" title={t("Pieces already carry this prefix")}>🔒</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{c.piece_count}</td>
                  <td className="space-x-3 whitespace-nowrap px-4 py-2.5 text-right">
                    <Button variant="link" onClick={() => setEditing({ id: c.id, name: c.name, code_prefix: c.code_prefix, hsn_code: c.hsn_code })}>{t("Edit")}</Button>
                    <Button variant="link" onClick={() => save(c, { is_active: !c.is_active })}>
                      {c.is_active ? t("Deactivate") : t("Activate")}
                    </Button>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </Card>

      <Card className="p-5">
        <h2 className="font-semibold">{t("Add category")}</h2>
        <form onSubmit={add} className="mt-4 flex flex-col gap-3">
          <Field label={t("Name")}>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Chain" required minLength={2} />
          </Field>
          <Field label={t("Code prefix")} hint={t("2–3 letters. Starts every Item Code in this category. CB is kept for combos.")}>
            <Input
              value={form.code_prefix}
              onChange={(e) => setForm({ ...form, code_prefix: e.target.value.toUpperCase().replace(/[^A-Z]/g, "") })}
              placeholder="CH"
              maxLength={3}
              required
              minLength={2}
              className="font-mono"
            />
          </Field>
          <Button type="submit" disabled={busy}>{busy ? t("Adding…") : t("Add category")}</Button>
          <p className="text-xs text-muted">{t("Add its sub-categories in the Sub-categories tab.")}</p>
          {notice && <Notice tone={notice.tone} onClose={() => setNotice(null)}>{notice.text}</Notice>}
        </form>
      </Card>
    </div>
  );
}
