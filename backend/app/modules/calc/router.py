"""Calculator: quick sums for the counter. Nothing is saved.
A quote for real pieces is /billing/quote (same rules as the bill)."""
from decimal import Decimal

from fastapi import APIRouter, Query

from app.modules.calc import service
from app.modules.calc.schema import (
    FineIn, FineOut, GstIn, GstOut, MetalIn, MetalOut, MoneyIn, MoneyOut, OldGoldIn, OldGoldOut, RatesOut,
)

router = APIRouter(prefix="/calc", tags=["Calculator"])


@router.post("/fine", response_model=FineOut)
async def fine(data: FineIn):
    return service.fine(data)


@router.get("/rates", response_model=RatesOut)
async def rates(fine_rate: Decimal = Query(..., gt=0, le=10_000_000)):
    return service.rates(fine_rate)


@router.post("/gst", response_model=GstOut)
async def gst(data: GstIn):
    return service.gst(data)


@router.post("/old-gold", response_model=OldGoldOut)
async def old_gold(data: OldGoldIn):
    return service.old_gold(data)


@router.post("/money-to-gold", response_model=MoneyOut)
async def money_to_gold(data: MoneyIn):
    return service.money_to_gold(data)


@router.post("/metal-account", response_model=MetalOut)
async def metal_account(data: MetalIn):
    return service.metal_account(data)
