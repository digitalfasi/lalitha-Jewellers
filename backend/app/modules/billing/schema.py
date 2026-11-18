from datetime import date, datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field, field_validator

from app._shared.core.gst_states import check_code

BillStatus = Literal["FINAL", "CANCELLED"]


def _strip(v):
    return v.strip() if isinstance(v, str) else v


# --------------------------------------------------------------------- shops

class ShopCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=150)
    contact_person: Optional[str] = Field(None, max_length=100)
    phone: Optional[str] = Field(None, max_length=20)
    gstin: Optional[str] = Field(None, max_length=15)
    address: Optional[str] = Field(None, max_length=500)
    city: Optional[str] = Field(None, max_length=100)
    state_code: Optional[str] = Field(None, max_length=2, description="GST state code; filled from the GSTIN if blank")

    _s = field_validator("name", "contact_person", "phone", "gstin", "address", "city", "state_code", mode="before")(_strip)

    @field_validator("state_code")
    @classmethod
    def _state(cls, v):
        return check_code(v)

    @field_validator("gstin")
    @classmethod
    def _gstin(cls, v):
        if not v:
            return None
        v = v.upper()
        if len(v) != 15 or not v.isalnum():
            raise ValueError("GSTIN must be 15 letters and digits")
        return v


class ShopUpdate(ShopCreate):
    name: Optional[str] = Field(None, min_length=2, max_length=150)
    is_active: Optional[bool] = None


class ShopOut(BaseModel):
    id: str
    name: str
    contact_person: Optional[str]
    phone: Optional[str]
    gstin: Optional[str]
    address: Optional[str]
    city: Optional[str]
    state_code: Optional[str]
    state_name: Optional[str]
    is_active: bool


# --------------------------------------------------------------------- bills

class BillLineIn(BaseModel):
    """One line as staff enter it: a piece code or a combo code.
    A combo billed piece-by-piece is simply each of its pieces as its own line;
    every piece of the combo must then be on the bill."""
    code: str = Field(..., min_length=1, max_length=20)
    charges: float = Field(0, ge=0, le=10_000_000, description="Rupees: making / stone / other, for this line")
    touch_percent: Optional[float] = Field(
        None, gt=0, le=200, description="Overrides the piece's own touch (for a combo line: every piece in it)"
    )

    @field_validator("code", mode="before")
    @classmethod
    def _code(cls, v):
        return v.strip().upper() if isinstance(v, str) else v


class BillDraft(BaseModel):
    """Used both to preview the totals (quote) and to save the bill."""
    shop_id: Optional[str] = None
    bill_date: Optional[date] = None
    gold_rate: Optional[float] = Field(
        None, gt=0, le=10_000_000, description="Rupees per gram of fine gold; blank = the day's rate")
    gst_percent: float = Field(3, ge=0, le=28)
    lines: List[BillLineIn] = Field(..., min_length=1, max_length=300)
    remarks: Optional[str] = Field(None, max_length=1000)

    _s = field_validator("remarks", mode="before")(_strip)


class CancelIn(BaseModel):
    reason: str = Field(..., min_length=3, max_length=500)

    _s = field_validator("reason", mode="before")(_strip)


class BillLinePieceOut(BaseModel):
    piece_id: str
    item_code: str
    name: str
    purity: str
    huid: Optional[str] = None
    gross_weight: float
    stone_weight: float
    net_weight: float
    touch_percent: float
    fine_weight: float


class BillLineOut(BaseModel):
    line_no: int
    kind: Literal["PIECE", "COMBO"]
    code: str
    description: str
    hsn_code: Optional[str] = None
    combo_code: Optional[str]
    purity: str
    gross_weight: float
    stone_weight: float
    net_weight: float
    touch_percent: float
    fine_weight: float
    metal_amount: float
    charges: float
    amount: float
    pieces: List[BillLinePieceOut]


class BillTotals(BaseModel):
    total_pieces: int
    total_gross: float
    total_stone: float
    total_net: float
    total_fine: float
    metal_amount: float
    total_charges: float
    subtotal: float
    gst_amount: float
    tax_type: Literal["INTRA", "INTER"]
    cgst_amount: float
    sgst_amount: float
    igst_amount: float
    round_off: float
    grand_total: float


class QuoteOut(BaseModel):
    gold_rate: float
    gold_rate_from_day: bool = False  # True when the day's rate was used
    gst_percent: float
    lines: List[BillLineOut]
    totals: BillTotals


class BillOut(QuoteOut):
    id: str
    bill_number: str
    shop_id: str
    shop_name: str
    shop_gstin: Optional[str]
    shop_address: Optional[str] = None
    shop_phone: Optional[str] = None
    shop_state_code: Optional[str] = None
    shop_state_name: Optional[str] = None
    seller_name: Optional[str] = None
    seller_gstin: Optional[str] = None
    seller_address: Optional[str] = None
    seller_state_code: Optional[str] = None
    seller_state_name: Optional[str] = None
    bill_date: date
    status: BillStatus
    remarks: Optional[str]
    created_at: datetime
    created_by_name: Optional[str] = None
    cancelled_at: Optional[datetime]
    cancel_reason: Optional[str]
    cancelled_by_name: Optional[str] = None
    amount_in_words: str = ""


class BillSummaryOut(BaseModel):
    id: str
    bill_number: str
    shop_name: str
    bill_date: date
    status: BillStatus
    total_pieces: int
    total_fine: float
    grand_total: float


class BillList(BaseModel):
    items: List[BillSummaryOut]
    total: int


class PieceBillOut(BaseModel):
    """A bill a piece was on (for the piece history screen)."""
    bill_id: str
    bill_number: str
    bill_date: date
    shop_name: str
    status: BillStatus
    line_code: str
    active: bool


class EmailBillIn(BaseModel):
    to: str = Field(..., min_length=5, max_length=150, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    message: Optional[str] = Field(None, max_length=2000)
