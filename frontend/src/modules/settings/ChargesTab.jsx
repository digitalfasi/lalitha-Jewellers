"use client";

import { useEffect, useState } from "react";
import { api } from "@/_shared/api/client";
import { Button, Card, Field, Input, Notice } from "@/_shared/components/ui";
import { useT } from "@/_shared/i18n/LanguageProvider";

// Bill settings the owner sets once: HSN, stone and HUID charges, making on/off.
// Every bill starts from these and can change them for that bill.
export default function ChargesTab({ canEdit }) {
  const { t } = useT();
  const [form, setForm] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api("/business").then((b) => setForm({
      default_hsn: b.default_hsn || "7113", huid_rate: b.huid_rate ?? "", stone_rate: b.stone_rate ?? "", show_making: !!b.show_making,
    })).catch((e) => setMsg({ tone: "error", text: e.message }));
  }, []);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const n = (v) => (v === "" || v === null ? null : Number(v));
    try {
      await api("/business/charges", { method: "PUT", body: { ...form, huid_rate: n(form.huid_rate), stone_rate: n(form.stone_rate) } });
      setMsg({ tone: "ok", text: t("Saved. New bills use these.") });
    } catch (err) {
      setMsg({ tone: "error", text: err.message });
    } finally {
      setBusy(false);
    }
  };

  if (!form) return <p className="text-sm text-muted">{t("Loading…")}</p>;
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <Card className="max-w-xl p-5">
      <form onSubmit={save} className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("Stone charge (₹ per g of less)")} hint={t("Less weight × this, on each line. e.g. 515")}>
            <Input type="number" inputMode="decimal" min="0" step="0.01" value={form.stone_rate} onChange={set("stone_rate")} disabled={!canEdit} placeholder="0" />
          </Field>
          <Field label={t("HUID charge (₹ per piece)")} hint={t("Counted from pieces with a HUID")}>
            <Input type="number" inputMode="decimal" min="0" step="0.01" value={form.huid_rate} onChange={set("huid_rate")} disabled={!canEdit} placeholder="0" />
          </Field>
          <Field label={t("HSN code")} hint={t("Printed on bills. 7113 is gold jewellery. A category can have its own in Stock → Categories → Edit.")}>
            <Input value={form.default_hsn} onChange={(e) => setForm({ ...form, default_hsn: e.target.value.replace(/\D/g, "") })} maxLength={8}
              className="font-mono" disabled={!canEdit} />
          </Field>
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5 h-4 w-4" checked={form.show_making} disabled={!canEdit}
            onChange={(e) => setForm({ ...form, show_making: e.target.checked })} />
          <span>{t("Show making charges on bills")}
            <span className="block text-xs text-muted">{t("Off for wholesale: the % already covers wastage and work. Turn on if a dealer pays making per gram.")}</span>
          </span>
        </label>
        {msg && <Notice tone={msg.tone} onClose={() => setMsg(null)}>{msg.text}</Notice>}
        {canEdit && <Button type="submit" disabled={busy} className="self-start">{busy ? t("Saving…") : t("Save")}</Button>}
      </form>
    </Card>
  );
}
