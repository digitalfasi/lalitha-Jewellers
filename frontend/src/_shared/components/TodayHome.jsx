"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen, Images, Link2, PackagePlus, Receipt, ScanLine, Settings, Tag } from "lucide-react";
import { api } from "@/_shared/api/client";
import { isManager, useAuth } from "@/_shared/auth/AuthProvider";
import { localToday } from "@/_shared/dates";
import { useT } from "@/_shared/i18n/LanguageProvider";
import Tip from "./Tip";

const inr = (n) => `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

// Home: today's numbers and the everyday jobs as big picture buttons.
// Staff see only the everyday jobs; managers and the owner also get Settings.
export default function TodayHome() {
  const { user } = useAuth();
  const { t, lang } = useT();
  const [s, setS] = useState(null);

  useEffect(() => {
    const day = localToday();
    Promise.all([
      api(`/rates/today?on=${day}`).catch(() => null),
      api("/inventory/pieces?status=IN_STOCK&limit=1").catch(() => null),
      api("/combos?status=ACTIVE&limit=1").catch(() => null),
      api("/tags/pending").catch(() => []),
      api(`/billing/bills?status=FINAL&date_from=${day}&date_to=${day}&limit=200`).catch(() => null),
    ]).then(([rate, pieces, combos, pending, bills]) =>
      setS({
        rate: rate?.today?.rate,
        pieces: pieces?.total,
        combos: combos?.total,
        pending: pending.length,
        bills: bills?.total ?? 0,
        sales: (bills?.items || []).reduce((tot, b) => tot + b.grand_total, 0),
      }),
    );
  }, []);

  const jobs = [
    { href: "/inventory", icon: PackagePlus, label: "Add stock", text: "One piece or a whole set. Tags print as you save." },
    { href: "/billing/new", icon: Receipt, label: "New bill", text: "Scan pieces or sets for a shop." },
    { href: "/inventory?pick=1", icon: Link2, label: "Make a set", text: "Tick pieces in stock and join them." },
    { href: "/tags", icon: Tag, label: "Print tags", text: s?.pending ? t("{n} waiting", { n: s.pending }) : t("All tags printed"), warn: s?.pending > 0 },
    { href: "/audit", icon: ScanLine, label: "Stock count", text: "Scan the shelves, see what's missing." },
    { href: "/catalogue", icon: Images, label: "Catalogue", text: "Show available sets to a shop." },
  ];
  if (isManager(user)) jobs.push({ href: "/settings", icon: Settings, label: "Settings", text: "Gold rate, business details, staff." });
  jobs.push({ href: "/help", icon: BookOpen, label: "Help", text: "How to do each job, step by step." });

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">{t("Hello, {name}", { name: user.full_name.split(" ")[0] })}</h1>
        <p className="text-sm text-muted">{new Date().toLocaleDateString(lang === "ta" ? "ta-IN" : "en-IN", { weekday: "long", day: "numeric", month: "long" })}</p>
      </div>

      <Tip id="home">{t("Tip: scan any tag into the box at the top of every page to open that piece, set or bill.")}</Tip>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t("Gold rate today")} value={s ? (s.rate ? `${inr(s.rate)}/g` : t("Not set")) : "…"} warn={s && !s.rate} href="/settings?tab=rate" />
        <Stat label={t("Pieces in stock")} value={s?.pieces ?? "…"} href="/inventory" />
        <Stat label={t("Sets ready")} value={s?.combos ?? "…"} href="/combos" />
        <Stat label={t("Sold today")} value={s ? `${s.bills} · ${inr(s.sales)}` : "…"} href="/billing" />
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {jobs.map(({ href, icon: Icon, label, text, warn }) => (
          <Link key={href} href={href}
            className={`flex min-h-32 flex-col gap-2 rounded-2xl border p-5 transition hover:border-accent hover:shadow-sm ${warn ? "border-amber-300 bg-amber-50" : "border-line bg-surface"}`}>
            <Icon size={32} className={warn ? "text-amber-700" : "text-accent"} aria-hidden />
            <span className="text-lg font-semibold leading-tight">{t(label)}</span>
            <span className={`text-sm ${warn ? "text-amber-800" : "text-muted"}`}>{warn ? text : t(text)}</span>
          </Link>
        ))}
      </section>
    </div>
  );
}

function Stat({ label, value, warn, href }) {
  return (
    <Link href={href} className={`rounded-2xl border p-4 hover:border-accent ${warn ? "border-red-200 bg-red-50" : "border-line bg-surface"}`}>
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className={`mt-1 break-words text-xl font-bold tabular-nums ${warn ? "text-red-700" : ""}`}>{value}</div>
    </Link>
  );
}
