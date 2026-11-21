import re
import uuid
from datetime import timezone, date
from decimal import Decimal
from typing import Dict, List, Optional

from fastapi import UploadFile
from sqlalchemy import case, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app._shared.core.actor import actor_name
from app._shared.core.uploads import delete_upload, save_image, upload_url
from app._shared.exceptions.base import ConflictException, NotFoundException, ValidationException
from app.modules.billing.pricing import fine_of
from app.modules.inventory.model import (
    LOT_COUNTER_KEY,
    PIECE_STATUS_IN_STOCK,
    PIECE_STATUS_INACTIVE,
    PIECE_STATUS_SOLD,
    Category,
    Design,
    Karigar,
    Lot,
    Piece,
)
from app.modules.inventory.repository import (
    CategoryRepository,
    CodeSequenceRepository,
    DesignRepository,
    PieceRepository,
)
from app.modules.inventory.schema import (
    CategoryCreate,
    CategoryOut,
    CategoryUpdate,
    DesignCreate,
    DesignOut,
    DesignUpdate,
    KarigarIn,
    KarigarOut,
    LotCreate,
    LotOut,
    LotUpdate,
    PieceBulkIn,
    PieceCreate,
    PieceList,
    PieceOut,
    PieceUpdate,
)

# Prefixes the system keeps for its own codes. CB = combos.
RESERVED_PREFIXES = {"CB"}
_PREFIX_RE = re.compile(r"^[A-Z]{2,3}$")
_MG = Decimal("0.001")


def _new_id() -> str:
    return str(uuid.uuid4())


def _grams(value: float) -> Decimal:
    return Decimal(str(value)).quantize(_MG)


def _check_prefix(prefix: str) -> str:
    prefix = prefix.upper()
    if not _PREFIX_RE.match(prefix):
        raise ValidationException("Code prefix must be 2 or 3 letters (A-Z), e.g. CH.", field="code_prefix")
    if prefix in RESERVED_PREFIXES:
        raise ValidationException(f"{prefix} is reserved for combos. Pick another prefix.", field="code_prefix")
    return prefix


def _weights(gross: Decimal, stone: Decimal) -> Decimal:
    if stone >= gross:
        raise ValidationException("Stone weight must be less than gross weight.", field="stone_weight")
    return gross - stone


def _aware(dt):
    return dt.replace(tzinfo=timezone.utc) if dt is not None and dt.tzinfo is None else dt


def tag_state(p: Piece, back=None):
    """(state, note) for a piece's physical tag. Only in-stock pieces need tags.
    back: the combo code, or (combo code, partner codes now, when the combo last changed)."""
    combo_code, back_with, changed_at = back if isinstance(back, tuple) else (back, None, None)
    if p.status != PIECE_STATUS_IN_STOCK:
        return None, None
    if p.tag_printed_at is None:
        return "NEW", "Tag not printed yet"
    if (p.tag_back_code or None) != combo_code:
        if combo_code and not p.tag_back_code:
            return "COMBO_CHANGED", f"Now in {combo_code}: print the tag with the combo on the back"
        if not combo_code:
            return "COMBO_CHANGED", f"Tag back still says {p.tag_back_code}, but it is no longer in a combo"
        return "COMBO_CHANGED", f"Tag back says {p.tag_back_code}, but it is now in {combo_code}"
    # Same combo, but its pieces may have changed: the back lists the partners.
    if combo_code and back_with is not None:
        if p.tag_back_with is not None:
            if p.tag_back_with != back_with:
                return "COMBO_CHANGED", f"{combo_code} changed: the back says with {p.tag_back_with or 'no other piece'}, now with {back_with or 'no other piece'}"
        elif changed_at is not None and _aware(p.tag_printed_at) < _aware(changed_at):
            return "COMBO_CHANGED", f"{combo_code} changed since this tag was printed: the back should say with {back_with}"
    return "OK", None



