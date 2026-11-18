"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { beep } from "@/_shared/beep";
import { api } from "@/_shared/api/client";

// The header's "scan anything" box: scan or type any tag (piece CH0001, set
// CB0001, bill INV-00001) and it opens straight away.
export default function ScanBox() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState(null);

  const go = async (e) => {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    setCode("");
    if (!c) return;
    setError(null);
    try {
      if (c.startsWith("INV-")) {
        const { items } = await api(`/billing/bills?q=${encodeURIComponent(c)}&limit=1`);
        if (!items.length || items[0].bill_number !== c) throw new Error(`No bill ${c}`);
        beep(true);
        return router.push(`/billing/${items[0].id}`);
      }
      const found = await api(`/tags/resolve/${encodeURIComponent(c)}`);
      beep(true);
      router.push(found.kind === "COMBO" ? `/combos?code=${found.code}` : `/inventory?piece=${found.code}`);
    } catch (err) {
      beep(false);
      setError(err.message);
      setTimeout(() => setError(null), 4000);
    }
  };

  return (
    <form onSubmit={go} className="relative">
      <input
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="Scan or type a code…"
        aria-label="Scan or type any code"
        className="h-8 w-48 rounded-lg border border-line bg-canvas px-3 font-mono text-sm outline-none focus:border-accent"
      />
      {error && (
        <div className="absolute right-0 top-9 z-40 w-64 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800 shadow" role="alert">{error}</div>
      )}
    </form>
  );
}
