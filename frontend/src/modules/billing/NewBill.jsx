"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/_shared/api/client";
import CameraScan from "@/_shared/components/CameraScan";
import { Button, Card, Field, Input, Notice, Select } from "@/_shared/components/ui";
import { grams } from "@/modules/inventory/inventoryService";
import { tagService } from "@/modules/tags/tagService";
import { billingService, inr, num2, pct, today } from "./billingService";

// Build a bill: scan pieces or combos, set touch and charges per line, and the
// server prices it live (quote). Saving marks everything on it sold.
export default function NewBill() {
  const router = useRouter();
  const [shops, setShops] = useState([]);
  const [shopId, setShopId] = useState("");
  const [billDate, setBillDate] = useState(today());
  const [goldRate, setGoldRate] = useState(""); // blank = the day's rate from Settings
  const [dayRate, setDayRate] = useState(undefined); // undefined = loading, null = not set
  const [gst, setGst] = useState("3");
  const [remarks, setRemarks] = useState("");
  // [{code, kind: "PIECE"|"COMBO", comboCode, pieceCodes, charges, touch}] - combo membership is
  // kept from the scan, so Split / Join / Remove work even while pricing shows an error.
  const [lines, setLines] = useState([]);
  const [scan, setScan] = useState("");
  const [quote, setQuote] = useState(null);
  const [quoteError, setQuoteError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [saving, setSaving] = useState(false);
  const scanRef = useRef(null);

  useEffect(() => {
    billingService.listShops().then(setShops).catch((e) => setNotice({ tone: "error", text: e.message }));
  }, []);

  // The rate set for the bill's date (Settings → Gold rate).
  useEffect(() => {
    if (!billDate) return setDayRate(null);
    setDayRate(undefined);
    api(`/rates/today?on=${billDate}`).then((r) => setDayRate(r.today?.rate ?? null)).catch(() => setDayRate(null));
  }, [billDate]);

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

  // Live pricing. A stale answer is dropped if the lines changed meanwhile.
  useEffect(() => {
    if (!lines.length || !rateOk) {
      setQuote(null);
      setQuoteError(null);
      return;
    }
    let live = true;
    const t = setTimeout(() => {
      billingService
        .quote(draft)
        .then((q) => live && (setQuote(q), setQuoteError(null)))
        .catch((e) => live && (setQuote(null), setQuoteError(e.message)));
    }, 300);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [draft]); // eslint-disable-line react-hooks/exhaustive-deps

  const onBill = (code) => lines.some((l) => l.code === code || l.comboCode === code || l.pieceCodes?.includes(code));
  const comboLine = (combo) => ({ code: combo.code, kind: "COMBO", comboCode: combo.code, pieceCodes: combo.piece_codes, charges: "", touch: "" });

  const addCode = (e) => {
    e.preventDefault();
    const code = scan.trim().toUpperCase();
    setScan("");
    if (code) addItem(code);
  };

  const addItem = async (code) => {
    setNotice(null);
    if (onBill(code)) return setNotice({ tone: "error", text: `${code} is already on this bill.` });
    try {
      const item = await tagService.resolve(code);
      if (!item.printable) {
        return setNotice({ tone: "error", text: `${code} is ${item.status.replace("_", " ").toLowerCase()}, so it cannot be billed.` });
      }
      // A piece in a combo goes on as its combo (it can be split afterwards).
      if (item.kind === "PIECE" && item.combo_code) {
        if (onBill(item.combo_code)) return setNotice({ tone: "error", text: `${code} is in ${item.combo_code}, which is already on this bill.` });
        const combo = await tagService.resolve(item.combo_code);
        setLines((ls) => [...ls, comboLine(combo)]);
        return setNotice({ tone: "ok", text: `${code} is part of ${item.combo_code}, so the combo was added. Use “Split” to bill it piece by piece.` });
      }
      setLines((ls) => [...ls, item.kind === "COMBO" ? comboLine(item) : { code: item.code, kind: "PIECE", charges: "", touch: "" }]);
    } catch (err) {
      setNotice({ tone: "error", text: err.message });
    } finally {
      scanRef.current?.focus();
    }
  };

  const setLine = (i, k, v) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  const removeLine = (i) => {
    const l = lines[i];
    // Removing one piece of a split combo removes the whole combo: half a combo can't be sold.
    if (l.kind === "PIECE" && l.comboCode) return setLines((ls) => ls.filter((x) => x.comboCode !== l.comboCode));
    setLines((ls) => ls.filter((_, j) => j !== i));
  };
  const split = (i) => {
    const l = lines[i];
    const parts = l.pieceCodes.map((c) => ({ code: c, kind: "PIECE", comboCode: l.comboCode, pieceCodes: l.pieceCodes, charges: "", touch: l.touch }));
    setLines((ls) => [...ls.slice(0, i), ...parts, ...ls.slice(i + 1)]);
  };
  const join = (comboCode) => {
    setLines((ls) => {
      const first = ls.findIndex((x) => x.comboCode === comboCode);
      const out = ls.filter((x) => x.comboCode !== comboCode);
      out.splice(first, 0, { code: comboCode, kind: "COMBO", comboCode, pieceCodes: ls[first].pieceCodes, charges: "", touch: "" });
      return out;
    });
  };

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

  const t = quote?.totals;
  const canSave = shopId && rateOk && lines.length && quote && !quoteError && !saving;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/billing" className="text-sm text-muted hover:text-ink">← Billing</Link>
          <h1 className="text-2xl font-bold">New bill</h1>
        </div>
      </div>

      <Card className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Shop" hint={shops.length === 0 ? "Add shops under Billing → Shops." : undefined}>
          <Select value={shopId} onChange={(e) => setShopId(e.target.value)} required>
            <option value="">Choose…</option>
            {shops.map((s) => (
              <option key={s.id} value={s.id}>{s.name}{s.city ? ` · ${s.city}` : ""}</option>
            ))}
          </Select>
        </Field>
        <Field label="Bill date">
          <Input type="date" value={billDate} onChange={(e) => setBillDate(e.target.value)} />
        </Field>
        <Field
          label="Gold rate (₹ / g fine)"
          error={goldRate !== "" && !rateOk ? "Enter a rate above 0" : goldRate === "" && dayRate === null ? "No rate set for this date. Set it in Settings, or type one here." : undefined}
          hint={goldRate === "" && dayRate ? "The day's rate. Type to use a different one on this bill." : goldRate !== "" && dayRate ? `Day's rate is ₹${dayRate.toLocaleString("en-IN")}` : undefined}
        >
          <Input type="number" min="0" step="0.01" value={goldRate} onChange={(e) => setGoldRate(e.target.value)}
            placeholder={dayRate ? String(dayRate) : "e.g. 7200"} className="tabular-nums" />
        </Field>
        <Field label="GST %">
          <Input type="number" min="0" max="28" step="0.01" value={gst} onChange={(e) => setGst(e.target.value)} className="tabular-nums" />
        </Field>
      </Card>

      <Card className="p-5">
        <form onSubmit={addCode} className="flex flex-wrap items-end gap-2">
          <Field label="Add piece or combo" className="w-72">
            <Input ref={scanRef} value={scan} onChange={(e) => setScan(e.target.value)} placeholder="Scan or type CH0001 / CB0001" className="font-mono" autoFocus />
          </Field>
          <Button type="submit" variant="ghost" disabled={!scan.trim()}>Add</Button>
          <CameraScan onCode={addItem} continuous />
        </form>
        {notice && (
          <div className="mt-3">
            <Notice tone={notice.tone} onClose={() => setNotice(null)}>{notice.text}</Notice>
          </div>
        )}
        {!rateOk && lines.length > 0 && <p className="mt-3 text-sm text-amber-700">Set the day’s gold rate (or type one) to price the bill.</p>}
        {quoteError && <div className="mt-3"><Notice tone="error">{quoteError}</Notice></div>}

        <div className="mt-4 overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[860px] text-sm tabular-nums">
            <thead className="bg-canvas text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">Code</th>
                <th className="px-3 py-2">Description</th>
                <th className="px-3 py-2 text-right">Gross</th>
                <th className="px-3 py-2 text-right">Net</th>
                <th className="px-3 py-2 text-right">Touch %</th>
                <th className="px-3 py-2 text-right">Fine</th>
                <th className="px-3 py-2 text-right">Charges ₹</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-muted">Scan pieces or combos to start the bill.</td>
                </tr>
              )}
              {lines.map((l, i) => {
                const ql = quote?.lines[i];
                return (
                  <tr key={`${l.code}-${i}`} className="border-t border-line align-top">
                    <td className="px-3 py-2 text-muted">{i + 1}</td>
                    <td className="px-3 py-2 font-mono font-semibold">
                      {l.code}
                      {l.kind === "PIECE" && l.comboCode && <div className="text-xs font-normal text-muted">of {l.comboCode}</div>}
                    </td>
                    <td className="px-3 py-2">
                      {ql ? ql.description : l.kind === "COMBO" ? <span className="font-mono text-xs text-muted">{l.pieceCodes.join(" + ")}</span> : <span className="text-muted">…</span>}
                      {ql && <div className="text-xs text-muted">{ql.purity}</div>}
                    </td>
                    <td className="px-3 py-2 text-right">{ql ? grams(ql.gross_weight) : ""}</td>
                    <td className="px-3 py-2 text-right">{ql ? grams(ql.net_weight) : ""}</td>
                    <td className="px-3 py-2 text-right">
                      <Input
                        type="number" min="0" max="200" step="0.01" value={l.touch}
                        onChange={(e) => setLine(i, "touch", e.target.value)}
                        placeholder={ql ? String(ql.touch_percent) : "touch"}
                        title={l.kind === "COMBO" ? "Applies to every piece in the combo. Leave blank to use each piece's own touch." : undefined}
                        className="ml-auto h-8 w-20 px-2 text-right"
                        aria-label={`Touch for ${l.code}`}
                      />
                    </td>
                    <td className="px-3 py-2 text-right font-medium">{ql ? grams(ql.fine_weight) : ""}</td>
                    <td className="px-3 py-2 text-right">
                      <Input
                        type="number" min="0" step="0.01" value={l.charges}
                        onChange={(e) => setLine(i, "charges", e.target.value)}
                        placeholder="0"
                        className="ml-auto h-8 w-24 px-2 text-right"
                        aria-label={`Charges for ${l.code}`}
                      />
                    </td>
                    <td className="px-3 py-2 text-right font-medium">{ql ? num2(ql.amount) : ""}</td>
                    <td className="space-x-2 whitespace-nowrap px-3 py-2 text-right">
                      {l.kind === "COMBO" && <Button variant="link" onClick={() => split(i)}>Split</Button>}
                      {l.kind === "PIECE" && l.comboCode && lines.findIndex((x) => x.comboCode === l.comboCode) === i && (
                        <Button variant="link" onClick={() => join(l.comboCode)}>Join</Button>
                      )}
                      <button onClick={() => removeLine(i)} className="text-xs text-muted hover:text-red-700" aria-label={`Remove ${l.code}`}>✕</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid items-start gap-5 lg:grid-cols-[1fr_380px]">
        <Card className="p-5">
          <Field label="Remarks" hint="Optional, printed on the bill">
            <Input value={remarks} onChange={(e) => setRemarks(e.target.value)} maxLength={1000} />
          </Field>
          <p className="mt-4 text-xs text-muted">
            Fine = net × touch %. Metal = fine × gold rate. Line amount = metal + charges. GST on the subtotal; the total is rounded to the rupee.
          </p>
        </Card>
        <Card className="p-5">
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-sm tabular-nums">
            <dt className="text-muted">Pieces</dt><dd className="text-right">{t ? t.total_pieces : "—"}</dd>
            <dt className="text-muted">Net weight</dt><dd className="text-right">{t ? `${grams(t.total_net)} g` : "—"}</dd>
            <dt className="text-muted">Fine weight</dt><dd className="text-right font-medium">{t ? `${grams(t.total_fine)} g` : "—"}</dd>
            <dt className="text-muted">Metal value</dt><dd className="text-right">{t ? inr(t.metal_amount) : "—"}</dd>
            <dt className="text-muted">Charges</dt><dd className="text-right">{t ? inr(t.total_charges) : "—"}</dd>
            <dt className="text-muted">Subtotal</dt><dd className="text-right">{t ? inr(t.subtotal) : "—"}</dd>
            {t?.tax_type === "INTER" ? (
              <><dt className="text-muted">IGST {pct(quote.gst_percent)}</dt><dd className="text-right">{inr(t.igst_amount)}</dd></>
            ) : t ? (
              <>
                <dt className="text-muted">CGST {pct(quote.gst_percent / 2)}</dt><dd className="text-right">{inr(t.cgst_amount)}</dd>
                <dt className="text-muted">SGST {pct(quote.gst_percent / 2)}</dt><dd className="text-right">{inr(t.sgst_amount)}</dd>
              </>
            ) : (
              <><dt className="text-muted">GST</dt><dd className="text-right">—</dd></>
            )}
            <dt className="text-muted">Round off</dt><dd className="text-right">{t ? num2(t.round_off) : "—"}</dd>
            <dt className="mt-2 border-t border-line pt-2 font-semibold">Total</dt>
            <dd className="mt-2 border-t border-line pt-2 text-right text-lg font-bold">{t ? inr(t.grand_total) : "—"}</dd>
          </dl>
          <Button onClick={save} disabled={!canSave} className="mt-4 w-full">
            {saving ? "Saving…" : !shopId ? "Choose a shop" : !lines.length ? "Add items" : !rateOk ? "Set the gold rate" : "Save bill"}
          </Button>
          <p className="mt-2 text-xs text-muted">
            {t ? (t.tax_type === "INTER" ? "Shop is in another state: IGST. " : "Same state (or state unknown): CGST + SGST. ") : ""}
            Saving marks every piece and combo on this bill as sold.
          </p>
        </Card>
      </div>
    </div>
  );
}