def piece_out(p: Piece, combo_code: Optional[str] = None, back=None) -> PieceOut:
    return PieceOut(
        id=p.id,
        item_code=p.item_code,
        category_id=p.category_id,
        category_name=p.category.name,
        design_id=p.design_id,
        design_name=p.design.name if p.design else None,
        name=p.name,
        purity=p.purity,
        gross_weight=float(p.gross_weight),
        stone_weight=float(p.stone_weight),
        net_weight=float(p.net_weight),
        touch_percent=float(p.touch_percent) if p.touch_percent is not None else None,
        cost_touch=float(p.cost_touch) if p.cost_touch is not None else None,
        status=p.status,
        remarks=p.remarks,
        huid=p.huid,
        lot_id=p.lot_id,
        lot_no=p.lot.lot_no if p.lot else None,
        karigar_name=p.lot.karigar.name if p.lot and p.lot.karigar else None,
        photo_url=upload_url(p.photo_path),
        created_by_name=p.created_by_name,
        created_at=p.created_at,
        combo_code=combo_code,
        tag_state=tag_state(p, back or combo_code)[0],
    )


def _design_out(d: Design, in_stock: int) -> DesignOut:
    return DesignOut(
        id=d.id, category_id=d.category_id, category_name=d.category.name, name=d.name,
        design_no=d.design_no, is_active=d.is_active, in_stock_count=in_stock,
        default_percent=float(d.default_percent) if d.default_percent is not None else None,
    )


def _category_out(c: Category, pieces: int) -> CategoryOut:
    return CategoryOut(
        id=c.id, name=c.name, code_prefix=c.code_prefix, hsn_code=c.hsn_code or "7113", is_active=c.is_active,
        piece_count=pieces, prefix_locked=pieces > 0,
    )


class CategoryService:
    @staticmethod
    async def list(db: AsyncSession) -> List[CategoryOut]:
        return [_category_out(c, n) for c, n in await CategoryRepository.list(db)]

    @staticmethod
    async def create(db: AsyncSession, data: CategoryCreate) -> CategoryOut:
        prefix = _check_prefix(data.code_prefix)
        if await CategoryRepository.find_by_name(db, data.name):
            raise ConflictException(f"A category named '{data.name}' already exists.")
        if await CategoryRepository.find_by_prefix(db, prefix):
            raise ConflictException(f"Code prefix {prefix} is already used by another category.")
        from app.modules.business.service import BusinessService
        default_hsn = (await BusinessService.load(db)).default_hsn or "7113"
        cat = Category(id=_new_id(), name=data.name, code_prefix=prefix, hsn_code=data.hsn_code or default_hsn,
                       is_active=True)
        db.add(cat)
        await db.commit()
        return _category_out(cat, 0)

    @staticmethod
    async def update(db: AsyncSession, category_id: str, data: CategoryUpdate) -> CategoryOut:
        cat = await CategoryRepository.get(db, category_id)
        if not cat:
            raise NotFoundException("Category not found.")
        pieces = await CategoryRepository.piece_count(db, cat.id)

        if data.name is not None and data.name.lower() != cat.name.lower():
            if await CategoryRepository.find_by_name(db, data.name):
                raise ConflictException(f"A category named '{data.name}' already exists.")
        if data.name is not None:
            cat.name = data.name
        if data.code_prefix is not None:
            prefix = _check_prefix(data.code_prefix)
            if prefix != cat.code_prefix:
                if pieces:
                    raise ConflictException(
                        "This prefix is already on printed codes, so it cannot change. "
                        "Create a new category instead."
                    )
                if await CategoryRepository.find_by_prefix(db, prefix):
                    raise ConflictException(f"Code prefix {prefix} is already used by another category.")
                cat.code_prefix = prefix
        if data.hsn_code:
            cat.hsn_code = data.hsn_code
        if data.is_active is not None:
            cat.is_active = data.is_active
        await db.commit()
        return _category_out(cat, pieces)


async def _design_stats(db: AsyncSession, design_ids: List[str]) -> Dict[str, tuple]:
    """design_id -> (most used touch %, average net g, pieces) over every piece ever
    entered with that design. Used to pre-fill touch and to warn about odd weights."""
    if not design_ids:
        return {}
    avg = dict(((did, (float(a), n)) for did, a, n in (await db.execute(
        select(Piece.design_id, func.avg(Piece.net_weight), func.count(Piece.id))
        .where(Piece.design_id.in_(design_ids)).group_by(Piece.design_id)
    )).all()))
    touch_counts = (await db.execute(
        select(Piece.design_id, Piece.touch_percent, func.count(Piece.id))
        .where(Piece.design_id.in_(design_ids), Piece.touch_percent.is_not(None))
        .group_by(Piece.design_id, Piece.touch_percent)
    )).all()
    best: Dict[str, tuple] = {}
    for did, touch, n in touch_counts:
        if did not in best or n > best[did][1]:
            best[did] = (float(touch), n)
    return {did: (best.get(did, (None,))[0], round(a, 3), n) for did, (a, n) in avg.items()}


