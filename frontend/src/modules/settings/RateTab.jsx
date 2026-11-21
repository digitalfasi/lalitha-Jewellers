"use client";

import { useEffect, useState } from "react";
import { Button, Card, Field, Input, Notice } from "@/_shared/components/ui";
import { fmtDay, localToday } from "@/_shared/dates";
import { settingsService } from "./settingsService";

// Gold content of each purity, as on the server. Other purities start from 24K x this; the owner can type their own.
const OTHERS = [["22K", 91.6], ["20K", 83.3], ["18K", 75.0], ["14K", 58.5]];

// The day's gold rate: set once each morning, every bill that day starts from it.
export default function RateTab({ canEdit }) {
  const [day, setDay] = useState(localToday());
  const [rate, setRate] = useState("");
  const [notes, setNotes] = useState("");
  const [own, setOwn] = useState({}); // {"22K": "6900"}: rates typed for other purities
  const [history, setHistory] = useState([]);
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () => settingsService.rates(30).then(setHistory).catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  // Fill the form with the rate already set for the chosen day, if any.
  useEffect(() => {
    const row = history.find((r) => r.rate_date === day);
    setRate(row ? String(row.rate) : "");
    setNotes(row?.notes || "");
    setOwn(Object.fromEntries((row?.custom_purities || []).map((k) => [k, String(row.purity_rates[k])])));
  }, [day, history]);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const purity_rates = Object.fromEntries(Object.entries(own).filter(([, v]) => v !== "").map(([k, v]) => [k, Number(v)]));
      await settingsService.setRate(day, { rate: Number(rate), notes: notes || null, purity_rates });
      setMsg(`Gold rate for ${fmtDay(day)} saved.`);
      window.dispatchEvent(new Event("rate:changed"));
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const today = history.find((r) => r.rate_date === localToday());

  return (
    <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
      <Card className="flex flex-col gap-4 p-5">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted">Today</div>
          <div className="text-3xl font-bold tabular-nums">
            {today ? `₹${today.rate.toLocaleString("en-IN")}` : <span className="text-red-700">Not set</span>}
          </div>
          <div className="text-xs text-muted">per gram of fine (24K) gold{today?.set_by_name ? ` · set by ${today.set_by_name}` : ""}</div>
          {today?.purity_rates && (
            <div className="mt-2 flex flex-wrap gap-1.5 text-xs tabular-nums">
              {OTHERS.map(([k]) => (
                <span key={k} className="rounded-full bg-canvas px-2 py-0.5">{k} ₹{today.purity_rates[k]?.toLocaleString("en-IN")}</span>
              ))}
            </div>
          )}
        </div>
        {canEdit ? (
          <form onSubmit={save} className="flex flex-col gap-3 border-t border-line pt-4">
            <Field label="Date">
              <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} required />
            </Field>
            <Field label="24K rate (₹ per g fine)" hint="Bills use this: fine × 24K rate.">
              <Input type="number" inputMode="decimal" step="0.01" min="1" value={rate} onChange={(e) => setRate(e.target.value)} required autoFocus />
            </Field>
            <fieldset className="grid grid-cols-2 gap-3 rounded-xl border border-line p-3">
              <legend className="px-1 text-xs text-muted">Other purities (₹ per g). Blank = 24K × purity %</legend>
              {OTHERS.map(([k, pctv]) => (
                <Field key={k} label={k}>
                  <Input type="number" inputMode="decimal" step="0.01" min="1" value={own[k] ?? ""} onChange={(e) => setOwn({ ...own, [k]: e.target.value })}
                    placeholder={rate ? String(Math.round((Number(rate) * pctv) / 100)) : ""} />
                </Field>
              ))}
            </fieldset>
            <Field label="Note" hint="Optional, e.g. source of the rate">
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
            </Field>
            {msg && <Notice onClose={() => setMsg(null)}>{msg}</Notice>}
            {error && <Notice tone="error" onClose={() => setError(null)}>{error}</Notice>}
            <Button type="submit" disabled={busy || !rate}>{busy ? "Saving…" : "Save rate"}</Button>
            <p className="text-xs text-muted">Bills already saved keep the rate they were made with.</p>
          </form>
        ) : (
          <p className="text-sm text-muted">Ask the owner or a manager to set the rate.</p>
        )}
      </Card>

      <Card className="overflow-hidden">
        <table className="w-full text-sm tabular-nums">
          <thead className="border-b border-line bg-canvas text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2 text-right">24K / g</th>
              <th className="px-4 py-2 text-right">22K / g</th>
              <th className="px-4 py-2">Set by</th>
              <th className="px-4 py-2">Note</th>
            </tr>
          </thead>
          <tbody>
            {history.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-muted">No rates yet.</td></tr>
            )}
            {history.map((r) => (
              <tr key={r.rate_date} className="border-b border-line last:border-0">
                <td className="px-4 py-2">
                  {canEdit ? (
                    <button className="text-accent hover:underline" onClick={() => setDay(r.rate_date)}>{fmtDay(r.rate_date)}</button>
                  ) : fmtDay(r.rate_date)}
                </td>
                <td className="px-4 py-2 text-right font-medium">₹{r.rate.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                <td className="px-4 py-2 text-right">₹{(r.purity_rates?.["22K"] ?? 0).toLocaleString("en-IN")}</td>
                <td className="px-4 py-2 text-muted">{r.set_by_name || "—"}</td>
                <td className="px-4 py-2 text-muted">{r.notes || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
