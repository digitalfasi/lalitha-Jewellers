import uuid
from collections import Counter
from decimal import Decimal
from typing import Dict, List, Optional, Set

from fastapi import UploadFile
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app._shared.core.actor import actor_id, actor_name
from app._shared.core.uploads import delete_upload, save_image, upload_url
from app._shared.exceptions.base import ConflictException, NotFoundException, ValidationException
from app.modules.combos.model import (
    COMBO_PREFIX,
    COMBO_STATUS_ACTIVE,
    COMBO_STATUS_DISSOLVED,
    EVENT_CREATED,
    EVENT_DISSOLVED,
    EVENT_LINKED,
    EVENT_SWAPPED,
    EVENT_UNLINKED,
    MIN_PIECES,
    Combo,
    ComboEvent,
    ComboItem,
    ComboTemplate,
    utcnow,
)
from app.modules.combos.repository import ComboItemRepository, ComboRepository
from app.modules.combos.schema import (
    AvailablePieceOut,
    ComboCreate,
    ComboEventOut,
    ComboList,
    ComboOut,
    ComboPieceOut,
    ComboTotals,
    ComboUpdate,
    DissolveIn,
    PieceCodeIn,
    NewSetIn,
    PieceComboHistoryOut,
    SuggestionOut,
    SwapIn,
    TemplateIn,
    TemplateOut,
    TemplateSlotOut,
)
from app.modules.inventory.model import PIECE_STATUS_IN_STOCK, Category, Piece
from app.modules.inventory.repository import CodeSequenceRepository, PieceRepository

_STATUS_WORD = {"SOLD": "sold", "INACTIVE": "inactive"}


def _new_id() -> str:
    return str(uuid.uuid4())


def _piece_out(item: ComboItem) -> ComboPieceOut:
    p = item.piece
    return ComboPieceOut(
        piece_id=p.id, item_code=p.item_code, name=p.name, category_name=p.category.name,
        design_name=p.design.name if p.design else None, purity=p.purity, huid=p.huid,
        photo_url=upload_url(p.photo_path), gross_weight=float(p.gross_weight), stone_weight=float(p.stone_weight), net_weight=float(p.net_weight),
        touch_percent=float(p.touch_percent) if p.touch_percent is not None else None,
        linked_at=item.linked_at, unlinked_at=item.unlinked_at,
    )


def _short_name(p: Piece) -> str:
    """'Rope chain' from design Rope + category Chain; the piece name if no design."""
    return f"{p.design.name} {p.category.name.lower()}" if p.design else p.name


def suggest_name(pieces: List[Piece]) -> str:
    return " + ".join(_short_name(p) for p in pieces)[:150]


def combo_out(c: Combo) -> ComboOut:
    current = [i for i in c.items if i.unlinked_at is None]
    past = sorted((i for i in c.items if i.unlinked_at is not None), key=lambda i: i.unlinked_at, reverse=True)
    total = lambda attr: float(sum((getattr(i.piece, attr) for i in current), Decimal("0")))  # noqa: E731
    return ComboOut(
        id=c.id, combo_code=c.combo_code, name=c.name, status=c.status, remarks=c.remarks,
        created_at=c.created_at, dissolved_at=c.dissolved_at, photo_url=upload_url(c.photo_path),
        suggested_name=suggest_name([i.piece for i in current]),
        pieces=[_piece_out(i) for i in current],
        past_pieces=[_piece_out(i) for i in past],
        totals=ComboTotals(
            pieces=len(current), gross_weight=total("gross_weight"),
            stone_weight=total("stone_weight"), net_weight=total("net_weight"),
        ),
    )


async def _commit(db: AsyncSession) -> None:
    """The one-active-combo-per-piece index is the last line of defence when
    two people link the same piece at the same moment."""
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise ConflictException("One of these pieces was just linked to another combo. Refresh and try again.")


