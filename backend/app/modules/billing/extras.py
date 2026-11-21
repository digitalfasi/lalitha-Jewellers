"""Counter quote (lenient), estimates and the shops' fine-gold accounts.
All pricing goes through the bill's own _build, so every number matches a bill."""
import uuid
from datetime import date, timedelta
from decimal import Decimal
from typing import Dict, List, Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app._shared.core.actor import actor_name
from app._shared.exceptions.base import AppException, ConflictException, NotFoundException, ValidationException
from app.modules.billing.model import (
    CASH_IN, ESTIMATE_BILLED, ESTIMATE_COUNTER_KEY, ESTIMATE_OPEN, GOLD_ADJUST, GOLD_BILL, GOLD_BILL_CANCEL, GOLD_IN,
    Bill, Estimate, GoldEntry, Shop,
)
from app.modules.billing.pricing import d, fine_of, q3, totals
from app.modules.billing.schema import (
    BillDraft, EstimateIn, EstimateOut, GoldAccountOut, GoldEntryIn, GoldEntryOut, LenientQuoteIn, LenientQuoteOut,
    QuoteProblem,
)
from app.modules.billing.service import _build, charge_rates, _calc_line_out, _gold_rate, _interstate, _shop_out, _totals_out
from app.modules.business.service import BusinessService
from app.modules.combos.model import COMBO_PREFIX, utcnow
from app.modules.combos.repository import ComboItemRepository, ComboRepository
from app.modules.inventory.repository import CodeSequenceRepository, PieceRepository
from app.modules.rates.service import RateService

_new_id = lambda: str(uuid.uuid4())  # noqa: E731
_f = lambda v: float(v) if v is not None else None  # noqa: E731


# ------------------------------------------------------------------ quote

async def lenient_quote(db: AsyncSession, data: LenientQuoteIn) -> LenientQuoteOut:
    rate = d(data.gold_rate)
    shop = await db.get(Shop, data.shop_id) if data.shop_id else None
    if data.interstate is None:
        interstate = _interstate(await BusinessService.load(db), shop)
    else:
        interstate = data.interstate

    # A piece that sits in a set brings the whole set (like scanning on a bill).
    swapped: Dict[str, str] = {}
    entries, seen = [], set()
    for entry in data.lines:
        code = entry.code
        if not code.startswith(COMBO_PREFIX):
            piece = await PieceRepository.get_by_code(db, code)
            member = await ComboItemRepository.active_for_piece(db, piece.id) if piece else None
            if member:
                combo = await ComboRepository.get(db, member.combo_id)
                swapped[code] = combo.combo_code
                code = combo.combo_code
        if code in seen:
            continue
        seen.add(code)
        entries.append(entry.model_copy(update={"code": code}))

    stone_rate, huid_rate = await charge_rates(db, None, None)
    priced, problems = [], []
    for entry in entries:
        one = BillDraft(gold_rate=float(rate), gst_percent=data.gst_percent, lines=[entry], stone_rate=float(stone_rate))
        try:
            lines, _ = await _build(db, one, rate, interstate)
            priced.extend(lines)
        except AppException as e:
            problems.append(QuoteProblem(code=entry.code, message=e.message))

    t = totals(priced, d(data.gst_percent), interstate, huid_rate, stone_rate) if priced else None
    return LenientQuoteOut(
        gold_rate=float(rate), gst_percent=data.gst_percent,
        lines=[_calc_line_out(i, l) for i, l in enumerate(priced, 1)], problems=problems, swapped=swapped,
        totals=_totals_out(t) if t else None,
    )


# -------------------------------------------------------------- estimates

def _estimate_out(e: Estimate, bill_number: Optional[str] = None) -> EstimateOut:
    return EstimateOut(
        id=e.id, estimate_number=e.estimate_number, shop_id=e.shop_id, shop_name=e.shop_name,
        estimate_date=e.estimate_date, valid_until=e.valid_until, is_valid=e.valid_until >= date.today(),
        gold_rate=float(e.gold_rate), gst_percent=float(e.gst_percent), lines=e.lines,
        total_fine=float(e.total_fine), grand_total=float(e.grand_total), status=e.status, bill_id=e.bill_id,
        bill_number=bill_number, remarks=e.remarks, created_by_name=e.created_by_name,
    )


