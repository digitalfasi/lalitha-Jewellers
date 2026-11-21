"use client";

import { useEffect, useState } from "react";
import { mediaUrl } from "@/_shared/api/client";
import { isManager, useAuth } from "@/_shared/auth/AuthProvider";
import PhotoButton from "@/_shared/components/PhotoButton";
import { Button, Field, Input, Notice } from "@/_shared/components/ui";
import { grams } from "@/modules/inventory/inventoryService";
import { COMBO_STATUS_LABEL, comboService, when } from "./comboService";
import PiecePicker from "./PiecePicker";
import { useTagPrinter } from "@/modules/tags/TagPrinter";
import { tagService } from "@/modules/tags/tagService";

const EVENT_TEXT = {
  CREATED: () => "Created",
  LINKED: (e) => `Linked ${e.item_code}`,
  UNLINKED: (e) => `Unlinked ${e.item_code}`,
  SWAPPED: (e) => `Swapped ${e.item_code} → ${e.other_item_code}`,
  DISSOLVED: () => "Dissolved",
};

export default function ComboDetail({ combo, onChanged }) {
  const { user } = useAuth();
  const [history, setHistory] = useState([]);
  const [renameOffer, setRenameOffer] = useState(false); // after a change, offer the name that fits the pieces now
  const [reprint, setReprint] = useState([]); // codes whose physical tags are now out of date
  const [undoUnlink, setUndoUnlink] = useState(null); // the piece just unlinked, for one tap back
  const { printTags, printer } = useTagPrinter();
  const [swapFor, setSwapFor] = useState(null); // item_code being swapped out
  const [note, setNote] = useState("");
  const [confirmDissolve, setConfirmDissolve] = useState(false);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const editable = combo.status === "ACTIVE";
  const atMinimum = combo.pieces.length <= 2;

  useEffect(() => {
    comboService.history(combo.id).then(setHistory).catch(() => setHistory([]));
  }, [combo]);

  // Tags of this combo's pieces (and of pieces that just left it) that no longer match.
  useEffect(() => {
    const load = () => tagService.pending()
      .then((list) => setReprint(list.filter((x) => x.combo_code === combo.combo_code || x.back_was_code === combo.combo_code)))
      .catch(() => setReprint([]));
    load();
    window.addEventListener("tags:changed", load);
    return () => window.removeEventListener("tags:changed", load);
  }, [combo]);

  useEffect(() => {
    setSwapFor(null);
    setConfirmDissolve(false);
    setNotice(null);
    setNote("");
    setRenameOffer(false);
    setUndoUnlink(null);
  }, [combo.id]);

  const run = async (fn, okText, piecesChanged = true) => {
    setBusy(true);
    setNotice(null);
    try {
      const updated = await fn();
      setNotice({ tone: "ok", text: okText });
      setRenameOffer(piecesChanged && updated.status === "ACTIVE" && !!updated.name && updated.name !== updated.suggested_name);
      setSwapFor(null);
      setConfirmDissolve(false);
      setNote("");
      onChanged(updated);
    } catch (err) {
      setNotice({ tone: "error", text: err.message });
    } finally {
      setBusy(false);
    }
  };

  const members = combo.pieces.map((p) => p.item_code);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-mono text-xl font-bold text-accent">{combo.combo_code}</div>
          <div className="text-sm">{combo.name || <span className="text-muted">No name</span>}</div>
          {combo.remarks && <div className="mt-0.5 text-xs text-muted">{combo.remarks}</div>}
        </div>
        <div className="flex items-center gap-3">
          {editable && (
            <Button variant="link" onClick={() => printTags([combo.combo_code, ...members])}>Print tags</Button>
          )}
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
            combo.status === "ACTIVE" ? "bg-green-100 text-green-800" : "bg-line text-muted"
          }`}
        >
          {COMBO_STATUS_LABEL[combo.status]}
        </span>
        </div>
      </div>

      {notice && <Notice tone={notice.tone} onClose={() => setNotice(null)}>{notice.text}</Notice>}
      {undoUnlink && editable && (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-canvas px-3 py-2 text-sm">
          <span>{undoUnlink} was taken out of this set.</span>
          <Button variant="link" onClick={() => {
            const code = undoUnlink;
            setUndoUnlink(null);
            run(() => comboService.link(combo.id, code, "Undo of unlink"), `${code} is back in ${combo.combo_code}.`);
          }}>Undo</Button>
        </div>
      )}
      {printer}
      {reprint.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <b>{reprint.length === 1 ? "1 tag needs printing" : `${reprint.length} tags need printing`}</b>
            <Button onClick={() => printTags(reprint.map((x) => x.code))}>
              Reprint {reprint.length} {reprint.length === 1 ? "tag" : "tags"}
            </Button>
          </div>
          <ul className="text-xs">
            {reprint.map((x) => (
              <li key={x.code}>
                <b className="font-mono">{x.code}</b>{" "}
                {x.state === "NEW" ? "has no tag yet" : <>back: <s>{x.back_was || "no combo"}</s> → <b>{x.back_now || "no combo (take the old tag off)"}</b></>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {renameOffer && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <span>The pieces changed. Rename “{combo.name}” to “{combo.suggested_name}”?</span>
          <span className="flex gap-3">
            <Button variant="link" onClick={() => run(() => comboService.update(combo.id, { name: combo.suggested_name }), "Renamed.", false)}>Rename</Button>
            <Button variant="link" className="text-muted" onClick={() => setRenameOffer(false)}>Keep the name</Button>
          </span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {combo.photo_url ? (
          <img src={mediaUrl(combo.photo_url)} alt={`${combo.combo_code} photo`} className="h-28 w-28 rounded-xl object-cover" />
        ) : (
          <div className="flex h-28 w-28 items-center justify-center rounded-xl bg-canvas text-xs text-muted">No photo</div>
        )}
        {editable && (
          <PhotoButton
            hasPhoto={!!combo.photo_url}
            onUpload={async (f) => onChanged(await comboService.uploadPhoto(combo.id, f))}
            onRemove={async () => onChanged(await comboService.removePhoto(combo.id))}
            onError={(m) => setNotice({ tone: "error", text: m })}
          />
        )}
        <p className="text-xs text-muted">Shown in the catalogue and on the tag lookup.</p>
      </div>

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Pieces in this combo</h3>
        <div className="overflow-hidden rounded-xl border border-line">
          <table className="w-full text-sm tabular-nums">
            <tbody>
              {combo.pieces.length === 0 && (
                <tr>
                  <td className="px-3 py-4 text-center text-muted">No pieces linked.</td>
                </tr>
              )}
              {combo.pieces.map((p) => (
                <tr key={p.piece_id} className="border-b border-line last:border-0 align-top">
                  <td className="px-3 py-2 font-mono font-semibold">{p.item_code}</td>
                  <td className="px-3 py-2">
                    {p.name}
                    <div className="text-xs text-muted">{p.category_name} · {p.purity}</div>
                    {swapFor === p.item_code && (
                      <div className="mt-2">
                        <PiecePicker
                          autoFocus
                          placeholder={`Piece to replace ${p.item_code}`}
                          exclude={members}
                          disabled={busy}
                          onPick={(n) =>
                            run(() => comboService.swap(combo.id, p.item_code, n.item_code, note || null), `Swapped ${p.item_code} for ${n.item_code}.`)
                          }
                        />
                      </div>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">{grams(p.net_weight)} g</td>
                  {editable && (
                    <td className="space-x-3 whitespace-nowrap px-3 py-2 text-right">
                      <Button variant="link" onClick={() => setSwapFor(swapFor === p.item_code ? null : p.item_code)}>
                        {swapFor === p.item_code ? "Cancel" : "Swap"}
                      </Button>
                      <Button
                        variant="link"
                        disabled={atMinimum || busy}
                        title={atMinimum ? "A combo needs at least 2 pieces — swap or dissolve instead" : undefined}
                        onClick={() => run(async () => {
                          const out = await comboService.unlink(combo.id, p.item_code, note || null);
                          setUndoUnlink(p.item_code);
                          return out;
                        }, `Unlinked ${p.item_code}. It is free for another combo.`)}
                      >
                        Unlink
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            {combo.pieces.length > 0 && (
              <tfoot className="bg-canvas text-xs">
                <tr>
                  <td colSpan={2} className="px-3 py-2">
                    {combo.totals.pieces} pieces · gross {grams(combo.totals.gross_weight)} · stone {grams(combo.totals.stone_weight)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-semibold">{grams(combo.totals.net_weight)} g</td>
                  {editable && <td />}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>

      {editable && (
        <section className="flex flex-col gap-3">
          <Field label="Link another piece">
            <PiecePicker
              exclude={members}
              disabled={busy}
              onPick={(p) => run(() => comboService.link(combo.id, p.item_code, note || null), `Linked ${p.item_code}.`)}
            />
          </Field>
          <Field label="Reason" hint="Optional. Saved with the next link, unlink, swap or dissolve.">
            <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="e.g. Buyer chose a different pendant" />
          </Field>
          {!isManager(user) ? (
            <p className="text-xs text-muted">Only the owner or a manager can dissolve a combo.</p>
          ) : !confirmDissolve ? (
            <Button variant="ghost" onClick={() => setConfirmDissolve(true)} className="self-start text-red-700">
              Dissolve combo…
            </Button>
          ) : (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm">
              <p>
                Unlink all {combo.pieces.length} pieces and close <b>{combo.combo_code}</b>? The pieces go back to stock; this code
                is never used again.
              </p>
              <div className="mt-2 flex gap-2">
                <Button disabled={busy} onClick={() => run(() => comboService.dissolve(combo.id, note || null), `${combo.combo_code} dissolved.`)}>
                  Dissolve
                </Button>
                <Button variant="ghost" onClick={() => setConfirmDissolve(false)}>Keep it</Button>
              </div>
            </div>
          )}
        </section>
      )}

      {combo.past_pieces.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Previously in this combo</h3>
          <ul className="flex flex-col gap-1 text-sm">
            {combo.past_pieces.map((p) => (
              <li key={`${p.piece_id}-${p.linked_at}`} className="flex justify-between gap-3">
                <span>
                  <span className="font-mono">{p.item_code}</span> <span className="text-muted">{p.name}</span>
                </span>
                <span className="text-xs text-muted">
                  {when(p.linked_at)} → {when(p.unlinked_at)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">History</h3>
        <ol className="flex flex-col gap-2 border-l border-line pl-4 text-sm">
          {history.map((e) => (
            <li key={e.seq} className="relative">
              <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-accent" />
              <span className="font-medium">{(EVENT_TEXT[e.event] || (() => e.event))(e)}</span>
              <span className="ml-2 text-xs text-muted">{when(e.at)}{e.by_name ? ` · ${e.by_name}` : ""}</span>
              {e.note && <div className="text-xs text-muted">{e.note}</div>}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
