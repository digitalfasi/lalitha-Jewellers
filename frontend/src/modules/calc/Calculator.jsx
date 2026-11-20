"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { Copy, MessageCircle, X } from "lucide-react";
import { api } from "@/_shared/api/client";
import { beep } from "@/_shared/beep";
import { localToday } from "@/_shared/dates";
import Drawer from "@/_shared/components/Drawer";
import ScaleButton from "@/_shared/components/ScaleButton";
import { Button, Field, Input, Notice, Select } from "@/_shared/components/ui";
import { useT } from "@/_shared/i18n/LanguageProvider";
import { PURITIES, inventoryService } from "@/modules/inventory/inventoryService";
import { calcService, g3, num, pv, rs, useLive } from "./calcService";

// The counter calculator: a side panel over any screen. Nothing here is saved.
// Today's rate fills itself in; the sums come from the server, so they match the bills.
const TABS = [
  ["value", "Gold value"],
  ["quote", "Quick quote"],
  ["rates", "Rate chart"],
  ["old", "Old gold"],
  ["money", "Money → gold"],
  ["account", "Gold account"],
  ["gst", "GST"],
];
const TAB_KEY = "calc.tab";

export default function Calculator({ open, onClose }) {
  const { t } = useT();
  const [tab, setTabState] = useState("value");
  const [rate, setRate] = useState("");
  const [gst, setGst] = useState("3");
  const [interstate, setInterstate] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(TAB_KEY);
      if (TABS.some(([k]) => k === saved)) setTabState(saved);
    } catch {}
  }, []);
  const setTab = (k) => {
    setTabState(k);
    try {
      localStorage.setItem(TAB_KEY, k);
    } catch {}
  };

  // Today's rate each time the panel opens (and when someone changes it in Settings).
  useEffect(() => {
    if (!open) return;
    const load = () =>
      api(`/rates/today?on=${localToday()}`)
        .then((r) => {
          const v = r.today?.rate ?? r.last?.rate;
          if (v) setRate(String(v));
        })
        .catch(() => {});
    load();
    window.addEventListener("rate:changed", load);
    return () => window.removeEventListener("rate:changed", load);
  }, [open]);

  const common = { rate: num(rate), gst: num(gst) ?? 0, interstate };

  return (
    <Drawer open={open} onClose={onClose} title={t("Calculator")}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4" role="tablist">
          {TABS.map(([k, label]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
              className={clsx("rounded-lg border px-2 py-2 text-sm",
                tab === k ? "border-accent bg-accent-soft font-semibold text-accent" : "border-line hover:bg-canvas")}>
              {t(label)}
            </button>
          ))}
        </div>

        {tab !== "gst" && (
          <div className="grid grid-cols-2 gap-3 rounded-xl bg-canvas p-3">
            <Field label={t("Gold rate ₹/g (fine)")}>
              <Input type="number" inputMode="decimal" min="0" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} />
            </Field>
            {["value", "quote", "money"].includes(tab) ? (
              <Field label={t("GST %")}>
                <Input type="number" inputMode="decimal" min="0" max="28" step="0.01" value={gst} onChange={(e) => setGst(e.target.value)} />
              </Field>
            ) : <div />}
            {["value", "quote"].includes(tab) && (
              <label className="col-span-2 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={interstate} onChange={(e) => setInterstate(e.target.checked)} className="h-4 w-4" />
                {t("Shop is in another state (IGST)")}
              </label>
            )}
          </div>
        )}

        {tab === "value" && <ValueTab {...common} />}
        {tab === "quote" && <QuoteTab {...common} />}
        {tab === "rates" && <RatesTab {...common} />}
        {tab === "old" && <OldGoldTab {...common} />}
        {tab === "money" && <MoneyTab {...common} />}
        {tab === "account" && <AccountTab {...common} />}
        {tab === "gst" && <GstTab />}
      </div>
    </Drawer>
  );
}

// ------------------------------------------------------------------ pieces

function Num({ label, value, onChange, hint, scale, step = "0.001" }) {
  return (
    <Field label={label} hint={hint}>
      <span className="flex gap-1.5">
        <Input type="number" inputMode="decimal" min="0" step={step} value={value} onChange={(e) => onChange(e.target.value)}
          className="text-right tabular-nums" />
        {scale && <ScaleButton onWeight={(g) => onChange(String(g))} />}
      </span>
    </Field>
  );
}