class EstimateService:
    @staticmethod
    async def create(db: AsyncSession, data: EstimateIn) -> EstimateOut:
        shop = await db.get(Shop, data.shop_id) if data.shop_id else None
        if data.shop_id and not shop:
            raise NotFoundException("Shop not found.")
        draft = BillDraft(shop_id=data.shop_id, gold_rate=data.gold_rate, gst_percent=data.gst_percent, lines=data.lines)
        rate, _ = await _gold_rate(db, draft)
        _, t = await _build(db, draft, rate, _interstate(await BusinessService.load(db), shop))
        n = await CodeSequenceRepository.next_value(db, ESTIMATE_COUNTER_KEY)
        today = date.today()
        e = Estimate(
            id=_new_id(), estimate_number=f"EST-{n:05d}", shop_id=shop.id if shop else None,
            shop_name=shop.name if shop else None, estimate_date=today,
            valid_until=today + timedelta(days=data.valid_days), gold_rate=rate, gst_percent=d(data.gst_percent),
            lines=[l.model_dump(exclude_none=True) for l in data.lines], total_fine=t.total_fine,
            grand_total=t.grand_total, status=ESTIMATE_OPEN, remarks=data.remarks or None, created_by_name=actor_name(),
        )
        db.add(e)
        await db.commit()
        return _estimate_out(e)

    @staticmethod
    async def list(db: AsyncSession, status: Optional[str], limit: int) -> List[EstimateOut]:
        stmt = select(Estimate, Bill.bill_number).outerjoin(Bill, Bill.id == Estimate.bill_id)
        if status:
            stmt = stmt.where(Estimate.status == status)
        stmt = stmt.order_by(Estimate.estimate_date.desc(), Estimate.estimate_number.desc()).limit(limit)
        return [_estimate_out(e, no) for e, no in (await db.execute(stmt)).all()]

    @staticmethod
    async def get(db: AsyncSession, estimate_id: str) -> EstimateOut:
        e = await db.get(Estimate, estimate_id)
        if not e:
            raise NotFoundException("Estimate not found.")
        bill = await db.get(Bill, e.bill_id) if e.bill_id else None
        return _estimate_out(e, bill.bill_number if bill else None)

    @staticmethod
    async def mark_billed(db: AsyncSession, estimate_id: str, bill: Bill) -> None:
        """Called inside the bill's own transaction."""
        e = await db.get(Estimate, estimate_id)
        if not e:
            raise NotFoundException("Estimate not found.")
        if e.status == ESTIMATE_BILLED:
            raise ConflictException(f"{e.estimate_number} is already billed.")
        e.status, e.bill_id = ESTIMATE_BILLED, bill.id


# ---------------------------------------------------------- gold accounts

