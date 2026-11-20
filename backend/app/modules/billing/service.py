import uuid
from datetime import date
from decimal import Decimal
from typing import Dict, List, Optional, Tuple

from sqlalchemy import func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app._shared.core.actor import actor_name
from app._shared.core.gst_states import code_from_gstin, state_name
from app._shared.exceptions.base import ConflictException, NotFoundException, ValidationException
from app.modules.business.model import BusinessProfile
from app.modules.business.service import BusinessService
from app.modules.rates.service import RateService
from app.modules.billing.model import (
    BILL_COUNTER_KEY,
    BILL_STATUS_CANCELLED,
    BILL_STATUS_FINAL,
    LINE_KIND_COMBO,
    LINE_KIND_PIECE,
    Bill,
    BillLine,
    BillLinePiece,
    Shop,
)
from app.modules.billing.pricing import (
    PURITY_PERCENT, LineCalc, PieceCalc, Totals, d, fine_of, making_for, totals, touch_from_wastage,
)
from app.modules.billing.schema import (
    BillDraft,
    BillLineIn,
    BillLineOut,
    BillLinePieceOut,
    BillList,
    BillOut,
    BillSummaryOut,
    BillTotals,
    CancelIn,
    QuoteOut,
    ShopCreate,
    ShopOut,
    ShopUpdate,
    PieceBillOut,
)
from app.modules.billing.words import rupees_in_words
from app.modules.combos.model import COMBO_PREFIX, COMBO_STATUS_ACTIVE, COMBO_STATUS_SOLD, Combo, utcnow
from app.modules.combos.repository import ComboItemRepository, ComboRepository
from app.modules.inventory.model import PIECE_STATUS_IN_STOCK, PIECE_STATUS_SOLD, Piece
from app.modules.inventory.repository import CodeSequenceRepository, PieceRepository

_STATUS_WORD = {"SOLD": "already sold", "INACTIVE": "inactive"}


def _new_id() -> str:
    return str(uuid.uuid4())


def _shop_out(s: Shop) -> ShopOut:
    return ShopOut(id=s.id, name=s.name, contact_person=s.contact_person, phone=s.phone, gstin=s.gstin,
                   address=s.address, city=s.city, state_code=s.state_code, state_name=state_name(s.state_code),
                   is_active=s.is_active)


# ------------------------------------------------------------------- shops

class ShopService:
    @staticmethod
    async def list(db: AsyncSession, q: Optional[str], include_inactive: bool) -> List[ShopOut]:
        stmt = select(Shop).order_by(Shop.name)
        if not include_inactive:
            stmt = stmt.where(Shop.is_active.is_(True))
        if q:
            like = f"%{q.strip().lower()}%"
            stmt = stmt.where(or_(func.lower(Shop.name).like(like), func.lower(Shop.city).like(like), Shop.phone.like(like)))
        return [_shop_out(s) for s in (await db.execute(stmt)).scalars()]

    @staticmethod
    async def _name_taken(db: AsyncSession, name: str, exclude_id: Optional[str] = None) -> bool:
        stmt = select(Shop.id).where(func.lower(Shop.name) == name.lower())
        if exclude_id:
            stmt = stmt.where(Shop.id != exclude_id)
        return (await db.execute(stmt)).first() is not None

    @staticmethod
    async def create(db: AsyncSession, data: ShopCreate) -> ShopOut:
        if await ShopService._name_taken(db, data.name):
            raise ConflictException(f"A shop named '{data.name}' already exists.")
        shop = Shop(id=_new_id(), is_active=True, **{k: (v or None) for k, v in data.model_dump().items()})
        shop.name = data.name
        shop.state_code = code_from_gstin(shop.gstin) or shop.state_code
        db.add(shop)
        await db.commit()
        return _shop_out(shop)

    @staticmethod
    async def update(db: AsyncSession, shop_id: str, data: ShopUpdate) -> ShopOut:
        shop = await db.get(Shop, shop_id)
        if not shop:
            raise NotFoundException("Shop not found.")
        for k in data.model_fields_set:
            v = getattr(data, k)
            if k == "name":
                if not v:
                    continue  # a shop always keeps a name
                if await ShopService._name_taken(db, v, exclude_id=shop.id):
                    raise ConflictException(f"A shop named '{v}' already exists.")
                shop.name = v
            elif k == "is_active":
                if v is not None:
                    shop.is_active = v
            else:
                setattr(shop, k, v or None)  # blank clears the field
        if "gstin" in data.model_fields_set and code_from_gstin(shop.gstin):
            shop.state_code = code_from_gstin(shop.gstin)
        await db.commit()
        return _shop_out(shop)


