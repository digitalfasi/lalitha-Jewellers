"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/_shared/api/client";
import { localToday } from "@/_shared/dates";

// Today's gold rate in the header. Red when it hasn't been set yet, because
// bills can't use "the day's rate" until someone sets it.
export default function GoldRateBadge() {
  const [info, setInfo] = useState(null);

  useEffect(() => {
    const load = () => api(`/rates/today?on=${localToday()}`).then(setInfo).catch(() => setInfo(null));
    load();
    window.addEventListener("rate:changed", load);
    return () => window.removeEventListener("rate:changed", load);
  }, []);

  if (!info) return null;
  const rate = info.today?.rate;
  return (
    <Link
      href="/settings?tab=rate"
      title={rate ? `Set by ${info.today.set_by_name || "?"}` : "Today's gold rate isn't set yet"}
      className={`rounded-full px-2.5 py-1 text-xs font-medium tabular-nums ${
        rate ? "bg-accent-soft text-accent" : "bg-red-100 text-red-800"
      }`}
    >
      {rate ? `Gold ₹${rate.toLocaleString("en-IN")}/g` : "Set today's rate"}
    </Link>
  );
}
