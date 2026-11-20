from decimal import Decimal
from typing import List, Literal, Optional

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
    other_charges: Decimal = Field(0, ge=0, le=100_000_000, description="Rupees: stones, hallmarking...")
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


class FineOut(BaseModel):
    net_weight: Decimal
    net_pavan: Decimal
    touch_percent: Decimal
    fine_weight: Decimal
    fine_pavan: Decimal
    metal_amount: Decimal
    making_amount: Decimal
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
