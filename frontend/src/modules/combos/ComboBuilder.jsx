"use client";

import { useEffect, useState } from "react";
import { isManager, useAuth } from "@/_shared/auth/AuthProvider";
import { Button, Field, Input, Notice, Select } from "@/_shared/components/ui";
import { grams } from "@/modules/inventory/inventoryService";
import { comboService, shortName } from "./comboService";
import PiecePicker from "./PiecePicker";
import TemplatesManager from "./TemplatesManager";

const sum = (list, key) => Math.round(list.reduce((t, p) => t + Number(p[key]), 0) * 1000) / 1000;

// Pick two or more free pieces, then create: the server gives the combo its CB code.
// Either pick freely (with "good matches" suggested from past sets) or start
// from a template, which asks for one piece per slot (Chain, Pendant, ...).
export default function ComboBuilder({ onCreated, onCancel }) {
  const { user } = useAuth();
  const [templates, setTemplates] = useState([]);
  const [templateId, setTemplateId] = useState("");
  const [slots, setSlots] = useState([]); // template mode: one chosen piece (or null) per slot
  const [free, setFree] = useState([]);   // free mode: chosen pieces
  const [suggestions, setSuggestions] = useState([]);
  const [name, setName] = useState("");
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [managing, setManaging] = useState(false);

  const loadTemplates = () => comboService.templates().then(setTemplates).catch(() => setTemplates([]));
  useEffect(() => {
    loadTemplates();
  }, []);

  const template = templates.find((t) => t.id === templateId);
  const chosen = template ? slots.filter(Boolean) : free;
  const codes = chosen.map((p) => p.item_code);
  const nextSlot = template ? slots.findIndex((s) => !s) : -1;
  const suggestedName = chosen.map(shortName).join(" + ");

  const chooseTemplate = (id) => {
    const t = templates.find((x) => x.id === id);
    const picked = template ? slots.filter(Boolean) : free;
    setTemplateId(id);
    if (t) {
      // Keep what was picked so far where it fits one of the new template's slots.
      const left = [...picked];
      setSlots(t.slots.map((s) => {
        const i = left.findIndex((p) => p.category_id === s.category_id);
        return i >= 0 ? left.splice(i, 1)[0] : null;
      }));
    } else {
      setFree(picked);
    }
  };

  // Good matches for what's chosen so far (for the next empty slot in template mode).
  const slotCategory = template && nextSlot >= 0 ? template.slots[nextSlot].category_id : undefined;
  useEffect(() => {
    if ((!codes.length && !slotCategory) || (template && nextSlot < 0)) {
      setSuggestions([]);
      return;
    }
    let live = true;
    comboService
      .suggestions(codes, slotCategory, 6)
      .then((s) => live && setSuggestions(s))
      .catch(() => live && setSuggestions([]));
    return () => {
      live = false;
    };
  }, [codes.join(","), slotCategory, templateId]); // eslint-disable-line react-hooks/exhaustive-deps

  const add = (p) => {
    if (codes.includes(p.item_code)) return;
    if (template) {
      const i = slots.findIndex((s, j) => !s && template.slots[j].category_id === p.category_id);
      if (i < 0) return setError(`${p.item_code} is a ${p.category_name}; this template has no empty ${p.category_name} slot.`);
      setSlots((ss) => ss.map((s, j) => (j === i ? p : s)));
    } else {
      setFree((c) => [...c, p]);
    }
    setError(null);
  };
  const remove = (p) => {
    if (template) setSlots((ss) => ss.map((s) => (s?.piece_id === p.piece_id ? null : s)));
    else setFree((c) => c.filter((x) => x.piece_id !== p.piece_id));
  };

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const combo = await comboService.create({ piece_codes: codes, name: name || null, remarks: remarks || null });
      onCreated(combo);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const ready = chosen.length >= 2;
  const templateIncomplete = template && nextSlot >= 0;

  if (managing) return <TemplatesManager onDone={() => { setManaging(false); loadTemplates(); }} />;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <h2 className="font-semibold">New combo</h2>
        <Button variant="link" onClick={onCancel}>Cancel</Button>
      </div>

      <Field label="Start from" hint={templates.length === 0 ? "No templates yet." : "A template asks for one piece per slot."}>
        <div className="flex gap-2">
          <Select value={templateId} onChange={(e) => chooseTemplate(e.target.value)}>
            <option value="">Pick pieces freely</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
          {isManager(user) && <Button variant="ghost" onClick={() => setManaging(true)}>Templates…</Button>}
        </div>
      </Field>

      {template ? (
        <ol className="flex flex-col gap-2">
          {template.slots.map((slot, i) => (
            <li key={i} className="rounded-xl border border-line p-3">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{i + 1}. {slot.label}</div>
              {slots[i] ? (
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span><span className="font-mono font-semibold">{slots[i].item_code}</span> {slots[i].name}
                    <span className="text-xs text-muted"> · {slots[i].purity}</span></span>
                  <span className="flex items-center gap-3 tabular-nums">
                    <span className="whitespace-nowrap">{grams(slots[i].net_weight)} g</span>
                    <button onClick={() => remove(slots[i])} className="text-xs text-muted hover:text-red-700" aria-label={`Remove ${slots[i].item_code}`}>✕</button>
                  </span>
                </div>
              ) : (
                <PiecePicker onPick={add} exclude={codes} categoryId={slot.category_id} autoFocus={i === nextSlot}
                  placeholder={`Scan or type a ${slot.category_name.toLowerCase()} code`} />
              )}
            </li>
          ))}
        </ol>
      ) : (
        <>
          <Field label="Add pieces" hint="In-stock pieces that are not in another combo.">
            <PiecePicker onPick={add} exclude={codes} autoFocus />
          </Field>
          <div className="rounded-xl border border-line">
            {free.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted">No pieces yet. A combo needs at least 2.</p>
            ) : (
              <table className="w-full text-sm tabular-nums">
                <tbody>
                  {free.map((p) => (
                    <tr key={p.piece_id} className="border-b border-line last:border-0">
                      <td className="px-3 py-2 font-mono font-semibold">{p.item_code}</td>
                      <td className="px-3 py-2">
                        {p.name}
                        <div className="text-xs text-muted">{p.category_name} · {p.purity}</div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right">{grams(p.net_weight)} g</td>
                      <td className="px-3 py-2 text-right">
                        <button onClick={() => remove(p)} className="text-xs text-muted hover:text-red-700" aria-label={`Remove ${p.item_code}`}>✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {chosen.length > 0 && (
        <p className="text-xs text-muted tabular-nums">
          {chosen.length} pieces · gross {grams(sum(chosen, "gross_weight"))} · stone {grams(sum(chosen, "stone_weight"))} ·{" "}
          <b className="text-ink">net {grams(sum(chosen, "net_weight"))} g</b>
        </p>
      )}

      {suggestions.length > 0 && (
        <section className="rounded-xl bg-canvas p-3">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            {template ? `Good matches for “${template.slots[nextSlot]?.label}”` : "Good matches"}
          </h3>
          <ul className="flex flex-col gap-1.5">
            {suggestions.map((s) => (
              <li key={s.piece_id} className="flex items-start justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <span className="font-mono font-semibold">{s.item_code}</span> {s.name}
                  <span className="text-xs text-muted"> · {s.category_name} · {s.purity} · {grams(s.net_weight)} g</span>
                  {s.reasons.length > 0 && <div className="text-xs text-green-700">{s.reasons.join(" · ")}</div>}
                </div>
                <Button variant="link" onClick={() => add(s)}>Add</Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Field label="Name" hint="Optional">
        <div className="flex gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={150} placeholder={suggestedName || "e.g. Rope chain + Dollar"} />
          {suggestedName && name !== suggestedName && (
            <Button variant="ghost" onClick={() => setName(suggestedName)} title={suggestedName}>Use suggested</Button>
          )}
        </div>
      </Field>
      <Field label="Remarks" hint="Optional">
        <Input value={remarks} onChange={(e) => setRemarks(e.target.value)} maxLength={1000} />
      </Field>

      {error && <Notice tone="error" onClose={() => setError(null)}>{error}</Notice>}

      <Button onClick={create} disabled={busy || !ready}>
        {busy ? "Creating…" : !ready ? "Pick at least 2 pieces" : templateIncomplete ? `Create with ${chosen.length} (template not full)` : `Create combo of ${chosen.length}`}
      </Button>
    </div>
  );
}
