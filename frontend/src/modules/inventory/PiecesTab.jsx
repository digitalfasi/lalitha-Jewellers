"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import CameraScan from "@/_shared/components/CameraScan";
import { Camera, History, Pencil, Plus, Printer, RotateCcw, Tag, Trash2 } from "lucide-react";
import { mediaUrl } from "@/_shared/api/client";
import { isManager, useAuth } from "@/_shared/auth/AuthProvider";
import Drawer from "@/_shared/components/Drawer";
import RowMenu from "@/_shared/components/RowMenu";
import Tip from "@/_shared/components/Tip";
import { Button, Card, Input, Notice, PurityBadge, Select, StatusPill } from "@/_shared/components/ui";
import { useT } from "@/_shared/i18n/LanguageProvider";
import { comboService } from "@/modules/combos/comboService";
import { useTagPrinter } from "@/modules/tags/TagPrinter";
import { grams, inventoryService } from "./inventoryService";
import PieceForm from "./PieceForm";
import { CodeKindSwitch, CodeMark, useCodeKind } from "@/modules/tags/CodeMark";
import PieceHistory from "./PieceHistory";

const TAG_NOTE = { NEW: "Tag not printed", COMBO_CHANGED: "Reprint tag: combo changed" };
const shortName = (p) => (p.design_name ? `${p.design_name} ${p.category_name.toLowerCase()}` : p.name);
const PAGE = 50;

// One grid for the header and every row, so columns line up. On a laptop it
// fits without sideways scrolling; below "lg" a row becomes two lines.
// The columns follow the trade's own slip: gross - less = net, net x % = fine.
const ROW = "grid items-center gap-x-3 px-3 grid-cols-[24px_48px_minmax(0,1fr)_auto] lg:grid-cols-[24px_48px_minmax(0,2fr)_128px_48px_repeat(5,minmax(0,0.75fr))_minmax(0,1.2fr)_auto]";
const fineOf = (p) => (p.touch_percent != null ? (Number(p.net_weight) * Number(p.touch_percent)) / 100 : null);
const sumOf = (items, f) => items.reduce((a, p) => a + (Number(f(p)) || 0), 0);

