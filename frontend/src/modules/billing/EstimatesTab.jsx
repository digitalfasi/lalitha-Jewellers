"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, Notice } from "@/_shared/components/ui";
import { useT } from "@/_shared/i18n/LanguageProvider";
import { billingService, fmtDate, inr } from "./billingService";

// Saved quotes. An open one becomes a bill with one tap; nothing was reserved meanwhile.
export default function EstimatesTab() {
  const { t } = useT();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    billingService.listEstimates({ limit: 100 }).then(setRows).catch((e) => setError(e.message));
  }, []);
  if (error) return <Notice tone="error">{error}</Notice>;
  return (
    <Card className="overflow-x-auto">
      <table className="w-full min-w-[620px] text-sm">
        <thead className="bg-canvas text-left text-xs uppercase tracking-wide text-muted">
          <tr>
            <th className="px-4 py-2.5">{t("Estimate")}</th>
            <th className="px-4 py-2.5">{t("Shop")}</th>
            <th className="px-4 py-2.5 text-right">{t("Total")}</th>
            <th className="px-4 py-2.5">{t("Valid until")}</th>
            <th className="px-4 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {rows === null && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted">{t("Loading…")}</td></tr>}
          {rows?.length === 0 && (
            <tr><td colSpan={5} className="px-4 py-8 text-center text-muted">{t("No estimates yet. Save one from Calculator → Quick quote.")}</td></tr>
          )}
          {rows?.map((e) => (
            <tr key={e.id} className="border-t border-line">
              <td className="px-4 py-2.5"><span className="font-mono font-semibold">{e.estimate_number}</span>
                <div className="text-xs text-muted">{fmtDate(e.estimate_date)} · {e.lines.length} {t("items")}</div></td>
              <td className="px-4 py-2.5">{e.shop_name || <span className="text-muted">—</span>}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{inr(e.grand_total)}
                <div className="text-xs text-muted">{Number(e.total_fine).toFixed(3)} g {t("fine")}</div></td>
              <td className="px-4 py-2.5">
                {e.status === "BILLED" ? <span className="text-muted">—</span>
                  : <span className={e.is_valid ? "" : "text-amber-700"}>{fmtDate(e.valid_until)}{!e.is_valid && ` · ${t("rate may have changed")}`}</span>}
              </td>
              <td className="px-4 py-2.5 text-right">
                {e.status === "BILLED"
                  ? <Link href={`/billing/${e.bill_id}`} className="text-accent hover:underline">{e.bill_number}</Link>
                  : <Link href={`/billing/new?estimate=${e.id}`} className="inline-flex h-8 items-center rounded-lg bg-accent px-3 text-xs font-medium text-white hover:bg-accent/90">{t("Make bill")}</Link>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
