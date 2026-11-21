"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button, Card, Field, Input, Notice, Select } from "@/_shared/components/ui";
import { fmtDay, localToday } from "@/_shared/dates";
import { grams, inventoryService } from "./inventoryService";

// Karigars (makers / suppliers) and the lots of stock they deliver.
export default function LotsTab({ onShowPieces }) {
  const [karigars, setKarigars] = useState([]);
  const [lots, setLots] = useState([]);
  const [kForm, setKForm] = useState({ name: "", phone: "", city: "" });
  const [lForm, setLForm] = useState({ karigar_id: "", received_on: localToday(), remarks: "", gold_given_fine: "" });
  const [notice, setNotice] = useState(null);

  const load = useCallback(() => {
    inventoryService.listKarigars(true).then(setKarigars).catch((e) => setNotice({ tone: "error", text: e.message }));
    inventoryService.listLots({ limit: 200 }).then(setLots).catch((e) => setNotice({ tone: "error", text: e.message }));
  }, []);
  useEffect(load, [load]);

  const run = async (fn, ok) => {
    setNotice(null);
    try {
      const out = await fn();
      setNotice({ tone: "ok", text: typeof ok === "function" ? ok(out) : ok });
      load();
      return true;
    } catch (e) {
      setNotice({ tone: "error", text: e.message });
      return false;
    }
  };

  const addKarigar = async (e) => {
    e.preventDefault();
    if (await run(() => inventoryService.createKarigar(kForm), `${kForm.name} added.`)) setKForm({ name: "", phone: "", city: "" });
  };
  const addLot = async (e) => {
    e.preventDefault();
    const ok = await run(
      () => inventoryService.createLot({ ...lForm, karigar_id: lForm.karigar_id || null, remarks: lForm.remarks || null,
        gold_given_fine: lForm.gold_given_fine === "" ? null : Number(lForm.gold_given_fine) }),
      (lot) => `${lot.lot_no} started. Add its pieces with Bulk entry or one by one.`,
    );
    if (ok) setLForm({ karigar_id: "", received_on: localToday(), remarks: "", gold_given_fine: "" });
  };

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[1fr_340px]">
      <div className="flex min-w-0 flex-col gap-3">
        {notice && <Notice tone={notice.tone} onClose={() => setNotice(null)}>{notice.text}</Notice>}
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm tabular-nums">
            <thead className="bg-canvas text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-2.5">Lot</th>
                <th className="px-4 py-2.5">Karigar</th>
                <th className="px-4 py-2.5">Received</th>
                <th className="px-4 py-2.5 text-right">Pieces</th>
                <th className="px-4 py-2.5 text-right">Gross g</th>
                <th className="px-4 py-2.5 text-right">Karigar check</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {lots.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-muted">No lots yet. Start one when stock arrives.</td></tr>
              )}
              {lots.map((l) => (
                <tr key={l.id} className="border-t border-line">
                  <td className="px-4 py-2.5">
                    <div className="font-mono font-semibold">{l.lot_no}</div>
                    {l.remarks && <div className="text-xs text-muted">{l.remarks}</div>}
                  </td>
                  <td className="px-4 py-2.5">{l.karigar_name || <span className="text-muted">—</span>}</td>
                  <td className="px-4 py-2.5">{fmtDay(l.received_on)}</td>
                  <td className="px-4 py-2.5 text-right">
                    {l.piece_count}
                    <div className="text-xs text-muted">{l.in_stock_count} in stock</div>
                  </td>
                  <td className="px-4 py-2.5 text-right">{grams(l.total_gross)}</td>
                  <td className="px-4 py-2.5 text-right text-xs tabular-nums">
                    {l.gold_given_fine === null ? <span className="text-muted">—</span> : (
                      <>
                        <div>Given {grams(l.gold_given_fine)} · back {grams(l.returned_fine)}</div>
                        <div className={l.karigar_balance > 0.0005 ? "font-semibold text-amber-700" : "text-green-700"}>
                          {l.karigar_balance > 0.0005 ? `Karigar holds ${grams(l.karigar_balance)}` : l.karigar_balance < -0.0005 ? `Extra ${grams(-l.karigar_balance)}` : "Settled"}
                        </div>
                        {l.pieces_without_cost_touch > 0 && <div className="text-muted">{l.pieces_without_cost_touch} without cost touch</div>}
                      </>
                    )}
                  </td>
                  <td className="space-x-3 whitespace-nowrap px-4 py-2.5 text-right">
                    <Button variant="link" onClick={() => onShowPieces(l)}>Pieces</Button>
                    <Link href={`/inventory/bulk?lot=${l.id}`} className="text-sm text-accent hover:underline">Add pieces</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-canvas text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-2.5">Karigar</th>
                <th className="px-4 py-2.5">Phone</th>
                <th className="px-4 py-2.5 text-right">Lots</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {karigars.map((k) => (
                <tr key={k.id} className={`border-t border-line ${k.is_active ? "" : "text-muted"}`}>
                  <td className="px-4 py-2.5">
                    <div className="font-medium">{k.name}{!k.is_active && " (inactive)"}</div>
                    <div className="text-xs text-muted">{k.city}</div>
                  </td>
                  <td className="px-4 py-2.5">{k.phone || "—"}</td>
                  <td className="px-4 py-2.5 text-right">{k.lot_count}</td>
                  <td className="px-4 py-2.5 text-right">
                    <Button variant="link" onClick={() => run(() => inventoryService.updateKarigar(k.id, { ...k, is_active: !k.is_active }),
                      `${k.name} ${k.is_active ? "deactivated" : "activated"}.`)}>
                      {k.is_active ? "Deactivate" : "Activate"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <div className="flex flex-col gap-5">
        <Card className="p-5">
          <h2 className="font-semibold">New lot</h2>
          <form onSubmit={addLot} className="mt-3 flex flex-col gap-3">
            <Field label="Karigar">
              <Select value={lForm.karigar_id} onChange={(e) => setLForm({ ...lForm, karigar_id: e.target.value })}>
                <option value="">Not from a karigar</option>
                {karigars.filter((k) => k.is_active).map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
              </Select>
            </Field>
            <Field label="Received on">
              <Input type="date" value={lForm.received_on} onChange={(e) => setLForm({ ...lForm, received_on: e.target.value })} required />
            </Field>
            <Field label="Fine gold given to karigar (g)" hint="Optional. To check what comes back.">
              <Input type="number" step="0.001" min="0" value={lForm.gold_given_fine} onChange={(e) => setLForm({ ...lForm, gold_given_fine: e.target.value })} />
            </Field>
            <Field label="Remarks" hint="Optional">
              <Input value={lForm.remarks} onChange={(e) => setLForm({ ...lForm, remarks: e.target.value })} maxLength={1000} />
            </Field>
            <Button type="submit">Start lot</Button>
          </form>
        </Card>
        <Card className="p-5">
          <h2 className="font-semibold">Add karigar</h2>
          <form onSubmit={addKarigar} className="mt-3 flex flex-col gap-3">
            <Field label="Name"><Input value={kForm.name} onChange={(e) => setKForm({ ...kForm, name: e.target.value })} required minLength={2} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Phone"><Input value={kForm.phone} onChange={(e) => setKForm({ ...kForm, phone: e.target.value })} inputMode="tel" /></Field>
              <Field label="City"><Input value={kForm.city} onChange={(e) => setKForm({ ...kForm, city: e.target.value })} /></Field>
            </div>
            <Button type="submit" variant="ghost">Add karigar</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
