"use client";

import { useEffect, useState } from "react";
import { Button, Card, Field, Input, Notice } from "@/_shared/components/ui";
import { fmtDay, localToday } from "@/_shared/dates";
import { settingsService } from "./settingsService";

// The day's gold rate: set once each morning, every bill that day starts from it.
export default function RateTab({ canEdit }) {
  const [day, setDay] = useState(localToday());
  const [rate, setRate] = useState("");
  const [notes, setNotes] = useState("");
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
  }, [day, history]);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await settingsService.setRate(day, { rate: Number(rate), notes: notes || null });
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
        </div>
        {canEdit ? (
          <form onSubmit={save} className="flex flex-col gap-3 border-t border-line pt-4">
            <Field label="Date">
              <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} required />
            </Field>
            <Field label="Rate (₹ per g fine)">
              <Input type="number" inputMode="decimal" step="0.01" min="1" value={rate} onChange={(e) => setRate(e.target.value)} required autoFocus />
            </Field>
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
              <th className="px-4 py-2 text-right">Rate / g fine</th>
              <th className="px-4 py-2">Set by</th>
              <th className="px-4 py-2">Note</th>
            </tr>
          </thead>
          <tbody>
            {history.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-muted">No rates yet.</td></tr>
            )}
            {history.map((r) => (
              <tr key={r.rate_date} className="border-b border-line last:border-0">
                <td className="px-4 py-2">
                  {canEdit ? (
                    <button className="text-accent hover:underline" onClick={() => setDay(r.rate_date)}>{fmtDay(r.rate_date)}</button>
                  ) : fmtDay(r.rate_date)}
                </td>
                <td className="px-4 py-2 text-right font-medium">₹{r.rate.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
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