/** The answer: a list of rows, the last one big. Copy / WhatsApp share it as text. */
function Result({ rows, error, waiting, title }) {
  const { t } = useT();
  const [copied, setCopied] = useState(false);
  if (error) return <Notice tone="error">{error}</Notice>;
  if (!rows) return <p className="rounded-xl border border-dashed border-line p-4 text-center text-sm text-muted">{t(waiting)}</p>;
  const shown = rows.filter(Boolean);
  const text = [t(title), ...shown.map(([k, v, sub]) => `${t(k)}: ${v}${sub ? ` (${sub})` : ""}`)].join("\n");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };
  const last = shown.length - 1;
  return (
    <div className="rounded-xl border border-line">
      <dl className="divide-y divide-line">
        {shown.map(([k, v, sub, tone], i) => (
          <div key={k} className={clsx("flex items-baseline justify-between gap-3 px-3",
            i === last ? "bg-accent-soft py-3" : "py-2 text-sm")}>
            <dt className={clsx(i === last ? "font-semibold" : "text-muted")}>{t(k)}</dt>
            <dd className={clsx("text-right tabular-nums", i === last && "text-xl font-bold text-accent",
              tone === "good" && "text-green-700", tone === "bad" && "text-red-700")}>
              {v}{sub && <span className="block text-xs font-normal text-muted">{sub}</span>}
            </dd>
          </div>
        ))}
      </dl>
      <div className="flex gap-2 border-t border-line p-2">
        <Button variant="ghost" onClick={copy}><Copy size={15} aria-hidden /> {copied ? t("Copied") : t("Copy")}</Button>
        <a href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer"
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3.5 text-sm font-medium hover:bg-canvas">
          <MessageCircle size={15} aria-hidden /> WhatsApp
        </a>
      </div>
    </div>
  );
}

function ModeSwitch({ value, onChange, options }) {
  const { t } = useT();
  return (
    <div className="grid grid-cols-2 gap-1 rounded-lg bg-canvas p-1 text-sm">
      {options.map(([k, label]) => (
        <button key={k} type="button" onClick={() => onChange(k)}
          className={clsx("rounded-md px-2 py-1.5", value === k ? "bg-surface font-semibold shadow-sm" : "text-muted")}>
          {t(label)}
        </button>
      ))}
    </div>
  );
}

const taxRows = (r) => [
  Number(r.igst_amount) ? ["IGST", rs(r.igst_amount)] : ["CGST", rs(r.cgst_amount)],
  Number(r.igst_amount) ? null : ["SGST", rs(r.sgst_amount)],
];

// ------------------------------------------------------------------ tabs