async def _eligible_piece(db: AsyncSession, code: str) -> Piece:
    """A piece that may join a combo: exists, in stock, not in any combo now."""
    piece = await PieceRepository.get_by_code(db, code)
    if not piece:
        raise NotFoundException(f"No piece with code {code}.")
    if piece.status != PIECE_STATUS_IN_STOCK:
        raise ConflictException(f"{code} is {_STATUS_WORD.get(piece.status, piece.status.lower())}, so it cannot be linked.")
    current = await ComboItemRepository.active_for_piece(db, piece.id)
    if current:
        raise ConflictException(f"{code} is already in combo {current.combo.combo_code}. Unlink it there first.")
    return piece


async def _active_combo(db: AsyncSession, combo_id: str) -> Combo:
    combo = await ComboRepository.get(db, combo_id, for_update=True)
    if not combo:
        raise NotFoundException("Combo not found.")
    if combo.status != COMBO_STATUS_ACTIVE:
        raise ConflictException(f"{combo.combo_code} is {combo.status.lower()} and can no longer be changed.")
    return combo


def _current_item(combo: Combo, code: str) -> ComboItem:
    for item in combo.items:
        if item.unlinked_at is None and item.piece.item_code == code:
            return item
    raise ValidationException(f"{code} is not in {combo.combo_code}.")


async def _log(db: AsyncSession, combo: Combo, event: str, piece: Optional[Piece] = None,
               other: Optional[Piece] = None, note: Optional[str] = None) -> None:
    db.add(ComboEvent(
        id=_new_id(), combo_id=combo.id, seq=await ComboRepository.next_seq(db, combo.id), event=event,
        piece_id=piece.id if piece else None, item_code=piece.item_code if piece else None,
        other_piece_id=other.id if other else None, other_item_code=other.item_code if other else None,
        note=note or None, by_id=actor_id(), by_name=actor_name(),
    ))


async def _reload(db: AsyncSession, combo_id: str) -> ComboOut:
    return combo_out(await ComboRepository.get(db, combo_id))