# ------------------------------------------------------- building a bill

def _piece_touch(piece: Piece, entry: BillLineIn) -> Decimal:
    if entry.touch_percent is not None:
        return d(entry.touch_percent)
    if entry.wastage_percent is not None:
        if piece.purity not in PURITY_PERCENT:
            raise ValidationException(f"{piece.item_code} has no purity %, so wastage can't be added. Enter a touch %.")
        return touch_from_wastage(piece.purity, d(entry.wastage_percent))
    if piece.touch_percent is None:
        raise ValidationException(f"{piece.item_code} has no touch %. Enter one on the bill line.", field="touch_percent")
    return d(piece.touch_percent)


def _charges(entry: BillLineIn, pieces: List[Piece]) -> Decimal:
    """Charges typed on the line, plus making per gram x the line's net weight."""
    charges = d(entry.charges)
    if entry.making_per_gram:
        net = sum((d(p.net_weight) for p in pieces), Decimal("0"))
        charges += making_for(net, d(entry.making_per_gram))
    return charges


def _check_in_stock(piece: Piece) -> None:
    if piece.status != PIECE_STATUS_IN_STOCK:
        word = _STATUS_WORD.get(piece.status, piece.status.lower())
        raise ConflictException(f"{piece.item_code} is {word}, so it cannot be billed.")


async def _gold_rate(db: AsyncSession, draft: BillDraft) -> Tuple[Decimal, bool]:
    """The rate typed on the bill, else the rate set for the bill's date."""
    if draft.gold_rate is not None:
        return d(draft.gold_rate), False
    day = draft.bill_date or date.today()
    rate = await RateService.rate_on(db, day)
    if rate is None:
        raise ValidationException(
            f"No gold rate is set for {day.strftime('%d %b %Y')}. Set the day's rate, or type one on the bill.",
            field="gold_rate",
        )
    return d(rate), True


def _interstate(seller: BusinessProfile, shop: Optional[Shop]) -> bool:
    """IGST only when both states are known and differ; otherwise CGST + SGST."""
    return bool(shop and seller.state_code and shop.state_code and seller.state_code != shop.state_code)


async def _build(db: AsyncSession, draft: BillDraft, gold_rate: Decimal, interstate: bool) -> Tuple[List[LineCalc], Totals]:
    """Turn the entered codes into priced lines, enforcing every sale rule.
    Used unchanged by quote (no save) and create (save)."""
    seen_pieces: Dict[str, str] = {}   # piece_id -> where it appeared (for duplicate errors)
    lines: List[LineCalc] = []
    split_combos: Dict[str, Tuple[Combo, set]] = {}  # combo_id -> (combo, piece ids billed singly)

    def claim(piece: Piece, where: str) -> None:
        if piece.id in seen_pieces:
            raise ValidationException(f"{piece.item_code} is on the bill twice ({seen_pieces[piece.id]} and {where}).")
        seen_pieces[piece.id] = where

    for entry in draft.lines:
        if entry.code.startswith(COMBO_PREFIX):
            combo = await ComboRepository.get_by_code(db, entry.code)
            if not combo:
                raise NotFoundException(f"No combo with code {entry.code}.")
            if combo.status != COMBO_STATUS_ACTIVE:
                raise ConflictException(f"{combo.combo_code} is {combo.status.lower()}, so it cannot be billed.")
            members = [i.piece for i in combo.items if i.unlinked_at is None]
            if not members:
                raise ValidationException(f"{combo.combo_code} has no pieces.")
            calcs = []
            for p in members:
                _check_in_stock(p)
                claim(p, combo.combo_code)
                touch = _piece_touch(p, entry)
                calcs.append(PieceCalc(piece=p, touch=touch, fine=fine_of(d(p.net_weight), touch)))
            title = combo.name or " + ".join(p.category.name for p in members)
            lines.append(LineCalc(
                kind=LINE_KIND_COMBO, code=combo.combo_code,
                description=f"{title} ({' + '.join(p.item_code for p in members)})",
                purity=" / ".join(dict.fromkeys(p.purity for p in members)),
                charges=_charges(entry, members), pieces=calcs, combo=combo, hsn=members[0].category.hsn_code,
            ).price(gold_rate))
        else:
            piece = await PieceRepository.get_by_code(db, entry.code)
            if not piece:
                raise NotFoundException(f"No piece with code {entry.code}.")
            _check_in_stock(piece)
            claim(piece, entry.code)
            touch = _piece_touch(piece, entry)
            membership = await ComboItemRepository.active_for_piece(db, piece.id)
            combo = None
            if membership:
                combo = await ComboRepository.get(db, membership.combo_id)
                split_combos.setdefault(combo.id, (combo, set()))[1].add(piece.id)
            lines.append(LineCalc(
                kind=LINE_KIND_PIECE, code=piece.item_code,
                description=piece.name + (f" (part of {combo.combo_code})" if combo else ""),
                purity=piece.purity, charges=_charges(entry, [piece]),
                pieces=[PieceCalc(piece=piece, touch=touch, fine=fine_of(d(piece.net_weight), touch))],
                combo=combo, hsn=piece.category.hsn_code,
            ).price(gold_rate))

    # A combo billed piece-by-piece must have all its pieces on the bill:
    # selling part of a combo would leave a combo with sold pieces in it.
    for combo, billed in split_combos.values():
        members = {i.piece_id: i.piece.item_code for i in combo.items if i.unlinked_at is None}
        missing = [code for pid, code in members.items() if pid not in billed]
        if missing:
            raise ValidationException(
                f"{', '.join(sorted(members[p] for p in billed))} "
                f"{'is' if len(billed) == 1 else 'are'} part of {combo.combo_code}. Add {', '.join(sorted(missing))} "
                f"too, bill {combo.combo_code} as one line, or unlink first."
            )

    return lines, totals(lines, d(draft.gst_percent), interstate)


