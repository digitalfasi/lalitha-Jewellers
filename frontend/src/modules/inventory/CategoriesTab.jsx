"use client";

import { useState } from "react";
import { Button, Card, Field, Input, Notice } from "@/_shared/components/ui";
import { inventoryService } from "./inventoryService";

// Categories own the code prefix (CH -> CH0001). Once a piece is coded the
// prefix is locked, because printed tags already carry it.
export default function CategoriesTab({ categories, onChanged }) {
  const [form, setForm] = useState({ name: "", code_prefix: "", hsn_code: "7113" });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [editing, setEditing] = useState(null); // {id, name, code_prefix}

  const add = async (e) => {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      const cat = await inventoryService.createCategory(form);
      setForm({ name: "", code_prefix: "", hsn_code: "7113" });
      setNotice({ tone: "ok", text: `${cat.name} added. Its pieces will be coded ${cat.code_prefix}0001, ${cat.code_prefix}0002…` });
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

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[1fr_320px]">
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-canvas text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-2.5">Category</th>
              <th className="px-4 py-2.5">Prefix</th>
              <th className="px-4 py-2.5 text-right">Pieces · HSN</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {categories.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted">
                  No categories yet. Add Chain, Pendant, Ring… on the right.
                </td>
              </tr>
            )}
            {categories.map((c) =>
              editing?.id === c.id ? (
                <tr key={c.id} className="border-t border-line bg-accent-soft/30">
                  <td className="px-4 py-2">
                    <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} aria-label="Category name" />
                  </td>
                  <td className="px-4 py-2">
                    <Input
                      value={editing.code_prefix}
                      maxLength={3}
                      disabled={c.prefix_locked}
                      title={c.prefix_locked ? "Locked: pieces already carry this prefix" : undefined}
                      onChange={(e) => setEditing({ ...editing, code_prefix: e.target.value.toUpperCase() })}
                      className="w-20 font-mono"
                      aria-label="Code prefix"
                    />
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Input value={editing.hsn_code} onChange={(e) => setEditing({ ...editing, hsn_code: e.target.value.replace(/\D/g, "") })}
                      maxLength={8} className="ml-auto w-24 font-mono" aria-label="HSN code" title="HSN code printed on bills" />
                  </td>
                  <td className="space-x-2 whitespace-nowrap px-4 py-2 text-right">
                    <Button
                      onClick={() =>
                        save(c, c.prefix_locked
                          ? { name: editing.name, hsn_code: editing.hsn_code }
                          : { name: editing.name, code_prefix: editing.code_prefix, hsn_code: editing.hsn_code })
                      }
                    >
                      Save
                    </Button>
                    <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                  </td>
                </tr>
              ) : (
                <tr key={c.id} className={`border-t border-line ${c.is_active ? "" : "text-muted"}`}>
                  <td className="px-4 py-2.5 font-medium">
                    {c.name}
                    {!c.is_active && <span className="ml-2 text-xs">(inactive)</span>}
                  </td>
                  <td className="px-4 py-2.5 font-mono">
                    {c.code_prefix}
                    {c.prefix_locked && <span className="ml-1.5 text-xs text-muted" title="Pieces already carry this prefix">🔒</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {c.piece_count}
                    <div className="font-mono text-xs text-muted">HSN {c.hsn_code}</div>
                  </td>
                  <td className="space-x-3 whitespace-nowrap px-4 py-2.5 text-right">
                    <Button variant="link" onClick={() => setEditing({ id: c.id, name: c.name, code_prefix: c.code_prefix, hsn_code: c.hsn_code })}>Edit</Button>
                    <Button variant="link" onClick={() => save(c, { is_active: !c.is_active })}>
                      {c.is_active ? "Deactivate" : "Activate"}
                    </Button>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </Card>

      <Card className="p-5">
        <h2 className="font-semibold">Add category</h2>
        <form onSubmit={add} className="mt-4 flex flex-col gap-3">
          <Field label="Name">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Chain" required minLength={2} />
          </Field>
          <Field label="Code prefix" hint="2–3 letters. Starts every Item Code in this category. CB is kept for combos.">
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
          <Field label="HSN code" hint="Printed on bills. 7113 is jewellery.">
            <Input value={form.hsn_code} onChange={(e) => setForm({ ...form, hsn_code: e.target.value.replace(/\D/g, "") })} maxLength={8} className="font-mono" />
          </Field>
          <Button type="submit" disabled={busy}>{busy ? "Adding…" : "Add category"}</Button>
          {notice && <Notice tone={notice.tone} onClose={() => setNotice(null)}>{notice.text}</Notice>}
        </form>
      </Card>
    </div>
  );
}
