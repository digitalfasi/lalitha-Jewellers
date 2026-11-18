"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import BillsList from "./BillsList";
import ShopsTab from "./ShopsTab";

const TABS = [
  { id: "bills", label: "Bills" },
  { id: "shops", label: "Shops" },
];

export default function BillingPage() {
  const [tab, setTab] = useState("bills");

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("billing.tab");
      if (saved && TABS.some((t) => t.id === saved)) setTab(saved);
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
        <div className="flex items-center gap-3">
          <nav className="flex rounded-xl border border-line bg-surface p-1" aria-label="Billing sections">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => choose(t.id)}
                aria-current={tab === t.id ? "page" : undefined}
                className={clsx("rounded-lg px-4 py-1.5 text-sm font-medium transition", tab === t.id ? "bg-accent text-white" : "text-muted hover:text-ink")}
              >
                {t.label}
              </button>
            ))}
          </nav>
          <Link href="/billing/new" className="inline-flex h-9 items-center rounded-lg bg-accent px-3.5 text-sm font-medium text-white hover:bg-accent/90">
            + New bill
          </Link>
        </div>
      </div>
      {tab === "bills" ? <BillsList /> : <ShopsTab />}
    </div>
  );
}
