import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app._shared.core.actor import actor_name
from app._shared.core.uploads import upload_url
from app._shared.exceptions.base import NotFoundException, ValidationException
from app.modules.combos.model import COMBO_PREFIX, COMBO_STATUS_ACTIVE, Combo
from app.modules.combos.repository import ComboItemRepository, ComboRepository
from app.modules.combos.service import combo_out
from app.modules.inventory.model import PIECE_STATUS_IN_STOCK, Piece
from app.modules.inventory.repository import PieceRepository
from app.modules.inventory.service import tag_state
from app.modules.tags.model import TAG_REPRINT, TagPrint
from app.modules.tags.schema import ComboBack, LabelBatchOut, LabelOut, PendingTagOut, PrintedOut, TagPrintOut

MAX_BATCH = 200


def _norm(code: str) -> str:
    return code.strip().upper()


def _back(c: Combo) -> ComboBack:
    out = combo_out(c)
    return ComboBack(
        code=c.combo_code, title=c.name or out.suggested_name or "Combo",
        purity=" / ".join(dict.fromkeys(p.purity for p in out.pieces)),
        piece_codes=[p.item_code for p in out.pieces], gross_weight=out.totals.gross_weight,
        net_weight=out.totals.net_weight,
    )


def _piece_label(p: Piece, combo: Optional[Combo], back=None) -> LabelOut:
    combo_code = combo.combo_code if combo else None
    state, note = tag_state(p, back or combo_code)
    return LabelOut(
        kind="PIECE", id=p.id, code=p.item_code, title=p.name, category_name=p.category.name,
        purity=p.purity, gross_weight=float(p.gross_weight), stone_weight=float(p.stone_weight),
        net_weight=float(p.net_weight), status=p.status, printable=p.status == PIECE_STATUS_IN_STOCK,
        combo_code=combo_code, huid=p.huid, photo_url=upload_url(p.photo_path),
        back=_back(combo) if combo else None, tag_state=state, tag_note=note,
    )


def _combo_label(c: Combo) -> LabelOut:
    out = combo_out(c)
    purities = list(dict.fromkeys(p.purity for p in out.pieces))  # distinct, in order
    return LabelOut(
        kind="COMBO", id=c.id, code=c.combo_code,
        title=c.name or " + ".join(p.category_name for p in out.pieces) or "Combo",
        purity=" / ".join(purities), gross_weight=out.totals.gross_weight,
        stone_weight=out.totals.stone_weight, net_weight=out.totals.net_weight, status=c.status,
        printable=c.status == COMBO_STATUS_ACTIVE, piece_codes=[p.item_code for p in out.pieces],
        photo_url=out.photo_url,
    )


async def _lookup(db: AsyncSession, code: str) -> Optional[LabelOut]:
    # CB is reserved for combos, so the prefix alone says where to look.
    if code.startswith(COMBO_PREFIX):
        combo = await ComboRepository.get_by_code(db, code)
        return _combo_label(combo) if combo else None
    piece = await PieceRepository.get_by_code(db, code)
    if not piece:
        return None
    item = await ComboItemRepository.active_for_piece(db, piece.id)
    combo = await ComboRepository.get(db, item.combo_id) if item else None
    back = (await ComboItemRepository.active_backs(db, [piece.id])).get(piece.id) if combo else None
    return _piece_label(piece, combo, back)


