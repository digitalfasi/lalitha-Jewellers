"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { mediaUrl } from "@/_shared/api/client";
import { isManager, useAuth } from "@/_shared/auth/AuthProvider";
import { Button, Card, Field, Input, Notice } from "@/_shared/components/ui";
import { grams } from "@/modules/inventory/inventoryService";
import { settingsService } from "@/modules/settings/settingsService";
import { billingService, fmtDate, inr, num2, pct } from "./billingService";

// WhatsApp wants the number with country code and digits only.
const waNumber = (phone) => {
  const d = (phone || "").replace(/\D/g, "");
  return d.length === 10 ? `91${d}` : d;
};

// One bill as a tax invoice, laid out to print on A4. Mirrors the server PDF
// (backend billing/pdf.py): change both if what a bill shows changes.
export default function BillView({ id }) {
  const { user } = useAuth();
  const [bill, setBill] = useState(null);
  const [biz, setBiz] = useState(null);
  const [error, setError] = useState(null);
  const [msg, setMsg] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [emailing, setEmailing] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    billingService.getBill(id).then(setBill).catch((e) => setError(e.message));
    settingsService.business().then(setBiz).catch(() => setBiz(null));
  }, [id]);

  const act = async (fn, ok) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      if (ok) setMsg(ok);
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const cancel = (e) => {
    e.preventDefault();
    act(async () => {
      setBill(await billingService.cancelBill(id, reason));
      setCancelling(false);
    });
  };

  const pdfFile = async () => {
    const blob = await billingService.billPdf(id);
    return new File([blob], `${bill.bill_number}.pdf`, { type: "application/pdf" });
  };

  const download = () =>
    act(async () => {
      const url = URL.createObjectURL(await pdfFile());
      const a = document.createElement("a");
      a.href = url;
      a.download = `${bill.bill_number}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    });

  const canShareFiles = typeof navigator !== "undefined" && !!navigator.canShare;
  const sharePdf = () =>
    act(async () => {
      const file = await pdfFile();
      if (!navigator.canShare({ files: [file] })) throw new Error("This browser can't share files. Use Download PDF.");
      try {
        await navigator.share({ files: [file], title: bill.bill_number, text: summary() });
      } catch (e) {
        if (e.name !== "AbortError") throw e;
      }
    });

  const summary = () =>
    `Bill ${bill.bill_number} dated ${fmtDate(bill.bill_date)} from ${bill.seller_name || "us"}: ` +
    `${bill.totals.total_pieces} pieces, fine ${grams(bill.totals.total_fine)} g, total ${inr(bill.totals.grand_total)}.`;

  const whatsapp = () => {
    const text = encodeURIComponent(`${summary()}\nThe PDF bill follows.`);
    const n = waNumber(bill.shop_phone);
    window.open(n ? `https://wa.me/${n}?text=${text}` : `https://wa.me/?text=${text}`, "_blank", "noopener");
  };

  const sendEmail = (e) => {
    e.preventDefault();
    act(async () => {
      await billingService.emailBill(id, emailTo);
      setEmailing(false);
    }, `Bill emailed to ${emailTo}.`);
  };

  if (error && !bill) return <Notice tone="error">{error}</Notice>;
  if (!bill) return <p className="text-sm text-muted">Loading…</p>;
  const t = bill.totals;
  const cancelled = bill.status === "CANCELLED";
  const half = bill.gst_percent / 2;

  return (
    <div className="flex flex-col gap-5">
      <style>{"@page { size: A4; margin: 12mm; }"}</style>
      <div className="no-print flex flex-wrap items-end justify-between gap-3">
        <Link href="/billing" className="text-sm text-muted hover:text-ink">← Billing</Link>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => window.print()}>Print</Button>
          <Button variant="ghost" onClick={download} disabled={busy}>Download PDF</Button>
          {canShareFiles && <Button variant="ghost" onClick={sharePdf} disabled={busy}>Share PDF…</Button>}
          <Button variant="ghost" onClick={whatsapp} title={bill.shop_phone ? `Opens WhatsApp to ${bill.shop_phone}` : "No phone saved for this shop"}>
            WhatsApp
          </Button>
          <Button variant="ghost" onClick={() => setEmailing((v) => !v)} disabled={biz && !biz.email_enabled}
            title={biz && !biz.email_enabled ? "Email isn't set up on the server" : undefined}>
            Email…
          </Button>
          {!cancelled && !cancelling && isManager(user) && (
            <Button variant="ghost" className="text-red-700" onClick={() => setCancelling(true)}>Cancel bill…</Button>
          )}
        </div>
      </div>

      {emailing && (
        <Card className="no-print p-4">
          <form onSubmit={sendEmail} className="flex flex-wrap items-end gap-3">
            <Field label="Send the PDF to" className="min-w-64 flex-1">
              <Input type="email" value={emailTo} onChange={(e) => setEmailTo(e.target.value)} required autoFocus placeholder="shop@example.com" />
            </Field>
            <Button type="submit" disabled={busy}>{busy ? "Sending…" : "Send"}</Button>
            <Button type="button" variant="ghost" onClick={() => setEmailing(false)}>Close</Button>
          </form>
        </Card>
      )}

      {cancelling && (
        <Card className="no-print border-red-200 bg-red-50 p-4">
          <form onSubmit={cancel} className="flex flex-wrap items-end gap-3">
            <Field label="Why is this bill being cancelled?" className="min-w-64 flex-1">
              <Input value={reason} onChange={(e) => setReason(e.target.value)} required minLength={3} maxLength={500} autoFocus />
            </Field>
            <Button type="submit" disabled={busy || reason.trim().length < 3}>{busy ? "Cancelling…" : "Cancel bill"}</Button>
            <Button type="button" variant="ghost" onClick={() => setCancelling(false)}>Keep it</Button>
          </form>
          <p className="mt-2 text-xs text-red-800">All {t.total_pieces} pieces go back in stock and combos become active again. The bill number is kept as cancelled.</p>
        </Card>
      )}
      {msg && <Notice onClose={() => setMsg(null)}>{msg}</Notice>}
      {error && <Notice tone="error" onClose={() => setError(null)}>{error}</Notice>}

      <Card className="bill-sheet relative p-6 print:border-0 print:p-0">
        {cancelled && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            <b>CANCELLED</b>
            {bill.cancel_reason ? ` — ${bill.cancel_reason}` : ""}
            {bill.cancelled_by_name ? ` (by ${bill.cancelled_by_name})` : ""}
          </div>
        )}

        {/* Seller */}
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-4">
          <div className="flex items-start gap-4">
            {biz?.logo_url && <img src={mediaUrl(biz.logo_url)} alt="" className="h-16 max-w-40 object-contain" />}
            <div>
              <div className="text-xl font-bold text-accent">{bill.seller_name || "Business name not set"}</div>
              {bill.seller_address && <div className="max-w-md text-xs text-muted">{bill.seller_address}</div>}
              <div className="text-xs text-muted">
                {[bill.seller_gstin && `GSTIN ${bill.seller_gstin}`, bill.seller_state_name && `${bill.seller_state_name} (${bill.seller_state_code})`]
                  .filter(Boolean).join(" · ")}
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm font-bold tracking-wide">TAX INVOICE</div>
            <div className="font-mono text-xl font-bold">{bill.bill_number}</div>
            <div className="text-sm">{fmtDate(bill.bill_date)}</div>
          </div>
        </div>

        {/* Buyer */}
        <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted">Bill to</div>
            <div className="text-lg font-semibold">{bill.shop_name}</div>
            {bill.shop_address && <div className="text-sm">{bill.shop_address}</div>}
            {bill.shop_phone && <div className="text-sm">Phone {bill.shop_phone}</div>}
            {bill.shop_gstin && <div className="font-mono text-xs">GSTIN {bill.shop_gstin}</div>}
          </div>
          <div className="text-right text-sm">
            <div className="text-xs uppercase tracking-wide text-muted">Place of supply</div>
            <div>{bill.shop_state_name ? `${bill.shop_state_name} (${bill.shop_state_code})` : bill.seller_state_name || "—"}</div>
            <div className="mt-1 text-xs text-muted tabular-nums">Gold rate {inr(bill.gold_rate)} / g fine</div>
          </div>
        </div>

        <table className="mt-4 w-full text-sm tabular-nums">
          <thead className="border-y border-line text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="py-2 pr-2">#</th>
              <th className="py-2 pr-2">Item</th>
              <th className="py-2 pr-2">HSN</th>
              <th className="py-2 pr-2 text-right">Gross</th>
              <th className="py-2 pr-2 text-right">Stone</th>
              <th className="py-2 pr-2 text-right">Net</th>
              <th className="py-2 pr-2 text-right">Touch</th>
              <th className="py-2 pr-2 text-right">Fine</th>
              <th className="py-2 pr-2 text-right">Charges</th>
              <th className="py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {bill.lines.map((l) => (
              <tr key={l.line_no} className="border-b border-line align-top last:border-0">
                <td className="py-2 pr-2 text-muted">{l.line_no}</td>
                <td className="py-2 pr-2">
                  <span className="font-mono font-semibold">{l.code}</span> {l.description}
                  <div className="text-xs text-muted">
                    {l.purity}
                    {l.kind === "PIECE" && l.pieces[0]?.huid && ` · HUID ${l.pieces[0].huid}`}
                  </div>
                  {l.kind === "COMBO" && (
                    <ul className="mt-1 text-xs text-muted">
                      {l.pieces.map((p) => (
                        <li key={p.piece_id}>
                          {p.item_code} {p.name} · net {grams(p.net_weight)} @ {pct(p.touch_percent)} = {grams(p.fine_weight)}
                          {p.huid && ` · HUID ${p.huid}`}
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
                <td className="py-2 pr-2 font-mono text-xs">{l.hsn_code || "—"}</td>
                <td className="py-2 pr-2 text-right">{grams(l.gross_weight)}</td>
                <td className="py-2 pr-2 text-right">{grams(l.stone_weight)}</td>
                <td className="py-2 pr-2 text-right">{grams(l.net_weight)}</td>
                <td className="py-2 pr-2 text-right">{pct(l.touch_percent)}</td>
                <td className="py-2 pr-2 text-right font-medium">{grams(l.fine_weight)}</td>
                <td className="py-2 pr-2 text-right">{num2(l.charges)}</td>
                <td className="py-2 text-right font-medium">{num2(l.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-ink text-sm font-medium">
            <tr>
              <td />
              <td className="py-2 pr-2">{t.total_pieces} pieces</td>
              <td />
              <td className="py-2 pr-2 text-right">{grams(t.total_gross)}</td>
              <td className="py-2 pr-2 text-right">{grams(t.total_stone)}</td>
              <td className="py-2 pr-2 text-right">{grams(t.total_net)}</td>
              <td />
              <td className="py-2 pr-2 text-right">{grams(t.total_fine)}</td>
              <td className="py-2 pr-2 text-right">{num2(t.total_charges)}</td>
              <td className="py-2 text-right">{num2(t.subtotal)}</td>
            </tr>
          </tfoot>
        </table>

        <div className="mt-4 flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-md text-sm">
            <p className="font-semibold">{bill.amount_in_words}</p>
            {biz?.bank_name && (
              <div className="mt-3">
                <div className="text-xs uppercase tracking-wide text-muted">Bank details</div>
                <div>{biz.bank_name}{biz.bank_branch ? `, ${biz.bank_branch}` : ""}</div>
                {biz.bank_account && <div>A/c {biz.bank_account}</div>}
                {biz.bank_ifsc && <div>IFSC {biz.bank_ifsc}</div>}
              </div>
            )}
            {bill.remarks && (
              <div className="mt-3">
                <div className="text-xs uppercase tracking-wide text-muted">Remarks</div>
                <p>{bill.remarks}</p>
              </div>
            )}
          </div>
          <dl className="grid min-w-72 grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm tabular-nums">
            <dt className="text-muted">Metal ({grams(t.total_fine)} g × {num2(bill.gold_rate)})</dt><dd className="text-right">{inr(t.metal_amount)}</dd>
            <dt className="text-muted">Charges</dt><dd className="text-right">{inr(t.total_charges)}</dd>
            <dt className="text-muted">Taxable value</dt><dd className="text-right">{inr(t.subtotal)}</dd>
            {t.tax_type === "INTER" ? (
              <><dt className="text-muted">IGST {pct(bill.gst_percent)}</dt><dd className="text-right">{inr(t.igst_amount)}</dd></>
            ) : (
              <>
                <dt className="text-muted">CGST {pct(half)}</dt><dd className="text-right">{inr(t.cgst_amount)}</dd>
                <dt className="text-muted">SGST {pct(half)}</dt><dd className="text-right">{inr(t.sgst_amount)}</dd>
              </>
            )}
            <dt className="text-muted">Round off</dt><dd className="text-right">{num2(t.round_off)}</dd>
            <dt className="mt-1 border-t border-line pt-1.5 font-semibold">Total</dt>
            <dd className={`mt-1 border-t border-line pt-1.5 text-right text-lg font-bold ${cancelled ? "line-through" : ""}`}>{inr(t.grand_total)}</dd>
          </dl>
        </div>

        <div className="mt-10 flex flex-wrap items-end justify-between gap-6 text-xs text-muted">
          <div className="max-w-md">
            {biz?.bill_terms && (<><div className="uppercase tracking-wide">Terms</div><p>{biz.bill_terms}</p></>)}
            {bill.created_by_name && <p className="mt-2">Billed by {bill.created_by_name}</p>}
          </div>
          <div className="text-right">
            <div className="mb-10 text-sm font-semibold text-ink">For {bill.seller_name || ""}</div>
            Authorised signatory
          </div>
        </div>
      </Card>
    </div>
  );
}
