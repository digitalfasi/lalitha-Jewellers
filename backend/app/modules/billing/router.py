from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app._shared.core.database import get_async_db
from app.modules.auth.deps import require_role
from app.modules.auth.model import MANAGERS
from app.modules.billing.schema import (
    EstimateIn,
    EstimateOut,
    GoldAccountOut,
    GoldEntryIn,
    LenientQuoteIn,
    LenientQuoteOut,
    BillDraft,
    BillList,
    BillOut,
    BillStatus,
    CancelIn,
    EmailBillIn,
    PieceBillOut,
    QuoteOut,
    ShopCreate,
    ShopOut,
    ShopUpdate,
)
from app.modules.billing.mailer import send_bill
from app.modules.billing.pdf import bill_pdf
from app.modules.billing.extras import EstimateService, GoldAccountService, lenient_quote
from app.modules.billing.service import BillService, ShopService
from app.modules.business.service import BusinessService

# Signed-in staff only (applied in api/v1/router.py). Cancelling needs a manager.
router = APIRouter(prefix="/billing", tags=["billing"])


# --------------------------------------------------------------------- shops

@router.get("/shops", response_model=List[ShopOut])
async def list_shops(
    q: Optional[str] = Query(None, max_length=100),
    include_inactive: bool = False,
    db: AsyncSession = Depends(get_async_db),
):
    return await ShopService.list(db, q, include_inactive)


@router.post("/shops", response_model=ShopOut, status_code=status.HTTP_201_CREATED)
async def create_shop(data: ShopCreate, db: AsyncSession = Depends(get_async_db)):
    return await ShopService.create(db, data)


@router.patch("/shops/{shop_id}", response_model=ShopOut)
async def update_shop(shop_id: str, data: ShopUpdate, db: AsyncSession = Depends(get_async_db)):
    return await ShopService.update(db, shop_id, data)


# --------------------------------------------------------------------- bills

@router.post("/quote", response_model=QuoteOut)
async def quote_bill(data: BillDraft, db: AsyncSession = Depends(get_async_db)):
    """Price a bill without saving it - the New Bill screen calls this as lines change."""
    return await BillService.quote(db, data)


@router.post("/bills", response_model=BillOut, status_code=status.HTTP_201_CREATED)
async def create_bill(data: BillDraft, db: AsyncSession = Depends(get_async_db)):
    """Save the bill: pieces and combos on it become SOLD."""
    return await BillService.create(db, data)


@router.get("/bills", response_model=BillList)
async def list_bills(
    q: Optional[str] = Query(None, max_length=100, description="Bill number or shop name"),
    shop_id: Optional[str] = None,
    status: Optional[BillStatus] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_async_db),
):
    return await BillService.list(db, q=q, shop_id=shop_id, status=status, date_from=date_from,
                                  date_to=date_to, limit=limit, offset=offset)


@router.get("/bills/{bill_id}", response_model=BillOut)
async def get_bill(bill_id: str, db: AsyncSession = Depends(get_async_db)):
    return await BillService.get(db, bill_id)


@router.post("/bills/{bill_id}/cancel", response_model=BillOut, dependencies=[Depends(require_role(*MANAGERS))])
async def cancel_bill(bill_id: str, data: CancelIn, db: AsyncSession = Depends(get_async_db)):
    """Undo the sale: pieces back in stock, combos active again."""
    return await BillService.cancel(db, bill_id, data)


async def _pdf_for(db: AsyncSession, bill_id: str) -> tuple[BillOut, bytes]:
    bill = await BillService.get(db, bill_id)
    profile = await BusinessService.load(db)
    bank = [x for x in (
        profile.bank_name and f"{profile.bank_name}" + (f", {profile.bank_branch}" if profile.bank_branch else ""),
        profile.bank_account and f"A/c {profile.bank_account}",
        profile.bank_ifsc and f"IFSC {profile.bank_ifsc}",
    ) if x]
    return bill, bill_pdf(bill, profile.logo_path, profile.bill_terms, bank)


@router.get("/bills/{bill_id}/pdf")
async def bill_pdf_download(bill_id: str, db: AsyncSession = Depends(get_async_db)):
    bill, pdf = await _pdf_for(db, bill_id)
    name = f"{bill.bill_number}.pdf"
    return Response(pdf, media_type="application/pdf", headers={"Content-Disposition": f'inline; filename="{name}"'})


@router.post("/bills/{bill_id}/email", status_code=status.HTTP_204_NO_CONTENT)
async def bill_email(bill_id: str, data: EmailBillIn, db: AsyncSession = Depends(get_async_db)):
    bill, pdf = await _pdf_for(db, bill_id)
    seller = bill.seller_name or "us"
    body = (data.message or f"Dear {bill.shop_name},\n\nPlease find attached bill {bill.bill_number} dated "
            f"{bill.bill_date.strftime('%d %b %Y')} for Rs {bill.totals.grand_total:,.2f}.\n\nThank you,\n{seller}")
    await send_bill(data.to, f"Bill {bill.bill_number} from {seller}", body, pdf, f"{bill.bill_number}.pdf")


@router.get("/piece-bills/{piece_code}", response_model=List[PieceBillOut])
async def piece_bills(piece_code: str, db: AsyncSession = Depends(get_async_db)):
    """Bills a piece has been on, for its history screen."""
    return await BillService.bills_for_piece(db, piece_code)


# ----------------------------------------------- counter quote, estimates, gold

@router.post("/quick-quote", response_model=LenientQuoteOut)
async def quick_quote(data: LenientQuoteIn, db: AsyncSession = Depends(get_async_db)):
    """The calculator's quote: prices what it can and lists the rest as problems."""
    return await lenient_quote(db, data)


@router.post("/estimates", response_model=EstimateOut, status_code=status.HTTP_201_CREATED)
async def create_estimate(data: EstimateIn, db: AsyncSession = Depends(get_async_db)):
    return await EstimateService.create(db, data)


@router.get("/estimates", response_model=List[EstimateOut])
async def list_estimates(status_: Optional[str] = Query(None, alias="status", pattern="^(OPEN|BILLED)$"),
                         limit: int = Query(50, ge=1, le=200), db: AsyncSession = Depends(get_async_db)):
    return await EstimateService.list(db, status_, limit)


@router.get("/estimates/{estimate_id}", response_model=EstimateOut)
async def get_estimate(estimate_id: str, db: AsyncSession = Depends(get_async_db)):
    return await EstimateService.get(db, estimate_id)


@router.get("/shops/{shop_id}/gold", response_model=GoldAccountOut)
async def gold_account(shop_id: str, db: AsyncSession = Depends(get_async_db)):
    return await GoldAccountService.account(db, shop_id)


@router.post("/shops/{shop_id}/gold", response_model=GoldAccountOut, dependencies=[Depends(require_role(*MANAGERS))])
async def add_gold_entry(shop_id: str, data: GoldEntryIn, db: AsyncSession = Depends(get_async_db)):
    """Record gold or cash the shop gave, or an opening balance / correction. Managers and the owner."""
    return await GoldAccountService.add(db, shop_id, data)


@router.delete("/shops/{shop_id}/gold/{entry_id}", response_model=GoldAccountOut,
               dependencies=[Depends(require_role(*MANAGERS))])
async def remove_gold_entry(shop_id: str, entry_id: str, db: AsyncSession = Depends(get_async_db)):
    return await GoldAccountService.remove(db, shop_id, entry_id)
