"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Check, ClipboardList, CornerDownLeft, Image as ImageIcon, Plus, Printer, Receipt, Redo2, Save, Sparkles, Star, Trash2, Undo2, X } from "lucide-react";
import { isManager, useAuth } from "@/_shared/auth/AuthProvider";
import CameraScan from "@/_shared/components/CameraScan";
import { Button, Field, Input, Notice, Select } from "@/_shared/components/ui";
import { useT } from "@/_shared/i18n/LanguageProvider";
import { inventoryService } from "@/modules/inventory/inventoryService";
import { calcService, useLive, usePersist } from "./calcService";
import { ExcelImport, SlipPhoto, VoiceButton, printTape, shareTapePicture } from "./MathExtras";
import ExcelSheet, { SheetFiles, addRowsToBook } from "./ExcelSheet";

// Quick math, like the owner's Excel sheet but faster: type A and B and every common answer
// shows at once; write any Excel formula (with today's RATE, STONE, HUID); use the mini sheet;
// paste a list to add it up. Sums are exact (0.1 + 0.2 = 0.3) and errors read like Excel.
const LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H"];
const KEYS = ["+", "−", "×", "÷", "(", ")", "%", "^"];
const PAD = ["7", "8", "9", "4", "5", "6", "1", "2", "3", "0", ".", "⌫"];
const COMMON = ["SUM", "ROUND", "IF", "AVERAGE", "MAX", "MIN", "ROUNDUP", "ROUNDDOWN", "MROUND", "CEILING", "FLOOR",
  "INT", "MOD", "ABS", "SQRT", "POWER", "COUNT", "SUMPRODUCT"];
const LIVE = ["RATE", "RATE22", "STONE", "HUID"];
const TAG_FIELDS = [["net_weight", "Net"], ["gross_weight", "Gross"], ["stone_weight", "Less"], ["touch_percent", "%"], ["fine", "Fine"]];
const TAPE_KEY = "calc.tape";

/** Saved formulas grouped by folder; those without a folder come first. */
const groupFolders = (list) => {
  const m = new Map();
  list.forEach((f) => (m.get(f.folder || "") || m.set(f.folder || "", []).get(f.folder || "")).push(f));
  return [...m.entries()].sort(([a], [b]) => (a === "" ? -1 : b === "" ? 1 : a.localeCompare(b)));
};

/** A sum typed in plain words, turned into a formula the formula box understands. */
export function toFormula(text) {
  let s = String(text || "").toLowerCase().replace(/[₹,]/g, "").replace(/[\s=?]+$/, "").replace(/\s+/g, " ").trim();
  if (!s) return "";
  const n = "(-?\\d+(?:\\.\\d+)?)";
  const g = "\\s*(?:g|gm|gms|grams?)?\\s*";
  const rules = [
    [new RegExp(`^${n}${g}(?:at|@)\\s*${n}\\s*%?$`), (m) => `${m[1]}*${m[2]}/100*RATE`],     // 13.7 g at 103
    [new RegExp(`^${n}${g}fine$`), (m) => `${m[1]}*RATE`],                                     // 14.111 g fine
    [new RegExp(`^${n}${g}(?:stones?|less)$`), (m) => `${m[1]}*STONE`],                        // 2.14 g stone
    [new RegExp(`^${n}\\s*(?:pavan|pavun|sovereign|pvn)s?$`), (m) => `${m[1]}*8`],             // 3 pavan (in grams)
    [new RegExp(`^${n}\\s*tolas?$`), (m) => `${m[1]}*11.664`],                                 // 2 tola (in grams)
    [new RegExp(`^${n}\\s*%\\s*of\\s*${n}$`), (m) => `${m[2]}*${m[1]}/100`],                // 15% of 2000
    [new RegExp(`^${n}\\s*(?:huid|hallmarks?)$`), (m) => `${m[1]}*HUID`],                     // 30 huid
  ];
  for (const [re, f] of rules) {
    const m = s.match(re);
    if (m) return f(m);
  }
  return s.replace(/\bx\b|×/g, "*").replace(/\binto\b|\btimes\b/g, "*").replace(/\bplus\b/g, "+")
    .replace(/\bminus\b/g, "-").replace(/\bdivided by\b|÷/g, "/").replace(/\bgst\b/g, "3%")
    .replace(/\b(rate22|rate|stone|huid|ans)\b/g, (w) => w.toUpperCase()).replace(/(\d)\s*g\b/g, "$1");
}

// ---------------------------------------------------------------- numbers as text
// Answers come from the server as exact text ("30.06"); rounding and grouping are done on the
// text itself, so nothing goes through floating point.
function roundText(s, dec) {
  if (dec === "auto" || !/^-?\d+(\.\d+)?$/.test(s)) return s;
  const neg = s.startsWith("-");
  const [i, f = ""] = (neg ? s.slice(1) : s).split(".");
  if (f.length <= dec) return (neg ? "-" : "") + i + (dec ? "." + f.padEnd(dec, "0") : "");
  const digits = (i + f.slice(0, dec)).split("").map(Number);
  if (Number(f[dec]) >= 5) { // half up, away from zero, as Excel
    let k = digits.length - 1;
    while (k >= 0) {
      if (digits[k] < 9) { digits[k] += 1; break; }
      digits[k] = 0;
      k -= 1;
    }
    if (k < 0) digits.unshift(1);
  }
  const all = digits.join("");
  const ip = all.slice(0, all.length - dec) || "0";
  const out = dec ? `${ip}.${all.slice(all.length - dec)}` : ip;
  return (neg && /[1-9]/.test(out) ? "-" : "") + out;
}

/** Indian grouping: 1,02,345.50 */
function indian(s) {
  if (!/^-?\d+(\.\d+)?$/.test(s)) return s;
  const neg = s.startsWith("-");
  const [i, f] = (neg ? s.slice(1) : s).split(".");
  const head = i.length > 3 ? i.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + i.slice(-3) : i;
  return `${neg ? "−" : ""}${head}${f ? "." + f : ""}`;
}

const localTape = {
  get() {
    try {
      return JSON.parse(localStorage.getItem(TAPE_KEY)) || [];
    } catch {
      return [];
    }
  },
  set(list) {
    try {
      localStorage.setItem(TAPE_KEY, JSON.stringify(list));
    } catch {}
  },
};

