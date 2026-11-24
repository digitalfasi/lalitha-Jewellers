from decimal import Decimal
from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, Field, model_validator

Purity = Literal["24K", "22K", "20K", "18K", "14K"]
Weight = Field(..., ge=0, le=100_000, description="Grams")
Rate = Field(..., gt=0, le=10_000_000, description="Rupees per gram of fine (24K) gold")


class FineIn(BaseModel):
    """Price by TOUCH (touch %), or by WASTAGE (purity + wastage %, usually with making per gram)."""
    gross_weight: Decimal = Weight
    stone_weight: Decimal = Field(0, ge=0, le=100_000)
    mode: Literal["TOUCH", "WASTAGE"] = "TOUCH"
    touch_percent: Optional[Decimal] = Field(None, gt=0, le=200)
    purity: Optional[Purity] = None
    wastage_percent: Optional[Decimal] = Field(None, ge=0, le=100)
    making_per_gram: Optional[Decimal] = Field(None, ge=0, le=1_000_000)
    other_charges: Decimal = Field(0, ge=0, le=100_000_000, description="Rupees, anything else")
    # Stones: rate x quantity, by carat, by piece or by gram.
    stone_rate: Optional[Decimal] = Field(None, ge=0, le=10_000_000)
    stone_qty: Optional[Decimal] = Field(None, ge=0, le=100_000)
    stone_unit: Literal["CARAT", "PIECE", "GRAM"] = "CARAT"
    # Hallmarking (HUID), per piece.
    hallmark_pieces: int = Field(0, ge=0, le=10_000)
    hallmark_rate: Decimal = Field(0, ge=0, le=100_000)
    # Discount: as touch taken off, and / or rupees off.
    touch_discount: Decimal = Field(0, ge=0, le=50)
    discount_amount: Decimal = Field(0, ge=0, le=100_000_000)
    gold_rate: Decimal = Rate
    gst_percent: Decimal = Field(3, ge=0, le=28)
    interstate: bool = False

    @model_validator(mode="after")
    def _check(self):
        if self.stone_weight > self.gross_weight:
            raise ValueError("Stone weight can't be more than the gross weight")
        if self.mode == "TOUCH" and self.touch_percent is None:
            raise ValueError("Enter the touch %")
        if self.mode == "WASTAGE" and (self.purity is None or self.wastage_percent is None):
            raise ValueError("Choose the purity and enter the wastage %")
        return self

    @property
    def stone_amount(self) -> Decimal:
        return (self.stone_rate or 0) * (self.stone_qty or 0)


class FineOut(BaseModel):
    net_weight: Decimal
    net_pavan: Decimal
    touch_percent: Decimal
    fine_weight: Decimal
    fine_pavan: Decimal
    metal_amount: Decimal
    making_amount: Decimal
    stone_amount: Decimal
    hallmark_amount: Decimal
    discount_amount: Decimal
    other_charges: Decimal
    subtotal: Decimal
    gst_amount: Decimal
    cgst_amount: Decimal
    sgst_amount: Decimal
    igst_amount: Decimal
    round_off: Decimal
    total: Decimal
    per_gram: Decimal


class RateRow(BaseModel):
    purity: str
    purity_percent: Decimal
    per_gram: Decimal
    per_pavan: Decimal
    per_10g: Decimal
    per_tola: Decimal


class RatesOut(BaseModel):
    fine_rate: Decimal
    rows: List[RateRow]


class GstIn(BaseModel):
    amount: Decimal = Field(..., ge=0, le=10_000_000_000)
    inclusive: bool = False
    gst_percent: Decimal = Field(3, ge=0, le=28)
    interstate: bool = False


class GstOut(BaseModel):
    base_amount: Decimal
    gst_amount: Decimal
    cgst_amount: Decimal
    sgst_amount: Decimal
    igst_amount: Decimal
    total: Decimal


class OldGoldIn(BaseModel):
    weight: Decimal = Weight
    less_weight: Decimal = Field(0, ge=0, le=100_000, description="Stones, dirt, lac")
    purity_percent: Decimal = Field(..., gt=0, le=100, description="Tested purity (touch-stone or machine)")
    melting_loss_percent: Decimal = Field(0, ge=0, le=50)
    gold_rate: Decimal = Rate
    new_bill_amount: Optional[Decimal] = Field(None, ge=0, le=10_000_000_000)

    @model_validator(mode="after")
    def _check(self):
        if self.less_weight > self.weight:
            raise ValueError("The less weight can't be more than the weight")
        return self


class OldGoldOut(BaseModel):
    net_weight: Decimal
    after_loss_weight: Decimal
    fine_weight: Decimal
    fine_pavan: Decimal
    value: Decimal
    balance: Optional[Decimal] = None
    balance_direction: Optional[Literal["SHOP_PAYS", "WE_PAY", "SETTLED"]] = None