function ValueTab({ rate, gst, interstate }) {
  const { t } = useT();
  const [code, setCode] = useState("");
  const [codeMsg, setCodeMsg] = useState(null);
  const [f, setF] = useState({ gross: "", stone: "", mode: "TOUCH", touch: "", purity: "22K", wastage: "", making: "", other: "" });
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));

  // Scan a tag: its weights and touch fill in.
  const fromCode = async (e) => {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (!c) return;
    try {
      const p = await inventoryService.getPieceByCode(c);
      beep(true);
      setF((x) => ({ ...x, gross: String(p.gross_weight), stone: String(p.stone_weight || ""), purity: p.purity,
        touch: p.touch_percent ? String(p.touch_percent) : x.touch }));
      setCodeMsg(`${p.item_code} · ${p.name}`);
      setCode("");
    } catch (err) {
      beep(false);
      setCodeMsg(err.message);
    }
  };

  const body = {
    gross_weight: num(f.gross), stone_weight: num(f.stone) ?? 0, mode: f.mode,
    touch_percent: f.mode === "TOUCH" ? num(f.touch) : null,
    purity: f.mode === "WASTAGE" ? f.purity : null,
    wastage_percent: f.mode === "WASTAGE" ? num(f.wastage) : null,
    making_per_gram: num(f.making), other_charges: num(f.other) ?? 0,
    gold_rate: rate, gst_percent: gst, interstate,
  };
  const ready = body.gross_weight > 0 && rate > 0 && (f.mode === "TOUCH" ? body.touch_percent > 0 : body.wastage_percent !== null);
  const { res: r, error } = useLive(ready ? () => calcService.fine(body) : null, [JSON.stringify(body), ready]);

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={fromCode} className="flex gap-2">
        <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder={t("Scan a tag to fill in (optional)")} />
        <Button type="submit" variant="ghost">{t("Fill")}</Button>
      </form>
      {codeMsg && <p className="-mt-1 text-xs text-muted">{codeMsg}</p>}
      <div className="grid grid-cols-2 gap-3">
        <Num label={t("Gross weight (g)")} value={f.gross} onChange={set("gross")} scale />
        <Num label={t("Stone weight (g)")} value={f.stone} onChange={set("stone")} />
      </div>
      <ModeSwitch value={f.mode} onChange={set("mode")} options={[["TOUCH", "By touch"], ["WASTAGE", "Purity + wastage"]]} />
      {f.mode === "TOUCH" ? (
        <Num label={t("Touch %")} value={f.touch} onChange={set("touch")} step="0.01" hint={t("e.g. 92 for 22K with wastage")} />
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("Purity")}>
            <Select value={f.purity} onChange={(e) => set("purity")(e.target.value)}>
              {PURITIES.map((p) => <option key={p}>{p}</option>)}
            </Select>
          </Field>
          <Num label={t("Wastage %")} value={f.wastage} onChange={set("wastage")} step="0.01" />
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Num label={t("Making ₹ per gram")} value={f.making} onChange={set("making")} step="0.01" />
        <Num label={t("Stone / other ₹")} value={f.other} onChange={set("other")} step="0.01" />
      </div>
      <Result title="Gold value" error={error} waiting="Enter the weight and touch to see the value."
        rows={r && [
          ["Net weight", g3(r.net_weight), pv(r.net_pavan)],
          f.mode === "WASTAGE" && ["Touch", `${Number(r.touch_percent)}%`],
          ["Fine gold", g3(r.fine_weight), pv(r.fine_pavan)],
          ["Gold value", rs(r.metal_amount)],
          Number(r.making_amount) > 0 && ["Making", rs(r.making_amount)],
          Number(r.other_charges) > 0 && ["Stone / other", rs(r.other_charges)],
          ["Before GST", rs(r.subtotal), `${rs(r.per_gram)} / g`],
          ...taxRows(r),
          Number(r.round_off) !== 0 && ["Round off", rs(r.round_off)],
          ["Total", rs(r.total)],
        ]} />
    </div>
  );
}

