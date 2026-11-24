"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, Notice } from "@/_shared/components/ui";
import { useT } from "@/_shared/i18n/LanguageProvider";
import { billingService, inr } from "./billingService";

// Bills saved as drafts, to finish later. Nothing on them is sold yet.
export default function DraftsTab() {
  const { t } = useT();
  const [list, setList] = useState(null);
  const [error, setError] = useState(null);
  const load = () => billingService.drafts().then(setList).catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);
  const remove = async (d) => {
    if (!window.confirm(t("Delete this draft?"))) return;
    await billingService.deleteDraft(d.id).catch((e) => setError(e.message));
    load();
  };
  if (error) return <Notice tone="error">{error}</Notice>;
  if (!list) return <p className="text-sm text-muted">{t("Loading…")}</p>;
  if (!list.length) return <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">{t("No drafts. On a new bill, press Save as draft to finish it later.")}</p>;
  return (
    <Card className="divide-y divide-line">
      {list.map((d) => (
        <div key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="font-medium">{d.shop_name || t("No shop yet")}</div>
            <div className="text-xs text-muted">
              {t("{n} lines", { n: d.line_count })} · {new Date(d.updated_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              {d.created_by_name ? ` · ${d.created_by_name}` : ""}
            </div>
          </div>
          {d.grand_total != null && <div className="font-semibold tabular-nums">{inr(d.grand_total)}</div>}
          <Link href={`/billing/new?draft=${d.id}`} className="inline-flex h-9 items-center rounded-lg bg-accent px-3 text-sm font-medium text-white">{t("Open")}</Link>
          <button onClick={() => remove(d)} className="text-sm text-muted hover:text-red-700">{t("Delete")}</button>
        </div>
      ))}
    </Card>
  );
}
