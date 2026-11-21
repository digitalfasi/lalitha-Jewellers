import re
from datetime import date, datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

Purity = Literal["24K", "22K", "20K", "18K", "14K"]
PieceStatus = Literal["IN_STOCK", "SOLD", "INACTIVE"]


def _strip(v):
    return v.strip() if isinstance(v, str) else v


# ---------------------------------------------------------------- categories

def _hsn(v):
    if v in (None, ""):
        return None
    if not re.fullmatch(r"\d{4,8}", v):
        raise ValueError("HSN code is 4 to 8 digits, e.g. 7113")
    return v


def _huid(v):
    if v in (None, ""):
        return None
    v = v.upper()
    if not re.fullmatch(r"[A-Z0-9]{6}", v):
        raise ValueError("HUID is 6 letters and digits")
    return v


class CategoryCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    code_prefix: str = Field(..., min_length=2, max_length=3, description="2-3 letters, e.g. CH")
    hsn_code: Optional[str] = Field(None, max_length=8, description="Printed on bills; default 7113")

    _s = field_validator("name", "code_prefix", "hsn_code", mode="before")(_strip)
    _h = field_validator("hsn_code")(_hsn)


class CategoryUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    code_prefix: Optional[str] = Field(None, min_length=2, max_length=3)
    hsn_code: Optional[str] = Field(None, max_length=8)
    is_active: Optional[bool] = None

    _s = field_validator("name", "code_prefix", "hsn_code", mode="before")(_strip)
    _h = field_validator("hsn_code")(_hsn)


class CategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    code_prefix: str
    hsn_code: str = "7113"
    is_active: bool
    piece_count: int = 0
    prefix_locked: bool = False


# ------------------------------------------------------------------- designs

class DesignCreate(BaseModel):
    category_id: str
    name: str = Field(..., min_length=2, max_length=150)
    design_no: Optional[str] = Field(None, max_length=50)
    default_percent: Optional[float] = Field(None, gt=0, le=200, description="Usual % for this sub-category")

    _s = field_validator("name", "design_no", mode="before")(_strip)


class DesignUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=150)
    design_no: Optional[str] = Field(None, max_length=50)
    default_percent: Optional[float] = Field(None, gt=0, le=200)
    is_active: Optional[bool] = None

    _s = field_validator("name", "design_no", mode="before")(_strip)


class DesignOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    category_id: str
    category_name: str
    name: str
    design_no: Optional[str]
    default_percent: Optional[float] = None
    is_active: bool
    in_stock_count: int = 0
    # Learned from pieces already entered with this design, to help the next entry:
    usual_touch: Optional[float] = None    # the touch % used most often
    typical_net: Optional[float] = None    # average net weight (g)
    piece_count: int = 0


# -------------------------------------------------------------------- pieces

class PieceCreate(BaseModel):
    """No item_code here: the server always allocates it from the category."""
    category_id: str
    design_id: Optional[str] = None
    name: Optional[str] = Field(None, max_length=150, description="Blank = the sub-category or category name")
    purity: Purity
    gross_weight: float = Field(..., gt=0, le=100000)
    stone_weight: float = Field(0, ge=0)
    touch_percent: Optional[float] = Field(None, gt=0, le=200)
    cost_touch: Optional[float] = Field(None, gt=0, le=200, description="Touch the karigar charged (purchase)")
    remarks: Optional[str] = Field(None, max_length=1000)
    huid: Optional[str] = Field(None, max_length=6, description="Hallmark Unique ID")
    lot_id: Optional[str] = None

    _s = field_validator("name", "remarks", "huid", mode="before")(_strip)
    _h = field_validator("huid")(_huid)