class ComboService:
    @staticmethod
    async def list(db: AsyncSession, **filters) -> ComboList:
        items, total = await ComboRepository.list(db, **filters)
        return ComboList(items=[combo_out(c) for c in items], total=total)

    @staticmethod
    async def get(db: AsyncSession, combo_id: str) -> ComboOut:
        combo = await ComboRepository.get(db, combo_id)
        if not combo:
            raise NotFoundException("Combo not found.")
        return combo_out(combo)

    @staticmethod
    async def get_by_code(db: AsyncSession, code: str) -> ComboOut:
        combo = await ComboRepository.get_by_code(db, code)
        if not combo:
            raise NotFoundException(f"No combo with code {code.strip().upper()}.")
        return combo_out(combo)

    @staticmethod
    async def create(db: AsyncSession, data: ComboCreate) -> ComboOut:
        combo = await ComboService._add_combo(db, data.piece_codes, data.name, data.remarks)
        await _commit(db)
        return await _reload(db, combo.id)

    @staticmethod
    async def create_set(db: AsyncSession, data: NewSetIn) -> ComboOut:
        """Add new pieces and link them into a combo in one transaction. If any
        piece is wrong, nothing is saved and the error names the piece (1-based)."""
        from app.modules.inventory.service import PieceService  # inventory doesn't import combos

        huids = {}
        for i, row in enumerate(data.pieces, 1):
            if row.huid:
                if row.huid in huids:
                    raise ValidationException(f"Piece {i}: HUID {row.huid} is also on piece {huids[row.huid]}.")
                huids[row.huid] = i
        codes = []
        for i, row in enumerate(data.pieces, 1):
            try:
                piece = await PieceService._add(db, row, data.lot_id)
            except (ValidationException, ConflictException, NotFoundException) as exc:
                await db.rollback()
                raise exc.__class__(f"Piece {i}: {exc.message} Nothing was saved.")
            codes.append(piece.item_code)
        try:
            combo = await ComboService._add_combo(db, codes, data.name, data.remarks)
        except Exception:
            await db.rollback()
            raise
        await _commit(db)
        return await _reload(db, combo.id)

    @staticmethod
    async def _add_combo(db: AsyncSession, codes: List[str], name: Optional[str], remarks: Optional[str]) -> Combo:
        """Check the pieces and add the combo, its items and its CREATED event. The caller commits."""
        if len(set(codes)) != len(codes):
            raise ValidationException("The same piece is listed twice.", field="piece_codes")
        pieces = [await _eligible_piece(db, code) for code in codes]

        combo = Combo(
            id=_new_id(), combo_code=await CodeSequenceRepository.next_code(db, COMBO_PREFIX),
            name=name or None, remarks=remarks or None, status=COMBO_STATUS_ACTIVE,
        )
        db.add(combo)
        now = utcnow()
        for p in pieces:
            db.add(ComboItem(id=_new_id(), combo_id=combo.id, piece_id=p.id, linked_at=now))
        db.add(ComboEvent(
            id=_new_id(), combo_id=combo.id, seq=1, event=EVENT_CREATED,
            note="Linked " + ", ".join(codes), by_id=actor_id(), by_name=actor_name(),
        ))
        return combo  # flushed by the caller's commit, where a clash is caught

    @staticmethod
    async def update(db: AsyncSession, combo_id: str, data: ComboUpdate) -> ComboOut:
        combo = await ComboRepository.get(db, combo_id, for_update=True)
        if not combo:
            raise NotFoundException("Combo not found.")
        sent = data.model_fields_set
        if "name" in sent:
            combo.name = data.name or None
        if "remarks" in sent:
            combo.remarks = data.remarks or None
        await db.commit()
        return await _reload(db, combo.id)

    @staticmethod
    async def link(db: AsyncSession, combo_id: str, data: PieceCodeIn) -> ComboOut:
        combo = await _active_combo(db, combo_id)
        piece = await _eligible_piece(db, data.piece_code)
        db.add(ComboItem(id=_new_id(), combo_id=combo.id, piece_id=piece.id))
        await _log(db, combo, EVENT_LINKED, piece, note=data.note)
        await _commit(db)
        return await _reload(db, combo.id)

    @staticmethod
    async def unlink(db: AsyncSession, combo_id: str, data: PieceCodeIn) -> ComboOut:
        combo = await _active_combo(db, combo_id)
        item = _current_item(combo, data.piece_code)
        remaining = sum(1 for i in combo.items if i.unlinked_at is None) - 1
        if remaining < MIN_PIECES:
            raise ValidationException(
                f"A combo needs at least {MIN_PIECES} pieces. Swap {data.piece_code} for another piece, "
                "or dissolve the combo."
            )
        item.unlinked_at = utcnow()
        await _log(db, combo, EVENT_UNLINKED, item.piece, note=data.note)
        await _commit(db)
        return await _reload(db, combo.id)

    @staticmethod
    async def swap(db: AsyncSession, combo_id: str, data: SwapIn) -> ComboOut:
        if data.out_code == data.in_code:
            raise ValidationException("Pick a different piece to swap in.", field="in_code")
        combo = await _active_combo(db, combo_id)
        item = _current_item(combo, data.out_code)
        incoming = await _eligible_piece(db, data.in_code)
        now = utcnow()
        item.unlinked_at = now
        # Flush the unlink first so the partial unique index never sees both rows active.
        await db.flush()
        db.add(ComboItem(id=_new_id(), combo_id=combo.id, piece_id=incoming.id, linked_at=now))
        await _log(db, combo, EVENT_SWAPPED, item.piece, other=incoming, note=data.note)
        await _commit(db)
        return await _reload(db, combo.id)

    @staticmethod
    async def dissolve(db: AsyncSession, combo_id: str, data: DissolveIn) -> ComboOut:
        combo = await _active_combo(db, combo_id)
        now = utcnow()
        released = [i for i in combo.items if i.unlinked_at is None]
        for item in released:
            item.unlinked_at = now
        combo.status = COMBO_STATUS_DISSOLVED
        combo.dissolved_at = now
        await _log(db, combo, EVENT_DISSOLVED,
                   note=data.note or "Released " + ", ".join(i.piece.item_code for i in released))
        await _commit(db)
        return await _reload(db, combo.id)

    @staticmethod
    async def events(db: AsyncSession, combo_id: str) -> List[ComboEventOut]:
        if not await ComboRepository.get(db, combo_id):
            raise NotFoundException("Combo not found.")
        return [
            ComboEventOut(seq=e.seq, event=e.event, item_code=e.item_code, other_item_code=e.other_item_code,
                          note=e.note, by_name=e.by_name, at=e.at)
            for e in await ComboRepository.events(db, combo_id)
        ]

    @staticmethod
    async def piece_history(db: AsyncSession, piece_code: str) -> List[PieceComboHistoryOut]:
        piece = await PieceRepository.get_by_code(db, piece_code)
        if not piece:
            raise NotFoundException(f"No piece with code {piece_code.strip().upper()}.")
        return [
            PieceComboHistoryOut(
                combo_id=c.id, combo_code=c.combo_code, combo_name=c.name, combo_status=c.status,
                linked_at=i.linked_at, unlinked_at=i.unlinked_at, current=i.unlinked_at is None,
            )
            for i, c in await ComboItemRepository.history_for_piece(db, piece.id)
        ]

    @staticmethod
    async def available_pieces(db: AsyncSession, q: Optional[str], limit: int,
                               category_id: Optional[str] = None) -> List[AvailablePieceOut]:
        return [_available(p) for p in await ComboItemRepository.available_pieces(db, q, limit, category_id)]

    @staticmethod
    async def suggestions(db: AsyncSession, codes: List[str], category_id: Optional[str],
                          limit: int) -> List[SuggestionOut]:
        """Free pieces that go well with the chosen ones, best first.

        Scored on: same purity; how often their designs have been put together
        before; how often their categories make a set; same lot. With nothing
        chosen yet, it simply lists free pieces (of the category, if given)."""
        chosen: List[Piece] = []
        for code in dict.fromkeys(c.strip().upper() for c in codes if c.strip()):
            p = await PieceRepository.get_by_code(db, code)
            if not p:
                raise NotFoundException(f"No piece with code {code}.")
            chosen.append(p)
        chosen_ids = {p.id for p in chosen}
        pool = [p for p in await ComboItemRepository.available_pieces(db, None, 400, category_id)
                if p.id not in chosen_ids]
        if not chosen:
            return [SuggestionOut(**_available(p).model_dump(), score=0, reasons=[]) for p in pool[:limit]]

        # Which designs / categories have been in the same combo before.
        by_combo: Dict[str, List[tuple]] = {}
        for combo_id, design_id, cat_id in await ComboItemRepository.pairings(db):
            by_combo.setdefault(combo_id, []).append((design_id, cat_id))
        design_pairs: Counter = Counter()
        cat_pairs: Counter = Counter()
        for members in by_combo.values():
            designs = {d for d, _ in members if d}
            cats = {c for _, c in members}
            for a in designs:
                for b in designs:
                    if a != b:
                        design_pairs[(a, b)] += 1
            for a in cats:
                for b in cats:
                    if a != b:
                        cat_pairs[(a, b)] += 1

        purities = {p.purity for p in chosen}
        chosen_designs = {p.design_id: p for p in chosen if p.design_id}
        chosen_cats = {p.category_id: p.category.name for p in chosen}
        chosen_lots: Set[str] = {p.lot_id for p in chosen if p.lot_id}

        ranked = []
        for cand in pool:
            score, reasons = 0, []
            if len(purities) == 1 and cand.purity in purities:
                score += 3
                reasons.append(f"Same purity ({cand.purity})")
            if cand.design_id:
                for did, p in chosen_designs.items():
                    n = design_pairs[(did, cand.design_id)]
                    if n:
                        score += min(2 * n, 6)
                        reasons.append(f"Paired with {p.design.name} {n} time{'s' if n > 1 else ''} before")
            if not category_id and cand.category_id not in chosen_cats:
                best = max((cat_pairs[(c, cand.category_id)], name) for c, name in chosen_cats.items())
                if best[0]:
                    score += min(best[0], 3)
                    reasons.append(f"{best[1]} + {cand.category.name} is a common set")
            if cand.lot_id and cand.lot_id in chosen_lots:
                score += 1
                reasons.append(f"Same lot ({cand.lot.lot_no})")
            ranked.append((score, cand, reasons))
        ranked.sort(key=lambda r: (-r[0], r[1].item_code))
        return [SuggestionOut(**_available(c).model_dump(), score=s, reasons=r) for s, c, r in ranked[:limit]]

    @staticmethod
    async def set_photo(db: AsyncSession, combo_id: str, file: UploadFile) -> ComboOut:
        combo = await ComboRepository.get(db, combo_id)
        if not combo:
            raise NotFoundException("Combo not found.")
        old = combo.photo_path
        combo.photo_path = await save_image(file, "combos")
        await db.commit()
        delete_upload(old)
        return await _reload(db, combo.id)

    @staticmethod
    async def remove_photo(db: AsyncSession, combo_id: str) -> ComboOut:
        combo = await ComboRepository.get(db, combo_id)
        if not combo:
            raise NotFoundException("Combo not found.")
        old, combo.photo_path = combo.photo_path, None
        await db.commit()
        delete_upload(old)
        return await _reload(db, combo.id)


