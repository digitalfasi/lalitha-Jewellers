"""Owner / manager reports. Profit: the gold margin on each bill - what the shop paid for
(sale touch) less what the karigar charged us (cost touch) - plus the charges collected."""
from datetime import date, timedelta
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app._shared.core.database import get_async_db
from app.modules.auth.deps import require_role
from app.modules.auth.model import MANAGERS
from app.modules.billing.model import BILL_STATUS_FINAL, Bill, BillLinePiece
from app.modules.billing.pricing import fine_of, q2, q3
from app.modules.inventory.model import Piece

router = APIRouter(prefix="/reports", tags=["Reports"], dependencies=[Depends(require_role(*MANAGERS))])


class ProfitRow(BaseModel):
    bill_id: str
    bill_number: str
    bill_date: date
    shop_name: str
    sold_fine: float
    cost_fine: float
    margin_fine: float
    margin_value: float
    charges: float
    pieces_without_cost: int


class ProfitOut(BaseModel):
    date_from: date
    date_to: date
    rows: List[ProfitRow]
    sold_fine: float
    cost_fine: float
    margin_fine: float
    margin_value: float
    charges: float
    pieces_without_cost: int


@router.get("/profit", response_model=ProfitOut)
async def profit(date_from: Optional[date] = None, date_to: Optional[date] = None,
                 db: AsyncSession = Depends(get_async_db)):
    """Pieces without a cost touch count at no margin, and are listed so they can be filled in."""
    date_to = date_to or date.today()
    date_from = date_from or date_to - timedelta(days=30)
    bills = (await db.execute(
        select(Bill).where(Bill.status == BILL_STATUS_FINAL, Bill.bill_date >= date_from, Bill.bill_date <= date_to)
        .order_by(Bill.bill_date, Bill.bill_number)
    )).scalars().all()
    rows = []
    for b in bills:
        parts = (await db.execute(
            select(BillLinePiece.net_weight, BillLinePiece.fine_weight, Piece.cost_touch)
            .join(Piece, Piece.id == BillLinePiece.piece_id).where(BillLinePiece.bill_id == b.id)
        )).all()
        sold = cost = Decimal("0")
        missing = 0
        for net, fine, cost_touch in parts:
            if cost_touch is None:
                missing += 1
                continue
            sold += fine
            cost += fine_of(net, cost_touch)
        margin = q3(sold - cost)
        rows.append(ProfitRow(
            bill_id=b.id, bill_number=b.bill_number, bill_date=b.bill_date, shop_name=b.shop_name,
            sold_fine=float(sold), cost_fine=float(cost), margin_fine=float(margin),
            margin_value=float(q2(margin * b.gold_rate)), charges=float(b.total_charges), pieces_without_cost=missing,
        ))
    s = lambda k: sum(getattr(r, k) for r in rows)  # noqa: E731
    return ProfitOut(
        date_from=date_from, date_to=date_to, rows=rows, sold_fine=round(s("sold_fine"), 3),
        cost_fine=round(s("cost_fine"), 3), margin_fine=round(s("margin_fine"), 3),
        margin_value=round(s("margin_value"), 2), charges=round(s("charges"), 2),
        pieces_without_cost=int(s("pieces_without_cost")),
    )
