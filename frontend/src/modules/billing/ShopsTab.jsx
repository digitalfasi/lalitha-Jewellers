"use client";

import { FEATURES } from "@/_shared/features";
import { useCallback, useEffect, useState } from "react";
import { Button, Card, Field, Input, Notice, Select } from "@/_shared/components/ui";
import { GST_STATES, STATE_OPTIONS } from "@/_shared/gstStates";
import { useT } from "@/_shared/i18n/LanguageProvider";
import { billingService } from "./billingService";
import GoldAccount from "./GoldAccount";

const EMPTY = { name: "", contact_person: "", phone: "", gstin: "", city: "", address: "", state_code: "",
  price_mode: "", deal_touch: "", deal_wastage: "", deal_making: "", settles_in_gold: false };
const numOrNull = (v) => (v === "" || v === null || v === undefined ? null : Number(v));

/** The shop's usual deal in a few words: "22K + 8% wastage · ₹150/g making". */
export function dealText(s) {
  if (!s?.price_mode) return "";
  const head = s.price_mode === "TOUCH" ? `${s.deal_touch ?? "—"} touch` : `+ ${s.deal_wastage ?? 0}% wastage`;
  return [head, s.deal_making ? `₹${s.deal_making}/g making` : null].filter(Boolean).join(" · ");
}

// Retail shops the wholesaler bills.
export default function ShopsTab() {
  const { t } = useT();
  const [shops, setShops] = useState([]);
  const [goldShop, setGoldShop] = useState(null);
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
      const body = { ...form, price_mode: form.price_mode || null, deal_touch: numOrNull(form.deal_touch),
        deal_wastage: numOrNull(form.deal_wastage), deal_making: numOrNull(form.deal_making) };
      const saved = editingId ? await billingService.updateShop(editingId, body) : await billingService.createShop(body);
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
      price_mode: s.price_mode || "", deal_touch: s.deal_touch ?? "", deal_wastage: s.deal_wastage ?? "",
      deal_making: s.deal_making ?? "", settles_in_gold: !!s.settles_in_gold,
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
        <table className="w-full min-w-[520px] text-sm">
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
                  {((FEATURES.shopDeals && dealText(s)) || s.settles_in_gold) && (
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                      {FEATURES.shopDeals && dealText(s) && <span className="rounded-full bg-canvas px-2 py-0.5">{dealText(s)}</span>}
                      {s.settles_in_gold && (
                        <button onClick={() => setGoldShop(s)} className={`rounded-full px-2 py-0.5 font-medium tabular-nums ${
                          s.gold_balance > 0 ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-800"}`}>
                          {t("Gold")} {Number(s.gold_balance || 0).toFixed(3)} g ›
                        </button>
                      )}
                    </div>
                  )}
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
          <fieldset className="flex flex-col gap-3 rounded-xl border border-line p-3">
            {FEATURES.shopDeals && <>
            <legend className="px-1 text-sm font-medium">{t("Usual deal (fills in on bills)")}</legend>
            <Select value={form.price_mode} onChange={set("price_mode")}>
              <option value="">{t("No usual deal")}</option>
              <option value="TOUCH">{t("By touch %")}</option>
              <option value="WASTAGE">{t("Purity + wastage")}</option>
            </Select>
            {form.price_mode && (
              <div className="grid grid-cols-2 gap-3">
                {form.price_mode === "TOUCH" ? (
                  <Field label={t("Touch %")}><Input type="number" step="0.01" min="0" max="200" value={form.deal_touch} onChange={set("deal_touch")} /></Field>
                ) : (
                  <Field label={t("Wastage %")}><Input type="number" step="0.01" min="0" max="100" value={form.deal_wastage} onChange={set("deal_wastage")} /></Field>
                )}
                <Field label={t("Making ₹/g")}><Input type="number" step="0.01" min="0" value={form.deal_making} onChange={set("deal_making")} /></Field>
              </div>
            )}
            </>}
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-0.5 h-4 w-4" checked={form.settles_in_gold}
                onChange={(e) => setForm((f) => ({ ...f, settles_in_gold: e.target.checked }))} />
              <span>{t("Settles in fine gold")}<span className="block text-xs text-muted">{t("Each bill adds its fine gold to the shop's gold account.")}</span></span>
            </label>
          </fieldset>
          {notice && <Notice tone={notice.tone} onClose={() => setNotice(null)}>{notice.text}</Notice>}
          <div className="flex gap-2">
            <Button type="submit" disabled={busy} className="flex-1">{busy ? "Saving…" : editingId ? "Save changes" : "Add shop"}</Button>
            {editingId && (
              <Button type="button" variant="ghost" onClick={() => { setEditingId(null); setForm(EMPTY); }}>Cancel</Button>
            )}
          </div>
        </form>
      </Card>
      <GoldAccount shop={goldShop} onClose={() => setGoldShop(null)} onChanged={load} />
    </div>
  );
}
