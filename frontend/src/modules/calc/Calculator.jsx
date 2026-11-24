"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { AlertTriangle, ChevronDown, Copy, ExternalLink, MessageCircle, Minus, RotateCcw, Star, X } from "lucide-react";
import { api } from "@/_shared/api/client";
import { beep } from "@/_shared/beep";
import { localToday } from "@/_shared/dates";
import ScaleButton from "@/_shared/components/ScaleButton";
import CameraScan from "@/_shared/components/CameraScan";
import { Button, Field, Input, Notice, Select } from "@/_shared/components/ui";
import { useT } from "@/_shared/i18n/LanguageProvider";
import { billingService } from "@/modules/billing/billingService";
import { PURITIES, inventoryService } from "@/modules/inventory/inventoryService";
import QuickMath from "./QuickMath";
import RateChart from "./RateChart";
import { ShareDialog } from "./ShareWhatsApp";
import { FEATURES } from "@/_shared/features";
import {
  GRAMS_PER_PAVAN, calcService, clearPersist, g3, history, num, pc, pv, rs, useLive, usePersist, w3,
} from "./calcService";

// The counter calculator: a side panel over any screen (F2). Nothing here is saved except
// estimates. Today's rate and the shop's usual deal fill in; the sums come from the server.
const MAIN = [["math", "Quick math"], ["value", "Gold value"], ["quote", "Quick quote"]];
const MORE = [["rates", "Rate chart"], ["old", "Old gold"], ["money", "Money → gold"], ["account", "Gold account"], ["gst", "GST"], ["history", "History"]];
const NEEDS_GST = ["value", "quote", "money"];
const ALL = [["math", "Quick math"], ["value", "Gold value"], ["quote", "Quick quote"], ["rates", "Rate chart"], ["old", "Old gold"],
  ["money", "Money → gold"], ["account", "Gold account"], ["gst", "GST"], ["history", "History"]];

/** All the calculator's tools. layout "popup": tabs on top, for the quick pop-up;
 *  layout "page": tools down the left and a wide work area, for the Calculator page. */