def _available(p: Piece) -> AvailablePieceOut:
    return AvailablePieceOut(
        piece_id=p.id, item_code=p.item_code, name=p.name, category_id=p.category_id, category_name=p.category.name,
        design_name=p.design.name if p.design else None, purity=p.purity,
        gross_weight=float(p.gross_weight), stone_weight=float(p.stone_weight), net_weight=float(p.net_weight),
        touch_percent=float(p.touch_percent) if p.touch_percent is not None else None, huid=p.huid,
        photo_url=upload_url(p.photo_path),
    )


# ----------------------------------------------------------------- templates

async def _template_out(db: AsyncSession, t: ComboTemplate) -> TemplateOut:
    ids = [s["category_id"] for s in t.slots]
    names = dict((await db.execute(select(Category.id, Category.name).where(Category.id.in_(ids)))).all())
    return TemplateOut(
        id=t.id, name=t.name, is_active=t.is_active,
        slots=[TemplateSlotOut(category_id=s["category_id"], category_name=names.get(s["category_id"], "?"),
                               label=s.get("label") or names.get(s["category_id"], "?")) for s in t.slots],
    )


class TemplateService:
    @staticmethod
    async def list(db: AsyncSession, include_inactive: bool) -> List[TemplateOut]:
        stmt = select(ComboTemplate).order_by(ComboTemplate.name)
        if not include_inactive:
            stmt = stmt.where(ComboTemplate.is_active.is_(True))
        return [await _template_out(db, t) for t in (await db.execute(stmt)).scalars()]

    @staticmethod
    async def _check(db: AsyncSession, data: TemplateIn, exclude: Optional[str] = None) -> list:
        stmt = select(ComboTemplate.id).where(func.lower(ComboTemplate.name) == data.name.lower())
        if exclude:
            stmt = stmt.where(ComboTemplate.id != exclude)
        if (await db.execute(stmt)).first():
            raise ConflictException(f"A template named '{data.name}' already exists.")
        ids = {s.category_id for s in data.slots}
        found = {r for (r,) in (await db.execute(select(Category.id).where(Category.id.in_(ids)))).all()}
        if found != ids:
            raise NotFoundException("One of the categories in this template doesn't exist.")
        return [{"category_id": s.category_id, "label": s.label or None} for s in data.slots]

    @staticmethod
    async def create(db: AsyncSession, data: TemplateIn) -> TemplateOut:
        t = ComboTemplate(id=_new_id(), name=data.name, slots=await TemplateService._check(db, data), is_active=True)
        db.add(t)
        await db.commit()
        return await _template_out(db, t)

    @staticmethod
    async def update(db: AsyncSession, template_id: str, data: TemplateIn) -> TemplateOut:
        t = await db.get(ComboTemplate, template_id)
        if not t:
            raise NotFoundException("Template not found.")
        t.slots = await TemplateService._check(db, data, exclude=t.id)
        t.name = data.name
        if data.is_active is not None:
            t.is_active = data.is_active
        await db.commit()
        return await _template_out(db, t)
