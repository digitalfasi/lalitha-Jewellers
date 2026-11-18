"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Card, Field, Input, Notice, Select } from "@/_shared/components/ui";
import { inventoryService } from "@/modules/inventory/inventoryService";
import { auditService } from "./auditService";

// Stock counts: start one, then scan every tag on the shelves.
export default function AuditList() {
  const router = useRouter();
  const [audits, setAudits] = useState([]);
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState({ name: "", category_id: "" });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    auditService.list().then(setAudits).catch((e) => setError(e.message));
    inventoryService.listCategories().then(setCategories).catch(() => {});
  }, []);

  const start = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const a = await auditService.start({ name: form.name || null, category_id: form.category_id || null });
      router.push(`/audit/${a.id}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold">Stock count</h1>
        <p className="text-sm text-muted">Scan everything on the shelves. The app lists what should be there but wasn't scanned.</p>
      </div>
      {error && <Notice tone="error" onClose={() => setError(null)}>{error}</Notice>}
      <div className="grid items-start gap-5 lg:grid-cols-[1fr_340px]">
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm tabular-nums">
            <thead className="bg-canvas text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-2.5">Count</th>
                <th className="px-4 py-2.5">Started</th>
                <th className="px-4 py-2.5 text-right">Found / expected</th>
                <th className="px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {audits.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-muted">No stock counts yet.</td></tr>
              )}
              {audits.map((a) => (
                <tr key={a.id} className="border-t border-line">
                  <td className="px-4 py-2.5">
                    <Link href={`/audit/${a.id}`} className="font-mono font-semibold text-accent hover:underline">{a.audit_no}</Link>
                    <div className="text-xs text-muted">{a.name || ""}{a.category_name ? ` · ${a.category_name} only` : " · all stock"}</div>
                  </td>
                  <td className="px-4 py-2.5 text-xs">
                    {new Date(a.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                    <div className="text-muted">{a.started_by_name}</div>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <b>{a.found}</b> / {a.expected}
                    {a.expected - a.found > 0 && <div className="text-xs text-red-700">{a.expected - a.found} missing</div>}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${a.status === "OPEN" ? "bg-amber-100 text-amber-800" : "bg-line text-muted"}`}>
                      {a.status === "OPEN" ? "In progress" : "Closed"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card className="p-5">
          <h2 className="font-semibold">Start a count</h2>
          <form onSubmit={start} className="mt-3 flex flex-col gap-3">
            <Field label="Name" hint="Optional, e.g. Monthly count – showroom">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={150} />
            </Field>
            <Field label="What to count">
              <Select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
                <option value="">All stock</option>
                {categories.map((c) => <option key={c.id} value={c.id}>Only {c.name}</option>)}
              </Select>
            </Field>
            <Button type="submit" disabled={busy}>{busy ? "Starting…" : "Start counting"}</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