export function CalcWorkspace({ open = true, onClose = () => {}, layout = "popup", onResultChange, listen = true }) {
  const { t } = useT();
  const page = layout === "page";
  const [s, setS] = usePersist("main", { tab: "value", rate: "", gst: "3", shopId: "", unit: "g", interstate: false });
  const set = (k) => (v) => setS((x) => ({ ...x, [k]: v }));
  const [rateInfo, setRateInfo] = useState(null); // {today, last}
  const [shops, setShops] = useState([]);
  const [biz, setBiz] = useState(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [result, setResult] = useState(null); // {title, rows, total} from the open tab
  const [resets, setResets] = useState(0);
  const [kept, setKept] = useState(false);
  const [recent, setRecent] = useState([]); // the chosen shop's last bills: rate and %
  const [sharing, setSharing] = useState(false);
  useEffect(() => onResultChange?.(result), [result]); // eslint-disable-line react-hooks/exhaustive-deps

  // Each time the panel opens: today's rate, shops (for their deals), our own state for IGST.
  useEffect(() => {
    if (!open) return;
    const loadRate = () =>
      api(`/rates/today?on=${localToday()}`).then((r) => {
        setRateInfo(r);
        const v = r.today?.rate ?? r.last?.rate;
        setS((x) => (x.rate === "" || x.rateAuto ? { ...x, rate: v ? String(v) : "", rateAuto: true } : x));
      }).catch(() => {});
    loadRate();
    const poll = setInterval(loadRate, 60000); // the day's rate, checked every minute
    billingService.listShops().then(setShops).catch(() => {});
    api("/business").then(setBiz).catch(() => {});
    window.addEventListener("rate:changed", loadRate);
    return () => {
      clearInterval(poll);
      window.removeEventListener("rate:changed", loadRate);
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // When the owner changes the rate during the day, open sums follow it, with a note.
  const seenRate = useRef(null);
  const [rateNote, setRateNote] = useState(null);
  useEffect(() => {
    const v = rateInfo ? rateInfo.today?.rate ?? rateInfo.last?.rate : null;
    if (v == null) return;
    if (seenRate.current != null && seenRate.current !== v) setRateNote({ from: seenRate.current, to: v });
    seenRate.current = v;
  }, [rateInfo]);

  // A tag scanned anywhere in the calculator goes onto Quick quote, with its weight, % and price.
  const addToQuote = (raw) => {
    const code = String(raw || "").trim().toUpperCase();
    if (!/^[A-Z]{2,3}\d{3,}$/.test(code)) return;
    let cur = { list: [] };
    try {
      cur = JSON.parse(sessionStorage.getItem("calc.v1.tab.quote")) || cur;
    } catch {}
    if (!cur.list.some((x) => x.code === code)) cur.list = [...cur.list, { code, touch: "" }];
    try {
      sessionStorage.setItem("calc.v1.tab.quote", JSON.stringify(cur));
    } catch {}
    beep(true);
    setResult(null);
    setS((x) => ({ ...x, tab: "quote" }));
    setResets((n) => n + 1);
  };
  // A USB scanner types fast and ends with Enter; catch that when no box has the cursor.
  useEffect(() => {
    if (!open || !listen) return;
    let buf = "";
    let lastAt = 0;
    const onKey = (e) => {
      const el = e.target;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
      const now = Date.now();
      if (now - lastAt > 80) buf = "";
      lastAt = now;
      if (e.key === "Enter") {
        if (buf.length >= 5) addToQuote(buf);
        buf = "";
      } else if (e.key.length === 1) buf += e.key;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, listen]); // eslint-disable-line react-hooks/exhaustive-deps
  const toolbar = (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      {rateNote && (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 font-medium text-amber-900">
          {t("Rate changed {a} → {b}", { a: rs(rateNote.from), b: rs(rateNote.to) })}
          <button onClick={() => setRateNote(null)} aria-label={t("Close")}><X size={12} /></button>
        </span>
      )}
      <span className="ml-auto"><CameraScan onCode={addToQuote} className="h-8" label={t("Scan a tag")} /></span>
    </div>
  );

  const rawShop = shops.find((x) => x.id === s.shopId) || null;
  // Shop deals are switched off for bills, so the calculator ignores them too.
  const shop = useMemo(() => (rawShop && !FEATURES.shopDeals
    ? { ...rawShop, price_mode: null, deal_touch: null, deal_wastage: null, deal_making: null } : rawShop), [rawShop]);
  useEffect(() => {
    if (!s.shopId) return setRecent([]);
    calcService.shopRecent(s.shopId).then(setRecent).catch(() => setRecent([]));
  }, [s.shopId]);
  const interstate = shop ? !!(biz?.state_code && shop.state_code && biz.state_code !== shop.state_code) : s.interstate;
  const rate = num(s.rate);
  const usingOldRate = rateInfo && !rateInfo.today && s.rateAuto && rateInfo.last;
  const common = { rate, gst: num(s.gst) ?? 0, interstate, shop, unit: s.unit, onResult: setResult, biz };

  const choose = (k) => {
    setResult(null);
    setKept(false);
    setMoreOpen(false);
    set("tab")(k);
  };
  const clear = () => {
    clearPersist(`tab.${s.tab}`);
    setResult(null);
    setResets((n) => n + 1);
  };
  const shareText = result && [t(result.title), shop ? shop.name : null,
    ...result.rows.map(([k, v, sub]) => `${t(k)}: ${v}${sub ? ` (${sub})` : ""}`),
    `${t(result.total[0])}: ${result.total[1]}`].filter(Boolean).join("\n");
  const keep = () => {
    history.add({ title: t(result.title), total: result.total[1], text: shareText });
    setKept(true);
    setTimeout(() => setKept(false), 1500);
  };
  const moreLabel = MORE.find(([k]) => k === s.tab)?.[1];

  const footer = result ? (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-semibold">{t(result.total[0])}</span>
        <span className="text-right text-2xl font-bold tabular-nums text-accent">
          {result.total[1]}
          {result.total[2] && <span className="block text-xs font-normal text-muted">{result.total[2]}</span>}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" onClick={keep} aria-label={t("Keep")}><Star size={15} aria-hidden /> <span className="hidden sm:inline">{kept ? t("Kept") : t("Keep")}</span></Button>
        <CopyButton text={shareText} />
        <button onClick={() => setSharing(true)}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-green-600 px-3 text-sm font-semibold text-white hover:bg-green-700">
          <MessageCircle size={15} aria-hidden /> {result.quote ? t("Send quotation") : "WhatsApp"}
        </button>
        <Button variant="ghost" className="ml-auto" onClick={clear} aria-label={t("Clear")}><RotateCcw size={15} aria-hidden /> <span className="hidden sm:inline">{t("Clear")}</span></Button>
      </div>
    </div>
  ) : s.tab !== "history" && s.tab !== "rates" ? (
    <div className="flex justify-end"><Button variant="ghost" onClick={clear}><RotateCcw size={15} aria-hidden /> {t("Clear")}</Button></div>
  ) : null;

  const shareDialog = <ShareDialog open={sharing} onClose={() => setSharing(false)} result={result} biz={biz} shop={shop} />;
  // The bar sticks to the bottom only when it has an answer to show; otherwise Clear sits in the flow.
  const footerBar = footer && !result ? footer : footer && (
    <div className={clsx("sticky bottom-0 z-10 bg-surface", page ? "bottom-[4.25rem] rounded-xl border border-line p-3 shadow-lg sm:bottom-0" : "-mx-4 -mb-4 border-t border-line px-4 py-3")}>
      {footer}
    </div>
  );

  if (page) {
    return (
      <div className="grid items-start gap-5 lg:grid-cols-[200px_minmax(0,1fr)]">
        {/* Every tool in one list: down the left on a laptop, a scrolling row on a phone. */}
        <nav className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:sticky lg:top-4 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0" aria-label={t("Calculator tools")}>
          {ALL.map(([k, label]) => (
            <button key={k} onClick={() => choose(k)} aria-current={s.tab === k ? "page" : undefined}
              className={clsx("shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm",
                s.tab === k ? "bg-accent font-semibold text-white" : "text-muted hover:bg-surface hover:text-ink")}>
              {t(label)}
            </button>
          ))}
        </nav>
        <div className="flex min-w-0 flex-col gap-4">
          {toolbar}
          {!["gst", "history", "math"].includes(s.tab) && (
            <div className="flex flex-col gap-3 rounded-xl bg-canvas p-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label={t("Gold rate ₹/g (fine)")}>
                  <Input type="number" inputMode="decimal" min="0" step="0.01" value={s.rate}
                    onChange={(e) => setS((x) => ({ ...x, rate: e.target.value, rateAuto: false }))} className="text-base tabular-nums" />
                </Field>
                {NEEDS_GST.includes(s.tab) ? (
                  <Field label={t("GST %")}>
                    <Input type="number" inputMode="decimal" min="0" max="28" step="0.01" value={s.gst} onChange={(e) => set("gst")(e.target.value)} className="text-base" />
                  </Field>
                ) : <div />}
              </div>
              {usingOldRate && (
                <p className="flex items-start gap-1.5 text-xs text-amber-800">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
                  <span>{t("Today's rate isn't set. Using the last rate, from {d}.", { d: rateInfo.last.rate_date })}{" "}
                    <Link href="/settings?tab=rate" onClick={onClose} className="font-medium underline">{t("Set today's rate")}</Link></span>
                </p>
              )}
              {["value", "quote", "account"].includes(s.tab) && (
                <Field label={t("Shop")} hint={shop?.price_mode ? t("Its usual deal fills in.") : undefined}>
                  <Select value={s.shopId} onChange={(e) => set("shopId")(e.target.value)}>
                    <option value="">{t("Any shop")}</option>
                    {shops.map((x) => <option key={x.id} value={x.id}>{x.name}{x.city ? ` · ${x.city}` : ""}</option>)}
                  </Select>
                </Field>
              )}
              {["value", "quote", "account"].includes(s.tab) && recent.length > 0 && (
                <div className="flex flex-wrap items-center gap-1 text-xs">
                  <span className="text-muted">{t("Last bills")}:</span>
                  {recent.map((b) => (
                    <button key={b.bill_id} type="button" onClick={() => setS((x) => ({ ...x, rate: String(b.gold_rate), rateAuto: false }))}
                      title={t("Use this rate")} className="rounded-full bg-surface px-2 py-0.5 tabular-nums hover:bg-accent-soft">
                      {b.bill_date.slice(5).split("-").reverse().join("/")} · ₹{b.gold_rate.toLocaleString("en-IN")}{b.percent ? ` · ${b.percent}%` : ""}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                {["value", "quote"].includes(s.tab) && (shop ? (
                  <span className="text-xs text-muted">{interstate ? t("Other state: IGST") : t("Same state: CGST + SGST")}</span>
                ) : (
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={s.interstate} onChange={(e) => set("interstate")(e.target.checked)} className="h-4 w-4" />
                    {t("Shop is in another state (IGST)")}
                  </label>
                ))}
                {["value", "old", "account"].includes(s.tab) && (
                  <span className="ml-auto flex items-center gap-1 rounded-lg bg-surface p-0.5 text-xs" role="group" aria-label={t("Type weights in")}>
                    {[["g", "grams"], ["pavan", "pavan"]].map(([k, label]) => (
                      <button key={k} onClick={() => set("unit")(k)}
                        className={clsx("rounded-md px-2 py-1", s.unit === k ? "bg-accent text-white" : "text-muted")}>{t(label)}</button>
                    ))}
                  </span>
                )}
              </div>
            </div>
          )}

          <div key={`${s.tab}-${resets}`}>
            {s.tab === "math" && <QuickMath onResult={setResult} wide={page} />}
            {s.tab === "value" && <ValueTab {...common} />}
            {s.tab === "quote" && <QuoteTab {...common} onClose={onClose} />}
            {s.tab === "rates" && <RateChart rate={rate} biz={biz} />}
            {s.tab === "old" && <OldGoldTab {...common} />}
            {s.tab === "money" && <MoneyTab {...common} />}
            {s.tab === "account" && <AccountTab {...common} />}
            {s.tab === "gst" && <GstTab {...common} />}
            {s.tab === "history" && <HistoryTab />}
          </div>
          {footerBar}
          {shareDialog}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
        {toolbar}
        {/* Tabs: the three everyday jobs big, the rest under More. */}
        <div className="relative grid grid-cols-4 gap-1.5" role="tablist">
          {MAIN.map(([k, label]) => (
            <TabButton key={k} active={s.tab === k} onClick={() => choose(k)}>{t(label)}</TabButton>
          ))}
          <TabButton active={!!moreLabel} onClick={() => setMoreOpen((v) => !v)} aria-expanded={moreOpen}>
            <span className="truncate">{moreLabel ? t(moreLabel) : t("More")}</span> <ChevronDown size={14} aria-hidden className="shrink-0" />
          </TabButton>
          {moreOpen && (
            <div className="absolute right-0 top-full z-10 mt-1 w-48 rounded-xl border border-line bg-surface p-1 shadow-lg">
              {MORE.map(([k, label]) => (
                <button key={k} onClick={() => choose(k)}
                  className={clsx("block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-canvas", s.tab === k && "font-semibold text-accent")}>
                  {t(label)}
                </button>
              ))}
            </div>
          )}
        </div>

        {!["gst", "history", "math"].includes(s.tab) && (
          <div className="flex flex-col gap-3 rounded-xl bg-canvas p-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("Gold rate ₹/g (fine)")}>
                <Input type="number" inputMode="decimal" min="0" step="0.01" value={s.rate}
                  onChange={(e) => setS((x) => ({ ...x, rate: e.target.value, rateAuto: false }))} className="text-base tabular-nums" />
              </Field>
              {NEEDS_GST.includes(s.tab) ? (
                <Field label={t("GST %")}>
                  <Input type="number" inputMode="decimal" min="0" max="28" step="0.01" value={s.gst} onChange={(e) => set("gst")(e.target.value)} className="text-base" />
                </Field>
              ) : <div />}
            </div>
            {usingOldRate && (
              <p className="flex items-start gap-1.5 text-xs text-amber-800">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
                <span>{t("Today's rate isn't set. Using the last rate, from {d}.", { d: rateInfo.last.rate_date })}{" "}
                  <Link href="/settings?tab=rate" onClick={onClose} className="font-medium underline">{t("Set today's rate")}</Link></span>
              </p>
            )}
            {["value", "quote", "account"].includes(s.tab) && (
              <Field label={t("Shop")} hint={shop?.price_mode ? t("Its usual deal fills in.") : undefined}>
                <Select value={s.shopId} onChange={(e) => set("shopId")(e.target.value)}>
                  <option value="">{t("Any shop")}</option>
                  {shops.map((x) => <option key={x.id} value={x.id}>{x.name}{x.city ? ` · ${x.city}` : ""}</option>)}
                </Select>
              </Field>
            )}
            {["value", "quote", "account"].includes(s.tab) && recent.length > 0 && (
              <div className="flex flex-wrap items-center gap-1 text-xs">
                <span className="text-muted">{t("Last bills")}:</span>
                {recent.map((b) => (
                  <button key={b.bill_id} type="button" onClick={() => setS((x) => ({ ...x, rate: String(b.gold_rate), rateAuto: false }))}
                    title={t("Use this rate")} className="rounded-full bg-surface px-2 py-0.5 tabular-nums hover:bg-accent-soft">
                    {b.bill_date.slice(5).split("-").reverse().join("/")} · ₹{b.gold_rate.toLocaleString("en-IN")}{b.percent ? ` · ${b.percent}%` : ""}
                  </button>
                ))}
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              {["value", "quote"].includes(s.tab) && (shop ? (
                <span className="text-xs text-muted">{interstate ? t("Other state: IGST") : t("Same state: CGST + SGST")}</span>
              ) : (
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={s.interstate} onChange={(e) => set("interstate")(e.target.checked)} className="h-4 w-4" />
                  {t("Shop is in another state (IGST)")}
                </label>
              ))}
              {["value", "old", "account"].includes(s.tab) && (
                <span className="ml-auto flex items-center gap-1 rounded-lg bg-surface p-0.5 text-xs" role="group" aria-label={t("Type weights in")}>
                  {[["g", "grams"], ["pavan", "pavan"]].map(([k, label]) => (
                    <button key={k} onClick={() => set("unit")(k)}
                      className={clsx("rounded-md px-2 py-1", s.unit === k ? "bg-accent text-white" : "text-muted")}>{t(label)}</button>
                  ))}
                </span>
              )}
            </div>
          </div>
        )}

        <div key={`${s.tab}-${resets}`}>
          {s.tab === "math" && <QuickMath onResult={setResult} wide={page} />}
          {s.tab === "value" && <ValueTab {...common} />}
          {s.tab === "quote" && <QuoteTab {...common} onClose={onClose} />}
          {s.tab === "rates" && <RateChart rate={rate} biz={biz} />}
          {s.tab === "old" && <OldGoldTab {...common} />}
          {s.tab === "money" && <MoneyTab {...common} />}
          {s.tab === "account" && <AccountTab {...common} />}
          {s.tab === "gst" && <GstTab {...common} />}
          {s.tab === "history" && <HistoryTab />}
        </div>
      {footerBar}
      {shareDialog}
    </div>
  );
}

/** The quick calculator: a centred card over any screen (full screen on a phone). F2 opens it;
 *  Esc closes it; minimise keeps it as a small pill with the last answer; the full page is one tap away. */
export default function Calculator({ open, onClose }) {
  const { t } = useT();
  const [min, setMin] = useState(false);
  const [last, setLast] = useState(null);
  useEffect(() => {
    if (open) setMin(false);
  }, [open]);
  useEffect(() => {
    if (!open || min) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, min, onClose]);
  if (!open) return null;
  return (
    <>
      {min && (
        <span className="fixed bottom-20 right-4 z-50 flex items-center gap-1 rounded-full bg-accent py-1 pl-4 pr-1 text-sm font-medium text-white shadow-lg lg:bottom-4">
          <button onClick={() => setMin(false)} className="flex items-center gap-2 py-1.5">
            {t("Calculator")}{last?.total?.[1] && <b className="tabular-nums">{last.total[1]}</b>}
          </button>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-white/20" aria-label={t("Close")}><X size={14} /></button>
        </span>
      )}
      <div className={clsx("fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-center sm:p-4", min && "hidden")} onClick={onClose}>
        <div role="dialog" aria-modal="true" aria-label={t("Calculator")} onClick={(e) => e.stopPropagation()}
          className="flex h-[100dvh] w-full flex-col overflow-hidden bg-surface shadow-2xl sm:h-auto sm:max-h-[88vh] sm:max-w-[620px] sm:rounded-2xl">
          <header className="flex items-center gap-1 border-b border-line px-4 py-2.5">
            <h2 className="flex-1 font-semibold">{t("Calculator")}</h2>
            <Link href="/calculator" onClick={onClose} className="mr-1 inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-accent hover:bg-accent-soft">
              {t("Open full calculator")} <ExternalLink size={14} aria-hidden />
            </Link>
            <button onClick={() => setMin(true)} className="rounded-lg p-2 text-muted hover:bg-canvas" aria-label={t("Minimise")} title={t("Minimise")}><Minus size={18} /></button>
            <button onClick={onClose} className="rounded-lg p-2 text-muted hover:bg-canvas" aria-label={t("Close")} title={`${t("Close")} (Esc)`}><X size={18} /></button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <CalcWorkspace open={open} onClose={onClose} layout="popup" onResultChange={setLast} listen={!min} />
          </div>
        </div>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ pieces

function TabButton({ active, children, ...props }) {
  return (
    <button role="tab" aria-selected={active} {...props}
      className={clsx("flex min-h-11 items-center justify-center gap-1 rounded-lg border px-1.5 text-center text-sm leading-tight",
        active ? "border-accent bg-accent-soft font-semibold text-accent" : "border-line hover:bg-canvas")}>
      {children}
    </button>
  );
}

function CopyButton({ text }) {
  const { t } = useT();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };
  return <Button variant="ghost" onClick={copy} aria-label={t("Copy")}><Copy size={15} aria-hidden /> <span className={copied ? "" : "hidden sm:inline"}>{copied ? t("Copied") : t("Copy")}</span></Button>;
}

/** A number box, big. Weight boxes follow the g / pavan switch; the scale fills grams. */
function Num({ label, value, onChange, hint, weight, unit, step = "0.01" }) {
  const { t } = useT();
  const inPavan = weight && unit === "pavan";
  return (
    <Field label={weight ? `${label} (${inPavan ? t("pavan") : "g"})` : label} hint={hint}>
      <span className="flex gap-1.5">
        <Input type="number" inputMode="decimal" min="0" step={weight ? "0.001" : step} value={value}
          onChange={(e) => onChange(e.target.value)} className="h-11 text-right text-lg tabular-nums" />
        {weight && !inPavan && <ScaleButton onWeight={(g) => onChange(String(g))} className="self-center" />}
      </span>
    </Field>
  );
}
/** Grams from a weight box, whichever unit it was typed in. */
const grams = (v, unit) => {
  const n = num(v);
  return n === null ? null : unit === "pavan" ? Math.round(n * GRAMS_PER_PAVAN * 1000) / 1000 : n;
};

/** The breakdown: label, value, a small second line, and the working ("12.000 × 92%"). */
function Breakdown({ rows, error, waiting }) {
  const { t } = useT();
  if (error) return <Notice tone="error">{error}</Notice>;
  if (!rows) return <p className="rounded-xl border border-dashed border-line p-4 text-center text-sm text-muted">{t(waiting)}</p>;
  return (
    <dl className="divide-y divide-line rounded-xl border border-line">
      {rows.map(([k, v, sub, working]) => (
        <div key={k} className="flex items-baseline justify-between gap-3 px-3 py-2 text-sm">
          <dt>
            <span className="text-muted">{t(k)}</span>
            {working && <span className="block font-mono text-[11px] text-muted/80">{working}</span>}
          </dt>
          <dd className="text-right tabular-nums">{v}{sub && <span className="block text-xs text-muted">{sub}</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Sends the answer up to the panel's footer whenever it changes. */
function useReport(onResult, res, build, extra) {
  useEffect(() => {
    onResult(res ? build(res) : null);
  }, [res, extra]); // eslint-disable-line react-hooks/exhaustive-deps
}

function ModeSwitch({ value, onChange, options }) {
  const { t } = useT();
  return (
    <div className="grid grid-cols-2 gap-1 rounded-lg bg-canvas p-1 text-sm">
      {options.map(([k, label]) => (
        <button key={k} type="button" onClick={() => onChange(k)}
          className={clsx("rounded-md px-2 py-2", value === k ? "bg-surface font-semibold shadow-sm" : "text-muted")}>
          {t(label)}
        </button>
      ))}
    </div>
  );
}

const tax = (r, pct) => (Number(r.igst_amount)
  ? [["IGST", rs(r.igst_amount), null, pct ? `${pct}% of ${rs(r.subtotal ?? r.base_amount)}` : null]]
  : [["CGST", rs(r.cgst_amount)], ["SGST", rs(r.sgst_amount)]]);
const clean = (rows) => rows.filter(Boolean);

// ------------------------------------------------------------------ tabs

const VALUE_EMPTY = { gross: "", stone: "", mode: "TOUCH", touch: "", purity: "22K", wastage: "", making: "", other: "",
  stoneRate: "", stoneQty: "", stoneUnit: "CARAT", hmPieces: "", hmRate: "45", touchOff: "", discount: "", extras: false };

function ValueTab({ rate, gst, interstate, shop, unit, onResult }) {
  const { t } = useT();
  const [f, setF] = usePersist("tab.value", VALUE_EMPTY);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const [code, setCode] = useState("");
  const [codeMsg, setCodeMsg] = useState(null);

  // The shop's usual deal fills the pricing boxes.
  useEffect(() => {
    if (!shop?.price_mode) return;
    setF((x) => ({ ...x, mode: shop.price_mode,
      touch: shop.price_mode === "TOUCH" && shop.deal_touch != null ? String(shop.deal_touch) : x.touch,
      wastage: shop.price_mode === "WASTAGE" && shop.deal_wastage != null ? String(shop.deal_wastage) : x.wastage,
      making: shop.deal_making != null ? String(shop.deal_making) : x.making }));
  }, [shop?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scan a tag: its weights, purity and touch fill in.
  const fromCode = async (e) => {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (!c) return;
    try {
      const p = await inventoryService.getPieceByCode(c);
      beep(true);
      const w = (g) => (unit === "pavan" ? String(Math.round((g / GRAMS_PER_PAVAN) * 1000) / 1000) : String(g));
      setF((x) => ({ ...x, gross: w(p.gross_weight), stone: p.stone_weight ? w(p.stone_weight) : "", purity: p.purity,
        touch: x.mode === "TOUCH" && !shop?.deal_touch && p.touch_percent ? String(p.touch_percent) : x.touch }));
      setCodeMsg(`${p.item_code} · ${p.name}`);
      setCode("");
    } catch (err) {
      beep(false);
      setCodeMsg(err.message);
    }
  };

  const body = {
    gross_weight: grams(f.gross, unit), stone_weight: grams(f.stone, unit) ?? 0, mode: f.mode,
    touch_percent: f.mode === "TOUCH" ? num(f.touch) : null,
    purity: f.mode === "WASTAGE" ? f.purity : null,
    wastage_percent: f.mode === "WASTAGE" ? num(f.wastage) : null,
    making_per_gram: num(f.making), other_charges: num(f.other) ?? 0,
    stone_rate: num(f.stoneRate), stone_qty: num(f.stoneQty), stone_unit: f.stoneUnit,
    hallmark_pieces: num(f.hmPieces) ?? 0, hallmark_rate: num(f.hmRate) ?? 0,
    touch_discount: num(f.touchOff) ?? 0, discount_amount: num(f.discount) ?? 0,
    gold_rate: rate, gst_percent: gst, interstate,
  };
  const ready = body.gross_weight > 0 && rate > 0 && (f.mode === "TOUCH" ? body.touch_percent > 0 : body.wastage_percent !== null);
  const { res: r, error } = useLive(ready ? () => calcService.fine(body) : null, [JSON.stringify(body), ready]);
  const rows = r && clean([
    ["Net weight", g3(r.net_weight), pv(r.net_pavan), body.stone_weight ? `${w3(body.gross_weight)} − ${w3(body.stone_weight)}` : null],
    ["Fine gold", g3(r.fine_weight), pv(r.fine_pavan), `${w3(r.net_weight)} × ${pc(r.touch_percent)}`
      + (f.mode === "WASTAGE" ? ` (${f.purity} + ${pc(body.wastage_percent)})` : "") + (body.touch_discount ? ` − ${body.touch_discount}` : "")],
    ["Gold value", rs(r.metal_amount), null, `${w3(r.fine_weight)} × ${rs(rate)}`],
    Number(r.making_amount) > 0 && ["Making", rs(r.making_amount), null, `${w3(r.net_weight)} × ${rs(body.making_per_gram)}`],
    Number(r.stone_amount) > 0 && ["Stones", rs(r.stone_amount), null, `${body.stone_qty} × ${rs(body.stone_rate)}`],
    Number(r.hallmark_amount) > 0 && ["Hallmarking", rs(r.hallmark_amount), null, `${body.hallmark_pieces} × ${rs(body.hallmark_rate)}`],
    Number(r.other_charges) > 0 && ["Other", rs(r.other_charges)],
    Number(r.discount_amount) > 0 && ["Discount", `−${rs(r.discount_amount)}`],
    ["Before GST", rs(r.subtotal), `${rs(r.per_gram)} / g`],
    ...tax(r, gst),
    Number(r.round_off) !== 0 && ["Round off", rs(r.round_off)],
  ]);
  useReport(onResult, r, () => ({ title: "Gold value", rows, total: ["Total", rs(r.total), pv(r.fine_pavan) && `${g3(r.fine_weight)} ${t("fine")}`] }));

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={fromCode} className="flex gap-2">
        <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder={t("Scan a tag to fill in (optional)")} />
        <Button type="submit" variant="ghost">{t("Fill")}</Button>
      </form>
      {codeMsg && <p className="-mt-1 text-xs text-muted">{codeMsg}</p>}
      <div className="grid grid-cols-2 gap-3">
        <Num label={t("Gross weight")} value={f.gross} onChange={set("gross")} weight unit={unit} />
        <Num label={t("Stone weight")} value={f.stone} onChange={set("stone")} weight unit={unit} />
      </div>
      <ModeSwitch value={f.mode} onChange={set("mode")} options={[["TOUCH", "By touch"], ["WASTAGE", "Purity + wastage"]]} />
      <div className="grid grid-cols-2 gap-3">
        {f.mode === "TOUCH" ? (
          <Num label={t("Touch %")} value={f.touch} onChange={set("touch")} hint={t("e.g. 92 for 22K with wastage")} />
        ) : (
          <>
            <Field label={t("Purity")}>
              <Select value={f.purity} onChange={(e) => set("purity")(e.target.value)} className="h-11 text-base">
                {PURITIES.map((p) => <option key={p}>{p}</option>)}
              </Select>
            </Field>
            <Num label={t("Wastage %")} value={f.wastage} onChange={set("wastage")} />
          </>
        )}
        <Num label={t("Making ₹ per gram")} value={f.making} onChange={set("making")} />
      </div>

      <button type="button" onClick={() => set("extras")(!f.extras)} aria-expanded={f.extras}
        className="flex items-center gap-1 self-start text-sm font-medium text-accent">
        <ChevronDown size={16} className={clsx("transition", f.extras && "rotate-180")} aria-hidden />
        {t("Stones, hallmarking, discount")}
      </button>
      {f.extras && (
        <div className="flex flex-col gap-3 rounded-xl border border-line p-3">
          <div className="grid grid-cols-3 gap-2">
            <Field label={t("Stones by")}>
              <Select value={f.stoneUnit} onChange={(e) => set("stoneUnit")(e.target.value)}>
                <option value="CARAT">{t("carat")}</option><option value="PIECE">{t("piece")}</option><option value="GRAM">{t("gram")}</option>
              </Select>
            </Field>
            <Num label={t("How many")} value={f.stoneQty} onChange={set("stoneQty")} />
            <Num label={t("₹ each")} value={f.stoneRate} onChange={set("stoneRate")} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Num label={t("Hallmark pieces")} value={f.hmPieces} onChange={set("hmPieces")} step="1" />
            <Num label={t("₹ per piece")} value={f.hmRate} onChange={set("hmRate")} />
            <Num label={t("Touch off")} value={f.touchOff} onChange={set("touchOff")} hint={t("Discount in touch, e.g. 0.5")} />
            <Num label={t("₹ off")} value={f.discount} onChange={set("discount")} />
          </div>
          <Num label={t("Other ₹")} value={f.other} onChange={set("other")} />
        </div>
      )}
      <Breakdown rows={rows} error={error} waiting="Enter the weight and touch to see the value." />
    </div>
  );
}

function QuoteTab({ rate, gst, interstate, shop, onResult, onClose }) {
  const { t } = useT();
  const [items, setItems] = usePersist("tab.quote", { list: [] });
  const list = items.list;
  const setList = (fn) => setItems((x) => ({ list: fn(x.list) }));
  const [code, setCode] = useState("");
  const [saved, setSaved] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const [offer, setOffer] = useState(""); // bargain mode: the total the shop wants to pay

  const add = (e) => {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (c && !list.some((x) => x.code === c)) setList((l) => [...l, { code: c, touch: "" }]);
    setCode("");
    setSaved(null);
  };

  // The shop's deal fills blank boxes; a touch typed on an item wins.
  const line = (code_, touch) => {
    const typed = num(touch);
    const out = { code: code_ };
    if (typed) out.touch_percent = typed;
    else if (shop?.price_mode === "TOUCH" && shop.deal_touch) out.touch_percent = shop.deal_touch;
    else if (shop?.price_mode === "WASTAGE") out.wastage_percent = shop.deal_wastage ?? 0;
    if (shop?.deal_making) out.making_per_gram = shop.deal_making;
    return out;
  };
  const body = { shop_id: shop?.id || null, gold_rate: rate, gst_percent: gst, interstate: shop ? null : interstate,
    lines: list.map((x) => line(x.code, x.touch)) };
  const ready = list.length > 0 && rate > 0;
  const { res: q, error } = useLive(ready ? () => billingService.quickQuote(body) : null, [JSON.stringify(body), ready]);
  const problem = (c) => q?.problems.find((p) => p.code === (q.swapped[c] || c));
  const priced = (c) => q?.lines.find((l) => l.code === (q.swapped[c] || c));
  const tot = q?.totals;
  const rows = tot && clean([
    ...q.lines.map((l) => [l.code, rs(l.amount), `${g3(l.net_weight)} · ${t("fine")} ${g3(l.fine_weight)}`]),
    ["Fine gold", g3(tot.total_fine)],
    ["Before GST", rs(tot.subtotal)],
    ...tax(tot),
    q.problems.length > 0 && ["Not priced", q.problems.map((p) => p.code).join(", ")],
  ]);
  useReport(onResult, tot ? q : null, () => ({ title: "Quick quote", rows, total: ["Total", rs(tot.grand_total), `${g3(tot.total_fine)} ${t("fine")}`],
    quote: { lines: q.lines, totals: tot, rate: q.gold_rate, gst: q.gst_percent, problems: q.problems, estimate: saved } }), saved);

  const saveEstimate = async () => {
    setSaveError(null);
    try {
      const seen = new Set();
      const lines = list.map((x) => line(q.swapped[x.code] || x.code, x.touch))
        .filter((l) => !seen.has(l.code) && seen.add(l.code));
      setSaved(await billingService.createEstimate({ shop_id: shop?.id || null, gold_rate: rate, gst_percent: gst, lines }));
    } catch (err) {
      setSaveError(err.message);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={add} className="flex gap-2">
        <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder={t("Scan or type a piece or combo code")} className="h-11 text-base" autoFocus />
        <Button type="submit" className="h-11">{t("Add")}</Button>
      </form>
      {list.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {list.map((x) => {
            const p = problem(x.code);
            const l = priced(x.code);
            return (
              <li key={x.code} className={clsx("flex items-center gap-2 rounded-xl border px-3 py-2", p ? "border-red-200 bg-red-50" : "border-line")}>
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-sm font-semibold">{x.code}
                    {q?.swapped[x.code] && <span className="ml-1 font-sans text-xs font-normal text-muted">→ {t("whole combo")} {q.swapped[x.code]}</span>}
                  </div>
                  {p ? <div className="text-xs text-red-800">{p.message.replace(" Enter one on the bill line.", "")}</div>
                    : l && <div className="text-xs tabular-nums text-muted">{g3(l.fine_weight)} {t("fine")} · {rs(l.amount)}</div>}
                </div>
                <label className="flex flex-col text-[11px] text-muted">
                  %
                  <Input type="number" inputMode="decimal" step="0.01" min="0" max="200" value={x.touch}
                    placeholder={l ? String(l.touch_percent) : ""} aria-label={t("Touch for {code}", { code: x.code })}
                    onChange={(e) => setList((ls) => ls.map((y) => (y.code === x.code ? { ...y, touch: e.target.value } : y)))}
                    className={clsx("h-9 w-20 text-right", p && !x.touch && "border-red-300")} />
                </label>
                <button onClick={() => setList((ls) => ls.filter((y) => y.code !== x.code))} className="rounded-full p-1.5 hover:bg-line"
                  aria-label={t("Remove {code}", { code: x.code })}><X size={15} aria-hidden /></button>
              </li>
            );
          })}
        </ul>
      )}
      {error && <Notice tone="error">{error}</Notice>}
      {!list.length && <p className="rounded-xl border border-dashed border-line p-4 text-center text-sm text-muted">{t("Scan pieces or combos to see their price.")}</p>}
      {tot && <Bargain tot={tot} q={q} offer={offer} setOffer={setOffer} rate={rate}
        onApply={(pct) => setList((ls) => ls.map((y) => ({ ...y, touch: String(pct) })))} />}
      {tot && (
        <div className="flex flex-col gap-2 rounded-xl bg-canvas p-3 text-sm">
          {saved ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>{t("Saved as")} <b className="font-mono">{saved.estimate_number}</b></span>
              <Link href={`/billing/new?estimate=${saved.id}`} onClick={onClose}
                className="inline-flex h-9 items-center rounded-lg bg-accent px-3 text-sm font-medium text-white">{t("Make bill now")}</Link>
            </div>
          ) : (
            <Button variant="ghost" onClick={saveEstimate} disabled={q.problems.length > 0}>{t("Save as estimate")}</Button>
          )}
          {q.problems.length > 0 && !saved && <span className="text-xs text-muted">{t("Fix or remove the red items to save an estimate.")}</span>}
          {saveError && <Notice tone="error">{saveError}</Notice>}
        </div>
      )}
    </div>
  );
}

function OldGoldTab({ rate, unit, onResult }) {
  const { t } = useT();
  const [f, setF] = usePersist("tab.old", { weight: "", less: "", purity: "", loss: "", bill: "" });
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const body = { weight: grams(f.weight, unit), less_weight: grams(f.less, unit) ?? 0, purity_percent: num(f.purity),
    melting_loss_percent: num(f.loss) ?? 0, gold_rate: rate, new_bill_amount: num(f.bill) };
  const ready = body.weight > 0 && body.purity_percent > 0 && rate > 0;
  const { res: r, error } = useLive(ready ? () => calcService.oldGold(body) : null, [JSON.stringify(body), ready]);
  const rows = r && clean([
    ["Net weight", g3(r.net_weight), null, body.less_weight ? `${w3(body.weight)} − ${w3(body.less_weight)}` : null],
    ["After melting loss", g3(r.after_loss_weight), null, body.melting_loss_percent ? `${w3(r.net_weight)} − ${pc(body.melting_loss_percent)}` : null],
    ["Fine gold", g3(r.fine_weight), pv(r.fine_pavan), `${w3(r.after_loss_weight)} × ${pc(body.purity_percent)}`],
    r.balance_direction && ["Old gold value", rs(r.value), null, `${w3(r.fine_weight)} × ${rs(rate)}`],
    r.balance_direction && ["New bill", rs(body.new_bill_amount)],
  ]);
  const label = { SHOP_PAYS: "Shop pays", WE_PAY: "We pay the shop", SETTLED: "Settled" };
  useReport(onResult, r, () => ({ title: "Old gold", rows,
    total: r.balance_direction ? [label[r.balance_direction], rs(r.balance)] : ["Old gold value", rs(r.value), g3(r.fine_weight)] }));
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <Num label={t("Old gold weight")} value={f.weight} onChange={set("weight")} weight unit={unit} />
        <Num label={t("Less: stones / dirt")} value={f.less} onChange={set("less")} weight unit={unit} />
        <Num label={t("Tested purity %")} value={f.purity} onChange={set("purity")} hint={t("From the touch-stone or machine")} />
        <Num label={t("Melting loss %")} value={f.loss} onChange={set("loss")} hint={t("Usually 1–3%")} />
      </div>
      <Num label={t("New bill total ₹ (optional)")} value={f.bill} onChange={set("bill")} hint={t("To see the balance after the old gold")} />
      <Breakdown rows={rows} error={error} waiting="Enter the weight and tested purity." />
    </div>
  );
}

function MoneyTab({ rate, gst, onResult }) {
  const { t } = useT();
  const [f, setF] = usePersist("tab.money", { amount: "", touch: "" });
  const body = { amount: num(f.amount), gold_rate: rate, gst_percent: gst, touch_percent: num(f.touch) };
  const ready = body.amount > 0 && rate > 0;
  const { res: r, error } = useLive(ready ? () => calcService.moneyToGold(body) : null, [JSON.stringify(body), ready]);
  const rows = r && clean([
    gst > 0 && ["GST in it", rs(r.gst_amount), null, `${rs(body.amount)} × ${gst} / ${100 + gst}`],
    ["For gold", rs(r.amount_before_gst)],
    r.jewellery_weight && ["Fine gold", g3(r.fine_weight), pv(r.fine_pavan), `${rs(r.amount_before_gst)} ÷ ${rs(rate)}`],
  ]);
  useReport(onResult, r, () => ({ title: "Money → gold", rows,
    total: r.jewellery_weight ? ["Jewellery weight", g3(r.jewellery_weight), `${pv(r.jewellery_pavan)} @ ${pc(body.touch_percent)}`]
      : ["Fine gold", g3(r.fine_weight), pv(r.fine_pavan)] }));
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <Num label={t("Amount ₹")} value={f.amount} onChange={(v) => setF((x) => ({ ...x, amount: v }))} step="1" hint={t("Including GST")} />
        <Num label={t("Touch % (optional)")} value={f.touch} onChange={(v) => setF((x) => ({ ...x, touch: v }))} hint={t("To see jewellery weight")} />
      </div>
      <Breakdown rows={rows} error={error} waiting="Enter an amount." />
    </div>
  );
}

function AccountTab({ rate, shop, unit, onResult }) {
  const { t } = useT();
  const [f, setF] = usePersist("tab.account", { owed: "", gold: "", purity: "99.5", cash: "" });
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  // A shop on a gold account brings its balance.
  useEffect(() => {
    if (shop?.settles_in_gold && shop.gold_balance > 0) setF((x) => ({ ...x, owed: String(shop.gold_balance) }));
  }, [shop?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const body = { owed_fine: num(f.owed), gold_weight: grams(f.gold, unit) ?? 0, gold_purity_percent: num(f.purity) ?? 99.5,
    cash: num(f.cash) ?? 0, gold_rate: rate };
  const ready = body.owed_fine !== null && rate > 0 && body.gold_purity_percent > 0;
  const { res: r, error } = useLive(ready ? () => calcService.metalAccount(body) : null, [JSON.stringify(body), ready]);
  const label = { SHOP_OWES: "Shop still owes", WE_OWE: "We owe the shop", SETTLED: "Settled" };
  const rows = r && clean([
    Number(r.gold_fine) > 0 && ["Gold given = fine", g3(r.gold_fine), null, `${w3(body.gold_weight)} × ${pc(body.gold_purity_percent)}`],
    Number(r.cash_fine) > 0 && ["Cash given = fine", g3(r.cash_fine), null, `${rs(body.cash)} ÷ ${rs(rate)}`],
    ["Paid in all", g3(r.paid_fine)],
    r.balance_direction !== "SETTLED" && ["In rupees today", rs(r.balance_rupees)],
  ]);
  useReport(onResult, r, () => ({ title: "Gold account", rows, total: [label[r.balance_direction], g3(r.balance_fine), pv(r.balance_pavan)] }));
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted">{t("For shops that settle in fine gold: what they owe, less the gold and cash they give now.")}</p>
      <Num label={t("Shop owes (fine g)")} value={f.owed} onChange={set("owed")}
        hint={shop?.settles_in_gold ? t("From {s}'s gold account", { s: shop.name }) : undefined} />
      <div className="grid grid-cols-2 gap-3">
        <Num label={t("Gold given")} value={f.gold} onChange={set("gold")} weight unit={unit} />
        <Num label={t("Its purity %")} value={f.purity} onChange={set("purity")} hint={t("Bar / coin: 99.5")} />
      </div>
      <Num label={t("Cash given ₹")} value={f.cash} onChange={set("cash")} step="1" hint={t("Counted at today's rate")} />
      <Breakdown rows={rows} error={error} waiting="Enter what the shop owes." />
    </div>
  );
}

function GstTab({ onResult }) {
  const { t } = useT();
  const [f, setF] = usePersist("tab.gst", { amount: "", pct: "3", inclusive: false, interstate: false });
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const body = { amount: num(f.amount), gst_percent: num(f.pct) ?? 0, inclusive: f.inclusive, interstate: f.interstate };
  const ready = body.amount > 0;
  const { res: r, error } = useLive(ready ? () => calcService.gst(body) : null, [JSON.stringify(body), ready]);
  const rows = r && [["Before GST", rs(r.base_amount)], ...tax(r), ["GST", rs(r.gst_amount), null,
    f.inclusive ? `${rs(body.amount)} × ${body.gst_percent} / ${100 + body.gst_percent}` : `${pc(body.gst_percent)} × ${rs(r.base_amount)}`]];
  useReport(onResult, r, () => ({ title: "GST", rows, total: ["Total", rs(r.total)] }));
  return (
    <div className="flex flex-col gap-3">
      <ModeSwitch value={f.inclusive ? "IN" : "ADD"} onChange={(v) => set("inclusive")(v === "IN")}
        options={[["ADD", "Add GST"], ["IN", "Take GST out"]]} />
      <div className="grid grid-cols-2 gap-3">
        <Num label={f.inclusive ? t("Price with GST ₹") : t("Price before GST ₹")} value={f.amount} onChange={set("amount")} />
        <Num label={t("GST %")} value={f.pct} onChange={set("pct")} hint={t("Gold jewellery: 3%")} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={f.interstate} onChange={(e) => set("interstate")(e.target.checked)} className="h-4 w-4" />
        {t("Shop is in another state (IGST)")}
      </label>
      <Breakdown rows={rows} error={error} waiting="Enter an amount." />
    </div>
  );
}

function HistoryTab() {
  const { t } = useT();
  const [list, setList] = useState(() => history.list());
  if (!list.length) return <p className="rounded-xl border border-dashed border-line p-4 text-center text-sm text-muted">{t("Press Keep on an answer to find it here later. The last 10 are kept on this device.")}</p>;
  return (
    <div className="flex flex-col gap-2">
      {list.map((h) => (
        <details key={h.at} className="rounded-xl border border-line px-3 py-2">
          <summary className="flex cursor-pointer list-none items-baseline justify-between gap-3">
            <span><span className="font-medium">{h.title}</span>
              <span className="block text-xs text-muted">{new Date(h.at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span></span>
            <span className="font-semibold tabular-nums">{h.total}</span>
          </summary>
          <pre className="mt-2 whitespace-pre-wrap font-sans text-xs text-muted">{h.text}</pre>
          <div className="mt-2"><CopyButton text={h.text} /></div>
        </details>
      ))}
      <Button variant="link" className="self-start text-red-700" onClick={() => { history.clear(); setList([]); }}>{t("Clear history")}</Button>
    </div>
  );
}


/** Bargain mode: the shop names a total; work back to the % that gives it, and what it costs us. */
function Bargain({ tot, q, offer, setOffer, rate, onApply }) {
  const { t } = useT();
  const want = num(offer);
  const gst = Number(q.gst_percent) || 0;
  const other = Number(tot.stone_amount || 0) + Number(tot.huid_amount || 0) + Number(tot.total_charges || 0);
  const net = Number(tot.total_net);
  const nowPct = net ? (Number(tot.total_fine) / net) * 100 : 0;
  let need = null;
  if (want && rate > 0 && net > 0) {
    const fine = (want / (1 + gst / 100) - other) / rate;
    need = { pct: Math.round((fine / net) * 100 * 100) / 100, fine, giveFine: Number(tot.total_fine) - fine, giveRs: Number(tot.grand_total) - want };
  }
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm">
      <label className="flex flex-wrap items-center gap-2 font-medium text-amber-900">
        🤝 {t("Shop's offer (total ₹)")}
        <Input type="number" inputMode="decimal" min="0" value={offer} onChange={(e) => setOffer(e.target.value)}
          placeholder={String(Math.round(Number(tot.grand_total)))} className="h-9 w-36 bg-surface text-right tabular-nums" />
      </label>
      {need && (
        need.pct <= 0 ? <span className="text-red-700">{t("That offer doesn't even cover the stones and charges.")}</span> : (
          <>
            <div className="text-amber-900">
              {t("{o} means {p}% on every piece", { o: rs(want), p: need.pct })}
              <span className="text-xs text-amber-900/70"> · {t("now {p}%", { p: Math.round(nowPct * 100) / 100 })}</span>
            </div>
            <div className={clsx("text-xs", need.giveFine > 0 ? "text-red-700" : "text-green-700")}>
              {need.giveFine > 0
                ? t("You give up {g} fine ({r})", { g: g3(need.giveFine), r: rs(need.giveRs) })
                : t("That is {g} fine more than the quote ({r})", { g: g3(-need.giveFine), r: rs(-need.giveRs) })}
            </div>
            <Button variant="ghost" className="self-start bg-surface" onClick={() => onApply(need.pct)}>{t("Use {p}% on all items", { p: need.pct })}</Button>
          </>
        )
      )}
    </div>
  );
}