class TagService:
    @staticmethod
    async def resolve(db: AsyncSession, code: str) -> LabelOut:
        """What a scan calls: any Item Code or Combo Code -> what it is."""
        code = _norm(code)
        label = await _lookup(db, code) if code else None
        if not label:
            raise NotFoundException(f"Nothing has the code {code or '(empty)'}.")
        return label

    @staticmethod
    async def labels(db: AsyncSession, codes: List[str], expand_combos: bool = False) -> LabelBatchOut:
        """expand_combos: a combo code becomes the tags of its pieces (fold-over
        tags: each piece's tag carries the combo on its back)."""
        wanted = list(dict.fromkeys(c for c in (_norm(x) for x in codes) if c))
        if len(wanted) > MAX_BATCH:
            raise ValidationException(f"At most {MAX_BATCH} codes at a time.", field="codes")
        labels, missing, seen = [], [], set()
        for code in wanted:
            label = await _lookup(db, code)
            if not label:
                missing.append(code)
                continue
            parts = [label]
            if expand_combos and label.kind == "COMBO":
                parts = [await _lookup(db, pc) for pc in label.piece_codes]
            for part in parts:
                if part and part.code not in seen:
                    seen.add(part.code)
                    labels.append(part)
        return LabelBatchOut(labels=labels, missing=missing)

    @staticmethod
    async def mark_printed(db: AsyncSession, codes: List[str]) -> PrintedOut:
        """Record that these tags are now on the pieces. A combo code marks all its
        pieces. Each piece remembers which combo code went on its back."""
        now = datetime.now(timezone.utc)
        pieces: Dict[str, Piece] = {}
        for code in dict.fromkeys(_norm(c) for c in codes if c.strip()):
            if code.startswith(COMBO_PREFIX):
                combo = await ComboRepository.get_by_code(db, code)
                if combo:
                    for item in combo.items:
                        if item.unlinked_at is None:
                            pieces[item.piece_id] = item.piece
            else:
                p = await PieceRepository.get_by_code(db, code)
                if p:
                    pieces[p.id] = p
        backs = await ComboItemRepository.active_backs(db, list(pieces))
        by = actor_name()
        for pid, p in pieces.items():
            back = backs.get(pid)
            state, _ = tag_state(p, back)
            reason = state if state in ("NEW", "COMBO_CHANGED") else TAG_REPRINT
            p.tag_printed_at = now
            p.tag_back_code = back[0] if back else None
            p.tag_back_with = back[1] if back else None
            db.add(TagPrint(id=str(uuid.uuid4()), piece_id=pid, item_code=p.item_code, printed_at=now, reason=reason,
                            back_code=p.tag_back_code, back_with=p.tag_back_with, by_name=by))
        await db.commit()
        return PrintedOut(marked=len(pieces))

    @staticmethod
    async def pending(db: AsyncSession, limit: int = 500) -> List[PendingTagOut]:
        """In-stock pieces whose tag was never printed or whose combo changed since."""
        rows = (await db.execute(
            select(Piece).where(Piece.status == PIECE_STATUS_IN_STOCK).order_by(Piece.item_code)
        )).unique().scalars().all()
        backs = await ComboItemRepository.active_backs(db, [p.id for p in rows])
        out = []
        for p in rows:
            back = backs.get(p.id)
            state, note = tag_state(p, back)
            if state in ("NEW", "COMBO_CHANGED"):
                was = (f"{p.tag_back_code}" + (f" with {p.tag_back_with}" if p.tag_back_with else "")) if p.tag_back_code else None
                now_ = (f"{back[0]}" + (f" with {back[1]}" if back[1] else "")) if back else None
                out.append(PendingTagOut(
                    code=p.item_code, name=p.name, category_name=p.category.name,
                    design_name=p.design.name if p.design else None, state=state, note=note,
                    combo_code=back[0] if back else None, back_was_code=p.tag_back_code,
                    back_was=was if state == "COMBO_CHANGED" else None, back_now=now_ if state == "COMBO_CHANGED" else None,
                ))
        # In shelf order: category, then sub-category, then code.
        out.sort(key=lambda x: (x.category_name.lower(), (x.design_name or "").lower(), x.code))
        return out[:limit]

    @staticmethod
    async def history(db: AsyncSession, code: str) -> List[TagPrintOut]:
        piece = await PieceRepository.get_by_code(db, _norm(code))
        if not piece:
            raise NotFoundException(f"No piece with code {_norm(code)}.")
        rows = (await db.execute(
            select(TagPrint).where(TagPrint.piece_id == piece.id).order_by(TagPrint.printed_at.desc())
        )).scalars().all()
        return [TagPrintOut(printed_at=r.printed_at, reason=r.reason, back_code=r.back_code, back_with=r.back_with,
                            by_name=r.by_name) for r in rows]
