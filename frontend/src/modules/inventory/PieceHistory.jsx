"use client";

import { tagService } from "@/modules/tags/tagService";
import { useEffect, useState } from "react";
import Link from "next/link";
import { mediaUrl } from "@/_shared/api/client";
import { Button, StatusPill } from "@/_shared/components/ui";
import { fmtDay } from "@/_shared/dates";
import { grams, inventoryService } from "./inventoryService";

const when = (iso) => (iso ? new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");

// Everything about one piece in one place: where it came from, every combo it
// has been part of, and every bill it has been on (cancelled ones too).
export default function PieceHistory({ piece, onClose }) {
  const [combos, setCombos] = useState(null);
  const [bills, setBills] = useState(null);
  const [tags, setTags] = useState(null);

  useEffect(() => {
    inventoryService.pieceCombos(piece.item_code).then(setCombos).catch(() => setCombos([]));
    inventoryService.pieceBills(piece.item_code).then(setBills).catch(() => setBills([]));
    tagService.history(piece.item_code).then(setTags).catch(() => setTags([]));
  }, [piece.item_code]);

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={onClose}>
      <aside
        className="h-full w-full max-w-md overflow-y-auto bg-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        aria-label={`History of ${piece.item_code}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-mono text-lg font-bold text-accent">{piece.item_code}</div>
            <div className="font-medium">{piece.name}</div>
            <div className="text-xs text-muted">
              {piece.category_name}{piece.design_name ? ` · ${piece.design_name}` : ""} · {piece.purity} · net {grams(piece.net_weight)} g
            </div>
          </div>
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </div>

        {piece.photo_url && <img src={mediaUrl(piece.photo_url)} alt="" className="mt-4 max-h-56 w-full rounded-xl object-contain bg-canvas" />}

        <dl className="mt-4 grid grid-cols-[110px_1fr] gap-y-1 text-sm">
          <dt className="text-muted">Status</dt><dd><StatusPill status={piece.status} /></dd>
          <dt className="text-muted">HUID</dt><dd className="font-mono">{piece.huid || "—"}</dd>
          <dt className="text-muted">Lot</dt><dd>{piece.lot_no ? `${piece.lot_no}${piece.karigar_name ? ` from ${piece.karigar_name}` : ""}` : "—"}</dd>
          <dt className="text-muted">Added</dt><dd>{when(piece.created_at)}{piece.created_by_name ? ` by ${piece.created_by_name}` : ""}</dd>
        </dl>

        <h3 className="mt-6 text-xs font-semibold uppercase tracking-wide text-muted">Combos</h3>
        {combos === null ? <p className="text-sm text-muted">Loading…</p> : combos.length === 0 ? (
          <p className="text-sm text-muted">Never in a combo.</p>
        ) : (
          <ul className="mt-1 divide-y divide-line text-sm">
            {combos.map((c) => (
              <li key={`${c.combo_id}-${c.linked_at}`} className="py-2">
                <Link href={`/combos?code=${c.combo_code}`} className="font-mono font-semibold text-accent hover:underline">{c.combo_code}</Link>
                {c.combo_name && <span> {c.combo_name}</span>}
                {c.current && <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800">now</span>}
                <div className="text-xs text-muted">
                  {when(c.linked_at)} → {c.unlinked_at ? when(c.unlinked_at) : "today"} · combo {c.combo_status.toLowerCase()}
                </div>
              </li>
            ))}
          </ul>
        )}

        <h3 className="mt-6 text-xs font-semibold uppercase tracking-wide text-muted">Bills</h3>
        {bills === null ? <p className="text-sm text-muted">Loading…</p> : bills.length === 0 ? (
          <p className="text-sm text-muted">Never billed.</p>
        ) : (
          <ul className="mt-1 divide-y divide-line text-sm">
            {bills.map((b) => (
              <li key={b.bill_id} className="py-2">
                <Link href={`/billing/${b.bill_id}`} className="font-mono font-semibold text-accent hover:underline">{b.bill_number}</Link>
                <span> to {b.shop_name}</span>
                <div className="text-xs text-muted">
                  {fmtDay(b.bill_date)} · {b.status === "CANCELLED" ? "cancelled" : "sold"}
                  {b.line_code !== piece.item_code ? ` (as part of ${b.line_code})` : ""}
                </div>
              </li>
            ))}
          </ul>
        )}
        <h3 className="mt-6 text-xs font-semibold uppercase tracking-wide text-muted">Tags printed</h3>
        {tags === null ? <p className="text-sm text-muted">Loading…</p> : tags.length === 0 ? (
          <p className="text-sm text-muted">No tag printed yet.</p>
        ) : (
          <ul className="mt-1 divide-y divide-line text-sm">
            {tags.map((x) => (
              <li key={x.printed_at} className="py-2">
                <b>{{ NEW: "First tag", COMBO_CHANGED: "New tag: combo changed", REPRINT: "Reprint (lost or damaged)" }[x.reason]}</b>
                <div className="text-xs text-muted">
                  {new Date(x.printed_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  {x.by_name ? ` · ${x.by_name}` : ""}
                  {x.back_code ? ` · back: ${x.back_code}${x.back_with ? ` with ${x.back_with}` : ""}` : ""}
                </div>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
