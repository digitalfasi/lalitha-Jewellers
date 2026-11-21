"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { isManager, useAuth } from "@/_shared/auth/AuthProvider";
import Drawer from "@/_shared/components/Drawer";
import { Button, Field, Input, Notice } from "@/_shared/components/ui";
import { useT } from "@/_shared/i18n/LanguageProvider";
import { billingService, fmtDate, inr } from "./billingService";

const KIND = { BILL: "Bill", CANCEL: "Bill cancelled", GOLD: "Gold received", CASH: "Cash received", ADJUST: "Adjustment" };
const g3 = (n) => `${Number(n).toFixed(3)} g`;

// A shop's fine-gold account: bills add what it owes, gold and cash it gives take it off.
export default function GoldAccount({ shop, onClose, onChanged }) {
  const { t } = useT();
  const { user } = useAuth();
  const [acc, setAcc] = useState(null);
  const [kind, setKind] = useState("GOLD");
  const [f, setF] = useState({ gold_weight: "", purity_percent: "99.5", cash: "", rate: "", fine: "", note: "" });
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (shop) billingService.goldAccount(shop.id).then(setAcc).catch((e) => setNotice({ tone: "error", text: e.message }));
  }, [shop]);

  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const n = (v) => (v === "" ? null : Number(v));
  const done = (a) => {
    setAcc(a);
    onChanged?.();
  };

  const add = async (e) => {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      const body = { kind, note: f.note || null };
      if (kind === "GOLD") Object.assign(body, { gold_weight: n(f.gold_weight), purity_percent: n(f.purity_percent) });
      if (kind === "CASH") Object.assign(body, { cash: n(f.cash), rate: n(f.rate) });
      if (kind === "ADJUST") body.fine = n(f.fine);
      done(await billingService.addGold(shop.id, body));
      setF((x) => ({ ...x, gold_weight: "", cash: "", fine: "", note: "" }));
      setNotice({ tone: "ok", text: t("Saved.") });
    } catch (err) {
      setNotice({ tone: "error", text: err.message });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (entry) => {
    if (!window.confirm(t("Remove this entry?"))) return;
    try {
      done(await billingService.removeGold(shop.id, entry.id));
    } catch (err) {
      setNotice({ tone: "error", text: err.message });
    }
  };

  const owes = acc && acc.balance > 0;
  return (
    <Drawer open={!!shop} onClose={onClose} title={shop ? `${t("Gold account")} · ${shop.name}` : ""}>
      {!acc ? <p className="text-sm text-muted">{t("Loading…")}</p> : (
        <div className="flex flex-col gap-4">
          <div className={clsx("rounded-xl p-4", owes ? "bg-amber-50" : "bg-green-50")}>
            <div className="text-sm text-muted">{acc.balance < 0 ? t("We owe the shop") : t("Shop owes")}</div>
            <div className="text-3xl font-bold tabular-nums">{g3(Math.abs(acc.balance))}</div>
            {acc.balance_value !== null && <div className="text-sm tabular-nums text-muted">≈ {inr(Math.abs(acc.balance_value))} {t("at today's rate")}</div>}
            {!acc.settles_in_gold && <p className="mt-2 text-xs text-amber-800">{t("This shop isn't set to settle in gold, so new bills don't add here. Turn it on in Edit shop.")}</p>}
          </div>

          {isManager(user) && (
            <form onSubmit={add} className="flex flex-col gap-3 rounded-xl border border-line p-3">
              <div className="grid grid-cols-3 gap-1 rounded-lg bg-canvas p-1 text-sm">
                {[["GOLD", "Gold"], ["CASH", "Cash"], ["ADJUST", "Adjust"]].map(([k, label]) => (
                  <button key={k} type="button" onClick={() => setKind(k)}
                    className={clsx("rounded-md py-1.5", kind === k ? "bg-surface font-semibold shadow-sm" : "text-muted")}>{t(label)}</button>
                ))}
              </div>
              {kind === "GOLD" && (
                <div className="grid grid-cols-2 gap-3">
                  <Field label={t("Gold given (g)")}><Input type="number" step="0.001" min="0" value={f.gold_weight} onChange={set("gold_weight")} required /></Field>
                  <Field label={t("Its purity %")}><Input type="number" step="0.01" min="0" max="100" value={f.purity_percent} onChange={set("purity_percent")} required /></Field>
                </div>
              )}
              {kind === "CASH" && (
                <div className="grid grid-cols-2 gap-3">
                  <Field label={t("Cash given ₹")}><Input type="number" step="1" min="0" value={f.cash} onChange={set("cash")} required /></Field>
                  <Field label={t("Rate ₹/g")} hint={t("Blank = today's rate")}><Input type="number" step="0.01" min="0" value={f.rate} onChange={set("rate")} /></Field>
                </div>
              )}
              {kind === "ADJUST" && (
                <Field label={t("Fine grams")} hint={t("+ shop owes more, − shop owes less (opening balance, corrections)")}>
                  <Input type="number" step="0.001" value={f.fine} onChange={set("fine")} required />
                </Field>
              )}
              <Field label={t("Note")}><Input value={f.note} onChange={set("note")} maxLength={500} /></Field>
              <Button type="submit" disabled={busy}>{busy ? t("Saving…") : t("Save entry")}</Button>
            </form>
          )}
          {notice && <Notice tone={notice.tone} onClose={() => setNotice(null)}>{notice.text}</Notice>}

          <ul className="divide-y divide-line rounded-xl border border-line text-sm">
            {acc.entries.length === 0 && <li className="p-4 text-center text-muted">{t("No entries yet.")}</li>}
            {acc.entries.map((e) => (
              <li key={e.id} className="flex items-start justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <div className="font-medium">{t(KIND[e.kind] || e.kind)} {e.bill_number && <span className="font-mono text-xs">{e.bill_number}</span>}</div>
                  <div className="text-xs text-muted">
                    {fmtDate(e.entry_date)}
                    {e.gold_weight !== null && ` · ${g3(e.gold_weight)} @ ${e.purity_percent}%`}
                    {e.cash !== null && ` · ${inr(e.cash)} @ ${inr(e.rate)}/g`}
                    {e.note && ` · ${e.note}`}
                  </div>
                </div>
                <div className="shrink-0 text-right tabular-nums">
                  <div className={e.fine > 0 ? "text-amber-700" : "text-green-700"}>{e.fine > 0 ? "+" : "−"}{g3(Math.abs(e.fine))}</div>
                  <div className="text-xs text-muted">{t("bal.")} {g3(e.balance)}</div>
                  {isManager(user) && ["GOLD", "CASH", "ADJUST"].includes(e.kind) && (
                    <button onClick={() => remove(e)} className="text-xs text-red-700 hover:underline">{t("Remove")}</button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Drawer>
  );
}