def _totals_out(t) -> BillTotals:
    return BillTotals(
        total_pieces=t.total_pieces, total_gross=float(t.total_gross), total_stone=float(t.total_stone),
        total_net=float(t.total_net), total_fine=float(t.total_fine), metal_amount=float(t.metal_amount),
        total_charges=float(t.total_charges), subtotal=float(t.subtotal), gst_amount=float(t.gst_amount),
        tax_type=t.tax_type, cgst_amount=float(t.cgst_amount), sgst_amount=float(t.sgst_amount),
        igst_amount=float(t.igst_amount), round_off=float(t.round_off), grand_total=float(t.grand_total),
    )


def _calc_line_out(no: int, l: LineCalc) -> BillLineOut:
    return BillLineOut(
        line_no=no, kind=l.kind, code=l.code, description=l.description, hsn_code=l.hsn,
        combo_code=l.combo.combo_code if l.combo is not None else None, purity=l.purity,
        gross_weight=float(l.gross), stone_weight=float(l.stone), net_weight=float(l.net),
        touch_percent=float(l.touch), fine_weight=float(l.fine), metal_amount=float(l.metal),
        charges=float(l.charges), amount=float(l.amount),
        pieces=[
            BillLinePieceOut(
                piece_id=p.piece.id, item_code=p.piece.item_code, name=p.piece.name, purity=p.piece.purity,
                huid=p.piece.huid, gross_weight=float(p.piece.gross_weight), stone_weight=float(p.piece.stone_weight),
                net_weight=float(p.piece.net_weight), touch_percent=float(p.touch), fine_weight=float(p.fine),
            )
            for p in l.pieces
        ],
    )


def bill_out(b: Bill) -> BillOut:
    return BillOut(
        id=b.id, bill_number=b.bill_number, shop_id=b.shop_id, shop_name=b.shop_name, shop_gstin=b.shop_gstin,
        shop_address=b.shop_address, shop_phone=b.shop_phone, shop_state_code=b.shop_state_code,
        shop_state_name=state_name(b.shop_state_code), seller_name=b.seller_name, seller_gstin=b.seller_gstin,
        seller_address=b.seller_address, seller_state_code=b.seller_state_code,
        seller_state_name=state_name(b.seller_state_code),
        bill_date=b.bill_date, status=b.status, remarks=b.remarks, created_at=b.created_at,
        created_by_name=b.created_by_name, cancelled_at=b.cancelled_at, cancel_reason=b.cancel_reason,
        cancelled_by_name=b.cancelled_by_name, amount_in_words=rupees_in_words(b.grand_total),
        gold_rate=float(b.gold_rate), gst_percent=float(b.gst_percent),
        lines=[
            BillLineOut(
                line_no=l.line_no, kind=l.kind, code=l.code, description=l.description, hsn_code=l.hsn_code,
                combo_code=l.combo_code,
                purity=l.purity, gross_weight=float(l.gross_weight), stone_weight=float(l.stone_weight),
                net_weight=float(l.net_weight), touch_percent=float(l.touch_percent), fine_weight=float(l.fine_weight),
                metal_amount=float(l.metal_amount), charges=float(l.charges), amount=float(l.amount),
                pieces=[
                    BillLinePieceOut(
                        piece_id=p.piece_id, item_code=p.item_code, name=p.name, purity=p.purity, huid=p.huid,
                        gross_weight=float(p.gross_weight), stone_weight=float(p.stone_weight),
                        net_weight=float(p.net_weight), touch_percent=float(p.touch_percent),
                        fine_weight=float(p.fine_weight),
                    )
                    for p in l.pieces
                ],
            )
            for l in b.lines
        ],
        totals=_totals_out(b),
    )