class DesignService:
    @staticmethod
    async def list(db: AsyncSession, category_id: Optional[str]) -> List[DesignOut]:
        rows = await DesignRepository.list(db, category_id)
        stats = await _design_stats(db, [d.id for d, _ in rows])
        out = []
        for d, n in rows:
            o = _design_out(d, n)
            st = stats.get(d.id)
            if st:
                o.usual_touch, o.typical_net, o.piece_count = st
            out.append(o)
        return out

    @staticmethod
    async def create(db: AsyncSession, data: DesignCreate) -> DesignOut:
        cat = await CategoryRepository.get(db, data.category_id)
        if not cat:
            raise NotFoundException("Category not found.")
        if not cat.is_active:
            raise ValidationException("This category is inactive.", field="category_id")
        if await DesignRepository.find_by_name(db, cat.id, data.name):
            raise ConflictException(f"'{data.name}' already exists in {cat.name}.")
        d = Design(id=_new_id(), category_id=cat.id, name=data.name, design_no=data.design_no or None,
                   default_percent=Decimal(str(data.default_percent)) if data.default_percent is not None else None)
        db.add(d)
        await db.commit()
        d = await DesignRepository.get(db, d.id)
        return _design_out(d, 0)

    @staticmethod
    async def update(db: AsyncSession, design_id: str, data: DesignUpdate) -> DesignOut:
        d = await DesignRepository.get(db, design_id)
        if not d:
            raise NotFoundException("Design not found.")
        if data.name is not None and data.name.lower() != d.name.lower():
            if await DesignRepository.find_by_name(db, d.category_id, data.name):
                raise ConflictException(f"'{data.name}' already exists in this category.")
            d.name = data.name
        if "design_no" in data.model_fields_set:
            d.design_no = data.design_no or None
        if "default_percent" in data.model_fields_set:
            d.default_percent = Decimal(str(data.default_percent)) if data.default_percent is not None else None
        if data.is_active is not None:
            d.is_active = data.is_active
        await db.commit()
        return _design_out(d, await DesignRepository.in_stock_count(db, d.id))


async def _combo_codes(db: AsyncSession, piece_ids) -> dict:
    # Imported here: combos depends on inventory, not the other way round.
    from app.modules.combos.repository import ComboItemRepository
    return await ComboItemRepository.active_combo_codes(db, piece_ids)


async def _combo_backs(db: AsyncSession, piece_ids) -> dict:
    from app.modules.combos.repository import ComboItemRepository
    return await ComboItemRepository.active_backs(db, piece_ids)


async def _piece_out(db: AsyncSession, p: Piece) -> PieceOut:
    back = (await _combo_backs(db, [p.id])).get(p.id)
    return piece_out(p, back[0] if back else None, back)


async def _huid_owner(db: AsyncSession, huid: str, exclude_id: Optional[str] = None) -> Optional[str]:
    stmt = select(Piece.item_code).where(Piece.huid == huid)
    if exclude_id:
        stmt = stmt.where(Piece.id != exclude_id)
    return (await db.execute(stmt)).scalar_one_or_none()


async def _check_lot(db: AsyncSession, lot_id: Optional[str]) -> Optional[str]:
    if not lot_id:
        return None
    if not await db.get(Lot, lot_id):
        raise NotFoundException("Lot not found.")
    return lot_id


