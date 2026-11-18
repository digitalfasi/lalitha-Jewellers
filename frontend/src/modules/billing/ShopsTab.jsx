"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, Field, Input, Notice, Select } from "@/_shared/components/ui";
import { GST_STATES, STATE_OPTIONS } from "@/_shared/gstStates";
import { billingService } from "./billingService";

const EMPTY = { name: "", contact_person: "", phone: "", gstin: "", city: "", address: "", state_code: "" };

// Retail shops the wholesaler bills.
export default function ShopsTab() {
  const [shops, setShops] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    billingService.listShops({ include_inactive: true }).then(setShops).catch((e) => setNotice({ tone: "error", text: e.message }));
  }, []);
  useEffect(load, [load]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: k === "gstin" ? e.target.value.toUpperCase() : e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      const saved = editingId ? await billingService.updateShop(editingId, form) : await billingService.createShop(form);
      setNotice({ tone: "ok", text: `${saved.name} ${editingId ? "updated" : "added"}.` });
      setForm(EMPTY);
      setEditingId(null);
      load();
    } catch (err) {
      setNotice({ tone: "error", text: err.message });
    } finally {
      setBusy(false);
    }
  };

  const edit = (s) => {
    setEditingId(s.id);
    setForm({
      name: s.name, contact_person: s.contact_person || "", phone: s.phone || "", gstin: s.gstin || "",
      city: s.city || "", address: s.address || "", state_code: s.state_code || "",
    });
  };

  const toggle = async (s) => {
    try {
      await billingService.updateShop(s.id, { is_active: !s.is_active });
      load();
    } catch (err) {
      setNotice({ tone: "error", text: err.message });
    }
  };

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[1fr_340px]">
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-canvas text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-2.5">Shop</th>
              <th className="px-4 py-2.5">Contact</th>
              <th className="px-4 py-2.5">GSTIN</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {shops.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted">No shops yet. Add the retail shops you sell to.</td>
              </tr>
            )}
            {shops.map((s) => (
              <tr key={s.id} className={`border-t border-line ${s.is_active ? "" : "text-muted"}`}>
                <td className="px-4 py-2.5">
                  <div className="font-medium">
                    {s.name}
                    {!s.is_active && <span className="ml-2 text-xs">(inactive)</span>}
                  </div>
                  <div className="text-xs text-muted">{[s.city, s.state_name].filter(Boolean).join(", ")}</div>
                </td>
                <td className="px-4 py-2.5">
                  {s.contact_person}
                  <div className="text-xs text-muted">{s.phone}</div>
                </td>
                <td className="px-4 py-2.5 font-mono text-xs">{s.gstin || "—"}</td>
                <td className="space-x-3 whitespace-nowrap px-4 py-2.5 text-right">
                  <Button variant="link" onClick={() => edit(s)}>Edit</Button>
                  <Button variant="link" onClick={() => toggle(s)}>{s.is_active ? "Deactivate" : "Activate"}</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card className="p-5">
        <h2 className="font-semibold">{editingId ? "Edit shop" : "Add shop"}</h2>
        <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
          <Field label="Shop name">
            <Input value={form.name} onChange={set("name")} required minLength={2} maxLength={150} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Contact person">
              <Input value={form.contact_person} onChange={set("contact_person")} maxLength={100} />
            </Field>
            <Field label="Phone">
              <Input value={form.phone} onChange={set("phone")} maxLength={20} inputMode="tel" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="City">
              <Input value={form.city} onChange={set("city")} maxLength={100} />
            </Field>
            <Field label="GSTIN" hint="Optional, 15 characters">
              <Input value={form.gstin} onChange={set("gstin")} maxLength={15} className="font-mono" />
            </Field>
          </div>
          <Field label="Address">
            <Input value={form.address} onChange={set("address")} maxLength={500} />
          </Field>
          <Field
            label="State (for GST)"
            hint={GST_STATES[form.gstin.slice(0, 2)] ? `From the GSTIN: ${GST_STATES[form.gstin.slice(0, 2)]}` : "Another state's shop is billed IGST; same state CGST + SGST"}
          >
            <Select value={GST_STATES[form.gstin.slice(0, 2)] ? form.gstin.slice(0, 2) : form.state_code} onChange={set("state_code")}
              disabled={!!GST_STATES[form.gstin.slice(0, 2)]}>
              <option value="">Not known</option>
              {STATE_OPTIONS.map(([code, name]) => <option key={code} value={code}>{name} ({code})</option>)}
            </Select>
          </Field>
          {notice && <Notice tone={notice.tone} onClose={() => setNotice(null)}>{notice.text}</Notice>}
          <div className="flex gap-2">
            <Button type="submit" disabled={busy} className="flex-1">{busy ? "Saving…" : editingId ? "Save changes" : "Add shop"}</Button>
            {editingId && (
              <Button type="button" variant="ghost" onClick={() => { setEditingId(null); setForm(EMPTY); }}>Cancel</Button>
            )}
          </div>
        </form>
      </Card>
    </div>
  );
}