class GoldAccountService:
    @staticmethod
    async def balances(db: AsyncSession) -> Dict[str, Decimal]:
        rows = await db.execute(select(GoldEntry.shop_id, func.sum(GoldEntry.fine)).group_by(GoldEntry.shop_id))
        return {sid: d(total or 0) for sid, total in rows.all()}

    @staticmethod
    async def balance(db: AsyncSession, shop_id: str) -> Decimal:
        total = (await db.execute(select(func.sum(GoldEntry.fine)).where(GoldEntry.shop_id == shop_id))).scalar()
        return d(total or 0)

    @staticmethod
    def on_bill(db: AsyncSession, shop: Shop, bill: Bill) -> None:
        """A shop on a gold account owes the bill's fine gold (making and GST are paid in cash)."""
        if shop.settles_in_gold:
            db.add(GoldEntry(id=_new_id(), created_at=utcnow(), shop_id=shop.id, entry_date=bill.bill_date, kind=GOLD_BILL,
                             fine=bill.total_fine, bill_id=bill.id, bill_number=bill.bill_number,
                             created_by_name=actor_name()))

    @staticmethod
    async def on_cancel(db: AsyncSession, bill: Bill) -> None:
        entry = (await db.execute(
            select(GoldEntry).where(GoldEntry.bill_id == bill.id, GoldEntry.kind == GOLD_BILL)
        )).scalar_one_or_none()
        if entry:
            db.add(GoldEntry(id=_new_id(), created_at=utcnow(), shop_id=entry.shop_id, entry_date=date.today(), kind=GOLD_BILL_CANCEL,
                             fine=-entry.fine, bill_id=bill.id, bill_number=bill.bill_number,
                             note=bill.cancel_reason, created_by_name=actor_name()))

    @staticmethod
    async def account(db: AsyncSession, shop_id: str, limit: int = 200) -> GoldAccountOut:
        shop = await db.get(Shop, shop_id)
        if not shop:
            raise NotFoundException("Shop not found.")
        rows = (await db.execute(
            select(GoldEntry).where(GoldEntry.shop_id == shop_id)
            .order_by(GoldEntry.entry_date, GoldEntry.created_at, GoldEntry.id)
        )).scalars().all()
        running, out = Decimal("0"), []
        for e in rows:
            running += d(e.fine)
            out.append(GoldEntryOut(
                id=e.id, entry_date=e.entry_date, kind=e.kind, fine=float(e.fine), gold_weight=_f(e.gold_weight),
                purity_percent=_f(e.purity_percent), cash=_f(e.cash), rate=_f(e.rate), bill_id=e.bill_id,
                bill_number=e.bill_number, note=e.note, created_by_name=e.created_by_name, balance=float(running),
            ))
        rate = await RateService.rate_on(db, date.today())
        return GoldAccountOut(
            shop_id=shop.id, shop_name=shop.name, settles_in_gold=bool(shop.settles_in_gold), balance=float(running),
            balance_value=float((running * rate).quantize(Decimal("0.01"))) if rate is not None else None,
            entries=list(reversed(out))[:limit],
        )

    @staticmethod
    async def add(db: AsyncSession, shop_id: str, data: GoldEntryIn) -> GoldAccountOut:
        shop = await db.get(Shop, shop_id)
        if not shop:
            raise NotFoundException("Shop not found.")
        day = data.entry_date or date.today()
        e = GoldEntry(id=_new_id(), created_at=utcnow(), shop_id=shop.id, entry_date=day, kind=data.kind, note=data.note or None,
                      created_by_name=actor_name())
        if data.kind == "GOLD":
            e.gold_weight, e.purity_percent = d(data.gold_weight), d(data.purity_percent)
            e.fine = -fine_of(e.gold_weight, e.purity_percent)
        elif data.kind == "CASH":
            rate = d(data.rate) if data.rate else await RateService.rate_on(db, day)
            if rate is None:
                raise ValidationException("No gold rate for that day. Type the rate the cash was counted at.",
                                          field="rate")
            e.cash, e.rate = d(data.cash), rate
            e.fine = -q3(e.cash / rate)
        else:
            e.fine = q3(d(data.fine))
        db.add(e)
        await db.commit()
        return await GoldAccountService.account(db, shop.id)

    @staticmethod
    async def remove(db: AsyncSession, shop_id: str, entry_id: str) -> GoldAccountOut:
        """Only hand-made entries (gold, cash, adjustment) can be removed; bills are undone by cancelling."""
        e = await db.get(GoldEntry, entry_id)
        if not e or e.shop_id != shop_id:
            raise NotFoundException("Entry not found.")
        if e.kind not in (GOLD_IN, CASH_IN, GOLD_ADJUST):
            raise ConflictException("A bill's entry goes away only by cancelling the bill.")
        await db.delete(e)
        await db.commit()
        return await GoldAccountService.account(db, shop_id)


async def shops_with_balances(db: AsyncSession, shops) -> list:
    balances = await GoldAccountService.balances(db)
    return [_shop_out(s, balances.get(s.id, Decimal("0"))) for s in shops]