async def _get_bill(db: AsyncSession, bill_id: str, for_update: bool = False) -> Bill:
    stmt = select(Bill).where(Bill.id == bill_id).execution_options(populate_existing=True)
    if for_update:
        stmt = stmt.with_for_update(of=Bill)
    bill = (await db.execute(stmt)).scalar_one_or_none()
    if not bill:
        raise NotFoundException("Bill not found.")
    return bill


async def _set_status(db: AsyncSession, model, ids: List[str], frm: str, to: str, what: str) -> None:
    """Move rows from one status to another only if every one is still in `frm`.
    Guards against the same piece being sold by two bills saved at once."""
    if not ids:
        return
    res = await db.execute(update(model).where(model.id.in_(ids), model.status == frm).values(status=to))
    if res.rowcount != len(ids):
        await db.rollback()
        raise ConflictException(f"Some {what} changed while the bill was being saved. Refresh and try again.")


class BillService:
    @staticmethod
    async def quote(db: AsyncSession, draft: BillDraft) -> QuoteOut:
        rate, from_day = await _gold_rate(db, draft)
        shop = await db.get(Shop, draft.shop_id) if draft.shop_id else None
        seller = await BusinessService.load(db)
        lines, t = await _build(db, draft, rate, _interstate(seller, shop))
        return QuoteOut(
            gold_rate=float(rate), gold_rate_from_day=from_day, gst_percent=draft.gst_percent,
            lines=[_calc_line_out(i, l) for i, l in enumerate(lines, 1)], totals=_totals_out(t),
        )

    @staticmethod
    async def create(db: AsyncSession, draft: BillDraft) -> BillOut:
        if not draft.shop_id:
            raise ValidationException("Choose the shop this bill is for.", field="shop_id")
        shop = await db.get(Shop, draft.shop_id)
        if not shop:
            raise NotFoundException("Shop not found.")
        if not shop.is_active:
            raise ValidationException(f"{shop.name} is inactive.", field="shop_id")

        rate, _ = await _gold_rate(db, draft)
        seller = await BusinessService.load(db)
        lines, t = await _build(db, draft, rate, _interstate(seller, shop))
        number = await CodeSequenceRepository.next_value(db, BILL_COUNTER_KEY)
        seller_address = ", ".join(x for x in (seller.address, seller.city, seller.pincode) if x) or None
        shop_address = ", ".join(x for x in (shop.address, shop.city) if x) or None
        bill = Bill(
            id=_new_id(), bill_number=f"INV-{number:05d}", shop_id=shop.id, shop_name=shop.name,
            shop_gstin=shop.gstin, shop_address=shop_address, shop_phone=shop.phone, shop_state_code=shop.state_code,
            seller_name=seller.name or None, seller_gstin=seller.gstin, seller_address=seller_address,
            seller_state_code=seller.state_code,
            bill_date=draft.bill_date or date.today(), status=BILL_STATUS_FINAL,
            gold_rate=rate, gst_percent=d(draft.gst_percent), remarks=draft.remarks or None,
            created_by_name=actor_name(),
            **{k: getattr(t, k) for k in (
                "total_pieces", "total_gross", "total_stone", "total_net", "total_fine", "metal_amount",
                "total_charges", "subtotal", "gst_amount", "tax_type", "cgst_amount", "sgst_amount", "igst_amount",
                "round_off", "grand_total")},
        )
        db.add(bill)
        piece_ids, combo_ids = [], set()
        for no, l in enumerate(lines, 1):
            line = BillLine(
                id=_new_id(), bill_id=bill.id, line_no=no, kind=l.kind, code=l.code, description=l.description,
                hsn_code=l.hsn, combo_id=l.combo.id if l.combo is not None else None,
                combo_code=l.combo.combo_code if l.combo is not None else None,
                purity=l.purity, gross_weight=l.gross, stone_weight=l.stone, net_weight=l.net,
                touch_percent=l.touch, fine_weight=l.fine, metal_amount=l.metal, charges=l.charges, amount=l.amount,
            )
            db.add(line)
            if l.combo is not None:
                combo_ids.add(l.combo.id)
            for p in l.pieces:
                piece_ids.append(p.piece.id)
                db.add(BillLinePiece(
                    id=_new_id(), line_id=line.id, bill_id=bill.id, piece_id=p.piece.id,
                    item_code=p.piece.item_code, name=p.piece.name, purity=p.piece.purity, huid=p.piece.huid,
                    gross_weight=p.piece.gross_weight, stone_weight=p.piece.stone_weight,
                    net_weight=p.piece.net_weight, touch_percent=p.touch, fine_weight=p.fine, active=True,
                ))
        try:
            await db.flush()
            await _set_status(db, Piece, piece_ids, PIECE_STATUS_IN_STOCK, PIECE_STATUS_SOLD, "pieces")
            await _set_status(db, Combo, list(combo_ids), COMBO_STATUS_ACTIVE, COMBO_STATUS_SOLD, "combos")
            await db.commit()
        except IntegrityError:
            await db.rollback()
            raise ConflictException("One of these pieces was just billed on another bill. Refresh and try again.")
        return bill_out(await _get_bill(db, bill.id))

    @staticmethod
    async def get(db: AsyncSession, bill_id: str) -> BillOut:
        return bill_out(await _get_bill(db, bill_id))

    @staticmethod
    async def list(db: AsyncSession, *, q: Optional[str], shop_id: Optional[str], status: Optional[str],
                   date_from: Optional[date], date_to: Optional[date], limit: int, offset: int) -> BillList:
        conds = []
        if q:
            like = f"%{q.strip().lower()}%"
            conds.append(or_(func.lower(Bill.bill_number).like(like), func.lower(Bill.shop_name).like(like)))
        if shop_id:
            conds.append(Bill.shop_id == shop_id)
        if status:
            conds.append(Bill.status == status)
        if date_from:
            conds.append(Bill.bill_date >= date_from)
        if date_to:
            conds.append(Bill.bill_date <= date_to)
        total = (await db.execute(select(func.count(Bill.id)).where(*conds))).scalar_one()
        rows = await db.execute(
            select(Bill).where(*conds).order_by(Bill.bill_date.desc(), Bill.bill_number.desc()).limit(limit).offset(offset)
        )
        return BillList(
            items=[
                BillSummaryOut(id=b.id, bill_number=b.bill_number, shop_name=b.shop_name, bill_date=b.bill_date,
                               status=b.status, total_pieces=b.total_pieces, total_fine=float(b.total_fine),
                               grand_total=float(b.grand_total))
                for b in rows.scalars()
            ],
            total=total,
        )

    @staticmethod
    async def cancel(db: AsyncSession, bill_id: str, data: CancelIn) -> BillOut:
        """Undo a sale: pieces back IN_STOCK, combos back ACTIVE. The bill stays
        on record as CANCELLED; its number is never reused."""
        bill = await _get_bill(db, bill_id, for_update=True)
        if bill.status == BILL_STATUS_CANCELLED:
            raise ConflictException(f"{bill.bill_number} is already cancelled.")
        piece_ids = [p.piece_id for l in bill.lines for p in l.pieces]
        combo_ids = list({l.combo_id for l in bill.lines if l.combo_id})
        await db.execute(update(BillLinePiece).where(BillLinePiece.bill_id == bill.id).values(active=False))
        await _set_status(db, Piece, piece_ids, PIECE_STATUS_SOLD, PIECE_STATUS_IN_STOCK, "pieces")
        await _set_status(db, Combo, combo_ids, COMBO_STATUS_SOLD, COMBO_STATUS_ACTIVE, "combos")
        bill.status = BILL_STATUS_CANCELLED
        bill.cancelled_at = utcnow()
        bill.cancel_reason = data.reason
        bill.cancelled_by_name = actor_name()
        await db.commit()
        return bill_out(await _get_bill(db, bill.id))

    @staticmethod
    async def bills_for_piece(db: AsyncSession, code: str) -> List[PieceBillOut]:
        """Every bill a piece has been on, newest first (cancelled ones included)."""
        piece = await PieceRepository.get_by_code(db, code)
        if not piece:
            raise NotFoundException(f"No piece with code {code.strip().upper()}.")
        rows = await db.execute(
            select(BillLinePiece, Bill, BillLine)
            .join(Bill, Bill.id == BillLinePiece.bill_id)
            .join(BillLine, BillLine.id == BillLinePiece.line_id)
            .where(BillLinePiece.piece_id == piece.id)
            .order_by(Bill.bill_date.desc(), Bill.bill_number.desc())
        )
        return [
            PieceBillOut(bill_id=b.id, bill_number=b.bill_number, bill_date=b.bill_date, shop_name=b.shop_name,
                         status=b.status, line_code=l.code, active=p.active)
            for p, b, l in rows.all()
        ]