export default function PiecesTab({ categories, onChanged, lot, onClearLot }) {
  const { t } = useT();
  const { user } = useAuth();
  const params = useSearchParams();
  const router = useRouter();
  const pickMode = params.get("pick") === "1";
  const pieceParam = params.get("piece");
  const { printTags, printer } = useTagPrinter();
  const [codeKind, setCodeKind] = useCodeKind();

  const [filters, setFilters] = useState({ q: "", category_id: "", design_id: "", status: "IN_STOCK" });
  const [subs, setSubs] = useState([]); // sub-categories of the chosen category
  const [query, setQuery] = useState(""); // debounced copy of filters.q
  const [page, setPage] = useState(0);
  const [data, setData] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState(null);
  const [history, setHistory] = useState(null);
  const [form, setForm] = useState(null); // null = closed, {} = add, {piece} = edit
  const [picked, setPicked] = useState({}); // item_code -> piece, for "Make a combo"
  const [setName, setSetName] = useState("");
  const [making, setMaking] = useState(false);
  const photoInput = useRef(null);
  const [photoFor, setPhotoFor] = useState(null);

  useEffect(() => {
    if (!pieceParam) return;
    inventoryService.getPieceByCode(pieceParam).then(setHistory).catch((e) => setNotice({ tone: "error", text: e.message }));
  }, [pieceParam]);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(filters.q.trim()), 250);
    return () => clearTimeout(timer);
  }, [filters.q]);

  const load = useCallback(() => {
    setLoading(true);
    inventoryService
      .listPieces({ q: query, category_id: filters.category_id, design_id: filters.design_id, status: filters.status, lot_id: lot?.id, limit: PAGE, offset: page * PAGE })
      .then(setData)
      .catch((e) => setNotice({ tone: "error", text: e.message }))
      .finally(() => setLoading(false));
  }, [query, filters.category_id, filters.design_id, filters.status, lot?.id, page]);

  useEffect(() => {
    if (!filters.category_id) return setSubs([]);
    inventoryService.listDesigns(filters.category_id).then((l) => setSubs(l.filter((d) => d.is_active))).catch(() => setSubs([]));
  }, [filters.category_id]);
  useEffect(load, [load]);
  // Marking tags as printed (from the print bar) refreshes the badges.
  useEffect(() => {
    window.addEventListener("tags:changed", load);
    return () => window.removeEventListener("tags:changed", load);
  }, [load]);

  const setFilter = (k) => (e) => {
    // A new category clears the sub-category, which belongs to the old one.
    setFilters((f) => ({ ...f, [k]: e.target.value, ...(k === "category_id" ? { design_id: "" } : {}) }));
    setPage(0);
  };

  // A scanned tag opens that piece (or its combo). A USB scanner types into the search box and presses Enter.
  const openCode = async (raw) => {
    const code = raw.trim().toUpperCase();
    if (!code) return;
    if (code.startsWith("CB")) return router.push(`/combos?code=${code}`);
    try {
      const p = await inventoryService.getPieceByCode(code);
      setFilters({ q: code, category_id: "", design_id: "", status: "" }); // show it, whatever was filtered
      setPage(0);
      setHistory(p);
    } catch (err) {
      setNotice({ tone: "error", text: err.message });
    }
  };

  const onSaved = (p, wasEdit, printAfter) => {
    setNotice({ tone: "ok", text: wasEdit ? t("{code} updated.", { code: p.item_code }) : t("Added {code} — {name}, net {net} g.", { code: p.item_code, name: p.name, net: grams(p.net_weight) }) });
    if (wasEdit) setForm(null); // after adding, the panel stays open for the next piece
    load();
    onChanged();
    if (!wasEdit && printAfter) printTags([p.item_code]);
  };

  const onSetSaved = (combo, printAfter) => {
    const codes = combo.pieces.map((x) => x.item_code);
    setNotice({ tone: "ok", text: t("Combo {set} saved: {codes}.", { set: combo.combo_code, codes: codes.join(" + ") }) });
    load();
    onChanged();
    if (printAfter) printTags([combo.combo_code, ...codes]);
  };

  const pickedList = Object.values(picked);
  const togglePick = (p) => setPicked((m) => {
    const next = { ...m };
    if (next[p.item_code]) delete next[p.item_code];
    else next[p.item_code] = p;
    return next;
  });
  const makeSet = async () => {
    setMaking(true);
    try {
      const combo = await comboService.create({
        piece_codes: pickedList.map((x) => x.item_code),
        name: setName || pickedList.map(shortName).join(" + "),
      });
      setPicked({});
      setSetName("");
      setNotice({ tone: "ok", text: t("Combo {set} made from {codes}. Print the new tags so the combo shows on their backs.", { set: combo.combo_code, codes: combo.pieces.map((x) => x.item_code).join(" + ") }) });
      load();
      printTags([combo.combo_code, ...combo.pieces.map((x) => x.item_code)]);
    } catch (err) {
      setNotice({ tone: "error", text: err.message });
    } finally {
      setMaking(false);
    }
  };

  const setStatus = async (p, status) => {
    try {
      const saved = await inventoryService.updatePiece(p.id, { status });
      setNotice({ tone: "ok", text: status === "INACTIVE" ? t("{code} is now retired.", { code: saved.item_code }) : t("{code} is back in stock.", { code: saved.item_code }) });
      load();
    } catch (err) {
      setNotice({ tone: "error", text: err.message });
    }
  };

  // One hidden file picker for the whole list (a menu closes before a file is chosen).
  const choosePhoto = (p) => {
    setPhotoFor(p);
    photoInput.current?.click();
  };
  const onPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !photoFor) return;
    try {
      await inventoryService.uploadPhoto(photoFor.id, file);
      setNotice({ tone: "ok", text: t("Photo saved for {code}.", { code: photoFor.item_code }) });
      load();
    } catch (err) {
      setNotice({ tone: "error", text: err.message });
    }
  };

  const pages = Math.max(1, Math.ceil(data.total / PAGE));

  return (
    <div className="flex flex-col gap-3">
      {/* Filters + the main action, kept at the top while the list scrolls. */}
      <div className="sticky top-0 z-20 -mx-1 flex flex-wrap items-center gap-2 bg-canvas px-1 py-2">
        <Input value={filters.q} onChange={setFilter("q")} onKeyDown={(e) => e.key === "Enter" && /^[A-Za-z]{2,3}\d{3,}$/.test(filters.q.trim()) && openCode(filters.q)}
          placeholder={t("Search or scan code, name or HUID")} className="h-10 min-w-48 flex-1 sm:max-w-xs" aria-label={t("Search")} />
        <CameraScan onCode={openCode} className="h-10" label={t("Scan")} />
        <Select value={filters.category_id} onChange={setFilter("category_id")} className="h-10 w-40" aria-label={t("Category")}>
          <option value="">{t("All categories")}</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Select value={filters.design_id} onChange={setFilter("design_id")} className="h-10 w-40" aria-label={t("Sub-category")}
          disabled={!filters.category_id} title={!filters.category_id ? t("Choose a category first") : undefined}>
          <option value="">{t("All sub-categories")}</option>
          {subs.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </Select>
        <Select value={filters.status} onChange={setFilter("status")} className="h-10 w-36" aria-label={t("Status")}>
          <option value="IN_STOCK">{t("In stock")}</option>
          <option value="INACTIVE">{t("Inactive")}</option>
          <option value="SOLD">{t("Sold")}</option>
          <option value="">{t("Any status")}</option>
        </Select>
        {lot && (
          <span className="inline-flex items-center gap-2 rounded-full bg-accent-soft px-3 py-1 text-sm text-accent">
            {t("Lot")} {lot.lot_no}
            <button onClick={onClearLot} aria-label={t("Show all lots")} className="text-xs">✕</button>
          </span>
        )}
        {lot && data.items.length > 0 && (
          <Button variant="link" onClick={() => printTags(data.items.filter((p) => p.status === "IN_STOCK").map((p) => p.item_code))}>
            {t("Print tags for this lot")}
          </Button>
        )}
        <Button onClick={() => setForm({})} className="ml-auto h-10 px-4 text-base">
          <Plus size={18} aria-hidden /> {t("Add stock")}
        </Button>
      </div>

      {notice && <Notice tone={notice.tone} onClose={() => setNotice(null)}>{notice.text}</Notice>}
      {pickMode ? (
        <div className="rounded-xl border border-accent bg-accent-soft px-4 py-3 text-sm">
          {t("To make a combo: tick the box next to each piece (for example a chain and a pendant), then press Make a combo.")}
        </div>
      ) : (
        <Tip id="pieces">{t("Tick the box next to pieces to make a combo or print their tags. A yellow badge means the tag still needs printing.")}</Tip>
      )}

      {pickedList.length > 0 && (
        <div className="sticky top-14 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-accent bg-accent-soft px-3 py-2 text-sm shadow-sm">
          <b>{t("{n} picked:", { n: pickedList.length })}</b>
          <span className="font-mono">{pickedList.map((x) => x.item_code).join(" + ")}</span>
          {pickedList.length >= 2 && (
            <Input value={setName} onChange={(e) => setSetName(e.target.value)} placeholder={pickedList.map(shortName).join(" + ")}
              className="h-9 w-64 bg-surface" aria-label={t("Combo name")} />
          )}
          <span className="ml-auto flex gap-2">
            <Button onClick={makeSet} disabled={making || pickedList.length < 2} title={pickedList.length < 2 ? t("Pick at least 2 pieces") : undefined}>
              {making ? t("Making…") : t("Make a combo")}
            </Button>
            <Button variant="ghost" onClick={() => printTags(pickedList.map((x) => x.item_code))}>{t("Print tags")}</Button>
            <Button variant="link" onClick={() => setPicked({})}>{t("Clear")}</Button>
          </span>
        </div>
      )}

      <Card className="overflow-hidden">
        <div className={`${ROW} hidden border-b border-line bg-canvas py-2 text-xs font-medium uppercase tracking-wide text-muted lg:grid`}>
          <span />
          <span />
          <span>{t("Piece")}</span>
          <span><CodeKindSwitch kind={codeKind} onChange={setCodeKind} /></span>
          <span>{t("Purity")}</span>
          <span className="text-right">{t("Gross")}</span>
          <span className="text-right">{t("Less")}</span>
          <span className="text-right">{t("Net")}</span>
          <span className="text-right">%</span>
          <span className="text-right">{t("Fine")}</span>
          <span>{t("Status")}</span>
          <span className="w-[84px]" />
        </div>

        {!loading && data.items.length === 0 && (
          <p className="px-4 py-10 text-center text-muted">
            {categories.length === 0 ? t("Add a category first, then add pieces.") : t("No pieces match.")}
          </p>
        )}

        <ul className="divide-y divide-line">
          {data.items.map((p) => {
            const canPick = p.status === "IN_STOCK" && (!p.combo_code || picked[p.item_code]);
            const chips = (
              <div className="flex flex-wrap items-center gap-1.5">
                {p.status !== "IN_STOCK" && <StatusPill status={p.status} />}
                {TAG_NOTE[p.tag_state] && (
                  <button onClick={() => printTags([p.item_code])} title={`${t(TAG_NOTE[p.tag_state])} — ${t("Print it now")}`}
                    className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 hover:bg-amber-200">
                    <Tag size={12} aria-hidden /> {p.tag_state === "NEW" ? t("Tag needed") : t("Reprint tag")}
                  </button>
                )}
                {p.combo_code && (
                  <Link href={`/combos?code=${p.combo_code}`} title={t("In combo {set}", { set: p.combo_code })}
                    className="rounded-full bg-accent-soft px-2 py-0.5 font-mono text-xs text-accent hover:underline">
                    {p.combo_code}
                  </Link>
                )}
              </div>
            );
            const fine = fineOf(p);
            return (
              <li key={p.id} className={`${ROW} py-2 ${picked[p.item_code] ? "bg-accent-soft/40" : "hover:bg-canvas/60"}`}>
                <span>
                  {p.status === "IN_STOCK" && (
                    <input type="checkbox" checked={!!picked[p.item_code]} onChange={() => togglePick(p)} disabled={!canPick}
                      className="h-5 w-5" title={p.combo_code ? t("Already in combo {set}", { set: p.combo_code }) : t("Pick for a combo or tag printing")}
                      aria-label={t("Pick {code}", { code: p.item_code })} />
                  )}
                </span>
                <button onClick={() => setHistory(p)} className="h-12 w-12 overflow-hidden rounded-lg bg-canvas" aria-label={t("History")}>
                  {p.photo_url && <img src={mediaUrl(p.photo_url)} alt="" className="h-full w-full object-cover" loading="lazy" />}
                </button>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold">{p.item_code}</span>
                    <span className="lg:hidden"><PurityBadge purity={p.purity} /></span>
                  </div>
                  <div className="truncate text-sm">{p.name}</div>
                  <div className="truncate text-xs text-muted">
                    {p.category_name}{p.design_name ? ` · ${p.design_name}` : ""}{p.huid ? ` · HUID ${p.huid}` : ""}{p.lot_no ? ` · ${p.lot_no}` : ""}
                  </div>
                  {/* Below "lg": weights and status on a second line, inside the row. */}
                  <div className="mt-1 flex flex-wrap items-center gap-3 lg:hidden">
                    <span className="text-sm tabular-nums">
                      <b>{grams(p.net_weight)} g</b>
                      <span className="text-xs text-muted"> · {t("Gross")} {grams(p.gross_weight)}{p.stone_weight > 0 ? ` · ${t("Less")} ${grams(p.stone_weight)}` : ""}{p.touch_percent != null ? ` · ${p.touch_percent}% · ${t("Fine")} ${grams(fine)}` : ""}</span>
                    </span>
                    {chips}
                  </div>
                </div>
                <div className="hidden lg:block"><CodeMark code={p.item_code} kind={codeKind} onPrint={p.status === "IN_STOCK" ? () => printTags([p.item_code]) : null} /></div>
                <div className="hidden lg:block"><PurityBadge purity={p.purity} /></div>
                <div className="hidden text-right tabular-nums lg:block">{grams(p.gross_weight)}</div>
                <div className="hidden text-right tabular-nums text-muted lg:block">{p.stone_weight > 0 ? grams(p.stone_weight) : "—"}</div>
                <div className="hidden text-right font-semibold tabular-nums lg:block">{grams(p.net_weight)}</div>
                <div className="hidden text-right tabular-nums lg:block">{p.touch_percent ?? <span className="text-red-600" title={t("No % yet")}>—</span>}</div>
                <div className="hidden text-right font-semibold tabular-nums lg:block">{fine != null ? grams(fine) : "—"}</div>
                <div className="hidden lg:block">{chips}</div>
                <div className="flex items-center gap-1">
                  {p.status === "IN_STOCK" && (
                    <button onClick={() => printTags([p.item_code])} title={t("Print tag")} aria-label={t("Print tag")}
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-accent hover:bg-accent-soft">
                      <Printer size={18} aria-hidden />
                    </button>
                  )}
                  <RowMenu items={[
                    { label: t("History"), icon: History, onClick: () => setHistory(p) },
                    p.status !== "SOLD" && { label: t("Edit"), icon: Pencil, onClick: () => setForm({ piece: p }) },
                    p.status !== "SOLD" && { label: p.photo_url ? t("Change photo") : t("Add photo"), icon: Camera, onClick: () => choosePhoto(p) },
                    p.status !== "SOLD" && !p.combo_code && isManager(user) && (p.status === "IN_STOCK"
                      ? { label: t("Retire"), icon: Trash2, danger: true, onClick: () => setStatus(p, "INACTIVE") }
                      : { label: t("Restore"), icon: RotateCcw, onClick: () => setStatus(p, "IN_STOCK") }),
                  ]} />
                </div>
              </li>
            );
          })}
        </ul>
        {data.items.length > 1 && (
          <div className={`${ROW} hidden border-t-2 border-ink/70 bg-canvas py-2 text-sm font-semibold tabular-nums lg:grid`}>
            <span />
            <span />
            <span>{pages > 1 ? t("Total (this page)") : t("Total")} · {data.items.length}</span>
            <span />
            <span />
            <span className="text-right">{grams(sumOf(data.items, (p) => p.gross_weight))}</span>
            <span className="text-right">{grams(sumOf(data.items, (p) => p.stone_weight))}</span>
            <span className="text-right">{grams(sumOf(data.items, (p) => p.net_weight))}</span>
            <span />
            <span className="text-right">{grams(sumOf(data.items, fineOf))}</span>
            <span />
            <span className="w-[84px]" />
          </div>
        )}
      </Card>

      <div className="flex items-center justify-between text-sm text-muted">
        <span>{loading ? t("Loading…") : t("{n} pieces", { n: data.total })}</span>
        {pages > 1 && (
          <div className="flex items-center gap-2">
            <Button variant="ghost" disabled={page === 0} onClick={() => setPage(page - 1)}>{t("Previous")}</Button>
            <span>{page + 1} / {pages}</span>
            <Button variant="ghost" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>{t("Next")}</Button>
          </div>
        )}
      </div>

      <input ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="hidden" onChange={onPhoto} />
      {history && <PieceHistory piece={history} onClose={() => setHistory(null)} />}
      {printer}

      <Drawer open={!!form} onClose={() => setForm(null)} title={form?.piece ? `${t("Edit piece")} · ${form.piece.item_code}` : t("Add stock")}>
        {form && (
          <PieceForm categories={categories} piece={form.piece || null} onSaved={onSaved} onSetSaved={onSetSaved}
            onCancel={() => setForm(null)} hideTitle />
        )}
      </Drawer>
    </div>
  );
}
