"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/_shared/api/client";
import { useAuth } from "@/_shared/auth/AuthProvider";
import { localToday } from "@/_shared/dates";

const inr = (n) => `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

// Home: what matters today, and the four things staff do most, as big buttons.
export default function TodayHome() {
  const { user } = useAuth();
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
        sales: (bills?.items || []).reduce((t, b) => t + b.grand_total, 0),
      }),
    );
  }, []);

  const actions = [
    { href: "/inventory", label: "Add stock", text: "One piece or a whole set, tags print as you save" },
    { href: "/billing/new", label: "New bill", text: "Scan pieces or sets for a shop" },
    { href: "/tags", label: "Print tags", text: s?.pending ? `${s.pending} waiting` : "All tags printed", warn: s?.pending > 0 },
    { href: "/audit", label: "Stock count", text: "Scan the shelves, see what's missing" },
  ];

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Hello, {user.full_name.split(" ")[0]}</h1>
        <p className="text-sm text-muted">{new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}</p>
      </div>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Gold rate today" value={s ? (s.rate ? `${inr(s.rate)}/g` : "Not set") : "…"} warn={s && !s.rate} href="/settings?tab=rate" />
        <Stat label="Pieces in stock" value={s?.pieces ?? "…"} href="/inventory" />
        <Stat label="Sets ready" value={s?.combos ?? "…"} href="/combos" />
        <Stat label="Sold today" value={s ? `${s.bills} bill${s.bills === 1 ? "" : "s"} · ${inr(s.sales)}` : "…"} href="/billing" />
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        {actions.map((a) => (
          <Link key={a.href} href={a.href}
            className={`flex flex-col justify-center rounded-2xl border p-5 transition hover:border-accent ${a.warn ? "border-amber-300 bg-amber-50" : "border-line bg-surface"}`}>
            <span className="text-lg font-semibold">{a.label} →</span>
            <span className={`text-sm ${a.warn ? "text-amber-800" : "text-muted"}`}>{a.text}</span>
          </Link>
        ))}
      </section>

      <p className="text-sm text-muted">
        Tip: scan any tag into the box at the top of every page to open that piece, set or bill.
        {" "}Also: <Link href="/combos" className="text-accent hover:underline">Combos</Link> ·{" "}
        <Link href="/catalogue" className="text-accent hover:underline">Catalogue</Link> ·{" "}
        <Link href="/settings" className="text-accent hover:underline">Settings</Link>
      </p>
    </div>
  );
}

function Stat({ label, value, warn, href }) {
  return (
    <Link href={href} className={`rounded-2xl border p-4 hover:border-accent ${warn ? "border-red-200 bg-red-50" : "border-line bg-surface"}`}>
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className={`mt-1 text-xl font-bold tabular-nums ${warn ? "text-red-700" : ""}`}>{value}</div>
    </Link>
  );
}
