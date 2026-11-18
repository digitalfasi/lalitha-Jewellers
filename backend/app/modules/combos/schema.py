from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field, field_validator

from app.modules.inventory.schema import PieceCreate

ComboStatus = Literal["ACTIVE", "DISSOLVED", "SOLD"]


def _code(v):
    return v.strip().upper() if isinstance(v, str) else v


def _strip(v):
    return v.strip() if isinstance(v, str) else v


class ComboCreate(BaseModel):
    """Pieces are given by Item Code, which is what staff scan or type."""
    piece_codes: List[str] = Field(..., min_length=2, max_length=20)
    name: Optional[str] = Field(None, max_length=150)
    remarks: Optional[str] = Field(None, max_length=1000)

    _s = field_validator("name", "remarks", mode="before")(_strip)

    @field_validator("piece_codes", mode="before")
    @classmethod
    def _codes(cls, v):
        return [_code(c) for c in v] if isinstance(v, list) else v


class ComboUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=150)
    remarks: Optional[str] = Field(None, max_length=1000)

    _s = field_validator("name", "remarks", mode="before")(_strip)


class PieceCodeIn(BaseModel):
    piece_code: str = Field(..., min_length=1, max_length=20)
    note: Optional[str] = Field(None, max_length=500)

    _c = field_validator("piece_code", mode="before")(_code)
    _s = field_validator("note", mode="before")(_strip)


class SwapIn(BaseModel):
    out_code: str = Field(..., min_length=1, max_length=20, description="Piece leaving the combo")
    in_code: str = Field(..., min_length=1, max_length=20, description="Piece joining the combo")
    note: Optional[str] = Field(None, max_length=500)

    _c = field_validator("out_code", "in_code", mode="before")(_code)
    _s = field_validator("note", mode="before")(_strip)


class DissolveIn(BaseModel):
    note: Optional[str] = Field(None, max_length=500)

    _s = field_validator("note", mode="before")(_strip)


class ComboPieceOut(BaseModel):
    piece_id: str
    item_code: str
    name: str
    category_name: str
    design_name: Optional[str] = None
    purity: str
    huid: Optional[str] = None
    photo_url: Optional[str] = None
    gross_weight: float
    stone_weight: float
    net_weight: float
    touch_percent: Optional[float]
    linked_at: datetime
    unlinked_at: Optional[datetime] = None


class ComboTotals(BaseModel):
    pieces: int
    gross_weight: float
    stone_weight: float
    net_weight: float


class ComboOut(BaseModel):
    id: str
    combo_code: str
    name: Optional[str]
    status: ComboStatus
    remarks: Optional[str]
    created_at: datetime
    dissolved_at: Optional[datetime]
    photo_url: Optional[str] = None
    # A name built from the current pieces, offered when the saved name may be out of date.
    suggested_name: str = ""
    pieces: List[ComboPieceOut]       # linked now
    past_pieces: List[ComboPieceOut]  # linked before, since unlinked
    totals: ComboTotals               # of the current pieces


class ComboList(BaseModel):
    items: List[ComboOut]
    total: int


class ComboEventOut(BaseModel):
    seq: int
    event: str
    item_code: Optional[str]
    other_item_code: Optional[str]
    note: Optional[str]
    by_name: Optional[str] = None
    at: datetime


class PieceComboHistoryOut(BaseModel):
    combo_id: str
    combo_code: str
    combo_name: Optional[str]
    combo_status: ComboStatus
    linked_at: datetime
    unlinked_at: Optional[datetime]
    current: bool


class AvailablePieceOut(BaseModel):
    """A piece that can go into a combo right now."""
    piece_id: str
    item_code: str
    name: str
    category_id: str = ""
    category_name: str
    design_name: Optional[str]
    purity: str
    gross_weight: float
    stone_weight: float
    net_weight: float
    touch_percent: Optional[float] = None
    huid: Optional[str] = None
    photo_url: Optional[str] = None



class SuggestionOut(AvailablePieceOut):
    """An available piece ranked as a good match for the pieces already chosen."""
    score: int
    reasons: List[str]


# ----------------------------------------------------------------- templates

class TemplateSlotIn(BaseModel):
    category_id: str
    label: Optional[str] = Field(None, max_length=50)

    _s = field_validator("label", mode="before")(_strip)


class TemplateIn(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    slots: List[TemplateSlotIn] = Field(..., min_length=2, max_length=10)
    is_active: Optional[bool] = None

    _s = field_validator("name", mode="before")(_strip)


class TemplateSlotOut(BaseModel):
    category_id: str
    category_name: str
    label: str


class TemplateOut(BaseModel):
    id: str
    name: str
    slots: List[TemplateSlotOut]
    is_active: bool



class NewSetIn(BaseModel):
    """New stock that arrives as a set: its pieces and the combo are saved
    together, all or nothing."""
    pieces: List[PieceCreate] = Field(..., min_length=2, max_length=20)
    lot_id: Optional[str] = None
    name: Optional[str] = Field(None, max_length=150)
    remarks: Optional[str] = Field(None, max_length=1000)

    _s = field_validator("name", "remarks", mode="before")(_strip)
