from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app._shared.core.database import get_async_db
from app.modules.auth.deps import require_role
from app.modules.auth.model import MANAGERS
from app.modules.rates.schema import RateIn, RateOut, TodayOut
from app.modules.rates.service import RateService

# Signed-in staff can read; setting the rate needs a manager.
router = APIRouter(prefix="/rates", tags=["rates"])


@router.get("/today", response_model=TodayOut)
async def today_rate(on: Optional[date] = None, db: AsyncSession = Depends(get_async_db)):
    """`on` lets the browser send its own date, so 'today' matches the staff's day."""
    return await RateService.today(db, on or date.today())


@router.get("", response_model=List[RateOut])
async def rate_history(limit: int = Query(30, ge=1, le=366), db: AsyncSession = Depends(get_async_db)):
    return await RateService.history(db, limit)


@router.put("/{rate_date}", response_model=RateOut, dependencies=[Depends(require_role(*MANAGERS))])
async def set_rate(rate_date: date, data: RateIn, db: AsyncSession = Depends(get_async_db)):
    return await RateService.set(db, rate_date, data)
