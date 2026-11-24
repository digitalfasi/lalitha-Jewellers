"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { isManager, useAuth } from "@/_shared/auth/AuthProvider";
import { useT } from "@/_shared/i18n/LanguageProvider";
import BillsList from "./BillsList";
import EstimatesTab from "./EstimatesTab";
import ProfitTab from "./ProfitTab";
import { FEATURES } from "@/_shared/features";
import ShopsTab from "./ShopsTab";
import DraftsTab from "./DraftsTab";

const ALL_TABS = [
  { id: "bills", label: "Bills" },
  { id: "drafts", label: "Drafts" },
  { id: "estimates", label: "Estimates" },
  { id: "shops", label: "Shops" },
  FEATURES.profit && { id: "profit", label: "Profit", managers: true },
].filter(Boolean);

export default function BillingPage() {
  const { t } = useT();
  const { user } = useAuth();
  const TABS = ALL_TABS.filter((x) => !x.managers || isManager(user));
  const [tab, setTab] = useState("bills");

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("billing.tab");
      if (saved && ALL_TABS.some((x) => x.id === saved)) setTab(saved);
    } catch {}
  }, []);
  const choose = (id) => {
    setTab(id);
    try {
      sessionStorage.setItem("billing.tab", id);
    } catch {}
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Billing</h1>
          <p className="text-sm text-muted">Bills to retail shops. Saving a bill marks its pieces and combos sold.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <nav className="flex rounded-xl border border-line bg-surface p-1" aria-label="Billing sections">
            {TABS.map((x) => (
              <button
                key={x.id}
                onClick={() => choose(x.id)}
                aria-current={tab === x.id ? "page" : undefined}
                className={clsx("rounded-lg px-3 py-1.5 text-sm font-medium transition", tab === x.id ? "bg-accent text-white" : "text-muted hover:text-ink")}
              >
                {t(x.label)}
              </button>
            ))}
          </nav>
          <Link href="/billing/new" className="inline-flex h-9 items-center rounded-lg bg-accent px-3.5 text-sm font-medium text-white hover:bg-accent/90">
            + New bill
          </Link>
        </div>
      </div>
      {tab === "bills" && <BillsList />}
      {tab === "drafts" && <DraftsTab />}
      {tab === "estimates" && <EstimatesTab />}
      {tab === "shops" && <ShopsTab />}
      {FEATURES.profit && tab === "profit" && isManager(user) && <ProfitTab />}
    </div>
  );
}