class PieceService:
    @staticmethod
    async def _resolve_design(db: AsyncSession, design_id: Optional[str], category_id: str) -> Optional[str]:
        if not design_id:
            return None
        d = await DesignRepository.get(db, design_id)
        if not d:
            raise NotFoundException("Design not found.")
        if d.category_id != category_id:
            raise ValidationException("That design belongs to a different category.", field="design_id")
        if not d.is_active:
            raise ValidationException("That design is inactive.", field="design_id")
        return d.id

    @staticmethod
    async def list(db: AsyncSession, **filters) -> PieceList:
        items, total = await PieceRepository.list(db, **filters)
        backs = await _combo_backs(db, [p.id for p in items])
        return PieceList(items=[piece_out(p, backs[p.id][0] if p.id in backs else None, backs.get(p.id)) for p in items],
                         total=total)

    @staticmethod
    async def get(db: AsyncSession, piece_id: str) -> PieceOut:
        p = await PieceRepository.get(db, piece_id)
        if not p:
            raise NotFoundException("Piece not found.")
        return await _piece_out(db, p)

    @staticmethod
    async def get_by_code(db: AsyncSession, code: str) -> PieceOut:
        p = await PieceRepository.get_by_code(db, code)
        if not p:
            raise NotFoundException(f"No piece with code {code.strip().upper()}.")
        return await _piece_out(db, p)

    @staticmethod
    async def _add(db: AsyncSession, data: PieceCreate, default_lot: Optional[str] = None) -> Piece:
        """Validate and add one piece (allocates its code); the caller commits."""
        cat = await CategoryRepository.get(db, data.category_id)
        if not cat:
            raise NotFoundException("Category not found.")
        if not cat.is_active:
            raise ValidationException("This category is inactive.", field="category_id")
        design_id = await PieceService._resolve_design(db, data.design_id, cat.id)
        design = await DesignRepository.get(db, design_id) if design_id else None
        touch = data.touch_percent
        if touch is None and design is not None and design.default_percent is not None:
            touch = float(design.default_percent)  # the sub-category's usual %
        name = (data.name or "").strip() or (design.name if design else cat.name)
        if data.huid:
            owner = await _huid_owner(db, data.huid)
            if owner:
                raise ConflictException(f"HUID {data.huid} is already on {owner}.")
        lot_id = await _check_lot(db, data.lot_id or default_lot)

        gross, stone = _grams(data.gross_weight), _grams(data.stone_weight)
        net = _weights(gross, stone)

        piece = Piece(
            id=_new_id(),
            item_code=await CodeSequenceRepository.next_code(db, cat.code_prefix),
            category_id=cat.id,
            design_id=design_id,
            name=name,
            purity=data.purity,
            gross_weight=gross,
            stone_weight=stone,
            net_weight=net,
            touch_percent=Decimal(str(touch)) if touch is not None else None,
            cost_touch=Decimal(str(data.cost_touch)) if data.cost_touch is not None else None,
            status=PIECE_STATUS_IN_STOCK,
            remarks=data.remarks or None,
            huid=data.huid,
            lot_id=lot_id,
            created_by_name=actor_name(),
        )
        db.add(piece)
        await db.flush()
        return piece

    @staticmethod
    async def _commit(db: AsyncSession) -> None:
        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()
            raise ConflictException("That HUID was just used on another piece. Check it and try again.")

    @staticmethod
    async def create(db: AsyncSession, data: PieceCreate) -> PieceOut:
        piece = await PieceService._add(db, data)
        await PieceService._commit(db)
        return piece_out(await PieceRepository.get(db, piece.id))

    @staticmethod
    async def create_bulk(db: AsyncSession, data: PieceBulkIn) -> PieceList:
        """All rows or none. Errors name the row (1-based) as staff see it."""
        huids: Dict[str, int] = {}
        for i, row in enumerate(data.pieces, 1):
            if row.huid:
                if row.huid in huids:
                    raise ValidationException(f"Row {i}: HUID {row.huid} is also on row {huids[row.huid]}.")
                huids[row.huid] = i
        created: List[Piece] = []
        for i, row in enumerate(data.pieces, 1):
            try:
                created.append(await PieceService._add(db, row, data.lot_id))
            except (ValidationException, ConflictException, NotFoundException) as exc:
                await db.rollback()
                err = exc.__class__(f"Row {i}: {exc.message} Nothing was saved.")
                raise err
        await PieceService._commit(db)
        items = [await PieceRepository.get(db, p.id) for p in created]
        return PieceList(items=[piece_out(p) for p in items], total=len(items))

    @staticmethod
    async def update(db: AsyncSession, piece_id: str, data: PieceUpdate) -> PieceOut:
        p = await PieceRepository.get(db, piece_id)
        if not p:
            raise NotFoundException("Piece not found.")
        if p.status == PIECE_STATUS_SOLD:
            raise ConflictException("This piece is sold and can no longer be edited.")

        sent = data.model_fields_set
        if "design_id" in sent:
            p.design_id = await PieceService._resolve_design(db, data.design_id, p.category_id)
        if data.name is not None:
            p.name = data.name
        if data.purity is not None:
            p.purity = data.purity
        if data.gross_weight is not None or data.stone_weight is not None:
            gross = _grams(data.gross_weight) if data.gross_weight is not None else p.gross_weight
            stone = _grams(data.stone_weight) if data.stone_weight is not None else p.stone_weight
            p.net_weight = _weights(gross, stone)
            p.gross_weight, p.stone_weight = gross, stone
        if "touch_percent" in sent:
            p.touch_percent = Decimal(str(data.touch_percent)) if data.touch_percent is not None else None
        if "cost_touch" in sent:
            p.cost_touch = Decimal(str(data.cost_touch)) if data.cost_touch is not None else None
        if "remarks" in sent:
            p.remarks = data.remarks or None
        if "huid" in sent:
            if data.huid:
                owner = await _huid_owner(db, data.huid, exclude_id=p.id)
                if owner:
                    raise ConflictException(f"HUID {data.huid} is already on {owner}.")
            p.huid = data.huid
        if "lot_id" in sent:
            p.lot_id = await _check_lot(db, data.lot_id)
        if data.status is not None and data.status != p.status:
            if data.status == PIECE_STATUS_INACTIVE:
                combo = (await _combo_codes(db, [p.id])).get(p.id)
                if combo:
                    raise ConflictException(f"{p.item_code} is in combo {combo}. Unlink it there before retiring it.")
            p.status = data.status
        await PieceService._commit(db)
        return await _piece_out(db, await PieceRepository.get(db, p.id))

    @staticmethod
    async def set_photo(db: AsyncSession, piece_id: str, file: UploadFile) -> PieceOut:
        p = await PieceRepository.get(db, piece_id)
        if not p:
            raise NotFoundException("Piece not found.")
        old = p.photo_path
        p.photo_path = await save_image(file, "pieces")
        await db.commit()
        delete_upload(old)
        return await _piece_out(db, await PieceRepository.get(db, p.id))

    @staticmethod
    async def remove_photo(db: AsyncSession, piece_id: str) -> PieceOut:
        p = await PieceRepository.get(db, piece_id)
        if not p:
            raise NotFoundException("Piece not found.")
        old, p.photo_path = p.photo_path, None
        await db.commit()
        delete_upload(old)
        return await _piece_out(db, await PieceRepository.get(db, p.id))


