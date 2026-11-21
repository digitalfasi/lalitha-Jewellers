"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import CameraScan from "@/_shared/components/CameraScan";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button, Card, Field, Input, Notice, Select } from "@/_shared/components/ui";
import { grams } from "@/modules/inventory/inventoryService";
import TagLabel from "./TagLabel";
import { LABEL_SIZES, TAG_STYLES, getTagPrefs, pageRule, setTagPrefs, tagService } from "./tagService";

const STATUS_WORD = { SOLD: "sold", INACTIVE: "inactive", DISSOLVED: "dissolved" };

// Print queue + scan lookup. Codes can arrive in the URL (?codes=CH0001,CB0001)
// from the Inventory and Combos screens.
export default function TagsPage() {
  const params = useSearchParams();
  const [queue, setQueue] = useState([]); // [{label, copies}]
  const [prefs, setPrefsState] = useState({ size: "small", layout: "sheet", style: "fold" });
  const { size, layout, style } = prefs;
  const setPref = (k, v) => setPrefsState((p) => {
    const next = { ...p, [k]: v };
    setTagPrefs(next);
    return next;
  });
  const [pending, setPending] = useState([]);
  const [askPrinted, setAskPrinted] = useState(false);
  const [codeText, setCodeText] = useState("");
  const [lookupText, setLookupText] = useState("");
  const [found, setFound] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const seeded = useRef(false);

  const loadPending = useCallback(() => tagService.pending().then(setPending).catch(() => setPending([])), []);
  useEffect(() => {
    setPrefsState(getTagPrefs());
    loadPending();
    window.addEventListener("tags:changed", loadPending);
    return () => window.removeEventListener("tags:changed", loadPending);
  }, [loadPending]);

  const addCodes = async (codes) => {
    if (!codes.length) return;
    setBusy(true);
    setNotice(null);
    try {
      const { labels, missing } = await tagService.labels(codes, getTagPrefs().style === "fold");
      const skipped = labels.filter((l) => !l.printable);
      setQueue((q) => {
        const have = new Set(q.map((x) => x.label.code));
        return [...q, ...labels.filter((l) => l.printable && !have.has(l.code)).map((label) => ({ label, copies: 1 }))];
      });
      const msgs = [];
      if (missing.length) msgs.push(`Not found: ${missing.join(", ")}`);
      if (skipped.length) msgs.push(`Not printed (${skipped.map((l) => `${l.code} is ${STATUS_WORD[l.status] || l.status.toLowerCase()}`).join(", ")})`);
      if (msgs.length) setNotice({ tone: "error", text: msgs.join(". ") + "." });
    } catch (err) {
      setNotice({ tone: "error", text: err.message });
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    const codes = (params.get("codes") || "").split(",").map((c) => c.trim()).filter(Boolean);
    if (codes.length) addCodes(codes);
  }, [params]); // eslint-disable-line react-hooks/exhaustive-deps

  const submitCodes = (e) => {
    e.preventDefault();
    const codes = codeText.split(/[\s,]+/).filter(Boolean);
    setCodeText("");
    addCodes(codes);
  };

  const lookup = (e) => {
    e.preventDefault();
    lookupCode(lookupText.trim());
  };

  const lookupCode = async (code) => {
    if (!code) return;
    setFound(null);
    try {
      setFound(await tagService.resolve(code));
    } catch (err) {
      setFound({ error: err.message });
    }
    setLookupText("");
  };

  const setCopies = (code, n) =>
    setQueue((q) => q.map((x) => (x.label.code === code ? { ...x, copies: Math.max(1, Math.min(50, n || 1)) } : x)));
  const remove = (code) => setQueue((q) => q.filter((x) => x.label.code !== code));

  const sheets = queue.flatMap((x) => Array.from({ length: x.copies }, (_, i) => ({ ...x, key: `${x.label.code}-${i}` })));

  const print = () => {
    window.print();
    setAskPrinted(true);
  };
  const markQueuePrinted = async () => {
    try {
      const { marked } = await tagService.markPrinted(queue.map((x) => x.label.code));
      setNotice({ tone: "ok", text: `${marked} piece${marked === 1 ? "" : "s"} marked as tagged.` });
      setQueue([]);
    } catch (err) {
      setNotice({ tone: "error", text: err.message });
    }
    setAskPrinted(false);
  };
  const markAllPendingDone = async () => {
    try {
      const { marked } = await tagService.markPrinted(pending.map((p) => p.code));
      setNotice({ tone: "ok", text: `${marked} pieces marked as already tagged.` });
    } catch (err) {
      setNotice({ tone: "error", text: err.message });
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Page size for the print run: one label per page on a roll, or A4 sheets. */}
      <style>{pageRule(prefs)}</style>

      <div className="no-print">
        <h1 className="text-2xl font-bold">Tags</h1>
        <p className="text-sm text-muted">Print code, QR and barcode labels for pieces and combos, or scan one to see what it is.</p>
      </div>

      {pending.length > 0 && (
        <Card className="no-print border-amber-200 bg-amber-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-amber-900">Tags to print: {pending.length}</h2>
              <p className="text-sm text-amber-900/80">
                {pending.filter((p) => p.state === "NEW").length} new pieces ·{" "}
                {pending.filter((p) => p.state === "COMBO_CHANGED").length} whose combo changed since their tag was printed
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => addCodes(pending.map((p) => p.code))} disabled={busy}>Add all to the queue</Button>
              <Button variant="ghost" onClick={markAllPendingDone} title="For stock that already has correct tags on it">Mark all as already tagged</Button>
            </div>
          </div>
          <details className="mt-2 text-sm" open={pending.length <= 12}>
            <summary className="cursor-pointer text-amber-900">Show the list (in shelf order)</summary>
            <div className="mt-2 max-h-80 overflow-y-auto">
              {/* Grouped by category and sub-category, so staff walk the shelves once. */}
              {Object.entries(pending.reduce((g, p) => {
                const k = p.design_name ? `${p.category_name} · ${p.design_name}` : p.category_name;
                (g[k] ||= []).push(p);
                return g;
              }, {})).map(([shelf, items]) => (
                <div key={shelf} className="mb-2">
                  <div className="flex items-center justify-between border-b border-amber-300 py-1 text-xs font-semibold uppercase tracking-wide text-amber-900">
                    <span>{shelf} · {items.length}</span>
                    <Button variant="link" onClick={() => addCodes(items.map((p) => p.code))}>Add these</Button>
                  </div>
                  <ul className="divide-y divide-amber-200">
                    {items.map((p) => (
                      <li key={p.code} className="flex items-start justify-between gap-3 py-1.5">
                        <span>
                          <b className="font-mono">{p.code}</b> {p.name}
                          {p.state === "NEW" ? (
                            <span className="ml-2 rounded-full bg-amber-200 px-1.5 text-xs text-amber-900">new</span>
                          ) : (
                            <span className="mt-0.5 block text-xs text-amber-900/80">
                              Old tag back: <s>{p.back_was || "no combo"}</s> → new: <b>{p.back_now || "no combo"}</b>
                              {!p.back_now && " · take the old tag off"}
                            </span>
                          )}
                        </span>
                        <Button variant="link" onClick={() => addCodes([p.code])}>Add</Button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </details>
        </Card>
      )}

      {askPrinted && queue.length > 0 && (
        <Card className="no-print flex flex-wrap items-center justify-between gap-3 p-4">
          <span className="text-sm">Did the {sheets.length} labels print OK and go on the pieces?</span>
          <div className="flex gap-2">
            <Button onClick={markQueuePrinted}>Yes, mark them as tagged</Button>
            <Button variant="ghost" onClick={() => setAskPrinted(false)}>Not yet</Button>
          </div>
        </Card>
      )}

      <div className="no-print grid items-start gap-5 lg:grid-cols-[360px_1fr]">
        <div className="flex flex-col gap-5">
          <Card className="p-5">
            <h2 className="font-semibold">Add to print queue</h2>
            <form onSubmit={submitCodes} className="mt-3 flex gap-2">
              <Input
                value={codeText}
                onChange={(e) => setCodeText(e.target.value)}
                placeholder="CH0001, CB0001…"
                className="font-mono"
                aria-label="Codes to print"
                autoFocus
              />
              <Button type="submit" disabled={busy || !codeText.trim()}>Add</Button>
            </form>
            <p className="mt-1.5 text-xs text-muted">Scan or type one or more codes. Only in-stock pieces and active combos print.</p>

            <Field label="Tag style" className="mt-4" hint={style === "fold" ? "A combo's code prints on the back of each piece's tag. Fold on the dashed line." : undefined}>
              <Select value={style} onChange={(e) => setPref("style", e.target.value)}>
                {Object.entries(TAG_STYLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Field label="Label size">
                <Select value={size} onChange={(e) => setPref("size", e.target.value)}>
                  {Object.entries(LABEL_SIZES).map(([k, s]) => (
                    <option key={k} value={k}>{s.name}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Printer">
                <Select value={layout} onChange={(e) => setPref("layout", e.target.value)}>
                  <option value="sheet">A4 sheet</option>
                  <option value="roll">Label printer</option>
                </Select>
              </Field>
            </div>

            {notice && (
              <div className="mt-3">
                <Notice tone={notice.tone} onClose={() => setNotice(null)}>{notice.text}</Notice>
              </div>
            )}

            {queue.length > 0 && (
              <ul className="mt-4 divide-y divide-line rounded-xl border border-line text-sm">
                {queue.map(({ label, copies }) => (
                  <li key={label.code} className="flex items-center justify-between gap-2 px-3 py-2">
                    <span className="min-w-0">
                      <span className="font-mono font-semibold">{label.code}</span>
                      {style === "fold" && label.back && <span className="ml-1 font-mono text-xs text-accent">/ {label.back.code}</span>}
                      <span className="ml-2 truncate text-muted">{label.title}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <Input
                        type="number"
                        min={1}
                        max={50}
                        value={copies}
                        onChange={(e) => setCopies(label.code, parseInt(e.target.value, 10))}
                        className="h-8 w-16 px-2"
                        aria-label={`Copies of ${label.code}`}
                      />
                      <button onClick={() => remove(label.code)} className="text-xs text-muted hover:text-red-700" aria-label={`Remove ${label.code}`}>
                        ✕
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-4 flex gap-2">
              <Button onClick={print} disabled={!sheets.length} className="flex-1">
                Print {sheets.length || ""} label{sheets.length === 1 ? "" : "s"}
              </Button>
              {queue.length > 0 && (
                <Button variant="ghost" onClick={() => setQueue([])}>Clear</Button>
              )}
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="font-semibold">Scan lookup</h2>
            <form onSubmit={lookup} className="mt-3 flex gap-2">
              <Input value={lookupText} onChange={(e) => setLookupText(e.target.value)} placeholder="Scan a tag" className="font-mono" aria-label="Code to look up" />
              <Button type="submit" variant="ghost" disabled={!lookupText.trim()}>Look up</Button>
              <CameraScan onCode={lookupCode} />
            </form>
            {found?.error && <p className="mt-3 text-sm text-red-700">{found.error}</p>}
            {found && !found.error && (
              <div className="mt-3 rounded-xl border border-line p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-base font-bold text-accent">{found.code}</span>
                  <span className="rounded-full bg-canvas px-2 py-0.5 text-xs">
                    {found.kind === "COMBO" ? "Combo" : found.category_name} · {found.status.replace("_", " ").toLowerCase()}
                  </span>
                </div>
                <div className="mt-1">{found.title}</div>
                <div className="mt-1 text-xs tabular-nums text-muted">
                  {found.purity} · gross {grams(found.gross_weight)} · stone {grams(found.stone_weight)} · net {grams(found.net_weight)} g
                </div>
                {found.kind === "COMBO" && found.piece_codes.length > 0 && (
                  <div className="mt-1 font-mono text-xs">{found.piece_codes.join(" + ")}</div>
                )}
                {found.combo_code && (
                  <div className="mt-1 text-xs">
                    In combo{" "}
                    <Link href={`/combos?code=${found.combo_code}`} className="font-mono text-accent hover:underline">{found.combo_code}</Link>
                  </div>
                )}
                <div className="mt-2 flex gap-3">
                  {found.kind === "COMBO" && (
                    <Link href={`/combos?code=${found.code}`} className="text-sm text-accent hover:underline">Open combo</Link>
                  )}
                  {found.printable && (
                    <button onClick={() => addCodes([found.code])} className="text-sm text-accent hover:underline">Add to print queue</button>
                  )}
                </div>
              </div>
            )}
          </Card>
        </div>

        <Card className="p-5">
          <h2 className="font-semibold">Preview</h2>
          {sheets.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">Add codes to see the labels here.</p>
          ) : (
            <div className="mt-4 flex flex-wrap gap-3">
              {sheets.map((s) => (
                <div key={s.key} className="outline outline-1 outline-dashed outline-line">
                  <TagLabel label={s.label} size={size} style={style} />
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* What actually prints. Hidden on screen. */}
      <div className={`print-only ${layout === "roll" ? "print-roll" : "print-sheet"}`}>
        {sheets.map((s) => (
          <TagLabel key={s.key} label={s.label} size={size} style={style} />
        ))}
      </div>
    </div>
  );
}
