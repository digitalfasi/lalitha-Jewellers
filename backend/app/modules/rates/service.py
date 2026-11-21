from datetime import date
from decimal import Decimal
from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app._shared.core.actor import actor_name
from app.modules.rates.model import GoldRate
from app.modules.rates.schema import RateIn, RateOut, TodayOut


def purity_rates(rate, custom: Optional[dict]) -> dict:
    """24K is the fine rate; the others are the owner's own, else 24K x purity %."""
    from app.modules.billing.pricing import PURITY_PERCENT
    rate = Decimal(str(rate))
    custom = custom or {}
    out = {"24K": float(rate)}
    for k, pct in PURITY_PERCENT.items():
        if k != "24K":
            out[k] = float(custom[k]) if k in custom else float((rate * pct / 100).quantize(Decimal("1")))
    return out


def _out(r: GoldRate) -> RateOut:
    return RateOut(rate_date=r.rate_date, rate=float(r.rate), notes=r.notes, set_by_name=r.set_by_name,
                   updated_at=r.updated_at, purity_rates=purity_rates(r.rate, r.purity_rates),
                   custom_purities=sorted((r.purity_rates or {}).keys()))


class RateService:
    @staticmethod
    async def rate_on(db: AsyncSession, day: date) -> Optional[Decimal]:
        row = await db.get(GoldRate, day)
        return row.rate if row else None

    @staticmethod
    async def today(db: AsyncSession, today: date) -> TodayOut:
        row = await db.get(GoldRate, today)
        last = (await db.execute(
            select(GoldRate).where(GoldRate.rate_date < today).order_by(GoldRate.rate_date.desc()).limit(1)
        )).scalar_one_or_none()
        return TodayOut(date=today, today=_out(row) if row else None, last=_out(last) if last else None)

    @staticmethod
    async def history(db: AsyncSession, limit: int) -> List[RateOut]:
        rows = await db.execute(select(GoldRate).order_by(GoldRate.rate_date.desc()).limit(limit))
        return [_out(r) for r in rows.scalars()]

    @staticmethod
    async def set(db: AsyncSession, day: date, data: RateIn) -> RateOut:
        """Bills already saved keep the rate they were made with."""
        row = await db.get(GoldRate, day)
        if row is None:
            row = GoldRate(rate_date=day)
            db.add(row)
        row.rate = Decimal(str(data.rate))
        row.notes = data.notes or None
        row.purity_rates = data.purity_rates
        row.set_by_name = actor_name()
        await db.commit()
        await db.refresh(row)
        return _out(row)
