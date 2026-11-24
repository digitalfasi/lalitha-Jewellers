"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import "@fortune-sheet/react/dist/index.css";
import { Button, Input } from "@/_shared/components/ui";
import { useT } from "@/_shared/i18n/LanguageProvider";
import { calcService } from "./calcService";

// A real spreadsheet, like Excel: select and drag, copy / paste with Excel, fill down, insert and
// delete rows and columns, resize, bold and colours, number formats, sort, freeze, several sheets,
// AutoSum and hundreds of functions. The workbook is saved to the person's account.
const Workbook = dynamic(() => import("@fortune-sheet/react").then((m) => m.Workbook), {
  ssr: false,
  loading: () => <p className="p-4 text-sm text-muted">Loading the sheet…</p>,
});

const COLS = "ABCDEFGHIJ";
const blank = () => [{ name: "Sheet1", celldata: [], order: 0, row: 100, column: 26, status: 1 }];

/** The saved workbook ({sheets}), or the older small sheet ({A1: "13.7"}), as Fortune sheets. */
export function toSheets(book) {
  if (Array.isArray(book?.sheets) && book.sheets.length) return book.sheets;
  const old = Object.entries(book || {}).filter(([k, v]) => /^[A-J]\d{1,2}$/i.test(k) && v);
  if (!old.length) return blank();
  const celldata = old.map(([k, v]) => {
    const r = Number(k.slice(1)) - 1;
    const c = COLS.indexOf(k[0].toUpperCase());
    const text = String(v);
    return { r, c, v: text.startsWith("=") ? { f: text } : { v: isNaN(Number(text)) ? text : Number(text), m: text } };
  });
  return [{ ...blank()[0], celldata }];
}

/** Numbers read from a slip photo, added under what is already on the first sheet. */
export function addRowsToBook(book, lines) {
  const sheets = toSheets(book).map((s) => ({ ...s }));
  const s0 = sheets[0];
  const cell = (n) => ({ v: Number(n), m: String(n), ct: { fa: "General", t: "n" } });
  if (Array.isArray(s0.data)) {
    const data = s0.data.map((row) => (row ? [...row] : row));
    let r = data.length;
    while (r > 0 && !(data[r - 1] || []).some((x) => x && x.v !== undefined && x.v !== null && x.v !== "")) r -= 1;
    lines.forEach((nums, i) => {
      data[r + i] = data[r + i] ? [...data[r + i]] : [];
      nums.forEach((n, j) => (data[r + i][j] = cell(n)));
    });
    s0.data = data;
  } else {
    const start = (s0.celldata || []).reduce((m, x) => Math.max(m, x.r + 1), 0);
    s0.celldata = [...(s0.celldata || []), ...lines.flatMap((nums, i) => nums.map((n, j) => ({ r: start + i, c: j, v: cell(n) })))];
  }
  return { sheets };
}

export default function ExcelSheet({ book, onChange }) {
  const [version, setVersion] = useState(0);
  const emitted = useRef(null);
  const timer = useRef(null);
  // A change from outside (a slip photo, a saved sheet opened) shows by starting the sheet afresh.
  useEffect(() => {
    if (book !== emitted.current) setVersion((v) => v + 1);
  }, [book]);
  const save = (sheets) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const next = { sheets };
      emitted.current = next;
      onChange(next);
    }, 600);
  };
  return (
    <div className="h-[68vh] min-h-[420px] w-full overflow-hidden rounded-xl border border-line bg-white">
      <Workbook key={version} data={toSheets(book)} onChange={save} lang="en" />
    </div>
  );
}

/** Save the workbook under a name ("Getti stones 20 Oct") for everyone, and open saved ones. */
export function SheetFiles({ book, onOpen }) {
  const { t } = useT();
  const [list, setList] = useState(null);
  const [name, setName] = useState("");
  const [msg, setMsg] = useState(null);
  const [current, setCurrent] = useState(null); // {id, title} of the sheet opened or saved
  const load = () => calcService.items("SHEET").then(setList).catch(() => setList([]));
  const save = async (asNew) => {
    const title = (asNew ? name : current?.title || name).trim();
    if (!title) return;
    const id = !asNew && current ? current.id : crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
    try {
      await calcService.saveItem(id, { kind: "SHEET", title, data: book && book.sheets ? book : { sheets: toSheets(book) } });
      setCurrent({ id, title });
      setName("");
      setMsg(t("Saved as {n}.", { n: title }));
      if (list) load();
    } catch (err) {
      setMsg(err.message);
    }
  };
  const open = async (it) => {
    const full = await calcService.item(it.id).catch(() => null);
    if (full) {
      onOpen(full.data);
      setCurrent({ id: it.id, title: it.title });
      setList(null);
    }
  };
  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        {current && <span className="font-medium">📄 {current.title}</span>}
        {current && <Button variant="ghost" className="h-8" onClick={() => save(false)}>{t("Save")}</Button>}
        <Input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save(true)}
          placeholder={t("Name, e.g. Getti stones 20 Oct")} className="h-8 w-56" maxLength={150} />
        <Button variant="ghost" className="h-8" onClick={() => save(true)} disabled={!name.trim()}>{t("Save sheet as")}</Button>
        <Button variant="ghost" className="h-8" onClick={() => (list ? setList(null) : load())}>{t("Open a saved sheet")}</Button>
      </div>
      {msg && <span className="text-xs text-muted">{msg}</span>}
      {list && (
        list.length === 0 ? <p className="text-xs text-muted">{t("No saved sheets yet.")}</p> : (
          <ul className="max-h-48 divide-y divide-line overflow-y-auto rounded-lg border border-line">
            {list.map((it) => (
              <li key={it.id} className="flex items-center gap-2 px-3 py-1.5">
                <button onClick={() => open(it)} className="min-w-0 flex-1 truncate text-left font-medium hover:text-accent">{it.title}</button>
                <span className="shrink-0 text-xs text-muted">{new Date(it.updated_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}{it.created_by_name ? ` · ${it.created_by_name}` : ""}</span>
                <button onClick={() => calcService.deleteItem(it.id).then(load)} className="text-xs text-muted hover:text-red-700">{t("Delete")}</button>
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  );
}