# ------------------------------------------------------- karigars and lots

def _karigar_out(k: Karigar, lots: int = 0) -> KarigarOut:
    return KarigarOut(id=k.id, name=k.name, phone=k.phone, city=k.city, notes=k.notes, is_active=k.is_active,
                      lot_count=lots)


class KarigarService:
    @staticmethod
    async def list(db: AsyncSession, include_inactive: bool) -> List[KarigarOut]:
        counts = select(Lot.karigar_id, func.count(Lot.id).label("n")).group_by(Lot.karigar_id).subquery()
        stmt = select(Karigar, func.coalesce(counts.c.n, 0)).outerjoin(counts, counts.c.karigar_id == Karigar.id)
        if not include_inactive:
            stmt = stmt.where(Karigar.is_active.is_(True))
        rows = await db.execute(stmt.order_by(Karigar.name))
        return [_karigar_out(k, n) for k, n in rows.all()]

    @staticmethod
    async def _name_taken(db: AsyncSession, name: str, exclude: Optional[str] = None) -> bool:
        stmt = select(Karigar.id).where(func.lower(Karigar.name) == name.lower())
        if exclude:
            stmt = stmt.where(Karigar.id != exclude)
        return (await db.execute(stmt)).first() is not None

    @staticmethod
    async def create(db: AsyncSession, data: KarigarIn) -> KarigarOut:
        if await KarigarService._name_taken(db, data.name):
            raise ConflictException(f"A karigar named '{data.name}' already exists.")
        k = Karigar(id=_new_id(), name=data.name, phone=data.phone or None, city=data.city or None,
                    notes=data.notes or None, is_active=True)
        db.add(k)
        await db.commit()
        return _karigar_out(k)

    @staticmethod
    async def update(db: AsyncSession, karigar_id: str, data: KarigarIn) -> KarigarOut:
        k = await db.get(Karigar, karigar_id)
        if not k:
            raise NotFoundException("Karigar not found.")
        if data.name.lower() != k.name.lower() and await KarigarService._name_taken(db, data.name, k.id):
            raise ConflictException(f"A karigar named '{data.name}' already exists.")
        k.name, k.phone, k.city, k.notes = data.name, data.phone or None, data.city or None, data.notes or None
        if data.is_active is not None:
            k.is_active = data.is_active
        await db.commit()
        return _karigar_out(k)