class PieceUpdate(BaseModel):
    """Category is not editable: the Item Code already carries its prefix."""
    design_id: Optional[str] = None
    name: Optional[str] = Field(None, min_length=2, max_length=150)
    purity: Optional[Purity] = None
    gross_weight: Optional[float] = Field(None, gt=0, le=100000)
    stone_weight: Optional[float] = Field(None, ge=0)
    touch_percent: Optional[float] = Field(None, gt=0, le=200)
    cost_touch: Optional[float] = Field(None, gt=0, le=200, description="Touch the karigar charged (purchase)")
    remarks: Optional[str] = Field(None, max_length=1000)
    huid: Optional[str] = Field(None, max_length=6)
    lot_id: Optional[str] = None
    status: Optional[Literal["IN_STOCK", "INACTIVE"]] = None

    _s = field_validator("name", "remarks", "huid", mode="before")(_strip)
    _h = field_validator("huid")(_huid)


class PieceOut(BaseModel):
    id: str
    item_code: str
    category_id: str
    category_name: str
    design_id: Optional[str]
    design_name: Optional[str]
    name: str
    purity: str
    gross_weight: float
    stone_weight: float
    net_weight: float
    touch_percent: Optional[float]
    cost_touch: Optional[float] = None
    status: PieceStatus
    remarks: Optional[str]
    huid: Optional[str] = None
    lot_id: Optional[str] = None
    lot_no: Optional[str] = None
    karigar_name: Optional[str] = None
    photo_url: Optional[str] = None
    created_by_name: Optional[str] = None
    created_at: datetime
    # Code of the combo this piece is in right now, if any.
    combo_code: Optional[str] = None
    # Physical tag: NEW (never printed), COMBO_CHANGED (back is out of date), OK; None if not in stock.
    tag_state: Optional[str] = None


class PieceList(BaseModel):
    items: List[PieceOut]
    total: int


class PieceBulkIn(BaseModel):
    """Many pieces in one go (a new lot arriving). All or nothing: if any row is
    wrong, nothing is saved and the error names the row."""
    lot_id: Optional[str] = Field(None, description="Applied to rows that don't name their own lot")
    pieces: List[PieceCreate] = Field(..., min_length=1, max_length=500)


# ------------------------------------------------------------ karigars, lots

class KarigarIn(BaseModel):
    name: str = Field(..., min_length=2, max_length=150)
    phone: Optional[str] = Field(None, max_length=20)
    city: Optional[str] = Field(None, max_length=100)
    notes: Optional[str] = Field(None, max_length=1000)
    is_active: Optional[bool] = None

    _s = field_validator("name", "phone", "city", "notes", mode="before")(_strip)


class KarigarOut(BaseModel):
    id: str
    name: str
    phone: Optional[str]
    city: Optional[str]
    notes: Optional[str]
    is_active: bool
    lot_count: int = 0


class LotCreate(BaseModel):
    karigar_id: Optional[str] = None
    received_on: Optional[date] = None
    gold_given_fine: Optional[float] = Field(None, ge=0, le=1_000_000, description="Fine grams given to the karigar")
    remarks: Optional[str] = Field(None, max_length=1000)

    _s = field_validator("remarks", mode="before")(_strip)


class LotUpdate(BaseModel):
    karigar_id: Optional[str] = None
    received_on: Optional[date] = None
    gold_given_fine: Optional[float] = Field(None, ge=0, le=1_000_000)
    remarks: Optional[str] = Field(None, max_length=1000)

    _s = field_validator("remarks", mode="before")(_strip)


class LotOut(BaseModel):
    id: str
    lot_no: str
    karigar_id: Optional[str]
    karigar_name: Optional[str]
    received_on: date
    remarks: Optional[str]
    created_by_name: Optional[str]
    piece_count: int = 0
    in_stock_count: int = 0
    total_gross: float = 0
    total_net: float = 0
    # Karigar check: fine given vs fine that came back (net x cost touch of the lot's pieces).
    gold_given_fine: Optional[float] = None
    returned_fine: float = 0
    pieces_without_cost_touch: int = 0
    karigar_balance: Optional[float] = None  # > 0: the karigar still holds our gold
