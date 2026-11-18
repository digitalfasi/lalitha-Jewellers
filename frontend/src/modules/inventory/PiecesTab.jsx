"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { mediaUrl } from "@/_shared/api/client";
import PhotoButton from "@/_shared/components/PhotoButton";
import { Button, Card, Input, Notice, Select, StatusPill } from "@/_shared/components/ui";
import { grams, inventoryService } from "./inventoryService";
import PieceForm from "./PieceForm";
import PieceHistory from "./PieceHistory";
import { comboService } from "@/modules/combos/comboService";
import { useTagPrinter } from "@/modules/tags/TagPrinter";

const TAG_BADGE = { NEW: "Tag not printed", COMBO_CHANGED: "Reprint tag: set changed" };
const shortName = (p) => (p.design_name ? `${p.design_name} ${p.category_name.toLowerCase()}` : p.name);

const PAGE = 50;

export default function PiecesTab({ categories, onChanged, lot, onClearLot }) {
  const [filters, setFilters] = useState({ q: "", category_id: "", status: "IN_STOCK" });
  const [history, setHistory] = useState(null);
  const [picked, setPicked] = useState({}); // item_code -> piece, for "Make a set"
  const [setName, setSetName] = useState("");
  const [making, setMaking] = useState(false);
  const { printTags, printer } = useTagPrinter();
  const params = useSearchParams();
  const pieceParam = params.get("piece");
  useEffect(() => {
    if (!pieceParam) return;
    inventoryService.getPieceByCode(pieceParam).then(setHistory).catch((e) => setNotice({ tone: "error", text: e.message }));
  }, [pieceParam]);
  const [query, setQuery] = useState(""); // debounced copy of filters.q
  const [page, setPage] = useState(0);
  const [data, setData] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => setQuery(filters.q.trim()), 250);
    return () => clearTimeout(t);
  }, [filters.q]);

  const load = useCallback(() => {
    setLoading(true);
    inventoryService
      .listPieces({ q: query, category_id: filters.category_id, status: filters.status, lot_id: lot?.id, limit: PAGE, offset: page * PAGE })
      .then(setData)
      .catch((e) => setNotice({ tone: "error", text: e.message }))
      .finally(() => setLoading(false));
  }, [query, filters.category_id, filters.status, lot?.id, page]);
  useEffect(load, [load]);
  // Marking tags as printed (from the print bar) refreshes the badges.
  useEffect(() => {
    window.addEventListener("tags:changed", load);
    return () => window.removeEventListener("tags:changed", load);
  }, [load]);

  const setFilter = (k) => (e) => {
    setFilters((f) => ({ ...f, [k]: e.target.value }));
    setPage(0);
  };

  const onSaved = (p, wasEdit, printAfter) => {
    setNotice({ tone: "ok", text: wasEdit ? `${p.item_code} updated.` : `Added ${p.item_code} — ${p.name}, net ${grams(p.net_weight)} g.` });
    setEditing(null);
    load();
    onChanged();
    if (!wasEdit && printAfter) printTags([p.item_code]);
  };

  const onSetSaved = (combo, printAfter) => {
    const codes = combo.pieces.map((x) => x.item_code);
    setNotice({ tone: "ok", text: `Set ${combo.combo_code} saved: ${codes.join(" + ")}.` });
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
      setNotice({ tone: "ok", text: `Set ${combo.combo_code} made from ${combo.pieces.map((x) => x.item_code).join(" + ")}. Print the new tags so the set shows on their backs.` });
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
      setNotice({ tone: "ok", text: `${saved.item_code} is now ${status === "INACTIVE" ? "inactive" : "back in stock"}.` });
      if (editing?.id === p.id) setEditing(null);
      load();
    } catch (err) {
      setNotice({ tone: "error", text: err.message });
    }
  };

  const pages = Math.max(1, Math.ceil(data.total / PAGE));

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[1fr_360px]">
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <Input value={filters.q} onChange={setFilter("q")} placeholder="Search code, name or HUID" className="w-56" aria-label="Search" />
          <Select value={filters.category_id} onChange={setFilter("category_id")} className="w-44" aria-label="Category">
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
          <Select value={filters.status} onChange={setFilter("status")} className="w-36" aria-label="Status">
            <option value="IN_STOCK">In stock</option>
            <option value="INACTIVE">Inactive</option>
            <option value="SOLD">Sold</option>
            <option value="">Any status</option>
          </Select>
          {lot && (
            <span className="inline-flex items-center gap-2 rounded-full bg-accent-soft px-3 py-1 text-sm text-accent">
              Lot {lot.lot_no}
              <button onClick={onClearLot} aria-label="Show all lots" className="text-xs">✕</button>
            </span>
          )}
          {lot && data.items.length > 0 && (
            <Link href={`/tags?codes=${data.items.filter((p) => p.status === "IN_STOCK").map((p) => p.item_code).join(",")}`}
              className="self-center text-sm text-accent hover:underline">Print tags for this lot</Link>
          )}
        </div>

        {notice && <Notice tone={notice.tone} onClose={() => setNotice(null)}>{notice.text}</Notice>}

        {pickedList.length > 0 && (
          <div className="sticky top-2 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-accent bg-accent-soft px-3 py-2 text-sm">
            <b>{pickedList.length} picked:</b>
            <span className="font-mono">{pickedList.map((x) => x.item_code).join(" + ")}</span>
            {pickedList.length >= 2 && (
              <Input value={setName} onChange={(e) => setSetName(e.target.value)} placeholder={pickedList.map(shortName).join(" + ")}
                className="h-8 w-64 bg-surface" aria-label="Set name" />
            )}
            <span className="ml-auto flex gap-2">
              <Button onClick={makeSet} disabled={making || pickedList.length < 2} title={pickedList.length < 2 ? "Pick at least 2 pieces" : undefined}>
                {making ? "Making…" : "Make a set"}
              </Button>
              <Button variant="ghost" onClick={() => printTags(pickedList.map((x) => x.item_code))}>Print tags</Button>
              <Button variant="link" onClick={() => setPicked({})}>Clear</Button>
            </span>
          </div>
        )}

        <Card className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-canvas text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="w-8 py-2.5 pl-3" title="Tick pieces to make a set or print their tags" />
                <th className="w-12 px-2 py-2.5" />
                <th className="px-4 py-2.5">Item code</th>
                <th className="px-4 py-2.5">Name</th>
                <th className="px-4 py-2.5">Purity</th>
                <th className="px-4 py-2.5 text-right">Gross</th>
                <th className="px-4 py-2.5 text-right">Stone</th>
                <th className="px-4 py-2.5 text-right">Net</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {!loading && data.items.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-muted">
                    {categories.length === 0 ? "Add a category first, then add pieces." : "No pieces match."}
                  </td>
                </tr>
              )}
              {data.items.map((p) => (
                <tr key={p.id} className={`border-t border-line ${editing?.id === p.id ? "bg-accent-soft/40" : ""}`}>
                  <td className="py-1.5 pl-3">
                    {p.status === "IN_STOCK" && (
                      <input type="checkbox" checked={!!picked[p.item_code]} onChange={() => togglePick(p)}
                        disabled={!!p.combo_code && !picked[p.item_code]}
                        title={p.combo_code ? `Already in ${p.combo_code}` : "Pick for a set or tag printing"}
                        aria-label={`Pick ${p.item_code}`} />
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    {p.photo_url ? (
                      <img src={mediaUrl(p.photo_url)} alt="" className="h-10 w-10 rounded-md object-cover" loading="lazy" />
                    ) : (
                      <div className="h-10 w-10 rounded-md bg-canvas" />
                    )}
                  </td>
                  <td className="px-4 py-2.5 font-mono font-semibold">
                    {p.item_code}
                    {p.huid && <div className="text-xs font-normal text-muted">HUID {p.huid}</div>}
                    {p.lot_no && <div className="text-xs font-normal text-muted">{p.lot_no}</div>}
                  </td>
                  <td className="px-4 py-2.5">
                    <div>{p.name}</div>
                    <div className="text-xs text-muted">
                      {p.category_name}
                      {p.design_name ? ` · ${p.design_name}` : ""}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    {p.purity}
                    {p.touch_percent != null && <span className="text-xs text-muted"> · {p.touch_percent}%</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right">{grams(p.gross_weight)}</td>
                  <td className="px-4 py-2.5 text-right">{grams(p.stone_weight)}</td>
                  <td className="px-4 py-2.5 text-right font-medium">{grams(p.net_weight)}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <StatusPill status={p.status} />
                      {TAG_BADGE[p.tag_state] && (
                        <button onClick={() => printTags([p.item_code])} title="Print it now"
                          className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800 hover:underline">
                          {TAG_BADGE[p.tag_state]}
                        </button>
                      )}
                      {p.combo_code && (
                        <Link
                          href={`/combos?code=${p.combo_code}`}
                          title={`In combo ${p.combo_code}`}
                          className="rounded-full bg-accent-soft px-2 py-0.5 font-mono text-xs text-accent hover:underline"
                        >
                          {p.combo_code}
                        </Link>
                      )}
                    </div>
                  </td>
                  <td className="space-x-3 whitespace-nowrap px-4 py-2.5 text-right">
                    <Button variant="link" onClick={() => setHistory(p)}>History</Button>
                    {p.status !== "SOLD" && (
                      <PhotoButton
                        hasPhoto={!!p.photo_url}
                        label={p.photo_url ? "Photo" : "Add photo"}
                        onUpload={async (f) => {
                          await inventoryService.uploadPhoto(p.id, f);
                          setNotice({ tone: "ok", text: `Photo saved for ${p.item_code}.` });
                          load();
                        }}
                        onError={(m) => setNotice({ tone: "error", text: m })}
                      />
                    )}
                    {p.status !== "SOLD" && (
                      <>
                        <Button variant="link" onClick={() => setEditing(p)}>Edit</Button>
                        {p.status === "IN_STOCK" && (
                          <Button variant="link" onClick={() => printTags([p.item_code])}>Print tag</Button>
                        )}
                        {!p.combo_code && (
                          <Button variant="link" onClick={() => setStatus(p, p.status === "IN_STOCK" ? "INACTIVE" : "IN_STOCK")}>
                            {p.status === "IN_STOCK" ? "Retire" : "Restore"}
                          </Button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <div className="flex items-center justify-between text-sm text-muted">
          <span>{loading ? "Loading…" : `${data.total} piece${data.total === 1 ? "" : "s"}`}</span>
          {pages > 1 && (
            <div className="flex items-center gap-2">
              <Button variant="ghost" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button>
              <span>{page + 1} / {pages}</span>
              <Button variant="ghost" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Next</Button>
            </div>
          )}
        </div>
      </div>

      {history && <PieceHistory piece={history} onClose={() => setHistory(null)} />}
      {printer}

      <Card className="p-5 lg:sticky lg:top-6">
        <PieceForm categories={categories} piece={editing} onSaved={onSaved} onSetSaved={onSetSaved} onCancel={() => setEditing(null)} />
      </Card>
    </div>
  );
}
