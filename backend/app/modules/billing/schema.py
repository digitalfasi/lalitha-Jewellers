from datetime import date, datetime
from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator

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
    # The shop's usual deal (blank = none): filled in on its bills and in the calculator.
    price_mode: Optional[Literal["TOUCH", "WASTAGE"]] = None
    deal_touch: Optional[float] = Field(None, gt=0, le=200)
    deal_wastage: Optional[float] = Field(None, ge=0, le=100)
    deal_making: Optional[float] = Field(None, ge=0, le=1_000_000, description="Rupees per gram")
    settles_in_gold: Optional[bool] = None

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
    price_mode: Optional[str] = None
    deal_touch: Optional[float] = None
    deal_wastage: Optional[float] = None
    deal_making: Optional[float] = None
    settles_in_gold: bool = False
    gold_balance: Optional[float] = None  # fine grams owed, for shops that settle in gold
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
    # The other way shops quote: purity + wastage, and making per gram. When wastage is
    # given, each piece's touch = its purity % + wastage % (so mixed-purity sets come out right).
    wastage_percent: Optional[float] = Field(None, ge=0, le=100, description="Added to each piece's purity %")
    making_per_gram: Optional[float] = Field(
        None, ge=0, le=1_000_000, description="Rupees per gram of net weight, added to the line's charges")

    @model_validator(mode="after")
    def _one_way(self):
        if self.touch_percent is not None and self.wastage_percent is not None:
            raise ValueError("Give either touch % or wastage %, not both")
        return self

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
    stone_rate: Optional[float] = Field(None, ge=0, le=1_000_000, description="Rs per gram of less; blank = settings")
    huid_rate: Optional[float] = Field(None, ge=0, le=100_000, description="Rs per hallmarked piece; blank = settings")
    huid_pieces: Optional[int] = Field(None, ge=0, le=100_000, description="Pieces charged for HUID; blank = pieces with a HUID")
    lines: List[BillLineIn] = Field(..., min_length=1, max_length=300)
    remarks: Optional[str] = Field(None, max_length=1000)
    estimate_id: Optional[str] = Field(None, description="The estimate this bill comes from; marked billed")

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
    stone_amount: float = 0
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
    stone_rate: float = 0
    stone_amount: float = 0
    huid_rate: float = 0
    huid_pieces: int = 0
    huid_amount: float = 0
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


# ------------------------------------------------- calculator quote (lenient)

class LenientQuoteIn(BaseModel):
    """A counter quote: prices what it can. A piece that is part of a set brings its whole set;
    a line that can't be priced is listed as a problem instead of failing the quote."""
    shop_id: Optional[str] = None
    gold_rate: float = Field(..., gt=0, le=10_000_000)
    gst_percent: float = Field(3, ge=0, le=28)
    interstate: Optional[bool] = Field(None, description="Blank = decide from the shop")
    lines: List[BillLineIn] = Field(..., min_length=1, max_length=300)


class QuoteProblem(BaseModel):
    code: str
    message: str


class LenientQuoteOut(BaseModel):
    gold_rate: float
    gst_percent: float
    lines: List[BillLineOut]
    problems: List[QuoteProblem]
    swapped: Dict[str, str]  # piece code -> the set code that was priced instead
    totals: Optional[BillTotals]


# --------------------------------------------------------------- estimates

class EstimateIn(BaseModel):
    shop_id: Optional[str] = None
    gold_rate: Optional[float] = Field(None, gt=0, le=10_000_000, description="Blank = today's rate")
    gst_percent: float = Field(3, ge=0, le=28)
    lines: List[BillLineIn] = Field(..., min_length=1, max_length=300)
    valid_days: int = Field(0, ge=0, le=30, description="0 = valid today only (the rate changes daily)")
    remarks: Optional[str] = Field(None, max_length=1000)

    _s = field_validator("remarks", mode="before")(_strip)


class EstimateOut(BaseModel):
    id: str
    estimate_number: str
    shop_id: Optional[str]
    shop_name: Optional[str]
    estimate_date: date
    valid_until: date
    is_valid: bool
    gold_rate: float
    gst_percent: float
    lines: List[dict]
    total_fine: float
    grand_total: float
    status: str
    bill_id: Optional[str]
    bill_number: Optional[str] = None
    remarks: Optional[str]
    created_by_name: Optional[str]


# ------------------------------------------------------------ gold account

class GoldEntryIn(BaseModel):
    """GOLD: the shop gave gold (weight x purity). CASH: cash counted as fine at a rate.
    ADJUST: an opening balance or correction in fine grams (+ the shop owes more)."""
    kind: Literal["GOLD", "CASH", "ADJUST"]
    entry_date: Optional[date] = None
    gold_weight: Optional[float] = Field(None, gt=0, le=1_000_000)
    purity_percent: Optional[float] = Field(None, gt=0, le=100)
    cash: Optional[float] = Field(None, gt=0, le=10_000_000_000)
    rate: Optional[float] = Field(None, gt=0, le=10_000_000, description="Blank = the day's rate")
    fine: Optional[float] = Field(None, ge=-1_000_000, le=1_000_000)
    note: Optional[str] = Field(None, max_length=500)

    _s = field_validator("note", mode="before")(_strip)

    @model_validator(mode="after")
    def _need(self):
        if self.kind == "GOLD" and (self.gold_weight is None or self.purity_percent is None):
            raise ValueError("Enter the gold weight and its purity")
        if self.kind == "CASH" and self.cash is None:
            raise ValueError("Enter the cash amount")
        if self.kind == "ADJUST" and not self.fine:
            raise ValueError("Enter the fine grams (+ owes more, - owes less)")
        return self


class GoldEntryOut(BaseModel):
    id: str
    entry_date: date
    kind: str
    fine: float
    gold_weight: Optional[float]
    purity_percent: Optional[float]
    cash: Optional[float]
    rate: Optional[float]
    bill_id: Optional[str]
    bill_number: Optional[str]
    note: Optional[str]
    created_by_name: Optional[str]
    balance: float  # running balance after this entry


class GoldAccountOut(BaseModel):
    shop_id: str
    shop_name: str
    settles_in_gold: bool
    balance: float
    balance_value: Optional[float]  # at today's rate, when set
    entries: List[GoldEntryOut]  # newest first