function QuoteTab({ rate, gst, interstate }) {
  const { t } = useT();
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState([]);
  const add = (e) => {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (c && !codes.includes(c)) setCodes((x) => [...x, c]);
    setCode("");
  };
  const body = { gold_rate: rate, gst_percent: gst, lines: codes.map((c) => ({ code: c })) };
  const ready = codes.length > 0 && rate > 0;
  const { res: q, error } = useLive(ready ? () => calcService.quote(body) : null, [JSON.stringify(body), ready]);
  // The bill decides IGST from the shop; a quote has no shop, so split it here when asked.
  const tot = q?.totals;
  const tax = tot && (interstate ? { igst_amount: tot.gst_amount } : { cgst_amount: tot.cgst_amount, sgst_amount: tot.sgst_amount });
  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={add} className="flex gap-2">
        <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder={t("Scan or type a piece or set code")} autoFocus />
        <Button type="submit">{t("Add")}</Button>
      </form>
      {codes.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {codes.map((c) => (
            <li key={c} className="flex items-center gap-1 rounded-full bg-canvas py-1 pl-3 pr-1 font-mono text-sm">
              {c}
              <button onClick={() => setCodes((x) => x.filter((y) => y !== c))} className="rounded-full p-1 hover:bg-line"
                aria-label={t("Remove {code}", { code: c })}><X size={13} aria-hidden /></button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted">{t("Uses each piece's own touch, like a bill. Nothing is sold or saved.")}</p>
      <Result title="Quick quote" error={error} waiting="Scan pieces or sets to see their price."
        rows={tot && [
          ...q.lines.map((l) => [`${l.code}`, rs(l.amount), `${g3(l.net_weight)} · ${t("fine")} ${g3(l.fine_weight)}`]),
          ["Fine gold", g3(tot.total_fine)],
          ["Before GST", rs(tot.subtotal)],
          ...(interstate ? [["IGST", rs(tax.igst_amount)]] : [["CGST", rs(tax.cgst_amount)], ["SGST", rs(tax.sgst_amount)]]),
          ["Total", rs(tot.grand_total)],
        ]} />
    </div>
  );
}

function RatesTab({ rate }) {
  const { t } = useT();
  const { res, error } = useLive(rate > 0 ? () => calcService.rates(rate) : null, [rate]);
  if (error) return <Notice tone="error">{error}</Notice>;
  if (!res) return <p className="text-sm text-muted">{t("Enter today's fine gold rate.")}</p>;
  const text = [t("Gold rate today"), ...res.rows.map((r) => `${r.purity}: ${rs(r.per_gram)}/g, ${rs(r.per_pavan)}/${t("pavan")}`)].join("\n");
  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-xl border border-line">
        <table className="w-full text-sm tabular-nums">
          <thead className="bg-canvas text-xs text-muted">
            <tr><th className="px-2 py-2 text-left">{t("Purity")}</th><th className="px-2 text-right">{t("1 g")}</th>
              <th className="px-2 text-right">{t("1 pavan (8 g)")}</th><th className="px-2 text-right">{t("10 g")}</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {res.rows.map((r) => (
              <tr key={r.purity}>
                <td className="px-2 py-2 font-semibold">{r.purity} <span className="text-xs font-normal text-muted">{Number(r.purity_percent)}%</span></td>
                <td className="px-2 text-right">{rs(r.per_gram)}</td>
                <td className="px-2 text-right font-semibold">{rs(r.per_pavan)}</td>
                <td className="px-2 text-right">{rs(r.per_10g)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">{t("Gold content only, before wastage, making and GST. 1 tola = 11.664 g: 22K {r}.",
        { r: rs(res.rows.find((r) => r.purity === "22K")?.per_tola) })}</p>
      <a href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer"
        className="inline-flex h-9 w-fit items-center gap-1.5 rounded-lg border border-line px-3.5 text-sm font-medium hover:bg-canvas">
        <MessageCircle size={15} aria-hidden /> {t("Send rates on WhatsApp")}
      </a>
    </div>
  );
}

function OldGoldTab({ rate }) {
  const { t } = useT();
  const [f, setF] = useState({ weight: "", less: "", purity: "", loss: "", bill: "" });
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const body = { weight: num(f.weight), less_weight: num(f.less) ?? 0, purity_percent: num(f.purity),
    melting_loss_percent: num(f.loss) ?? 0, gold_rate: rate, new_bill_amount: num(f.bill) };
  const ready = body.weight > 0 && body.purity_percent > 0 && rate > 0;
  const { res: r, error } = useLive(ready ? () => calcService.oldGold(body) : null, [JSON.stringify(body), ready]);
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <Num label={t("Old gold weight (g)")} value={f.weight} onChange={set("weight")} scale />
        <Num label={t("Less: stones / dirt (g)")} value={f.less} onChange={set("less")} />
        <Num label={t("Tested purity %")} value={f.purity} onChange={set("purity")} step="0.01" hint={t("From the touch-stone or machine")} />
        <Num label={t("Melting loss %")} value={f.loss} onChange={set("loss")} step="0.01" hint={t("Usually 1–3%")} />
      </div>
      <Num label={t("New bill total ₹ (optional)")} value={f.bill} onChange={set("bill")} step="0.01"
        hint={t("To see the balance after the old gold")} />
      <Result title="Old gold" error={error} waiting="Enter the weight and tested purity."
        rows={r && [
          ["Net weight", g3(r.net_weight)],
          ["After melting loss", g3(r.after_loss_weight)],
          ["Fine gold", g3(r.fine_weight), pv(r.fine_pavan)],
          r.balance_direction && ["Old gold value", rs(r.value)],
          r.balance_direction
            ? [{ SHOP_PAYS: "Shop pays", WE_PAY: "We pay the shop", SETTLED: "Settled" }[r.balance_direction], rs(r.balance)]
            : ["Old gold value", rs(r.value)],
        ]} />
    </div>
  );
}

function MoneyTab({ rate, gst }) {
  const { t } = useT();
  const [amount, setAmount] = useState("");
  const [touch, setTouch] = useState("");
  const body = { amount: num(amount), gold_rate: rate, gst_percent: gst, touch_percent: num(touch) };
  const ready = body.amount > 0 && rate > 0;
  const { res: r, error } = useLive(ready ? () => calcService.moneyToGold(body) : null, [JSON.stringify(body), ready]);
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <Num label={t("Amount ₹")} value={amount} onChange={setAmount} step="1" hint={t("Including GST")} />
        <Num label={t("Touch % (optional)")} value={touch} onChange={setTouch} step="0.01" hint={t("To see jewellery weight")} />
      </div>
      <Result title="Money → gold" error={error} waiting="Enter an amount."
        rows={r && [
          ["GST in it", rs(r.gst_amount)],
          ["For gold", rs(r.amount_before_gst)],
          r.jewellery_weight && ["Fine gold", g3(r.fine_weight), pv(r.fine_pavan)],
          r.jewellery_weight
            ? ["Jewellery weight", g3(r.jewellery_weight), pv(r.jewellery_pavan)]
            : ["Fine gold", g3(r.fine_weight), pv(r.fine_pavan)],
        ]} />
    </div>
  );
}

function AccountTab({ rate }) {
  const { t } = useT();
  const [f, setF] = useState({ owed: "", gold: "", purity: "99.5", cash: "" });
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const body = { owed_fine: num(f.owed), gold_weight: num(f.gold) ?? 0, gold_purity_percent: num(f.purity) ?? 99.5,
    cash: num(f.cash) ?? 0, gold_rate: rate };
  const ready = body.owed_fine !== null && rate > 0 && body.gold_purity_percent > 0;
  const { res: r, error } = useLive(ready ? () => calcService.metalAccount(body) : null, [JSON.stringify(body), ready]);
  const label = { SHOP_OWES: "Shop still owes", WE_OWE: "We owe the shop", SETTLED: "Settled" };
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted">{t("For shops that settle in fine gold: what they owe, less the gold and cash they give now.")}</p>
      <Num label={t("Shop owes (fine g)")} value={f.owed} onChange={set("owed")} />
      <div className="grid grid-cols-2 gap-3">
        <Num label={t("Gold given (g)")} value={f.gold} onChange={set("gold")} scale />
        <Num label={t("Its purity %")} value={f.purity} onChange={set("purity")} step="0.01" hint={t("Bar / coin: 99.5")} />
      </div>
      <Num label={t("Cash given ₹")} value={f.cash} onChange={set("cash")} step="1" hint={t("Counted at today's rate")} />
      <Result title="Gold account" error={error} waiting="Enter what the shop owes."
        rows={r && [
          Number(r.gold_fine) > 0 && ["Gold given = fine", g3(r.gold_fine)],
          Number(r.cash_fine) > 0 && ["Cash given = fine", g3(r.cash_fine)],
          ["Paid in all", g3(r.paid_fine)],
          r.balance_direction !== "SETTLED" && ["In rupees today", rs(r.balance_rupees)],
          [label[r.balance_direction], g3(r.balance_fine), pv(r.balance_pavan)],
        ]} />
    </div>
  );
}

function GstTab() {
  const { t } = useT();
  const [amount, setAmount] = useState("");
  const [pct, setPct] = useState("3");
  const [inclusive, setInclusive] = useState(false);
  const [interstate, setInterstate] = useState(false);
  const body = { amount: num(amount), gst_percent: num(pct) ?? 0, inclusive, interstate };
  const ready = body.amount > 0;
  const { res: r, error } = useLive(ready ? () => calcService.gst(body) : null, [JSON.stringify(body), ready]);
  return (
    <div className="flex flex-col gap-3">
      <ModeSwitch value={inclusive ? "IN" : "ADD"} onChange={(v) => setInclusive(v === "IN")}
        options={[["ADD", "Add GST"], ["IN", "Take GST out"]]} />
      <div className="grid grid-cols-2 gap-3">
        <Num label={inclusive ? t("Price with GST ₹") : t("Price before GST ₹")} value={amount} onChange={setAmount} step="0.01" />
        <Num label={t("GST %")} value={pct} onChange={setPct} step="0.01" hint={t("Gold jewellery: 3%")} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={interstate} onChange={(e) => setInterstate(e.target.checked)} className="h-4 w-4" />
        {t("Shop is in another state (IGST)")}
      </label>
      <Result title="GST" error={error} waiting="Enter an amount."
        rows={r && [["Before GST", rs(r.base_amount)], ...taxRows(r), ["GST", rs(r.gst_amount)], ["Total", rs(r.total)]]} />
    </div>
  );
}
