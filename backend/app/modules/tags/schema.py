from typing import List, Literal, Optional

from pydantic import BaseModel, Field

TagKind = Literal["PIECE", "COMBO"]
TagState = Literal["NEW", "COMBO_CHANGED", "OK"]


class ComboBack(BaseModel):
    """The back of a piece's fold-over tag: the combo it is in."""
    code: str
    title: str
    purity: str
    piece_codes: List[str]
    gross_weight: float
    net_weight: float


class LabelOut(BaseModel):
    """Everything a printed tag shows, for a piece or a combo. The QR code and
    barcode both encode just `code`, so any scanner (camera or USB) reads
    back the Item / Combo Code, which /tags/resolve turns into this again."""
    kind: TagKind
    id: str
    code: str
    title: str
    category_name: Optional[str] = None   # piece only
    purity: str                           # combo: distinct purities joined, e.g. "22K" or "22K / 18K"
    gross_weight: float
    stone_weight: float
    net_weight: float
    status: str                           # piece: IN_STOCK/SOLD/INACTIVE; combo: ACTIVE/DISSOLVED/SOLD
    printable: bool                       # False for stock that has left (sold / inactive / dissolved)
    combo_code: Optional[str] = None      # piece: the combo it is in now
    piece_codes: List[str] = []           # combo: its current pieces
    huid: Optional[str] = None            # piece only: hallmark ID
    photo_url: Optional[str] = None
    back: Optional[ComboBack] = None      # piece in a combo: what its tag's back side shows
    tag_state: Optional[TagState] = None  # piece only: does its tag need (re)printing?
    tag_note: Optional[str] = None


class LabelBatchOut(BaseModel):
    labels: List[LabelOut]  # in the order asked, duplicates removed
    missing: List[str]      # codes that matched nothing



class PrintedIn(BaseModel):
    codes: List[str] = Field(..., min_length=1, max_length=500)


class PrintedOut(BaseModel):
    marked: int


class PendingTagOut(BaseModel):
    code: str
    name: str
    category_name: str
    state: Literal["NEW", "COMBO_CHANGED"]
    note: str
    combo_code: Optional[str] = None