async def _lot_out(db: AsyncSession, lot: Lot) -> LotOut:
    in_stock = func.sum(case((Piece.status == PIECE_STATUS_IN_STOCK, 1), else_=0))
    no_cost = func.sum(case((Piece.cost_touch.is_(None), 1), else_=0))
    row = (await db.execute(
        select(func.count(Piece.id), func.coalesce(func.sum(Piece.gross_weight), 0),
               func.coalesce(func.sum(Piece.net_weight), 0), func.coalesce(in_stock, 0), func.coalesce(no_cost, 0))
        .where(Piece.lot_id == lot.id)
    )).one()
    # Fine that came back, piece by piece with the bill's rounding.
    costed = (await db.execute(
        select(Piece.net_weight, Piece.cost_touch).where(Piece.lot_id == lot.id, Piece.cost_touch.is_not(None))
    )).all()
    returned = sum((fine_of(Decimal(str(n)), Decimal(str(t))) for n, t in costed), Decimal("0"))
    given = lot.gold_given_fine
    return LotOut(id=lot.id, lot_no=lot.lot_no, karigar_id=lot.karigar_id,
                  karigar_name=lot.karigar.name if lot.karigar else None, received_on=lot.received_on,
                  remarks=lot.remarks, created_by_name=lot.created_by_name, piece_count=row[0],
                  total_gross=float(row[1]), total_net=float(row[2]), in_stock_count=int(row[3]),
                  gold_given_fine=float(given) if given is not None else None, returned_fine=float(returned),
                  pieces_without_cost_touch=int(row[4]),
                  karigar_balance=float(given - returned) if given is not None else None)


class LotService:
    @staticmethod
    async def list(db: AsyncSession, karigar_id: Optional[str], limit: int) -> List[LotOut]:
        stmt = select(Lot).order_by(Lot.received_on.desc(), Lot.lot_no.desc()).limit(limit)
        if karigar_id:
            stmt = stmt.where(Lot.karigar_id == karigar_id)
        return [await _lot_out(db, lot) for lot in (await db.execute(stmt)).unique().scalars()]

    @staticmethod
    async def get(db: AsyncSession, lot_id: str) -> LotOut:
        lot = await db.get(Lot, lot_id)
        if not lot:
            raise NotFoundException("Lot not found.")
        return await _lot_out(db, lot)

    @staticmethod
    async def _karigar(db: AsyncSession, karigar_id: Optional[str]) -> Optional[str]:
        if not karigar_id:
            return None
        if not await db.get(Karigar, karigar_id):
            raise NotFoundException("Karigar not found.")
        return karigar_id

    @staticmethod
    async def create(db: AsyncSession, data: LotCreate) -> LotOut:
        karigar_id = await LotService._karigar(db, data.karigar_id)
        n = await CodeSequenceRepository.next_value(db, LOT_COUNTER_KEY)
        lot = Lot(id=_new_id(), lot_no=f"LOT-{n:04d}", karigar_id=karigar_id,
                  received_on=data.received_on or date.today(), remarks=data.remarks or None,
                  gold_given_fine=Decimal(str(data.gold_given_fine)) if data.gold_given_fine is not None else None,
                  created_by_name=actor_name())
        db.add(lot)
        await db.commit()
        return await _lot_out(db, await db.get(Lot, lot.id, populate_existing=True))

    @staticmethod
    async def update(db: AsyncSession, lot_id: str, data: LotUpdate) -> LotOut:
        lot = await db.get(Lot, lot_id)
        if not lot:
            raise NotFoundException("Lot not found.")
        sent = data.model_fields_set
        if "karigar_id" in sent:
            lot.karigar_id = await LotService._karigar(db, data.karigar_id)
        if data.received_on:
            lot.received_on = data.received_on
        if "remarks" in sent:
            lot.remarks = data.remarks or None
        if "gold_given_fine" in sent:
            lot.gold_given_fine = Decimal(str(data.gold_given_fine)) if data.gold_given_fine is not None else None
        await db.commit()
        return await _lot_out(db, await db.get(Lot, lot.id, populate_existing=True))
