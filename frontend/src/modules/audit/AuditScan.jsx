"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { isManager, useAuth } from "@/_shared/auth/AuthProvider";
import { beep } from "@/_shared/beep";
import CameraScan from "@/_shared/components/CameraScan";
import { Button, Card, Input, Notice } from "@/_shared/components/ui";
import { grams } from "@/modules/inventory/inventoryService";
import { RESULT_LABEL, auditService } from "./auditService";

const RESULT_TONE = {
  FOUND: "bg-green-100 text-green-800",
  NOT_IN_STOCK: "bg-red-100 text-red-800",
  UNKNOWN: "bg-red-100 text-red-800",
  OTHER_CATEGORY: "bg-amber-100 text-amber-800",
};

// The counting screen: the input stays focused, so a USB scanner can fire tag
// after tag. Each beep shows straight away whether it counted.
export default function AuditScan({ id }) {
  const { user } = useAuth();
  const [audit, setAudit] = useState(null);
  const [code, setCode] = useState("");
  const [last, setLast] = useState(null);
  const [error, setError] = useState(null);
  const [closing, setClosing] = useState(false);
  const input = useRef(null);

  const load = useCallback(() => auditService.get(id).then(setAudit).catch((e) => setError(e.message)), [id]);
  useEffect(() => {
    load();
  }, [load]);

  const scan = async (value) => {
    const c = value.trim().toUpperCase();
    if (!c) return;
    try {
      const r = await auditService.scan(id, c);
      beep(r.ok);
      setLast({ code: c, ...r });
      setAudit((a) => a && { ...a, found: r.found, expected: r.expected });
      load();
    } catch (err) {
      beep(false);
      setLast({ code: c, ok: false, message: err.message, scans: [] });
    } finally {
      input.current?.focus();
    }
  };

  const submit = (e) => {
    e.preventDefault();
    const c = code;
    setCode("");
    scan(c);
  };

  if (!audit) return error ? <Notice tone="error">{error}</Notice> : <p className="text-sm text-muted">Loading…</p>;
  const open = audit.status === "OPEN";
  const missing = audit.expected - audit.found;
  const pctDone = audit.expected ? Math.round((audit.found / audit.expected) * 100) : 100;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/audit" className="text-sm text-muted hover:text-ink">← Stock counts</Link>
          <h1 className="text-2xl font-bold">
            <span className="font-mono">{audit.audit_no}</span> {audit.name && <span className="text-lg font-normal text-muted">{audit.name}</span>}
          </h1>
          <p className="text-sm text-muted">
            {audit.category_name ? `${audit.category_name} only` : "All stock"} · started by {audit.started_by_name || "?"}
            {!open && ` · closed by ${audit.closed_by_name || "?"} ${new Date(audit.closed_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}`}
          </p>
        </div>
        {open && isManager(user) && (
          closing ? (
            <div className="flex items-center gap-2 text-sm">
              <span>Close and freeze the result{missing > 0 ? ` with ${missing} missing` : ""}?</span>
              <Button onClick={async () => { await auditService.close(id).then(setAudit).catch((e) => setError(e.message)); setClosing(false); }}>Close count</Button>
              <Button variant="ghost" onClick={() => setClosing(false)}>Keep counting</Button>
            </div>
          ) : (
            <Button variant="ghost" onClick={() => setClosing(true)}>Finish count…</Button>
          )
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-4">
          {open && (
            <Card className="p-5">
              <form onSubmit={submit} className="flex flex-wrap gap-2">
                <Input ref={input} value={code} onChange={(e) => setCode(e.target.value)} autoFocus placeholder="Scan a tag (piece or combo)"
                  className="h-12 flex-1 font-mono text-lg" aria-label="Scan code" />
                <Button type="submit" className="h-12">Count</Button>
                <CameraScan onCode={scan} continuous className="h-12" />
              </form>
              {last && (
                <div className={`mt-3 rounded-lg px-4 py-3 text-sm ${last.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`} role="status">
                  <b className="font-mono">{last.code}</b> — {last.message}
                </div>
              )}
            </Card>
          )}
          {error && <Notice tone="error" onClose={() => setError(null)}>{error}</Notice>}

          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
              <h2 className="font-semibold">Missing <span className="text-muted">({audit.missing.length})</span></h2>
              <span className="text-xs text-muted">{open ? "In stock but not scanned yet" : "Not found when the count closed"}</span>
            </div>
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-sm tabular-nums">
                <tbody>
                  {audit.missing.length === 0 && (
                    <tr><td className="px-4 py-6 text-center text-green-700">Everything expected has been counted.</td></tr>
                  )}
                  {audit.missing.map((m) => (
                    <tr key={m.item_code} className="border-t border-line first:border-0">
                      <td className="px-4 py-2 font-mono font-semibold">{m.item_code}</td>
                      <td className="px-4 py-2">{m.name}<div className="text-xs text-muted">{m.category_name}</div></td>
                      <td className="px-4 py-2 text-right">{grams(m.net_weight)} g</td>
                      <td className="px-4 py-2">
                        {m.combo_code && <span className="rounded-full bg-accent-soft px-2 py-0.5 font-mono text-xs text-accent">{m.combo_code}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {audit.problems.length > 0 && (
            <Card className="overflow-hidden">
              <h2 className="border-b border-line px-4 py-2.5 font-semibold">Needs a look <span className="text-muted">({audit.problems.length})</span></h2>
              <ul className="divide-y divide-line text-sm">
                {audit.problems.map((p) => (
                  <li key={p.id} className="flex items-start justify-between gap-3 px-4 py-2">
                    <div>
                      <span className="font-mono font-semibold">{p.item_code || p.scanned_code}</span> {p.note}
                      <div className="mt-0.5"><span className={`rounded-full px-2 py-0.5 text-xs ${RESULT_TONE[p.result]}`}>{RESULT_LABEL[p.result]}</span></div>
                    </div>
                    {open && <Button variant="link" className="text-muted" onClick={() => auditService.undo(id, p.id).then(setAudit)}>Remove</Button>}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <Card className="p-5">
            <div className="text-xs uppercase tracking-wide text-muted">Counted</div>
            <div className="text-4xl font-bold tabular-nums">{audit.found}<span className="text-xl text-muted"> / {audit.expected}</span></div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-canvas">
              <div className="h-full bg-accent transition-all" style={{ width: `${Math.min(100, pctDone)}%` }} />
            </div>
            <p className="mt-2 text-sm">{missing > 0 ? <span className="text-red-700">{missing} not scanned</span> : <span className="text-green-700">Nothing missing</span>}</p>
            {!open && <Button variant="ghost" className="mt-3 w-full" onClick={() => window.print()}>Print result</Button>}
          </Card>
          <Card className="overflow-hidden">
            <h2 className="border-b border-line px-4 py-2.5 text-sm font-semibold">Last scans</h2>
            <ul className="max-h-96 divide-y divide-line overflow-y-auto text-sm">
              {audit.recent.length === 0 && <li className="px-4 py-4 text-muted">Nothing scanned yet.</li>}
              {audit.recent.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 px-4 py-2">
                  <div className="min-w-0">
                    <span className="font-mono">{s.item_code || s.scanned_code}</span>
                    {s.via_combo_code && <span className="text-xs text-muted"> via {s.via_combo_code}</span>}
                    <div className="text-xs text-muted">{new Date(s.at).toLocaleTimeString("en-IN", { timeStyle: "short" })} · {s.by_name}</div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${RESULT_TONE[s.result]}`}>{s.result === "FOUND" ? "✓" : "!"}</span>
                  {open && s.result === "FOUND" && (
                    <button className="text-xs text-muted hover:text-red-700" title="Undo this scan" onClick={() => auditService.undo(id, s.id).then(setAudit)}>undo</button>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
