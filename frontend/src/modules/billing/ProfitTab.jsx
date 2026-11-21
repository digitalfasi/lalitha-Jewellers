"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, Field, Input, Notice } from "@/_shared/components/ui";
import { useT } from "@/_shared/i18n/LanguageProvider";
import { billingService, fmtDate, inr } from "./billingService";

const g3 = (n) => `${Number(n).toFixed(3)} g`;
const iso = (d) => d.toISOString().slice(0, 10);

// Owner / manager: gold margin per bill = fine sold (sale touch) - fine it cost (karigar's touch).
export default function ProfitTab() {
  const { t } = useT();
  const [from, setFrom] = useState(iso(new Date(Date.now() - 30 * 864e5)));
  const [to, setTo] = useState(iso(new Date()));
  const [r, setR] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    billingService.profit({ date_from: from, date_to: to }).then((x) => (setR(x), setError(null))).catch((e) => setError(e.message));
  }, [from, to]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label={t("From")}><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label={t("To")}><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {r && (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            {[["Gold sold (fine)", g3(r.sold_fine)], ["Gold it cost", g3(r.cost_fine)],
              ["Gold margin", `${g3(r.margin_fine)} · ${inr(r.margin_value)}`], ["Charges collected", inr(r.charges)]].map(([k, v]) => (
              <Card key={k} className="p-4"><div className="text-xs uppercase tracking-wide text-muted">{t(k)}</div>
                <div className="mt-1 text-lg font-bold tabular-nums">{v}</div></Card>
            ))}
          </div>
          {r.pieces_without_cost > 0 && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {t("{n} sold pieces have no cost touch, so they count at no margin. Add the karigar's touch on each piece in Stock.", { n: r.pieces_without_cost })}
            </p>
          )}
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm tabular-nums">
              <thead className="bg-canvas text-left text-xs uppercase tracking-wide text-muted">
                <tr><th className="px-4 py-2.5">{t("Bill")}</th><th className="px-4 py-2.5">{t("Shop")}</th>
                  <th className="px-4 py-2.5 text-right">{t("Sold")}</th><th className="px-4 py-2.5 text-right">{t("Cost")}</th>
                  <th className="px-4 py-2.5 text-right">{t("Margin")}</th><th className="px-4 py-2.5 text-right">{t("Charges")}</th></tr>
              </thead>
              <tbody>
                {r.rows.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted">{t("No bills in these dates.")}</td></tr>}
                {r.rows.map((b) => (
                  <tr key={b.bill_id} className="border-t border-line">
                    <td className="px-4 py-2"><Link href={`/billing/${b.bill_id}`} className="font-mono text-accent hover:underline">{b.bill_number}</Link>
                      <div className="text-xs text-muted">{fmtDate(b.bill_date)}</div></td>
                    <td className="px-4 py-2">{b.shop_name}{b.pieces_without_cost > 0 && <div className="text-xs text-amber-700">{t("{n} without cost", { n: b.pieces_without_cost })}</div>}</td>
                    <td className="px-4 py-2 text-right">{g3(b.sold_fine)}</td>
                    <td className="px-4 py-2 text-right">{g3(b.cost_fine)}</td>
                    <td className="px-4 py-2 text-right font-semibold">{g3(b.margin_fine)}<div className="text-xs font-normal text-muted">{inr(b.margin_value)}</div></td>
                    <td className="px-4 py-2 text-right">{inr(b.charges)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}