class MoneyIn(BaseModel):
    amount: Decimal = Field(..., gt=0, le=10_000_000_000)
    gold_rate: Decimal = Rate
    gst_percent: Decimal = Field(3, ge=0, le=28, description="0 when the amount is before GST")
    touch_percent: Optional[Decimal] = Field(None, gt=0, le=200)


class MoneyOut(BaseModel):
    amount_before_gst: Decimal
    gst_amount: Decimal
    fine_weight: Decimal
    fine_pavan: Decimal
    jewellery_weight: Optional[Decimal] = None
    jewellery_pavan: Optional[Decimal] = None


class MetalIn(BaseModel):
    owed_fine: Decimal = Field(..., ge=0, le=1_000_000, description="Fine grams the shop owes")
    gold_weight: Decimal = Field(0, ge=0, le=1_000_000, description="Gold the shop gives now, in grams")
    gold_purity_percent: Decimal = Field(99.5, gt=0, le=100)
    cash: Decimal = Field(0, ge=0, le=10_000_000_000)
    gold_rate: Decimal = Rate


class MetalOut(BaseModel):
    gold_fine: Decimal
    cash_fine: Decimal
    paid_fine: Decimal
    balance_fine: Decimal
    balance_pavan: Decimal
    balance_rupees: Decimal
    balance_direction: Literal["SHOP_OWES", "WE_OWE", "SETTLED"]


# ------------------------------------------------------- Excel-style quick math

Letter = Literal["A", "B", "C", "D", "E", "F", "G", "H", "ANS"]


class FormulaIn(BaseModel):
    formula: str = Field(..., max_length=500, description="Excel style, e.g. =ROUND(A*B/100, 2)")
    values: Dict[str, Optional[Decimal]] = Field(default_factory=dict, description="A to H and ANS")

    @model_validator(mode="after")
    def _names(self):
        bad = [k for k in self.values if k.upper() not in Letter.__args__]
        if bad:
            raise ValueError(f"Boxes are A to H (and ANS), not {', '.join(bad)}")
        return self


class FormulaOut(BaseModel):
    status: Literal["ok", "error"]
    formula_used: str
    result: Optional[str] = None   # exact text, e.g. "30.06" or "TRUE"
    error: Optional[str] = None    # #DIV/0!, #VALUE! or #NAME?
    hint: Optional[str] = None     # the same, in plain words


class GridIn(BaseModel):
    a: Decimal = Field(..., ge=-10**15, le=10**15)
    b: Decimal = Field(..., ge=-10**15, le=10**15)


class GridItem(BaseModel):
    key: str
    label: str
    formula: str
    result: Optional[str] = None
    error: Optional[str] = None


class StatsIn(BaseModel):
    text: str = Field(..., max_length=50_000, description="Pasted numbers: a column, a list, a message")


class StatsOut(BaseModel):
    count: int
    sum: Optional[str] = None
    average: Optional[str] = None
    min: Optional[str] = None
    max: Optional[str] = None
    numbers: List[str]


class SavedFormulaIn(BaseModel):
    name: str = Field(..., min_length=2, max_length=60)
    formula: str = Field(..., min_length=1, max_length=500)
    hint: Optional[str] = Field(None, max_length=200)
    labels: Optional[Dict[str, str]] = Field(None, description='What each box is called, {"A": "Less (g)"}')
    folder: Optional[str] = Field(None, max_length=60)
    example: Optional[Dict[str, Optional[Decimal]]] = Field(None, description="Box values to show as a worked example")


class SavedFormulaEdit(BaseModel):
    folder: Optional[str] = Field(None, max_length=60)
    name: Optional[str] = Field(None, min_length=2, max_length=60)
    formula: Optional[str] = Field(None, min_length=1, max_length=500)
    hint: Optional[str] = Field(None, max_length=200)
    labels: Optional[Dict[str, str]] = None


class SavedFormulaOut(BaseModel):
    id: str
    name: str
    formula: str
    hint: Optional[str] = None
    letters: List[str]             # boxes the formula uses, e.g. ["A", "B"]
    labels: Dict[str, str] = {}
    folder: Optional[str] = None
    example: Optional[dict] = None  # {"values": {"A": "2.14"}, "result": "1102.1"}
    versions: int = 0               # earlier versions kept (Undo goes back one)
    created_by_name: Optional[str] = None


class SheetIn(BaseModel):
    cells: Dict[str, str] = Field(..., description="A1 to J20: a number, a label or =formula")


class MyCalcIn(BaseModel):
    tape: Optional[List[dict]] = Field(None, max_length=50)
    sheet: Optional[object] = None   # the workbook (Excel-style sheets)
    pins: Optional[List[str]] = Field(None, max_length=12)


class MyCalcOut(BaseModel):
    tape: List[dict] = []
    sheet: object = None
    pins: List[str] = []


class ImportedFormula(BaseModel):
    name: str
    formula: str
    labels: Dict[str, str] = {}
    source: str                     # where it was in the file, e.g. Sheet1!D2
    problem: Optional[str] = None   # why it can't be used as it is