export default function QuickMath({ onResult, wide = false }) {
  const { t } = useT();
  const { user } = useAuth();
  const manager = isManager(user);
  const [s, setS] = usePersist("tab.math", { values: { A: "", B: "" }, formula: "", dec: "auto", list: "", mode: "boxes", pad: false, tagField: "net_weight" });
  const set = (k, v) => setS((x) => ({ ...x, [k]: v }));
  const setVal = (k, v) => setS((x) => ({ ...x, values: { ...x.values, [k]: v } }));
  const [rows, setRows] = useState([]);          // the tape: [{expr, result}], on the person's account
  const [sheet, setSheet] = useState({});        // the mini sheet, on the person's account
  const [pins, setPins] = useState([]);          // pinned saved-formula ids
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState([]);
  const [live, setLive] = useState({});          // RATE, STONE, HUID… today's values
  const [saving, setSaving] = useState(null);    // {name, hint, labels} while saving a formula
  const [flash, setFlash] = useState(null);
  const [error, setError] = useState(null);
  const [excel, setExcel] = useState("");        // "Excel says" check
  const [tagCode, setTagCode] = useState("");
  const formulaRef = useRef(null);
  const [cmd, setCmd] = useState("");
  const [fq, setFq] = useState(""); // search in saved formulas
  const [moreAns, setMoreAns] = useState(false);
  const undoStack = useRef([]);
  const redoStack = useRef([]);
  const lastSnap = useRef(null);
  const skipSnap = useRef(false);
  const [, setTick] = useState(0);
  const boxRefs = useRef({});

  // Load this person's tape, sheet and pins (falling back to what this device had), the saved formulas and live values.
  useEffect(() => {
    calcService.me().then((me) => {
      setRows(me.tape?.length ? me.tape : localTape.get());
      setSheet(me.sheet || null);
      setPins(me.pins || []);
    }).catch(() => setRows(localTape.get())).finally(() => setLoaded(true));
    const loadLive = () => calcService.presets().then((p) => setLive(p.live || {})).catch(() => {});
    loadLive();
    const poll = setInterval(loadLive, 60000); // RATE / STONE / HUID follow Settings during the day
    return () => clearInterval(poll);
  }, []);
  const loadSaved = () => calcService.savedFormulas().then(setSaved).catch(() => setSaved([]));
  useEffect(() => {
    loadSaved();
  }, []);
  // Save them back a moment after each change.
  useEffect(() => {
    if (!loaded) return;
    localTape.set(rows);
    const timer = setTimeout(() => calcService.saveMe({ tape: rows, sheet, pins }).catch(() => {}), 800);
    return () => clearTimeout(timer);
  }, [rows, sheet, pins, loaded]);

  const letters = Object.keys(s.values);
  const ans = rows[0]?.result;
  const filled = Object.fromEntries(Object.entries(s.values).filter(([, v]) => v !== ""));
  const values = { ...filled, ...(ans && /^-?\d/.test(ans) ? { ANS: ans } : {}) };
  const dec = s.dec === "auto" ? "auto" : Number(s.dec);
  const fmt = (v) => indian(roundText(v, dec));
  const plain = (v) => roundText(v, dec);

  const activeSaved = saved.find((f) => f.formula.replace(/\s/g, "").toUpperCase() === s.formula.trim().replace(/^=/, "").replace(/\s/g, "").toUpperCase());
  const boxLabel = (k) => activeSaved?.labels?.[k];

  // 1. Every common answer for A and B at once.
  const ready = s.values.A !== "" && s.values.B !== "" && !isNaN(Number(s.values.A)) && !isNaN(Number(s.values.B));
  const grid = useLive(ready && s.mode === "boxes" ? () => calcService.grid(s.values.A, s.values.B) : null, [s.values.A, s.values.B, s.mode]);

  // 2. The formula box, worked out as you type.
  const liveRes = useLive(s.formula.trim() && s.mode === "boxes" ? () => calcService.formula(s.formula, values) : null, [s.formula, JSON.stringify(values), s.mode]);
  const res = liveRes.res;

  // 4. Pasted list.
  const stats = useLive(s.list.trim() ? () => calcService.stats(s.list) : null, [s.list]);

  const withNumbers = (f) => f.replace(/\b([A-H]|ANS)\b/gi, (m) => values[m.toUpperCase()] ?? m).replace(/\*/g, " × ").replace(/\//g, " ÷ ");
  useEffect(() => {
    onResult(res?.status === "ok" && s.mode === "boxes"
      ? { title: activeSaved?.name || "Quick math", rows: [], total: [withNumbers(res.formula_used), fmt(res.result)] }
      : null);
  }, [res, s.dec, s.mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const copy = async (label, v) => {
    try {
      await navigator.clipboard.writeText(plain(v)); // a plain number pastes cleanly into Excel
      setFlash(label);
      setTimeout(() => setFlash(null), 1200);
    } catch {}
  };
  const addTape = (expr, result) => setRows((rs) => [{ expr, result }, ...rs.filter((r) => !(r.expr === expr && r.result === result))].slice(0, 50));
  const tapAnswer = (label, expr, v) => {
    copy(label, v);
    addTape(expr, v);
  };

  // Typing in the formula box: insert at the cursor (keypad, number pad, function chips).
  const insert = (text) => {
    const el = formulaRef.current;
    const at = el ? el.selectionStart ?? s.formula.length : s.formula.length;
    const end = el ? el.selectionEnd ?? at : at;
    const next = text === "⌫" ? s.formula.slice(0, Math.max(0, at - (at === end ? 1 : 0))) + s.formula.slice(end) : s.formula.slice(0, at) + text + s.formula.slice(end);
    set("formula", next);
    requestAnimationFrame(() => {
      el?.focus();
      const pos = text === "⌫" ? Math.max(0, at - (at === end ? 1 : 0)) : at + text.length - (text.endsWith("()") ? 1 : 0);
      el?.setSelectionRange(pos, pos);
    });
  };
  const word = (s.formula.slice(0, formulaRef.current?.selectionStart ?? s.formula.length).match(/[A-Za-z]{2,}$/) || [""])[0].toUpperCase();
  const suggestions = word ? [...COMMON, ...LIVE].filter((f) => f.startsWith(word) && f !== word) : [];
  const pickFunction = (f) => {
    const el = formulaRef.current;
    const at = el?.selectionStart ?? s.formula.length;
    const start = at - word.length;
    const add = LIVE.includes(f) ? f : `${f}()`;
    set("formula", s.formula.slice(0, start) + add + s.formula.slice(at));
    requestAnimationFrame(() => {
      el?.focus();
      const pos = start + add.length - (add.endsWith("()") ? 1 : 0);
      el?.setSelectionRange(pos, pos);
    });
  };

  // More boxes when a formula needs them.
  const addBox = () => {
    const next = LETTERS.find((l) => !(l in s.values));
    if (next) setS((x) => ({ ...x, values: { ...x.values, [next]: "" } }));
  };
  const removeBox = (k) => setS((x) => {
    const v = { ...x.values };
    delete v[k];
    return { ...x, values: v };
  });
  const fillBoxes = (nums) => setS((x) => {
    const v = { ...x.values };
    nums.forEach((n, i) => (v[LETTERS[i]] = n));
    return { ...x, values: v };
  });

  // Scan a tag (or type its code): its net / gross / less / % / fine goes into the first empty box.
  const fromTag = async (raw) => {
    const code = raw.trim().toUpperCase();
    if (!code) return;
    setError(null);
    try {
      const p = await inventoryService.getPieceByCode(code);
      const v = s.tagField === "fine"
        ? (p.touch_percent != null ? String(Math.round(p.net_weight * p.touch_percent * 10) / 1000) : null)
        : p[s.tagField] != null ? String(p[s.tagField]) : null;
      if (v === null) return setError(t("{code} has no %.", { code }));
      const box = letters.find((k) => s.values[k] === "") || "A";
      setVal(box, v);
      setTagCode("");
    } catch (err) {
      setError(err.message);
    }
  };

  // Enter moves on: A → B → … → formula; Enter in the formula keeps the answer on the tape.
  const onBoxKey = (k) => (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const nextKey = letters[letters.indexOf(k) + 1];
    if (nextKey) boxRefs.current[nextKey]?.focus();
    else formulaRef.current?.focus();
  };
  const onFormulaKey = (e) => {
    if (e.key === "Enter" && res?.status === "ok") {
      e.preventDefault();
      addTape(withNumbers(res.formula_used), res.result);
    }
    if (e.key === "Tab" && suggestions.length) {
      e.preventDefault();
      pickFunction(suggestions[0]);
    }
  };

  // Saved formulas: save (with box names and a worked example), use, pin, update, undo, remove.
  const startSave = () => setSaving({ name: "", hint: "", labels: Object.fromEntries(usedLetters().map((l) => [l, ""])) });
  const usedLetters = () => LETTERS.filter((l) => new RegExp(`(?<![A-Za-z_0-9])${l}(?![A-Za-z_0-9(])`, "i").test(s.formula));
  const saveFormula = async () => {
    setError(null);
    try {
      await calcService.saveFormula({ name: saving.name, formula: s.formula, hint: saving.hint || null, labels: saving.labels, example: filled, folder: saving.folder || null });
      setSaving(null);
      loadSaved();
    } catch (err) {
      setError(err.message);
    }
  };
  const applySaved = (f) => {
    setS((x) => ({ ...x, mode: "boxes", formula: f.formula, values: { ...Object.fromEntries(f.letters.map((l) => [l, x.values[l] ?? ""])), ...x.values } }));
    requestAnimationFrame(() => boxRefs.current[f.letters[0]]?.focus());
  };
  const togglePin = (f) => setPins((p) => (p.includes(f.id) ? p.filter((x) => x !== f.id) : [...p, f.id].slice(0, 12)));
  const removeSaved = async (f) => {
    if (!window.confirm(t("Remove the saved formula {n}?", { n: f.name }))) return;
    await calcService.deleteFormula(f.id).catch((e) => setError(e.message));
    loadSaved();
  };
  const updateSaved = async (f) => {
    try {
      await calcService.editFormula(f.id, { formula: s.formula });
      set("editId", null);
      loadSaved();
    } catch (err) {
      setError(err.message);
    }
  };
  const undoSaved = async (f) => {
    try {
      const back = await calcService.undoFormula(f.id);
      set("formula", back.formula);
      loadSaved();
    } catch (err) {
      setError(err.message);
    }
  };
  const editing = saved.find((f) => f.id === s.editId); // the saved formula being changed (its text is in the box)

  const pinned = saved.filter((f) => pins.includes(f.id));
  const excelSame = excel.trim() && res?.status === "ok"
    ? roundText(res.result, Math.max(0, (excel.replace(/,/g, "").split(".")[1] || "").length)) === excel.replace(/,/g, "").trim()
    : null;

  useEffect(() => {
    const snap = JSON.stringify({ values: s.values, formula: s.formula });
    if (skipSnap.current) {
      skipSnap.current = false;
      lastSnap.current = snap;
      return;
    }
    const timer = setTimeout(() => {
      if (lastSnap.current && lastSnap.current !== snap) {
        undoStack.current = [...undoStack.current, lastSnap.current].slice(-100);
        redoStack.current = [];
        setTick((n) => n + 1);
      }
      lastSnap.current = snap;
    }, 400);
    return () => clearTimeout(timer);
  }, [s.values, s.formula]); // eslint-disable-line react-hooks/exhaustive-deps
  const restore = (snap) => {
    const o = JSON.parse(snap);
    skipSnap.current = true;
    setS((x) => ({ ...x, values: o.values, formula: o.formula }));
    setTick((n) => n + 1);
  };
  const undo = () => {
    const prev = undoStack.current.pop();
    if (prev) { redoStack.current.push(lastSnap.current); restore(prev); }
  };
  const redo = () => {
    const next = redoStack.current.pop();
    if (next) { undoStack.current.push(lastSnap.current); restore(next); }
  };
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || s.mode === "sheet") return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      else if (k === "y" || (k === "z" && e.shiftKey)) { e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  const runCmd = () => {
    const f = toFormula(cmd);
    if (!f) return;
    setS((x) => ({ ...x, mode: "boxes", formula: f }));
    setCmd("");
  };

  const Answer = ({ label, expr, v, err, big }) => (
    <button type="button" disabled={!v} onClick={() => tapAnswer(label, expr, v)}
      className={clsx("flex flex-col items-start rounded-xl border px-3 py-2 text-left transition hover:border-accent",
        flash === label ? "border-green-600 bg-green-50" : "border-line bg-surface", big && "col-span-2")}>
      <span className="text-xs text-muted">{t(label)}</span>
      <span className={clsx("tabular-nums font-semibold", big ? "text-3xl text-accent sm:text-4xl" : "text-lg", err && "text-red-700")}>{err || (v ? fmt(v) : "—")}</span>
      {big && expr && <span className="mt-0.5 break-all font-mono text-xs text-muted">{expr}</span>}
      {flash === label && <span className="text-[11px] text-green-700"><Check size={11} className="inline" aria-hidden /> {t("Copied")}</span>}
    </button>
  );

  // On the Calculator page: the work on the left; pinned, saved formulas and the tape always in view on the right.
  if (wide) {
    return (
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4">
      {/* Boxes or sheet; decimals */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex rounded-lg bg-canvas p-0.5 text-sm" role="group">
          {[["boxes", t("Boxes")], ["sheet", t("Sheet")]].map(([k, label]) => (
            <button key={k} type="button" onClick={() => set("mode", k)}
              className={clsx("rounded-md px-3 py-1", s.mode === k ? "bg-surface font-semibold shadow-sm" : "text-muted")}>{label}</button>
          ))}
        </span>
        <span className="flex gap-1">
          <button type="button" onClick={undo} disabled={!undoStack.current.length} title={t("Undo") + " (Ctrl+Z)"} aria-label={t("Undo")}
            className="rounded-lg p-1.5 text-muted hover:bg-canvas disabled:opacity-30"><Undo2 size={16} /></button>
          <button type="button" onClick={redo} disabled={!redoStack.current.length} title={t("Redo") + " (Ctrl+Y)"} aria-label={t("Redo")}
            className="rounded-lg p-1.5 text-muted hover:bg-canvas disabled:opacity-30"><Redo2 size={16} /></button>
        </span>
        <span className="ml-auto flex items-center gap-1 rounded-lg bg-canvas p-0.5 text-xs" role="group" aria-label={t("Decimals")}>
          {[["auto", t("Exact")], ["0", "0"], ["2", "0.00"], ["3", "0.000"]].map(([k, label]) => (
            <button key={k} type="button" onClick={() => set("dec", k)}
              className={clsx("rounded-md px-2 py-1", s.dec === k ? "bg-accent text-white" : "text-muted")}>{label}</button>
          ))}
        </span>
      </div>

      <div className="flex items-center gap-2 rounded-xl border border-accent/40 bg-surface px-3 focus-within:border-accent">
        <Sparkles size={16} className="shrink-0 text-accent" aria-hidden />
        <input value={cmd} onChange={(e) => setCmd(e.target.value)} onKeyDown={(e) => e.key === "Enter" && runCmd()}
          placeholder={t("Type a sum: 13.7 g at 103 · 15180 x 14.111 · 2.14 g stone")} aria-label={t("Type a sum")}
          className="h-11 min-w-0 flex-1 bg-transparent text-base outline-none" />
        {cmd && <span className="hidden shrink-0 font-mono text-xs text-muted sm:inline">= {toFormula(cmd)}</span>}
      </div>
      {s.mode === "sheet" ? (
        <>
          <SlipPhoto onRows={(lines) => setSheet((book) => addRowsToBook(book, lines))} />
          <SheetFiles book={sheet} onOpen={setSheet} />
          <ExcelSheet book={sheet} onChange={setSheet} />
        </>
      ) : (
        <>
          {/* Boxes A, B (and C… when needed), named by the saved formula in use */}
          <div className="grid grid-cols-2 gap-3">
            {letters.map((k) => (
              <Field key={k} label={boxLabel(k) ? `${k} · ${boxLabel(k)}` : k}>
                <span className="flex gap-1">
                  <Input ref={(el) => (boxRefs.current[k] = el)} type="text" inputMode="decimal" value={s.values[k]}
                    onChange={(e) => setVal(k, e.target.value.replace(/[^\d.\-]/g, ""))} onKeyDown={onBoxKey(k)}
                    className="h-11 text-right text-lg tabular-nums" aria-label={t("Box {k}", { k })} />
                  {k !== "A" && k !== "B" && (
                    <button type="button" onClick={() => removeBox(k)} className="px-1 text-muted hover:text-red-700" aria-label={t("Remove box {k}", { k })}><X size={14} /></button>
                  )}
                </span>
              </Field>
            ))}
          </div>
          <div className="-mt-2 flex flex-wrap items-center gap-2 text-sm">
            {letters.length < LETTERS.length && (
              <Button variant="ghost" className="h-8" onClick={addBox}><Plus size={14} aria-hidden /> {t("Add box {k}", { k: LETTERS.find((l) => !(l in s.values)) })}</Button>
            )}
            {ans && (
              <Button variant="ghost" className="h-8" onClick={() => setVal("A", ans)} title={t("Put the last answer in A")}>
                <CornerDownLeft size={14} aria-hidden /> {t("Last answer → A")} <span className="font-mono text-xs">({fmt(ans)})</span>
              </Button>
            )}
            <VoiceButton onNumbers={fillBoxes} />
          </div>

          {/* A tag's weight straight into a box */}
          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-canvas p-2 text-sm">
            <span className="text-xs text-muted">{t("Tag → box")}</span>
            <Input value={tagCode} onChange={(e) => setTagCode(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === "Enter" && fromTag(tagCode)}
              placeholder="CH0010" className="h-9 w-28 font-mono" aria-label={t("Tag code")} />
            <Select value={s.tagField} onChange={(e) => set("tagField", e.target.value)} className="h-9 w-24" aria-label={t("Which number")}>
              {TAG_FIELDS.map(([k, label]) => <option key={k} value={k}>{t(label)}</option>)}
            </Select>
            <CameraScan onCode={fromTag} className="h-9" label={t("Scan")} />
          </div>

          {/* 1. All the answers for A and B */}
          {ready ? (
            grid.error ? <Notice tone="error">{grid.error}</Notice> : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {(grid.res || []).filter((g, i) => moreAns || i < 4).map((g) => (
                    <Answer key={g.key} label={g.label} expr={g.label.replace(/\bA\b/g, s.values.A).replace(/\bB\b/g, s.values.B)} v={g.result} err={g.error} />
                  ))}
                </div>
                <button type="button" onClick={() => setMoreAns((v) => !v)} className="-mt-2 self-start text-xs font-medium text-accent hover:underline">
                  {moreAns ? t("Fewer answers") : t("More answers (%, average, rounding…)")}
                </button>
              </>
            )
          ) : <p className="rounded-xl border border-dashed border-line p-3 text-center text-sm text-muted">{t("Type A and B to see every answer at once. Tap an answer to copy it.")}</p>}

          {/* 2. Formula box */}
          <div className="flex flex-col gap-2 rounded-xl bg-canvas p-3">
            <label className="text-sm font-medium" htmlFor="calc-formula">{t("Formula (like Excel)")}</label>
            <div className="flex items-center gap-1 rounded-lg border border-line bg-surface px-2 focus-within:border-accent">
              <span className="font-mono text-muted">=</span>
              <input id="calc-formula" ref={formulaRef} value={s.formula} onChange={(e) => set("formula", e.target.value)} onKeyDown={onFormulaKey}
                placeholder="ROUND(A * B / 100, 2)" spellCheck={false} autoComplete="off" className="h-11 min-w-0 flex-1 bg-transparent font-mono text-base outline-none" />
              {s.formula && <button type="button" onClick={() => set("formula", "")} className="text-muted" aria-label={t("Clear formula")}><X size={16} /></button>}
            </div>
            {suggestions.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {suggestions.slice(0, 6).map((f) => (
                  <button key={f} type="button" onClick={() => pickFunction(f)} className="rounded-md border border-accent bg-accent-soft px-2 py-0.5 font-mono text-xs text-accent">{f}{LIVE.includes(f) ? "" : "("} <span className="text-muted">Tab</span></button>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-1">
              {KEYS.map((k) => (
                <button key={k} type="button" onClick={() => insert(k === "−" ? "-" : k === "×" ? "*" : k === "÷" ? "/" : k)}
                  className="h-9 min-w-9 rounded-lg border border-line bg-surface px-2 font-mono text-base hover:bg-accent-soft">{k}</button>
              ))}
              {letters.map((k) => (
                <button key={k} type="button" onClick={() => insert(k)} className="h-9 min-w-9 rounded-lg border border-line bg-surface px-2 font-mono font-semibold text-accent hover:bg-accent-soft">{k}</button>
              ))}
              {["SUM", "ROUND", "IF"].map((f) => (
                <button key={f} type="button" onClick={() => insert(`${f}()`)} className="h-9 rounded-lg border border-line bg-surface px-2 font-mono text-xs hover:bg-accent-soft">{f}</button>
              ))}
              <button type="button" onClick={() => set("pad", !s.pad)} className={clsx("h-9 rounded-lg border px-2 text-xs", s.pad ? "border-accent text-accent" : "border-line bg-surface")}>{t("Number pad")}</button>
            </div>
            {/* Today's values, usable in any formula */}
            <div className="flex flex-wrap gap-1">
              {LIVE.map((k) => (
                <button key={k} type="button" onClick={() => insert(k)} disabled={!live[k]} title={live[k] ? `${k} = ${live[k]}` : t("Not set in Settings")}
                  className="h-8 rounded-lg border border-line bg-surface px-2 font-mono text-xs hover:bg-accent-soft disabled:opacity-40">
                  {k} <span className="text-muted">{live[k] ? indian(live[k]) : "—"}</span>
                </button>
              ))}
            </div>
            {s.pad && (
              <div className="grid grid-cols-3 gap-1">
                {PAD.map((k) => (
                  <button key={k} type="button" onClick={() => insert(k)} className="h-12 rounded-lg border border-line bg-surface text-xl font-semibold hover:bg-accent-soft">{k}</button>
                ))}
              </div>
            )}
            {s.formula.trim() && (
              liveRes.error ? <Notice tone="error">{liveRes.error}</Notice> : res && (
                res.status === "ok" ? (
                  <>
                    <Answer big label={activeSaved ? activeSaved.name : "Answer"} expr={withNumbers(res.formula_used)} v={res.result} />
                    {/* Weight helpers, and sending the answer on */}
                    <div className="flex flex-wrap gap-1 text-xs">
                      {[["÷ 8", "/8", "g → pavan"], ["× 8", "*8", "pavan → g"], ["÷ 11.664", "/11.664", "g → tola"]].map(([label, op, title]) => (
                        <button key={op} type="button" title={t(title)} onClick={() => set("formula", `(${s.formula.replace(/^=/, "")})${op}`)}
                          className="rounded-md border border-line bg-surface px-2 py-1 hover:bg-accent-soft">{label} <span className="text-muted">{t(title)}</span></button>
                      ))}
                      <Link href={`/billing/new?rate=${encodeURIComponent(plain(res.result))}`} className="inline-flex items-center gap-1 rounded-md border border-line bg-surface px-2 py-1 hover:bg-accent-soft">
                        <Receipt size={12} aria-hidden /> {t("New bill at this rate")}
                      </Link>
                    </div>
                    {/* Check against Excel */}
                    <label className="flex items-center gap-2 text-xs text-muted">
                      {t("Excel says")}
                      <input value={excel} onChange={(e) => setExcel(e.target.value)} inputMode="decimal" className="h-8 w-28 rounded-md border border-line bg-surface px-2 text-right font-mono" />
                      {excelSame === true && <span className="font-semibold text-green-700">✓ {t("Same")}</span>}
                      {excelSame === false && <span className="font-semibold text-red-700">✗ {t("Different: we get {v}", { v: fmt(res.result) })}</span>}
                    </label>
                  </>
                ) : (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2">
                    <div className="font-mono text-lg font-bold text-red-700">{res.error}</div>
                    <div className="text-xs text-red-800">{t(res.hint || "")}</div>
                  </div>
                )
              )
            )}
            <p className="text-[11px] text-muted">{t("Enter keeps the answer on the tape. ANS is the last answer. 15% means 0.15.")}</p>
          </div>

        </>
      )}
      {/* 4. Add up a pasted list */}
      <details className="rounded-xl border border-line p-3" open={!!s.list}>
        <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium"><ClipboardList size={15} aria-hidden /> {t("Add up a list")}</summary>
        <div className="mt-2"><SlipPhoto onText={(text) => set("list", (s.list ? s.list + "\n" : "") + text)} /></div>
        <textarea value={s.list} onChange={(e) => set("list", e.target.value)} rows={4} placeholder={t("Paste a column from Excel or a WhatsApp message")}
          className="mt-2 w-full rounded-lg border border-line bg-surface px-3 py-2 font-mono text-sm outline-none focus:border-accent" />
        {stats.res && stats.res.count > 0 && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Answer big label="Total" expr={`SUM of ${stats.res.count}`} v={stats.res.sum} />
            <Answer label="Count" expr="COUNT" v={String(stats.res.count)} />
            <Answer label="Average" expr={`AVERAGE of ${stats.res.count}`} v={stats.res.average} />
            <Answer label="Smallest" expr="MIN" v={stats.res.min} />
            <Answer label="Biggest" expr="MAX" v={stats.res.max} />
          </div>
        )}
        {stats.res && stats.res.count === 0 && <p className="mt-2 text-xs text-muted">{t("No numbers found.")}</p>}
      </details>

        </div>
        <aside className="flex flex-col gap-4 xl:sticky xl:top-4">
          {/* Pinned formulas first */}
          {pinned.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {pinned.map((f) => (
                <button key={f.id} type="button" onClick={() => applySaved(f)}
                  className={clsx("rounded-xl border px-3 py-2 text-left text-sm font-semibold", activeSaved?.id === f.id ? "border-accent bg-accent-soft text-accent" : "border-line bg-surface hover:border-accent")}>
                  <Star size={12} className="mr-1 inline fill-current" aria-hidden />{f.name}
                </button>
              ))}
            </div>
          )}

          {/* 3. Saved formulas: one tap for everyone */}
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium">{t("Saved formulas")}</span>
              {manager && s.formula.trim() && res?.status === "ok" && !activeSaved && !saving && (
                <span className="flex gap-3">
                  {editing && <Button variant="link" onClick={() => updateSaved(editing)}>{t("Update {n}", { n: editing.name })}</Button>}
                  <Button variant="link" onClick={startSave}><Save size={14} aria-hidden /> {t("Save this formula")}</Button>
                </span>
              )}
            </div>
            {saving && (
              <div className="flex flex-col gap-2 rounded-xl border border-accent p-3">
                <Field label={t("Name")}><Input value={saving.name} onChange={(e) => setSaving({ ...saving, name: e.target.value })} placeholder={t("e.g. Stone charge")} autoFocus maxLength={60} /></Field>
                <Field label={t("Folder")} hint={t("Optional, e.g. Stones, Exchange")}>
                  <Input value={saving.folder || ""} onChange={(e) => setSaving({ ...saving, folder: e.target.value })} list="calc-folders" maxLength={60} />
                  <datalist id="calc-folders">{[...new Set(saved.map((f) => f.folder).filter(Boolean))].map((f) => <option key={f} value={f} />)}</datalist>
                </Field>
                {Object.keys(saving.labels).length > 0 && (
                  <div className="grid grid-cols-2 gap-2">
                    {Object.keys(saving.labels).map((l) => (
                      <Field key={l} label={t("Box {k} is", { k: l })}>
                        <Input value={saving.labels[l]} onChange={(e) => setSaving({ ...saving, labels: { ...saving.labels, [l]: e.target.value } })} placeholder={t("e.g. Less (g)")} maxLength={40} />
                      </Field>
                    ))}
                  </div>
                )}
                <Field label={t("Note")} hint={t("Optional")}><Input value={saving.hint} onChange={(e) => setSaving({ ...saving, hint: e.target.value })} maxLength={200} /></Field>
                <p className="text-xs text-muted">{t("The numbers in the boxes now are kept as a worked example.")}</p>
                <div className="flex gap-2">
                  <Button onClick={saveFormula} disabled={saving.name.trim().length < 2}>{t("Save")}</Button>
                  <Button variant="ghost" onClick={() => setSaving(null)}>{t("Cancel")}</Button>
                </div>
              </div>
            )}
            {error && <Notice tone="error" onClose={() => setError(null)}>{error}</Notice>}
            {saved.length > 6 && (
              <Input value={fq} onChange={(e) => setFq(e.target.value)} placeholder={t("Search formulas")} className="h-8" />
            )}
            {saved.length === 0 ? (
              <p className="text-xs text-muted">{manager ? t("Write a formula you use often, then press Save this formula. It becomes a button for all staff.") : t("The owner can save formulas here for everyone.")}</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {groupFolders(saved.filter((f) => !fq || `${f.name} ${f.folder || ""} ${f.formula}`.toLowerCase().includes(fq.toLowerCase()))).map(([folder, list]) => (
                  <span key={folder || "-"} className="flex w-full flex-wrap items-center gap-1.5">
                    {folder && <span className="w-full text-[11px] font-semibold uppercase tracking-wide text-muted">{folder}</span>}
                {list.map((f) => (
                  <span key={f.id} className={clsx("inline-flex items-center rounded-full border text-sm", activeSaved?.id === f.id ? "border-accent bg-accent-soft text-accent" : "border-line bg-surface")}>
                    <button type="button" onClick={() => togglePin(f)} className="pl-2 text-muted hover:text-accent" aria-label={t("Pin {n}", { n: f.name })}>
                      <Star size={12} className={pins.includes(f.id) ? "fill-current text-accent" : ""} />
                    </button>
                    <button type="button" onClick={() => applySaved(f)} className="px-2 py-1" title={`= ${f.formula}`}>{f.name}</button>
                    {manager && <button type="button" onClick={() => removeSaved(f)} className="pr-2 text-muted hover:text-red-700" aria-label={t("Remove {n}", { n: f.name })}><X size={12} /></button>}
                  </span>
                ))}
                  </span>
                ))}
              </div>
            )}
            {activeSaved && (
              <div className="rounded-lg bg-canvas px-3 py-2 text-xs text-muted">
                <div className="font-mono">= {activeSaved.formula}</div>
                {activeSaved.hint && <div>{activeSaved.hint}</div>}
                {activeSaved.example && (
                  <div>{t("Example")}: {Object.entries(activeSaved.example.values).map(([k, v]) => `${activeSaved.labels?.[k] || k} ${v}`).join(", ")} → <b className="text-ink">{fmt(activeSaved.example.result)}</b></div>
                )}
                {manager && (
                  <div className="mt-1 flex gap-3">
                    <Button variant="link" className="h-auto p-0 text-xs" onClick={() => set("editId", activeSaved.id)}>{t("Change this formula")}</Button>
                    {activeSaved.versions > 0 && <Button variant="link" className="h-auto p-0 text-xs" onClick={() => undoSaved(activeSaved)}><Undo2 size={12} aria-hidden /> {t("Undo last change")}</Button>}
                  </div>
                )}
              </div>
            )}
            {editing && !activeSaved && <p className="text-xs text-accent">{t("Changing {n}: edit the formula above, then press Update.", { n: editing.name })} <button className="underline" onClick={() => set("editId", null)}>{t("Cancel")}</button></p>}
            {manager && <ExcelImport onSaved={loadSaved} />}
          </div>
      {/* 6. The tape, on the person's account: print it, share it as a picture */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">{t("Tape")}</span>
          {rows.length > 0 && (
            <span className="flex gap-3">
              <Button variant="link" className="text-muted" onClick={() => printTape(rows, fmt, t("Calculation"))}><Printer size={13} aria-hidden /> {t("Print")}</Button>
              <Button variant="link" className="text-muted" onClick={() => shareTapePicture(rows, fmt, t("Calculation"))}><ImageIcon size={13} aria-hidden /> {t("Picture")}</Button>
              <Button variant="link" className="text-muted" onClick={() => setRows([])}><Trash2 size={13} aria-hidden /> {t("Clear")}</Button>
            </span>
          )}
        </div>
        {rows.length === 0 ? (
          <p className="text-xs text-muted">{t("Answers you tap or keep with Enter are listed here, on every device you sign in on. Tap one to put it in A.")}</p>
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {rows.map((r, i) => (
              <li key={`${r.expr}-${i}`}>
                <button type="button" onClick={() => { set("mode", "boxes"); setVal("A", r.result); }} className="flex w-full items-baseline justify-between gap-3 px-3 py-1.5 text-left hover:bg-canvas" title={t("Put in A")}>
                  <span className="truncate font-mono text-xs text-muted">{r.expr}</span>
                  <span className="shrink-0 font-semibold tabular-nums">= {fmt(r.result)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
        </aside>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Boxes or sheet; decimals */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex rounded-lg bg-canvas p-0.5 text-sm" role="group">
          {[["boxes", t("Boxes")], ["sheet", t("Sheet")]].map(([k, label]) => (
            <button key={k} type="button" onClick={() => set("mode", k)}
              className={clsx("rounded-md px-3 py-1", s.mode === k ? "bg-surface font-semibold shadow-sm" : "text-muted")}>{label}</button>
          ))}
        </span>
        <span className="flex gap-1">
          <button type="button" onClick={undo} disabled={!undoStack.current.length} title={t("Undo") + " (Ctrl+Z)"} aria-label={t("Undo")}
            className="rounded-lg p-1.5 text-muted hover:bg-canvas disabled:opacity-30"><Undo2 size={16} /></button>
          <button type="button" onClick={redo} disabled={!redoStack.current.length} title={t("Redo") + " (Ctrl+Y)"} aria-label={t("Redo")}
            className="rounded-lg p-1.5 text-muted hover:bg-canvas disabled:opacity-30"><Redo2 size={16} /></button>
        </span>
        <span className="ml-auto flex items-center gap-1 rounded-lg bg-canvas p-0.5 text-xs" role="group" aria-label={t("Decimals")}>
          {[["auto", t("Exact")], ["0", "0"], ["2", "0.00"], ["3", "0.000"]].map(([k, label]) => (
            <button key={k} type="button" onClick={() => set("dec", k)}
              className={clsx("rounded-md px-2 py-1", s.dec === k ? "bg-accent text-white" : "text-muted")}>{label}</button>
          ))}
        </span>
      </div>

      <div className="flex items-center gap-2 rounded-xl border border-accent/40 bg-surface px-3 focus-within:border-accent">
        <Sparkles size={16} className="shrink-0 text-accent" aria-hidden />
        <input value={cmd} onChange={(e) => setCmd(e.target.value)} onKeyDown={(e) => e.key === "Enter" && runCmd()}
          placeholder={t("Type a sum: 13.7 g at 103 · 15180 x 14.111 · 2.14 g stone")} aria-label={t("Type a sum")}
          className="h-11 min-w-0 flex-1 bg-transparent text-base outline-none" />
        {cmd && <span className="hidden shrink-0 font-mono text-xs text-muted sm:inline">= {toFormula(cmd)}</span>}
      </div>
      {s.mode === "sheet" ? (
        <>
          <SlipPhoto onRows={(lines) => setSheet((book) => addRowsToBook(book, lines))} />
          <SheetFiles book={sheet} onOpen={setSheet} />
          <ExcelSheet book={sheet} onChange={setSheet} />
        </>
      ) : (
        <>
          {/* Pinned formulas first */}
          {pinned.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {pinned.map((f) => (
                <button key={f.id} type="button" onClick={() => applySaved(f)}
                  className={clsx("rounded-xl border px-3 py-2 text-left text-sm font-semibold", activeSaved?.id === f.id ? "border-accent bg-accent-soft text-accent" : "border-line bg-surface hover:border-accent")}>
                  <Star size={12} className="mr-1 inline fill-current" aria-hidden />{f.name}
                </button>
              ))}
            </div>
          )}

          {/* Boxes A, B (and C… when needed), named by the saved formula in use */}
          <div className="grid grid-cols-2 gap-3">
            {letters.map((k) => (
              <Field key={k} label={boxLabel(k) ? `${k} · ${boxLabel(k)}` : k}>
                <span className="flex gap-1">
                  <Input ref={(el) => (boxRefs.current[k] = el)} type="text" inputMode="decimal" value={s.values[k]}
                    onChange={(e) => setVal(k, e.target.value.replace(/[^\d.\-]/g, ""))} onKeyDown={onBoxKey(k)}
                    className="h-11 text-right text-lg tabular-nums" aria-label={t("Box {k}", { k })} />
                  {k !== "A" && k !== "B" && (
                    <button type="button" onClick={() => removeBox(k)} className="px-1 text-muted hover:text-red-700" aria-label={t("Remove box {k}", { k })}><X size={14} /></button>
                  )}
                </span>
              </Field>
            ))}
          </div>
          <div className="-mt-2 flex flex-wrap items-center gap-2 text-sm">
            {letters.length < LETTERS.length && (
              <Button variant="ghost" className="h-8" onClick={addBox}><Plus size={14} aria-hidden /> {t("Add box {k}", { k: LETTERS.find((l) => !(l in s.values)) })}</Button>
            )}
            {ans && (
              <Button variant="ghost" className="h-8" onClick={() => setVal("A", ans)} title={t("Put the last answer in A")}>
                <CornerDownLeft size={14} aria-hidden /> {t("Last answer → A")} <span className="font-mono text-xs">({fmt(ans)})</span>
              </Button>
            )}
            <VoiceButton onNumbers={fillBoxes} />
          </div>

          {/* A tag's weight straight into a box */}
          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-canvas p-2 text-sm">
            <span className="text-xs text-muted">{t("Tag → box")}</span>
            <Input value={tagCode} onChange={(e) => setTagCode(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === "Enter" && fromTag(tagCode)}
              placeholder="CH0010" className="h-9 w-28 font-mono" aria-label={t("Tag code")} />
            <Select value={s.tagField} onChange={(e) => set("tagField", e.target.value)} className="h-9 w-24" aria-label={t("Which number")}>
              {TAG_FIELDS.map(([k, label]) => <option key={k} value={k}>{t(label)}</option>)}
            </Select>
            <CameraScan onCode={fromTag} className="h-9" label={t("Scan")} />
          </div>

          {/* 1. All the answers for A and B */}
          {ready ? (
            grid.error ? <Notice tone="error">{grid.error}</Notice> : (
              <>
                <div className="grid grid-cols-2 gap-2">
                  {(grid.res || []).filter((g, i) => moreAns || i < 4).map((g) => (
                    <Answer key={g.key} label={g.label} expr={g.label.replace(/\bA\b/g, s.values.A).replace(/\bB\b/g, s.values.B)} v={g.result} err={g.error} />
                  ))}
                </div>
                <button type="button" onClick={() => setMoreAns((v) => !v)} className="-mt-2 self-start text-xs font-medium text-accent hover:underline">
                  {moreAns ? t("Fewer answers") : t("More answers (%, average, rounding…)")}
                </button>
              </>
            )
          ) : <p className="rounded-xl border border-dashed border-line p-3 text-center text-sm text-muted">{t("Type A and B to see every answer at once. Tap an answer to copy it.")}</p>}

          {/* 2. Formula box */}
          <div className="flex flex-col gap-2 rounded-xl bg-canvas p-3">
            <label className="text-sm font-medium" htmlFor="calc-formula">{t("Formula (like Excel)")}</label>
            <div className="flex items-center gap-1 rounded-lg border border-line bg-surface px-2 focus-within:border-accent">
              <span className="font-mono text-muted">=</span>
              <input id="calc-formula" ref={formulaRef} value={s.formula} onChange={(e) => set("formula", e.target.value)} onKeyDown={onFormulaKey}
                placeholder="ROUND(A * B / 100, 2)" spellCheck={false} autoComplete="off" className="h-11 min-w-0 flex-1 bg-transparent font-mono text-base outline-none" />
              {s.formula && <button type="button" onClick={() => set("formula", "")} className="text-muted" aria-label={t("Clear formula")}><X size={16} /></button>}
            </div>
            {suggestions.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {suggestions.slice(0, 6).map((f) => (
                  <button key={f} type="button" onClick={() => pickFunction(f)} className="rounded-md border border-accent bg-accent-soft px-2 py-0.5 font-mono text-xs text-accent">{f}{LIVE.includes(f) ? "" : "("} <span className="text-muted">Tab</span></button>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-1">
              {KEYS.map((k) => (
                <button key={k} type="button" onClick={() => insert(k === "−" ? "-" : k === "×" ? "*" : k === "÷" ? "/" : k)}
                  className="h-9 min-w-9 rounded-lg border border-line bg-surface px-2 font-mono text-base hover:bg-accent-soft">{k}</button>
              ))}
              {letters.map((k) => (
                <button key={k} type="button" onClick={() => insert(k)} className="h-9 min-w-9 rounded-lg border border-line bg-surface px-2 font-mono font-semibold text-accent hover:bg-accent-soft">{k}</button>
              ))}
              {["SUM", "ROUND", "IF"].map((f) => (
                <button key={f} type="button" onClick={() => insert(`${f}()`)} className="h-9 rounded-lg border border-line bg-surface px-2 font-mono text-xs hover:bg-accent-soft">{f}</button>
              ))}
              <button type="button" onClick={() => set("pad", !s.pad)} className={clsx("h-9 rounded-lg border px-2 text-xs", s.pad ? "border-accent text-accent" : "border-line bg-surface")}>{t("Number pad")}</button>
            </div>
            {/* Today's values, usable in any formula */}
            <div className="flex flex-wrap gap-1">
              {LIVE.map((k) => (
                <button key={k} type="button" onClick={() => insert(k)} disabled={!live[k]} title={live[k] ? `${k} = ${live[k]}` : t("Not set in Settings")}
                  className="h-8 rounded-lg border border-line bg-surface px-2 font-mono text-xs hover:bg-accent-soft disabled:opacity-40">
                  {k} <span className="text-muted">{live[k] ? indian(live[k]) : "—"}</span>
                </button>
              ))}
            </div>
            {s.pad && (
              <div className="grid grid-cols-3 gap-1">
                {PAD.map((k) => (
                  <button key={k} type="button" onClick={() => insert(k)} className="h-12 rounded-lg border border-line bg-surface text-xl font-semibold hover:bg-accent-soft">{k}</button>
                ))}
              </div>
            )}
            {s.formula.trim() && (
              liveRes.error ? <Notice tone="error">{liveRes.error}</Notice> : res && (
                res.status === "ok" ? (
                  <>
                    <Answer big label={activeSaved ? activeSaved.name : "Answer"} expr={withNumbers(res.formula_used)} v={res.result} />
                    {/* Weight helpers, and sending the answer on */}
                    <div className="flex flex-wrap gap-1 text-xs">
                      {[["÷ 8", "/8", "g → pavan"], ["× 8", "*8", "pavan → g"], ["÷ 11.664", "/11.664", "g → tola"]].map(([label, op, title]) => (
                        <button key={op} type="button" title={t(title)} onClick={() => set("formula", `(${s.formula.replace(/^=/, "")})${op}`)}
                          className="rounded-md border border-line bg-surface px-2 py-1 hover:bg-accent-soft">{label} <span className="text-muted">{t(title)}</span></button>
                      ))}
                      <Link href={`/billing/new?rate=${encodeURIComponent(plain(res.result))}`} className="inline-flex items-center gap-1 rounded-md border border-line bg-surface px-2 py-1 hover:bg-accent-soft">
                        <Receipt size={12} aria-hidden /> {t("New bill at this rate")}
                      </Link>
                    </div>
                    {/* Check against Excel */}
                    <label className="flex items-center gap-2 text-xs text-muted">
                      {t("Excel says")}
                      <input value={excel} onChange={(e) => setExcel(e.target.value)} inputMode="decimal" className="h-8 w-28 rounded-md border border-line bg-surface px-2 text-right font-mono" />
                      {excelSame === true && <span className="font-semibold text-green-700">✓ {t("Same")}</span>}
                      {excelSame === false && <span className="font-semibold text-red-700">✗ {t("Different: we get {v}", { v: fmt(res.result) })}</span>}
                    </label>
                  </>
                ) : (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2">
                    <div className="font-mono text-lg font-bold text-red-700">{res.error}</div>
                    <div className="text-xs text-red-800">{t(res.hint || "")}</div>
                  </div>
                )
              )
            )}
            <p className="text-[11px] text-muted">{t("Enter keeps the answer on the tape. ANS is the last answer. 15% means 0.15.")}</p>
          </div>

          {/* 3. Saved formulas: one tap for everyone */}
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium">{t("Saved formulas")}</span>
              {manager && s.formula.trim() && res?.status === "ok" && !activeSaved && !saving && (
                <span className="flex gap-3">
                  {editing && <Button variant="link" onClick={() => updateSaved(editing)}>{t("Update {n}", { n: editing.name })}</Button>}
                  <Button variant="link" onClick={startSave}><Save size={14} aria-hidden /> {t("Save this formula")}</Button>
                </span>
              )}
            </div>
            {saving && (
              <div className="flex flex-col gap-2 rounded-xl border border-accent p-3">
                <Field label={t("Name")}><Input value={saving.name} onChange={(e) => setSaving({ ...saving, name: e.target.value })} placeholder={t("e.g. Stone charge")} autoFocus maxLength={60} /></Field>
                <Field label={t("Folder")} hint={t("Optional, e.g. Stones, Exchange")}>
                  <Input value={saving.folder || ""} onChange={(e) => setSaving({ ...saving, folder: e.target.value })} list="calc-folders" maxLength={60} />
                  <datalist id="calc-folders">{[...new Set(saved.map((f) => f.folder).filter(Boolean))].map((f) => <option key={f} value={f} />)}</datalist>
                </Field>
                {Object.keys(saving.labels).length > 0 && (
                  <div className="grid grid-cols-2 gap-2">
                    {Object.keys(saving.labels).map((l) => (
                      <Field key={l} label={t("Box {k} is", { k: l })}>
                        <Input value={saving.labels[l]} onChange={(e) => setSaving({ ...saving, labels: { ...saving.labels, [l]: e.target.value } })} placeholder={t("e.g. Less (g)")} maxLength={40} />
                      </Field>
                    ))}
                  </div>
                )}
                <Field label={t("Note")} hint={t("Optional")}><Input value={saving.hint} onChange={(e) => setSaving({ ...saving, hint: e.target.value })} maxLength={200} /></Field>
                <p className="text-xs text-muted">{t("The numbers in the boxes now are kept as a worked example.")}</p>
                <div className="flex gap-2">
                  <Button onClick={saveFormula} disabled={saving.name.trim().length < 2}>{t("Save")}</Button>
                  <Button variant="ghost" onClick={() => setSaving(null)}>{t("Cancel")}</Button>
                </div>
              </div>
            )}
            {error && <Notice tone="error" onClose={() => setError(null)}>{error}</Notice>}
            {saved.length > 6 && (
              <Input value={fq} onChange={(e) => setFq(e.target.value)} placeholder={t("Search formulas")} className="h-8" />
            )}
            {saved.length === 0 ? (
              <p className="text-xs text-muted">{manager ? t("Write a formula you use often, then press Save this formula. It becomes a button for all staff.") : t("The owner can save formulas here for everyone.")}</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {groupFolders(saved.filter((f) => !fq || `${f.name} ${f.folder || ""} ${f.formula}`.toLowerCase().includes(fq.toLowerCase()))).map(([folder, list]) => (
                  <span key={folder || "-"} className="flex w-full flex-wrap items-center gap-1.5">
                    {folder && <span className="w-full text-[11px] font-semibold uppercase tracking-wide text-muted">{folder}</span>}
                {list.map((f) => (
                  <span key={f.id} className={clsx("inline-flex items-center rounded-full border text-sm", activeSaved?.id === f.id ? "border-accent bg-accent-soft text-accent" : "border-line bg-surface")}>
                    <button type="button" onClick={() => togglePin(f)} className="pl-2 text-muted hover:text-accent" aria-label={t("Pin {n}", { n: f.name })}>
                      <Star size={12} className={pins.includes(f.id) ? "fill-current text-accent" : ""} />
                    </button>
                    <button type="button" onClick={() => applySaved(f)} className="px-2 py-1" title={`= ${f.formula}`}>{f.name}</button>
                    {manager && <button type="button" onClick={() => removeSaved(f)} className="pr-2 text-muted hover:text-red-700" aria-label={t("Remove {n}", { n: f.name })}><X size={12} /></button>}
                  </span>
                ))}
                  </span>
                ))}
              </div>
            )}
            {activeSaved && (
              <div className="rounded-lg bg-canvas px-3 py-2 text-xs text-muted">
                <div className="font-mono">= {activeSaved.formula}</div>
                {activeSaved.hint && <div>{activeSaved.hint}</div>}
                {activeSaved.example && (
                  <div>{t("Example")}: {Object.entries(activeSaved.example.values).map(([k, v]) => `${activeSaved.labels?.[k] || k} ${v}`).join(", ")} → <b className="text-ink">{fmt(activeSaved.example.result)}</b></div>
                )}
                {manager && (
                  <div className="mt-1 flex gap-3">
                    <Button variant="link" className="h-auto p-0 text-xs" onClick={() => set("editId", activeSaved.id)}>{t("Change this formula")}</Button>
                    {activeSaved.versions > 0 && <Button variant="link" className="h-auto p-0 text-xs" onClick={() => undoSaved(activeSaved)}><Undo2 size={12} aria-hidden /> {t("Undo last change")}</Button>}
                  </div>
                )}
              </div>
            )}
            {editing && !activeSaved && <p className="text-xs text-accent">{t("Changing {n}: edit the formula above, then press Update.", { n: editing.name })} <button className="underline" onClick={() => set("editId", null)}>{t("Cancel")}</button></p>}
            {manager && <ExcelImport onSaved={loadSaved} />}
          </div>
        </>
      )}
      {/* 4. Add up a pasted list */}
      <details className="rounded-xl border border-line p-3" open={!!s.list}>
        <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium"><ClipboardList size={15} aria-hidden /> {t("Add up a list")}</summary>
        <div className="mt-2"><SlipPhoto onText={(text) => set("list", (s.list ? s.list + "\n" : "") + text)} /></div>
        <textarea value={s.list} onChange={(e) => set("list", e.target.value)} rows={4} placeholder={t("Paste a column from Excel or a WhatsApp message")}
          className="mt-2 w-full rounded-lg border border-line bg-surface px-3 py-2 font-mono text-sm outline-none focus:border-accent" />
        {stats.res && stats.res.count > 0 && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Answer big label="Total" expr={`SUM of ${stats.res.count}`} v={stats.res.sum} />
            <Answer label="Count" expr="COUNT" v={String(stats.res.count)} />
            <Answer label="Average" expr={`AVERAGE of ${stats.res.count}`} v={stats.res.average} />
            <Answer label="Smallest" expr="MIN" v={stats.res.min} />
            <Answer label="Biggest" expr="MAX" v={stats.res.max} />
          </div>
        )}
        {stats.res && stats.res.count === 0 && <p className="mt-2 text-xs text-muted">{t("No numbers found.")}</p>}
      </details>

      {/* 6. The tape, on the person's account: print it, share it as a picture */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">{t("Tape")}</span>
          {rows.length > 0 && (
            <span className="flex gap-3">
              <Button variant="link" className="text-muted" onClick={() => printTape(rows, fmt, t("Calculation"))}><Printer size={13} aria-hidden /> {t("Print")}</Button>
              <Button variant="link" className="text-muted" onClick={() => shareTapePicture(rows, fmt, t("Calculation"))}><ImageIcon size={13} aria-hidden /> {t("Picture")}</Button>
              <Button variant="link" className="text-muted" onClick={() => setRows([])}><Trash2 size={13} aria-hidden /> {t("Clear")}</Button>
            </span>
          )}
        </div>
        {rows.length === 0 ? (
          <p className="text-xs text-muted">{t("Answers you tap or keep with Enter are listed here, on every device you sign in on. Tap one to put it in A.")}</p>
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {rows.map((r, i) => (
              <li key={`${r.expr}-${i}`}>
                <button type="button" onClick={() => { set("mode", "boxes"); setVal("A", r.result); }} className="flex w-full items-baseline justify-between gap-3 px-3 py-1.5 text-left hover:bg-canvas" title={t("Put in A")}>
                  <span className="truncate font-mono text-xs text-muted">{r.expr}</span>
                  <span className="shrink-0 font-semibold tabular-nums">= {fmt(r.result)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
