"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { FileSpreadsheet, Mic } from "lucide-react";
import { Button, Notice } from "@/_shared/components/ui";
import { useT } from "@/_shared/i18n/LanguageProvider";
import { calcService } from "./calcService";

const COLS = "ABCDEFGHIJ".split("");
const ROWS = Array.from({ length: 20 }, (_, i) => i + 1);

// ---------------------------------------------------------------- mini sheet
/** A small Excel-like sheet (A1 to J20): numbers, labels and =formulas that refer to other cells,
 *  ranges (=SUM(C2:C9)) and live values (=C4*RATE). Saved to the person's account. */
export function MiniSheet({ cells, onChange, fmt }) {
  const { t } = useT();
  const [sel, setSel] = useState("A1");
  const [editing, setEditing] = useState(null);
  const [res, setRes] = useState({});
  const inputRef = useRef(null);

  useEffect(() => {
    const filled = Object.fromEntries(Object.entries(cells).filter(([, v]) => v));
    if (!Object.keys(filled).length) return setRes({});
    const timer = setTimeout(() => calcService.sheet(filled).then(setRes).catch(() => {}), 300);
    return () => clearTimeout(timer);
  }, [cells]);

  const move = (dc, dr) => {
    const c = Math.min(Math.max(COLS.indexOf(sel[0]) + dc, 0), COLS.length - 1);
    const r = Math.min(Math.max(Number(sel.slice(1)) + dr, 1), ROWS.length);
    setSel(`${COLS[c]}${r}`);
  };
  const onKey = (e) => {
    if (editing) {
      if (e.key === "Enter") { e.preventDefault(); setEditing(null); move(0, 1); }
      if (e.key === "Escape") setEditing(null);
      return;
    }
    const keys = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], Enter: [0, 1], Tab: [1, 0] };
    if (keys[e.key]) { e.preventDefault(); move(...keys[e.key]); }
    else if (e.key === "Delete" || e.key === "Backspace") onChange({ ...cells, [sel]: "" });
    else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) { e.preventDefault(); onChange({ ...cells, [sel]: e.key }); setEditing(sel); }
  };
  useEffect(() => {
    if (editing) requestAnimationFrame(() => inputRef.current?.focus());
  }, [editing]);

  const shown = (ref) => {
    const r = res[ref];
    if (!cells[ref]) return "";
    if (r?.error) return r.error;
    if (r?.result && /^-?\d/.test(r.result)) return fmt(r.result);
    return r?.result ?? cells[ref];
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Formula bar for the chosen cell, as in Excel */}
      <div className="flex items-center gap-2 rounded-lg border border-line bg-surface px-2">
        <span className="w-10 font-mono text-sm font-semibold text-accent">{sel}</span>
        <input value={cells[sel] || ""} onChange={(e) => onChange({ ...cells, [sel]: e.target.value })}
          placeholder={t("Number, label or =formula")} className="h-10 min-w-0 flex-1 bg-transparent font-mono text-sm outline-none" />
      </div>
      {res[sel]?.hint && <p className="text-xs text-red-700">{res[sel].error}: {t(res[sel].hint)}</p>}
      <div className="max-h-[50vh] overflow-auto rounded-lg border border-line" tabIndex={0} onKeyDown={onKey} aria-label={t("Sheet")}>
        <table className="border-collapse text-sm tabular-nums">
          <thead className="sticky top-0 z-10 bg-canvas text-xs text-muted">
            <tr><th className="sticky left-0 w-8 bg-canvas" />{COLS.map((c) => <th key={c} className="min-w-[84px] border-l border-line px-1 py-1 font-medium">{c}</th>)}</tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r}>
                <td className="sticky left-0 bg-canvas px-1 text-center text-xs text-muted">{r}</td>
                {COLS.map((c) => {
                  const ref = `${c}${r}`;
                  const err = res[ref]?.error;
                  return (
                    <td key={ref} onClick={() => setSel(ref)} onDoubleClick={() => setEditing(ref)}
                      className={clsx("h-8 min-w-[84px] max-w-[120px] truncate border-l border-t border-line px-1.5",
                        sel === ref && "outline outline-2 -outline-offset-2 outline-accent",
                        /^=/.test(cells[ref] || "") && !err && "font-semibold",
                        /^-?[\d.]/.test(shown(ref)) || err ? "text-right" : "text-left", err && "text-red-700")}>
                      {editing === ref ? (
                        <input ref={inputRef} value={cells[ref] || ""} onChange={(e) => onChange({ ...cells, [ref]: e.target.value })}
                          onBlur={() => setEditing(null)} onKeyDown={onKey} className="h-7 w-full bg-transparent font-mono text-sm outline-none" />
                      ) : shown(ref)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted">{t("Click a cell and type, or double-click to edit. Arrow keys move. =SUM(C2:C9), =C2*RATE work like Excel. Saved to your account.")}</p>
    </div>
  );
}

// -------------------------------------------------------------- Excel import
/** The owner picks an .xlsx; its formulas are listed with their column names, and the ticked ones are saved. */
export function ExcelImport({ onSaved }) {
  const { t } = useT();
  const [found, setFound] = useState(null);
  const [pick, setPick] = useState({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const fileRef = useRef(null);

  const read = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setMsg(null);
    try {
      const list = await calcService.importExcel(file);
      setFound(list);
      setPick(Object.fromEntries(list.map((f, i) => [i, !f.problem])));
      if (!list.length) setMsg({ tone: "error", text: t("No formulas found in that file.") });
    } catch (err) {
      setMsg({ tone: "error", text: err.message });
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    setBusy(true);
    let ok = 0;
    const errors = [];
    for (const [i, on] of Object.entries(pick)) {
      if (!on) continue;
      const f = found[i];
      try {
        await calcService.saveFormula({ name: f.name, formula: f.formula, labels: f.labels });
        ok += 1;
      } catch (err) {
        errors.push(`${f.name}: ${err.message}`);
      }
    }
    setBusy(false);
    setFound(null);
    setMsg({ tone: errors.length ? "error" : "ok", text: t("{n} formulas saved.", { n: ok }) + (errors.length ? ` ${errors.join("; ")}` : "") });
    onSaved();
  };

  return (
    <div className="flex flex-col gap-2">
      <Button variant="ghost" className="self-start" onClick={() => fileRef.current?.click()} disabled={busy}>
        <FileSpreadsheet size={15} aria-hidden /> {busy ? t("Reading…") : t("Import from Excel")}
      </Button>
      <input ref={fileRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={read} />
      {msg && <Notice tone={msg.tone} onClose={() => setMsg(null)}>{msg.text}</Notice>}
      {found?.length > 0 && (
        <div className="flex flex-col gap-2 rounded-xl border border-accent p-3">
          <p className="text-sm font-medium">{t("Formulas found. Tick the ones to keep; you can rename them.")}</p>
          <ul className="max-h-64 divide-y divide-line overflow-y-auto text-sm">
            {found.map((f, i) => (
              <li key={f.source} className="flex items-start gap-2 py-1.5">
                <input type="checkbox" checked={!!pick[i]} onChange={(e) => setPick({ ...pick, [i]: e.target.checked })} className="mt-1 h-4 w-4" />
                <span className="min-w-0 flex-1">
                  <input value={f.name} onChange={(e) => setFound(found.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                    className="w-full rounded border border-line px-1.5 py-0.5 font-medium" />
                  <span className="block font-mono text-xs">= {f.formula}</span>
                  <span className="block text-xs text-muted">
                    {Object.entries(f.labels).map(([k, v]) => `${k} = ${v}`).join(" · ")} · {f.source}
                  </span>
                  {f.problem && <span className="block text-xs text-amber-800">{t(f.problem)}</span>}
                </span>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Button onClick={save} disabled={busy || !Object.values(pick).some(Boolean)}>{t("Save ticked formulas")}</Button>
            <Button variant="ghost" onClick={() => setFound(null)}>{t("Cancel")}</Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- voice
/** Say the numbers ("fifteen point eight four, two point one four"); they fill A, B, C… in order.
 *  Hidden where the browser has no speech recognition. */
export function VoiceButton({ onNumbers }) {
  const { t, lang } = useT();
  const [on, setOn] = useState(false);
  const [ok, setOk] = useState(false);
  useEffect(() => setOk(typeof window !== "undefined" && !!(window.SpeechRecognition || window.webkitSpeechRecognition)), []);
  if (!ok) return null;
  const start = () => {
    const R = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new R();
    rec.lang = lang === "ta" ? "ta-IN" : "en-IN";
    rec.onresult = (e) => {
      const text = Array.from(e.results).map((r) => r[0].transcript).join(" ");
      const nums = (text.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/g) || []).slice(0, 8);
      if (nums.length) onNumbers(nums);
    };
    rec.onend = () => setOn(false);
    setOn(true);
    rec.start();
  };
  return (
    <Button variant="ghost" className={clsx("h-8", on && "border-accent text-accent")} onClick={start} title={t("Say the numbers; they fill A, B, C…")}>
      <Mic size={14} aria-hidden /> {on ? t("Listening…") : t("Speak")}
    </Button>
  );
}

// ---------------------------------------------------------------- tape out
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/** The tape as a working sheet: print it, or save it as PDF from the print box. */
export function printTape(rows, fmt, title) {
  const w = window.open("", "_blank", "width=600,height=800");
  if (!w) return;
  const body = rows.map((r) => `<tr><td>${esc(r.expr)}</td><td class="n">${esc(fmt(r.result))}</td></tr>`).join("");
  w.document.write(`<!doctype html><meta charset="utf-8"><title>${esc(title)}</title>
<style>body{font:14px system-ui,sans-serif;margin:24px}h1{font-size:18px}table{width:100%;border-collapse:collapse}
td{border-bottom:1px solid #ddd;padding:6px 4px;font-family:ui-monospace,monospace}.n{text-align:right;font-weight:600}</style>
<h1>${esc(title)}</h1><p>${esc(new Date().toLocaleString("en-IN"))}</p><table>${body}</table>`);
  w.document.close();
  w.focus();
  w.print();
}

/** The tape as a neat picture for WhatsApp. */
export async function shareTapePicture(rows, fmt, title) {
  const list = rows.slice(0, 14);
  const W = 1080;
  const H = 220 + list.length * 70 + 60;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const x = c.getContext("2d");
  x.fillStyle = "#fffaf3";
  x.fillRect(0, 0, W, H);
  x.fillStyle = "#9f1239";
  x.fillRect(0, 0, W, 150);
  x.fillStyle = "#fff";
  x.font = "bold 52px Poppins, system-ui, sans-serif";
  x.fillText(title.slice(0, 32), 60, 95);
  x.font = "30px Poppins, system-ui, sans-serif";
  x.fillText(new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }), 60, 135);
  list.forEach((r, i) => {
    const y = 220 + i * 70;
    x.fillStyle = "#4b5563";
    x.font = "30px ui-monospace, monospace";
    x.textAlign = "left";
    x.fillText(String(r.expr).slice(0, 40), 60, y);
    x.fillStyle = "#111827";
    x.font = "bold 36px Poppins, system-ui, sans-serif";
    x.textAlign = "right";
    x.fillText(`= ${fmt(r.result)}`, W - 60, y);
  });
  const blob = await new Promise((ok) => c.toBlob(ok, "image/png"));
  const file = new File([blob], "calculation.png", { type: "image/png" });
  try {
    if (navigator.canShare?.({ files: [file] })) return await navigator.share({ files: [file], text: title });
  } catch {
    return;
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------------------------------------------------------- photo of a slip
/** Take a photo of a printed slip; the numbers on each line are read in the browser (the photo
 *  is not sent anywhere) and shown for checking. onRows gets [[numbers of line 1], …];
 *  onText gets the numbers as text, one line each. Clear printed slips read best. */
export function SlipPhoto({ onRows, onText }) {
  const { t } = useT();
  const [busy, setBusy] = useState(null); // progress 0..100 while reading
  const [lines, setLines] = useState(null);
  const [error, setError] = useState(null);
  const fileRef = useRef(null);

  const read = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setBusy(0);
    try {
      const { recognize } = await import("tesseract.js");
      const { data } = await recognize(file, "eng", {
        logger: (m) => m.status === "recognizing text" && setBusy(Math.round(m.progress * 100)),
      });
      const rows = data.text.split("\n")
        .map((l) => (l.replace(/[₹,]/g, "").replace(/(\d)\s+\.(\d)/g, "$1.$2").match(/-?\d+(?:\.\d+)?/g) || []))
        .filter((nums) => nums.length);
      if (!rows.length) setError(t("No numbers could be read. Try a sharper, straight photo in good light."));
      setLines(rows);
    } catch (err) {
      setError(t("The photo couldn't be read: {e}", { e: err.message || String(err) }));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <Button variant="ghost" className="self-start" onClick={() => fileRef.current?.click()} disabled={busy !== null}>
        📷 {busy !== null ? t("Reading the slip… {p}%", { p: busy }) : t("Photo of a slip")}
      </Button>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={read} />
      {error && <Notice tone="error" onClose={() => setError(null)}>{error}</Notice>}
      {lines?.length > 0 && (
        <div className="flex flex-col gap-2 rounded-xl border border-accent p-3">
          <p className="text-sm font-medium">{t("{n} lines read. Check them, fix any number, then use them.", { n: lines.length })}</p>
          <div className="max-h-56 overflow-auto">
            <table className="text-sm tabular-nums">
              <tbody>
                {lines.map((nums, i) => (
                  <tr key={i} className="border-t border-line">
                    <td className="pr-2 text-xs text-muted">{i + 1}</td>
                    {nums.map((n, j) => (
                      <td key={j} className="p-0.5">
                        <input value={n} onChange={(e) => setLines(lines.map((r, a) => (a === i ? r.map((v, b) => (b === j ? e.target.value : v)) : r)))}
                          className="w-20 rounded border border-line px-1 text-right" aria-label={t("Line {i} number {j}", { i: i + 1, j: j + 1 })} />
                      </td>
                    ))}
                    <td><button onClick={() => setLines(lines.filter((_, a) => a !== i))} className="px-1 text-muted hover:text-red-700" aria-label={t("Remove line {i}", { i: i + 1 })}>✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-2">
            {onRows && <Button onClick={() => { onRows(lines); setLines(null); }}>{t("Put in the sheet")}</Button>}
            {onText && <Button onClick={() => { onText(lines.map((r) => r.join(" ")).join("\n")); setLines(null); }}>{t("Add to the list")}</Button>}
            <Button variant="ghost" onClick={() => setLines(null)}>{t("Cancel")}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
