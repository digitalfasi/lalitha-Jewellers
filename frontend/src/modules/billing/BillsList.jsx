"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card, Input, Notice, Select } from "@/_shared/components/ui";
import { grams } from "@/modules/inventory/inventoryService";
import { billingService, fmtDate, inr } from "./billingService";

export default function BillsList() {
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [data, setData] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => setQuery(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(() => {
    setLoading(true);
    billingService
      .listBills({ q: query, status, limit: 100 })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [query, status]);
  useEffect(load, [load]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Bill number or shop" className="w-64" aria-label="Search bills" />
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-40" aria-label="Status">
          <option value="">All bills</option>
          <option value="FINAL">Final</option>
          <option value="CANCELLED">Cancelled</option>
        </Select>
      </div>
      {error && <Notice tone="error" onClose={() => setError(null)}>{error}</Notice>}
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-canvas text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-2.5">Bill</th>
              <th className="px-4 py-2.5">Date</th>
              <th className="px-4 py-2.5">Shop</th>
              <th className="px-4 py-2.5 text-right">Pieces</th>
              <th className="px-4 py-2.5 text-right">Fine (g)</th>
              <th className="px-4 py-2.5 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {!loading && data.items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted">
                  {query || status ? "No bills match." : "No bills yet."}
                </td>
              </tr>
            )}
            {data.items.map((b) => (
              <tr key={b.id} className={`border-t border-line ${b.status === "CANCELLED" ? "text-muted" : ""}`}>
                <td className="px-4 py-2.5">
                  <Link href={`/billing/${b.id}`} className="font-mono font-semibold text-accent hover:underline">{b.bill_number}</Link>
                  {b.status === "CANCELLED" && <span className="ml-2 rounded-full bg-line px-2 py-0.5 text-xs">Cancelled</span>}
                </td>
                <td className="px-4 py-2.5">{fmtDate(b.bill_date)}</td>
                <td className="px-4 py-2.5">{b.shop_name}</td>
                <td className="px-4 py-2.5 text-right">{b.total_pieces}</td>
                <td className="px-4 py-2.5 text-right">{grams(b.total_fine)}</td>
                <td className={`px-4 py-2.5 text-right font-medium ${b.status === "CANCELLED" ? "line-through" : ""}`}>{inr(b.grand_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <span className="text-sm text-muted">{loading ? "Loading…" : `${data.total} bill${data.total === 1 ? "" : "s"}`}</span>
    </div>
  );
}
