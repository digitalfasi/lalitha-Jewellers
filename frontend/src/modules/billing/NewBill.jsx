"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import clsx from "clsx";
import { Check, ChevronLeft, ChevronRight, Store, Undo2 } from "lucide-react";
import { api, mediaUrl } from "@/_shared/api/client";
import { beep } from "@/_shared/beep";
import CameraScan from "@/_shared/components/CameraScan";
import Tip from "@/_shared/components/Tip";
import { Button, Card, Field, Input, Notice, PurityBadge } from "@/_shared/components/ui";
import { useT } from "@/_shared/i18n/LanguageProvider";
import { grams } from "@/modules/inventory/inventoryService";
import { tagService } from "@/modules/tags/tagService";
import { FEATURES } from "@/_shared/features";
import { billingService, inr, num2, pct, today } from "./billingService";
import { dealText } from "./ShopsTab";

const STEPS = ["Shop", "Scan items", "Check and save"];

// A new bill in three steps, one job per screen:
//   1 choose the shop  ->  2 scan pieces or combos, set the rate and %  ->  3 charges, check and save.
// The server prices the bill live (quote) as lines change; saving marks everything sold.
export default function NewBill() {
  const router = useRouter();
  const { t } = useT();
  const [step, setStep] = useState(0);
  const [shops, setShops] = useState([]);
  const [shopQ, setShopQ] = useState("");
  const [shopId, setShopId] = useState("");
  const [billDate, setBillDate] = useState(today());
  const [goldRate, setGoldRate] = useState(""); // blank = the day's rate from Settings
  const [dayRate, setDayRate] = useState(undefined); // undefined = loading, null = not set
  const [gst, setGst] = useState("3");
  const [biz, setBiz] = useState(null); // the owner's bill settings: stone and HUID rates, making on/off
  const [stoneRate, setStoneRate] = useState(""); // blank = from Settings
  const [huidRate, setHuidRate] = useState("");
  const [allPct, setAllPct] = useState("");
  // How this shop is priced: by touch %, or by purity + wastage % with making per gram.
  const [priceBy, setPriceBy] = useState("TOUCH");
  const [estimateId, setEstimateId] = useState(null); // the estimate this bill comes from
  const [remarks, setRemarks] = useState("");
  const [huidPieces, setHuidPieces] = useState(""); // blank = pieces that have a HUID
  const [draftId, setDraftId] = useState(null);     // set once saved as a draft
  const [restored, setRestored] = useState(false);
  // [{code, kind: "PIECE"|"COMBO", comboCode, pieceCodes, charges, touch, photo, title, purity}]
  const [lines, setLines] = useState([]);
  const [undo, setUndo] = useState(null); // {lines, text} - the last removal, for one tap back
  const [scan, setScan] = useState("");
  const [last, setLast] = useState(null); // the last scanned item, shown big with its photo
  const [quote, setQuote] = useState(null);
  const [quoteError, setQuoteError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [saving, setSaving] = useState(false);
  const scanRef = useRef(null);

  useEffect(() => {
    billingService.listShops().then(setShops).catch((e) => setNotice({ tone: "error", text: e.message }));
    api("/business").then(setBiz).catch(() => {});
  }, []);

  // "Make bill" from an estimate: the same shop, lines and (if still valid) rate.
  useEffect(() => {
    const apply = (d) => {
      setShopId(d.shopId || ""); setBillDate(d.billDate || today()); setGoldRate(d.goldRate || ""); setGst(d.gst ?? "3");
      setPriceBy(d.priceBy || "TOUCH"); setEstimateId(d.estimateId || null); setRemarks(d.remarks || "");
      setLines(d.lines || []); setStoneRate(d.stoneRate || ""); setHuidRate(d.huidRate || ""); setHuidPieces(d.huidPieces || "");
      setDraftId(d.draftId || null); setStep(d.lines?.length ? 1 : d.shopId ? 1 : 0);
    };
    const params = new URLSearchParams(window.location.search);
    const draftParam = params.get("draft");
    if (draftParam) {
      billingService.drafts().then((list) => {
        const d = list.find((x) => x.id === draftParam);
        if (d) {
          apply({ ...d.data, draftId: d.id });
          setNotice({ tone: "ok", text: t("Draft opened.") });
        }
      }).finally(() => setRestored(true));
      return;
    }
    if (!params.get("estimate") && !params.get("rate")) {
      try {
        const saved = JSON.parse(localStorage.getItem("newbill.autosave"));
        if (saved?.lines?.length || saved?.shopId) {
          apply(saved);
          setNotice({ tone: "ok", text: t("Your unfinished bill is back.") });
        }
      } catch {}
    }
    setRestored(true);
    const fromCalc = new URLSearchParams(window.location.search).get("rate");
    if (fromCalc && Number(fromCalc) > 0) setGoldRate(fromCalc); // "New bill at this rate" from the calculator
    const id = new URLSearchParams(window.location.search).get("estimate");
    if (!id) return;
    billingService.getEstimate(id).then((e) => {
      if (e.status === "BILLED") return setNotice({ tone: "error", text: t("{n} is already billed.", { n: e.estimate_number }) });
      const str = (v) => (v === undefined || v === null ? "" : String(v));
      setEstimateId(e.id);
      if (e.shop_id) setShopId(e.shop_id);
      setGst(String(e.gst_percent));
      setGoldRate(e.is_valid ? String(e.gold_rate) : "");
      if (e.lines.some((l) => l.wastage_percent !== undefined)) setPriceBy("WASTAGE");
      setLines(e.lines.map((l) => ({
        code: l.code, kind: l.code.startsWith("CB") ? "COMBO" : "PIECE", charges: str(l.charges || ""),
        touch: str(l.touch_percent), wastage: str(l.wastage_percent), making: str(l.making_per_gram),
      })));
      setStep(e.shop_id ? 1 : 0);
      setNotice({ tone: "ok", text: e.is_valid ? t("Loaded {n}.", { n: e.estimate_number })
        : t("Loaded {n}. Its rate has expired, so today's rate is used.", { n: e.estimate_number }) });
    }).catch((err) => setNotice({ tone: "error", text: err.message }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!billDate) return setDayRate(null);
    setDayRate(undefined);
    api(`/rates/today?on=${billDate}`).then((r) => setDayRate(r.today?.rate ?? null)).catch(() => setDayRate(null));
  }, [billDate]);

  useEffect(() => {
    if (step === 1) scanRef.current?.focus();
  }, [step]);

  const shopDeal = FEATURES.shopDeals ? shops.find((s) => s.id === shopId) : null;
  const showMaking = FEATURES.shopDeals || !!biz?.show_making;
  // The shop's usual deal: switch the pricing way when a shop with a deal is chosen.
  useEffect(() => {
    if (shopDeal?.price_mode && !estimateId) setPriceBy(shopDeal.price_mode);
  }, [shopId, shops.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const draft = useMemo(
    () => ({
      shop_id: shopId || null,
      bill_date: billDate || null,
      gold_rate: goldRate === "" ? null : parseFloat(goldRate),
      gst_percent: gst === "" ? 0 : parseFloat(gst),
      stone_rate: stoneRate === "" ? null : parseFloat(stoneRate) || 0,
      huid_rate: huidRate === "" ? null : parseFloat(huidRate) || 0,
      huid_pieces: huidPieces === "" ? null : parseInt(huidPieces, 10) || 0,
      remarks: remarks || null,
      lines: lines.map((l) => {
        // Blank boxes take the shop's usual deal.
        const charges = l.charges === "" ? 0 : parseFloat(l.charges) || 0;
        const pick = (typed, deal) => ((typed ?? "") === "" ? deal ?? null : parseFloat(typed));
        if (priceBy === "WASTAGE") {
          return {
            code: l.code, charges,
            wastage_percent: pick(l.wastage, shopDeal?.deal_wastage) ?? 0,
            making_per_gram: pick(l.making, shopDeal?.deal_making) || null,
          };
        }
        const making = pick(l.making, shopDeal?.deal_making);
        return { code: l.code, charges, touch_percent: pick(l.touch, shopDeal?.deal_touch) || null,
          ...(making ? { making_per_gram: making } : {}) };
      }),
      estimate_id: estimateId,
    }),
    [shopId, billDate, goldRate, gst, stoneRate, huidRate, huidPieces, remarks, lines, priceBy, shopDeal, estimateId],
  );
  const rateOk = goldRate === "" ? !!dayRate : draft.gold_rate > 0;
  const shop = shops.find((s) => s.id === shopId);

  // Live pricing. A stale answer is dropped if the lines changed meanwhile.
  useEffect(() => {
    if (!lines.length || !rateOk) {
      setQuote(null);
      setQuoteError(null);
      return;
    }
    let live = true;
    const timer = setTimeout(() => {
      billingService
        .quote(draft)
        .then((q) => live && (setQuote(q), setQuoteError(null)))
        .catch((e) => live && (setQuote(null), setQuoteError(e.message)));
    }, 300);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [draft]); // eslint-disable-line react-hooks/exhaustive-deps

  const onBill = (code) => lines.some((l) => l.code === code || l.comboCode === code || l.pieceCodes?.includes(code));
  const comboLine = (c) => ({ code: c.code, kind: "COMBO", comboCode: c.code, pieceCodes: c.piece_codes, charges: "", touch: "",
    photo: c.photo_url, title: c.title, purity: c.purity });

  const addCode = (e) => {
    e.preventDefault();
    const code = scan.trim().toUpperCase();
    setScan("");
    if (code) addItem(code);
  };

  const fail = (text) => {
    beep(false);
    setLast(null);
    setNotice({ tone: "error", text });
  };

  const addItem = async (code) => {
    setNotice(null);
    if (onBill(code)) return fail(t("{code} is already on this bill.", { code }));
    try {
      const item = await tagService.resolve(code);
      if (!item.printable) return fail(t("{code} is {status}, so it cannot be billed.", { code, status: t(item.status === "SOLD" ? "sold" : "not in stock") }));
      // A piece in a set goes on as its set (it can be split afterwards).
      if (item.kind === "PIECE" && item.combo_code) {
        if (onBill(item.combo_code)) return fail(t("{code} is in combo {set}, which is already on this bill.", { code, set: item.combo_code }));
        const combo = await tagService.resolve(item.combo_code);
        setLines((ls) => [...ls, comboLine(combo)]);
        setLast(combo);
        beep(true);
        return setNotice({ tone: "ok", text: t("{code} is part of {set}, so the whole combo was added. Press Split to bill its pieces separately.", { code, set: item.combo_code }) });
      }
      setLines((ls) => [...ls, item.kind === "COMBO" ? comboLine(item)
        : { code: item.code, kind: "PIECE", charges: "", touch: "", photo: item.photo_url, title: item.title, purity: item.purity }]);
      setLast(item);
      beep(true);
    } catch (err) {
      fail(err.message);
    } finally {
      scanRef.current?.focus();
    }
  };

  const setLine = (i, k, v) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  // One % for every line, e.g. a dealer who gets 102 on everything. Each line can still be changed after.
  const applyAll = () => {
    if (allPct === "") return;
    setLines((ls) => ls.map((l) => ({ ...l, touch: allPct })));
  };
  const removeLine = (i) => {
    const l = lines[i];
    const before = lines;
    // Removing one piece of a split set removes the whole set: half a set can't be sold.
    const next = l.kind === "PIECE" && l.comboCode ? lines.filter((x) => x.comboCode !== l.comboCode) : lines.filter((_, j) => j !== i);
    setLines(next);
    setUndo({ lines: before, text: t("{code} removed.", { code: l.comboCode && l.kind === "PIECE" ? l.comboCode : l.code }) });
  };
  const split = (i) => {
    const l = lines[i];
    const parts = l.pieceCodes.map((c) => ({ code: c, kind: "PIECE", comboCode: l.comboCode, pieceCodes: l.pieceCodes, charges: "", touch: l.touch }));
    setLines((ls) => [...ls.slice(0, i), ...parts, ...ls.slice(i + 1)]);
  };
  const join = (comboCode) => {
    setLines((ls) => {
      const first = ls.findIndex((x) => x.comboCode === comboCode);
      const keep = ls[first];
      const out = ls.filter((x) => x.comboCode !== comboCode);
      out.splice(first, 0, { code: comboCode, kind: "COMBO", comboCode, pieceCodes: keep.pieceCodes, charges: "", touch: "" });
      return out;
    });
  };

  // The undo offer fades after a while.
  useEffect(() => {
    if (!undo) return;
    const timer = setTimeout(() => setUndo(null), 10000);
    return () => clearTimeout(timer);
  }, [undo]);

  const save = async () => {
    setSaving(true);
    setNotice(null);
    try {
      const bill = await billingService.createBill(draft);
      try {
        localStorage.removeItem("newbill.autosave");
      } catch {}
      if (draftId) billingService.deleteDraft(draftId).catch(() => {});
      router.push(`/billing/${bill.id}`);
    } catch (err) {
      setNotice({ tone: "error", text: err.message });
      setSaving(false);
    }
  };

  // Everything typed is kept on this device until the bill is saved, so leaving to check stock loses nothing.
  const snapshot = { shopId, billDate, goldRate, gst, priceBy, estimateId, remarks, lines, stoneRate, huidRate, huidPieces, draftId };
  useEffect(() => {
    if (!restored) return;
    try {
      localStorage.setItem("newbill.autosave", JSON.stringify(snapshot));
    } catch {}
  }, [restored, JSON.stringify(snapshot)]); // eslint-disable-line react-hooks/exhaustive-deps
  const [draftSaved, setDraftSaved] = useState(false);
  const saveDraft = async () => {
    const id = draftId || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()));
    try {
      await billingService.saveDraft(id, { data: { ...snapshot, draftId: id }, shop_name: shop?.name || null,
        line_count: lines.length, grand_total: quote?.totals?.grand_total ?? null });
      setDraftId(id);
      setDraftSaved(true);
      setTimeout(() => setDraftSaved(false), 2000);
    } catch (err) {
      setNotice({ tone: "error", text: err.message });
    }
  };
  const startOver = () => {
    try {
      localStorage.removeItem("newbill.autosave");
    } catch {}
    window.location.href = "/billing/new";
  };

  const tot = quote?.totals;
  const canSave = shopId && rateOk && lines.length && quote && !quoteError && !saving;
  const shownShops = shops.filter((s) => !shopQ.trim() || `${s.name} ${s.city || ""}`.toLowerCase().includes(shopQ.trim().toLowerCase()));

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <div>
        <Link href="/billing" className="text-sm text-muted hover:text-ink">← {t("Billing")}</Link>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-2xl font-bold">{t("New bill")}{draftId && <span className="ml-2 align-middle text-xs font-normal text-muted">({t("draft")})</span>}</h1>
          {(lines.length > 0 || shopId) && <button onClick={startOver} className="text-sm text-muted hover:text-red-700">{t("Start a new bill")}</button>}
        </div>
      </div>

      {/* Step indicator: tap a finished step to go back to it. */}
      <ol className="grid grid-cols-3 gap-2">
        {STEPS.map((label, i) => {
          const done = i < step;
          const reachable = i <= step || (i === 1 && shopId) || (i === 2 && shopId && lines.length);
          return (
            <li key={label}>
              <button type="button" disabled={!reachable} onClick={() => setStep(i)}
                className={clsx("flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm",
                  i === step ? "border-accent bg-accent-soft font-semibold text-accent" : done ? "border-line bg-surface" : "border-line bg-canvas text-muted")}>
                <span className={clsx("flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                  i === step ? "bg-accent text-white" : done ? "bg-green-600 text-white" : "bg-line text-muted")}>
                  {done ? <Check size={16} aria-hidden /> : i + 1}
                </span>
                <span className="min-w-0">
                  {t(label)}
                  {i === 0 && shop && <span className="block truncate text-xs font-normal text-muted">{shop.name}</span>}
                  {i === 1 && lines.length > 0 && <span className="block text-xs font-normal text-muted">{t("{n} lines", { n: lines.length })}</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      {notice && <Notice tone={notice.tone} onClose={() => setNotice(null)}>{notice.text}</Notice>}

      {/* ---------------------------------------------------------------- 1. shop */}
      {step === 0 && (
        <Card className="flex flex-col gap-4 p-5">
          <h2 className="text-lg font-semibold">{t("Which shop is this bill for?")}</h2>
          <Input value={shopQ} onChange={(e) => setShopQ(e.target.value)} placeholder={t("Type to find a shop")} className="h-11 text-base" autoFocus />
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {shownShops.map((s) => (
              <button key={s.id} type="button" onClick={() => { setShopId(s.id); setStep(1); }}
                className={clsx("flex items-center gap-3 rounded-xl border p-3 text-left hover:border-accent",
                  s.id === shopId ? "border-accent bg-accent-soft" : "border-line bg-surface")}>
                <Store size={22} className="shrink-0 text-accent" aria-hidden />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{s.name}</span>
                  <span className="block truncate text-xs text-muted">{[s.city, s.state_name].filter(Boolean).join(", ")}</span>
                </span>
              </button>
            ))}
            {shownShops.length === 0 && (
              <p className="text-sm text-muted">{t("No shop found. Add it under Billing → Shops.")}</p>
            )}
          </div>
          <details className="text-sm">
            <summary className="cursor-pointer text-muted">{t("Date, gold rate and GST")}: {billDate} · {goldRate || dayRate ? `₹${(goldRate || dayRate).toLocaleString?.("en-IN") ?? goldRate}` : t("rate not set")} · {gst}%</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <Field label={t("Bill date")}>
                <Input type="date" value={billDate} onChange={(e) => setBillDate(e.target.value)} />
              </Field>
              <Field
                label={t("Gold rate (₹ / g fine)")}
                error={goldRate !== "" && !rateOk ? t("Enter a rate above 0") : goldRate === "" && dayRate === null ? t("No rate set for this date. Set it in Settings, or type one here.") : undefined}
                hint={goldRate === "" && dayRate ? t("The day's rate. Type to use a different one on this bill.") : undefined}
              >
                <Input type="number" inputMode="decimal" min="0" step="0.01" value={goldRate} onChange={(e) => setGoldRate(e.target.value)} placeholder={dayRate ? String(dayRate) : "7200"} />
              </Field>
              <Field label="GST %">
                <Input type="number" inputMode="decimal" min="0" max="28" step="0.01" value={gst} onChange={(e) => setGst(e.target.value)} />
              </Field>
            </div>
          </details>
        </Card>
      )}

      {/* ---------------------------------------------------------------- 2. items */}
      {step === 1 && (
        <div className="grid items-start gap-5 lg:grid-cols-[1fr_300px]">
          <div className="flex min-w-0 flex-col gap-4">
            <Card className="p-5">
              <form onSubmit={addCode} className="flex flex-wrap items-center gap-2">
                <Input ref={scanRef} value={scan} onChange={(e) => setScan(e.target.value)} placeholder={t("Scan a tag, or type CH0001 / CB0001")}
                  className="h-12 min-w-56 flex-1 font-mono text-lg" aria-label={t("Scan code")} />
                <Button type="submit" className="h-12" disabled={!scan.trim()}>{t("Add")}</Button>
                <CameraScan onCode={addItem} continuous className="h-12" label={t("Camera")} />
              </form>
              {undo && (
                <div className="mt-3 flex items-center justify-between gap-2 rounded-lg bg-canvas px-3 py-2 text-sm">
                  <span>{undo.text}</span>
                  <Button variant="link" onClick={() => { setLines(undo.lines); setUndo(null); }}>
                    <Undo2 size={14} aria-hidden /> {t("Undo")}
                  </Button>
                </div>
              )}
              {!rateOk && lines.length > 0 && <p className="mt-3 text-sm text-amber-700">{t("Set the day's gold rate in Settings, or type one on the next step.")}</p>}
              {quoteError && <div className="mt-3"><Notice tone="error">{quoteError}</Notice></div>}
            </Card>
            <Tip id="newbill">{t("Scanning one piece of a combo adds the whole combo. Leave % empty to use each piece's own %.")}</Tip>
            {showMaking && <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted">{t("Price by")}</span>
              {[["TOUCH", "Touch %"], ["WASTAGE", "Purity + wastage"]].map(([k, label]) => (
                <button key={k} type="button" onClick={() => setPriceBy(k)}
                  className={clsx("rounded-lg border px-3 py-1.5", priceBy === k ? "border-accent bg-accent-soft font-semibold text-accent" : "border-line hover:bg-canvas")}>
                  {t(label)}
                </button>
              ))}
              {dealText(shopDeal) && <span className="rounded-full bg-canvas px-2 py-0.5 text-xs">{t("Shop's deal")}: {dealText(shopDeal)}</span>}
              {priceBy === "WASTAGE" && <span className="text-xs text-muted">{t("Touch = purity + wastage (22K + 8 = 99.6). Making is ₹ per gram of net weight.")}</span>}
            </div>}

            {lines.length === 0 ? (
              <Card className="p-10 text-center text-muted">{t("Scan pieces or combos to start the bill.")}</Card>
            ) : (
              <ul className="flex flex-col gap-2">
                {lines.map((l, i) => {
                  const ql = quote?.lines[i];
                  return (
                    <li key={`${l.code}-${i}`} className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface p-3">
                      {l.photo ? <img src={mediaUrl(l.photo)} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
                        : <div className="h-14 w-14 shrink-0 rounded-lg bg-canvas" />}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono font-semibold">{l.code}</span>
                          <PurityBadge purity={ql?.purity || l.purity} />
                          {l.kind === "COMBO" && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs text-accent">{t("Combo")}</span>}
                          {l.kind === "PIECE" && l.comboCode && <span className="text-xs text-muted">{t("of combo {set}", { set: l.comboCode })}</span>}
                        </div>
                        <div className="truncate text-sm">{ql ? ql.description : l.title || (l.pieceCodes || []).join(" + ")}</div>
                        {ql && <div className="text-xs tabular-nums text-muted">{t("Gross")} {grams(ql.gross_weight)}{ql.stone_weight > 0 ? ` · ${t("Less")} ${grams(ql.stone_weight)}` : ""} · {t("Net")} {grams(ql.net_weight)} · <b className="text-ink">{t("Fine")} {grams(ql.fine_weight)}</b></div>}
                      </div>
                      {priceBy === "TOUCH" ? null : (
                        <>
                          <label className="flex flex-col text-xs text-muted">
                            {t("Wastage %")}
                            <Input type="number" inputMode="decimal" min="0" max="100" step="0.01" value={l.wastage ?? ""} onChange={(e) => setLine(i, "wastage", e.target.value)}
                              placeholder={String(shopDeal?.deal_wastage ?? 0)} className="h-9 w-20 text-right" aria-label={t("Wastage for {code}", { code: l.code })} />
                            {ql && <span className="text-[11px]">{t("touch")} {ql.touch_percent}</span>}
                          </label>
                          <label className="flex flex-col text-xs text-muted">
                            {t("Making ₹/g")}
                            <Input type="number" inputMode="decimal" min="0" step="0.01" value={l.making ?? ""} onChange={(e) => setLine(i, "making", e.target.value)}
                              placeholder={String(shopDeal?.deal_making ?? 0)} className="h-9 w-20 text-right" aria-label={t("Making for {code}", { code: l.code })} />
                          </label>
                        </>
                      )}
                      {showMaking && <label className="flex flex-col text-xs text-muted">
                        {priceBy === "TOUCH" ? t("Charges ₹") : t("Other ₹")}
                        <Input type="number" inputMode="decimal" min="0" step="0.01" value={l.charges} onChange={(e) => setLine(i, "charges", e.target.value)}
                          placeholder="0" className="h-9 w-24 text-right" aria-label={t("Charges for {code}", { code: l.code })} />
                      </label>}
                      <div className="w-24 text-right font-semibold tabular-nums">{ql ? num2(ql.amount) : "…"}</div>
                      <div className="flex gap-2">
                        {l.kind === "COMBO" && <Button variant="ghost" className="h-9" onClick={() => split(i)}>{t("Split")}</Button>}
                        {l.kind === "PIECE" && l.comboCode && lines.findIndex((x) => x.comboCode === l.comboCode) === i && (
                          <Button variant="ghost" className="h-9" onClick={() => join(l.comboCode)}>{t("Join")}</Button>
                        )}
                        <Button variant="ghost" className="h-9 text-red-700" onClick={() => removeLine(i)} aria-label={t("Remove {code}", { code: l.code })}>✕</Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="flex flex-col gap-4 lg:sticky lg:top-4">
            {last && (
              <Card className="overflow-hidden">
                {last.photo_url && <img src={mediaUrl(last.photo_url)} alt="" className="aspect-square max-h-72 w-full object-cover" />}
                <div className="p-3">
                  <div className="text-xs uppercase tracking-wide text-green-700">{t("Just added")}</div>
                  <div className="font-mono font-bold">{last.code}</div>
                  <div className="text-sm">{last.title}</div>
                </div>
              </Card>
            )}
            <Card className="p-4">
              <div className="text-xs uppercase tracking-wide text-muted">{t("Total so far")}</div>
              <div className="text-2xl font-bold tabular-nums">{tot ? inr(tot.grand_total) : "—"}</div>
              <div className="text-xs text-muted">{tot ? t("{n} pieces · fine {g} g", { n: tot.total_pieces, g: grams(tot.total_fine) }) : ""}</div>
              <Button className="mt-3 h-11 w-full text-base" disabled={!lines.length} onClick={() => setStep(2)}>
                {t("Next: check and save")} <ChevronRight size={18} aria-hidden />
              </Button>
            </Card>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------- 3. check */}
      {step === 2 && (
        <div className="grid items-start gap-5 lg:grid-cols-[1fr_380px]">
          <Card className="flex min-w-0 flex-col gap-3 p-5">
            <h2 className="text-lg font-semibold">{t("Check the bill")}</h2>
            <dl className="grid grid-cols-[120px_1fr] gap-y-1 text-sm">
              <dt className="text-muted">{t("Shop")}</dt><dd className="font-medium">{shop?.name}</dd>
              <dt className="text-muted">{t("Date")}</dt><dd>{billDate}</dd>
              <dt className="text-muted">{t("Gold rate")}</dt><dd>{quote ? `${inr(quote.gold_rate)} / g` : "—"}</dd>
            </dl>
            <div className="flex flex-wrap items-end gap-3 rounded-xl bg-canvas p-3">
              <Field label={t("Gold rate (₹ / g fine)")} hint={goldRate === "" && dayRate ? t("Today's rate. Type to change it for this dealer.") : undefined}
                error={goldRate === "" && dayRate === null ? t("No rate set for this date. Type one here.") : undefined}>
                <Input type="number" inputMode="decimal" min="0" step="0.01" value={goldRate} onChange={(e) => setGoldRate(e.target.value)}
                  placeholder={dayRate ? String(dayRate) : "15180"} className="h-10 w-40 bg-surface text-base" />
              </Field>
              {priceBy === "TOUCH" && (
                <Field label={t("% for all lines")} hint={t("Fills every line; change any line after.")}>
                  <div className="flex gap-1">
                    <Input type="number" inputMode="decimal" min="0" max="200" step="0.01" value={allPct} onChange={(e) => setAllPct(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && applyAll()} placeholder="103" className="h-10 w-24 bg-surface text-base" />
                    <Button variant="ghost" className="h-10" onClick={applyAll} disabled={allPct === "" || !lines.length}>{t("Apply")}</Button>
                  </div>
                </Field>
              )}
            </div>
            {quote && (
              <div className="overflow-x-auto rounded-lg border border-line">
                <table className="w-full min-w-[620px] text-sm tabular-nums">
                  <thead className="bg-canvas text-xs uppercase tracking-wide text-muted">
                    <tr>
                      <th className="px-2 py-2 text-left">{t("Product")}</th>
                      <th className="px-2 text-left">{t("Purity")}</th>
                      <th className="px-2 text-right">{t("Gross")}</th><th className="px-2 text-right">{t("Less")}</th>
                      <th className="px-2 text-right">{t("Net")}</th><th className="px-2 text-right">%</th>
                      <th className="px-2 text-right">{t("Fine")}</th><th className="px-2 text-right">"RS"</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {quote.lines.map((ql, i) => (
                      <tr key={ql.line_no}>
                        <td className="px-2 py-1.5"><span className="font-mono text-xs">{ql.code}</span> <span className="text-xs text-muted">{ql.description}</span></td>
                        <td className="px-2 text-xs font-medium">{ql.purity}</td>
                        <td className="px-2 text-right">{grams(ql.gross_weight)}</td>
                        <td className="px-2 text-right">{ql.stone_weight > 0 ? grams(ql.stone_weight) : "—"}</td>
                        <td className="px-2 text-right">{grams(ql.net_weight)}</td>
                        <td className="px-1 text-right">
                          {priceBy === "TOUCH" && lines[i] ? (
                            <Input type="number" inputMode="decimal" min="0" max="200" step="0.01" value={lines[i].touch}
                              onChange={(e) => setLine(i, "touch", e.target.value)} placeholder={String(ql.touch_percent)}
                              className="ml-auto block h-8 w-20 text-right" aria-label={t("% for {code}", { code: ql.code })} />
                          ) : ql.touch_percent}
                        </td>
                        <td className="px-2 text-right font-semibold">{grams(ql.fine_weight)}</td>
                        <td className="px-2 text-right">{ql.stone_amount ? num2(ql.stone_amount) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t-2 border-ink/70 font-semibold">
                    <tr>
                      <td className="px-2 py-1.5">{t("{n} pieces", { n: tot.total_pieces })}</td>
                      <td />
                      <td className="px-2 text-right">{grams(tot.total_gross)}</td><td className="px-2 text-right">{grams(tot.total_stone)}</td>
                      <td className="px-2 text-right">{grams(tot.total_net)}</td><td />
                      <td className="px-2 text-right">{grams(tot.total_fine)}</td><td className="px-2 text-right">{num2(tot.stone_amount)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label={t("Stones ₹ / g of less")} hint={t("From Settings. Change for this bill.")}>
                <Input type="number" inputMode="decimal" min="0" step="0.01" value={stoneRate} onChange={(e) => setStoneRate(e.target.value)}
                  placeholder={biz?.stone_rate != null ? String(biz.stone_rate) : "0"} />
              </Field>
              <Field label={t("HUID ₹ / piece")} hint={tot ? t("{n} pieces have a HUID", { n: tot.huid_pieces }) : undefined}>
                <Input type="number" inputMode="decimal" min="0" step="0.01" value={huidRate} onChange={(e) => setHuidRate(e.target.value)}
                  placeholder={biz?.huid_rate != null ? String(biz.huid_rate) : "0"} />
              </Field>
              <Field label={t("HUID pieces")} hint={t("Blank = pieces with a HUID")}>
                <Input type="number" inputMode="numeric" min="0" step="1" value={huidPieces} onChange={(e) => setHuidPieces(e.target.value)}
                  placeholder={tot ? String(tot.huid_pieces) : "0"} />
              </Field>
              <Field label="GST %">
                <Input type="number" inputMode="decimal" min="0" max="28" step="0.01" value={gst} onChange={(e) => setGst(e.target.value)} />
              </Field>
            </div>
            <Field label={t("Remarks")} hint={t("Optional, printed on the bill")}>
              <Input value={remarks} onChange={(e) => setRemarks(e.target.value)} maxLength={1000} />
            </Field>
            {quoteError && <Notice tone="error">{quoteError}</Notice>}
            <Button variant="ghost" className="self-start" onClick={() => setStep(1)}><ChevronLeft size={16} aria-hidden /> {t("Back to items")}</Button>
          </Card>
          <Card className="p-5">
            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-sm tabular-nums">
              <dt className="text-muted">{t("Pieces")}</dt><dd className="text-right">{tot ? tot.total_pieces : "—"}</dd>
              <dt className="text-muted">{t("Fine weight")}</dt><dd className="text-right font-medium">{tot ? `${grams(tot.total_fine)} g` : "—"}</dd>
              <dt className="text-muted">{t("Gold")} {tot ? `(${grams(tot.total_fine)} × ${num2(quote.gold_rate)})` : ""}</dt><dd className="text-right">{tot ? inr(tot.metal_amount) : "—"}</dd>
              {tot?.stone_amount > 0 && <><dt className="text-muted">RS ({t("stones")} {grams(tot.total_stone)} × {num2(tot.stone_rate)})</dt><dd className="text-right">{inr(tot.stone_amount)}</dd></>}
              {tot?.huid_amount > 0 && <><dt className="text-muted">HUID ({tot.huid_pieces} × {num2(tot.huid_rate)})</dt><dd className="text-right">{inr(tot.huid_amount)}</dd></>}
              {tot?.total_charges > 0 && <><dt className="text-muted">{t("Other charges")}</dt><dd className="text-right">{inr(tot.total_charges)}</dd></>}
              <dt className="text-muted">{t("Taxable value")}</dt><dd className="text-right">{tot ? inr(tot.subtotal) : "—"}</dd>
              {tot?.tax_type === "INTER" ? (
                <><dt className="text-muted">IGST {pct(quote.gst_percent)}</dt><dd className="text-right">{inr(tot.igst_amount)}</dd></>
              ) : tot ? (
                <>
                  <dt className="text-muted">CGST {pct(quote.gst_percent / 2)}</dt><dd className="text-right">{inr(tot.cgst_amount)}</dd>
                  <dt className="text-muted">SGST {pct(quote.gst_percent / 2)}</dt><dd className="text-right">{inr(tot.sgst_amount)}</dd>
                </>
              ) : null}
              <dt className="text-muted">{t("Round off")}</dt><dd className="text-right">{tot ? num2(tot.round_off) : "—"}</dd>
              <dt className="mt-2 border-t border-line pt-2 text-base font-semibold">{t("Total")}</dt>
              <dd className="mt-2 border-t border-line pt-2 text-right text-2xl font-bold">{tot ? inr(tot.grand_total) : "—"}</dd>
            </dl>
            <Button variant="ghost" onClick={saveDraft} disabled={!lines.length && !shopId} className="mt-4 h-10 w-full">
              {draftSaved ? t("Draft saved") : t("Save as draft")}
            </Button>
            <Button onClick={save} disabled={!canSave} className="mt-2 h-12 w-full text-base">
              {saving ? t("Saving…") : !rateOk ? t("Set the gold rate") : t("Save bill")}
            </Button>
            <p className="mt-2 text-xs text-muted">{t("Saving marks every piece and combo on this bill as sold.")}</p>
          </Card>
        </div>
      )}

      {step === 0 && shopId && (
        <Button className="h-11 self-end text-base" onClick={() => setStep(1)}>{t("Next: scan items")} <ChevronRight size={18} aria-hidden /></Button>
      )}
    </div>
  );
}
