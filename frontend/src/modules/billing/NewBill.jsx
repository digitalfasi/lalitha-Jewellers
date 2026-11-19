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
import { billingService, inr, num2, pct, today } from "./billingService";

const STEPS = ["Shop", "Scan items", "Check and save"];

// A new bill in three steps, one job per screen:
//   1 choose the shop  ->  2 scan pieces or sets  ->  3 check the total and save.
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
  const [remarks, setRemarks] = useState("");
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
  }, []);

  useEffect(() => {
    if (!billDate) return setDayRate(null);
    setDayRate(undefined);
    api(`/rates/today?on=${billDate}`).then((r) => setDayRate(r.today?.rate ?? null)).catch(() => setDayRate(null));
  }, [billDate]);

  useEffect(() => {
    if (step === 1) scanRef.current?.focus();
  }, [step]);

  const draft = useMemo(
    () => ({
      shop_id: shopId || null,
      bill_date: billDate || null,
      gold_rate: goldRate === "" ? null : parseFloat(goldRate),
      gst_percent: gst === "" ? 0 : parseFloat(gst),
      remarks: remarks || null,
      lines: lines.map((l) => ({
        code: l.code,
        charges: l.charges === "" ? 0 : parseFloat(l.charges) || 0,
        touch_percent: l.touch === "" ? null : parseFloat(l.touch) || null,
      })),
    }),
    [shopId, billDate, goldRate, gst, remarks, lines],
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
        if (onBill(item.combo_code)) return fail(t("{code} is in {set}, which is already on this bill.", { code, set: item.combo_code }));
        const combo = await tagService.resolve(item.combo_code);
        setLines((ls) => [...ls, comboLine(combo)]);
        setLast(combo);
        beep(true);
        return setNotice({ tone: "ok", text: t("{code} is part of {set}, so the whole set was added. Press Split to bill its pieces separately.", { code, set: item.combo_code }) });
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
      router.push(`/billing/${bill.id}`);
    } catch (err) {
      setNotice({ tone: "error", text: err.message });
      setSaving(false);
    }
  };

  const tot = quote?.totals;
  const canSave = shopId && rateOk && lines.length && quote && !quoteError && !saving;
  const shownShops = shops.filter((s) => !shopQ.trim() || `${s.name} ${s.city || ""}`.toLowerCase().includes(shopQ.trim().toLowerCase()));

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <div>
        <Link href="/billing" className="text-sm text-muted hover:text-ink">← {t("Billing")}</Link>
        <h1 className="text-2xl font-bold">{t("New bill")}</h1>
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
              {!rateOk && lines.length > 0 && <p className="mt-3 text-sm text-amber-700">{t("Set the day's gold rate (or type one in step 1) to price the bill.")}</p>}
              {quoteError && <div className="mt-3"><Notice tone="error">{quoteError}</Notice></div>}
            </Card>
            <Tip id="newbill">{t("Scanning one piece of a set adds the whole set. Leave Touch empty to use each piece's own touch.")}</Tip>

            {lines.length === 0 ? (
              <Card className="p-10 text-center text-muted">{t("Scan pieces or sets to start the bill.")}</Card>
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
                          {l.kind === "COMBO" && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs text-accent">{t("Set")}</span>}
                          {l.kind === "PIECE" && l.comboCode && <span className="text-xs text-muted">{t("of {set}", { set: l.comboCode })}</span>}
                        </div>
                        <div className="truncate text-sm">{ql ? ql.description : l.title || (l.pieceCodes || []).join(" + ")}</div>
                        {ql && <div className="text-xs tabular-nums text-muted">{t("Net")} {grams(ql.net_weight)} g · {t("Fine")} {grams(ql.fine_weight)} g</div>}
                      </div>
                      <label className="flex flex-col text-xs text-muted">
                        {t("Touch %")}
                        <Input type="number" inputMode="decimal" min="0" max="200" step="0.01" value={l.touch} onChange={(e) => setLine(i, "touch", e.target.value)}
                          placeholder={ql ? String(ql.touch_percent) : ""} className="h-9 w-20 text-right" aria-label={t("Touch for {code}", { code: l.code })} />
                      </label>
                      <label className="flex flex-col text-xs text-muted">
                        {t("Charges ₹")}
                        <Input type="number" inputMode="decimal" min="0" step="0.01" value={l.charges} onChange={(e) => setLine(i, "charges", e.target.value)}
                          placeholder="0" className="h-9 w-24 text-right" aria-label={t("Charges for {code}", { code: l.code })} />
                      </label>
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
          <Card className="flex flex-col gap-3 p-5">
            <h2 className="text-lg font-semibold">{t("Check the bill")}</h2>
            <dl className="grid grid-cols-[120px_1fr] gap-y-1 text-sm">
              <dt className="text-muted">{t("Shop")}</dt><dd className="font-medium">{shop?.name}</dd>
              <dt className="text-muted">{t("Date")}</dt><dd>{billDate}</dd>
              <dt className="text-muted">{t("Gold rate")}</dt><dd>{quote ? `${inr(quote.gold_rate)} / g` : "—"}</dd>
              <dt className="text-muted">{t("Lines")}</dt><dd>{lines.map((l) => l.code).join(", ")}</dd>
            </dl>
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
              <dt className="text-muted">{t("Metal value")}</dt><dd className="text-right">{tot ? inr(tot.metal_amount) : "—"}</dd>
              <dt className="text-muted">{t("Charges")}</dt><dd className="text-right">{tot ? inr(tot.total_charges) : "—"}</dd>
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
            <Button onClick={save} disabled={!canSave} className="mt-4 h-12 w-full text-base">
              {saving ? t("Saving…") : !rateOk ? t("Set the gold rate") : t("Save bill")}
            </Button>
            <p className="mt-2 text-xs text-muted">{t("Saving marks every piece and set on this bill as sold.")}</p>
          </Card>
        </div>
      )}

      {step === 0 && shopId && (
        <Button className="h-11 self-end text-base" onClick={() => setStep(1)}>{t("Next: scan items")} <ChevronRight size={18} aria-hidden /></Button>
      )}
    </div>
  );
}
