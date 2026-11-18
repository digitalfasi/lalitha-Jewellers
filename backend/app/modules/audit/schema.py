from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field, field_validator

ScanResult = Literal["FOUND", "NOT_IN_STOCK", "UNKNOWN", "OTHER_CATEGORY"]


class AuditCreate(BaseModel):
    name: Optional[str] = Field(None, max_length=150)
    category_id: Optional[str] = None

    @field_validator("name", mode="before")
    @classmethod
    def _s(cls, v):
        return v.strip() if isinstance(v, str) else v


class ScanIn(BaseModel):
    code: str = Field(..., min_length=1, max_length=30)

    @field_validator("code", mode="before")
    @classmethod
    def _c(cls, v):
        return v.strip().upper() if isinstance(v, str) else v


class ScanOut(BaseModel):
    id: str
    scanned_code: str
    item_code: Optional[str]
    via_combo_code: Optional[str]
    result: ScanResult
    note: Optional[str]
    by_name: Optional[str]
    at: datetime


class MissingPiece(BaseModel):
    item_code: str
    name: str
    category_name: str
    net_weight: float
    combo_code: Optional[str] = None


class AuditSummaryOut(BaseModel):
    id: str
    audit_no: str
    name: Optional[str]
    category_id: Optional[str]
    category_name: Optional[str]
    status: Literal["OPEN", "CLOSED"]
    started_by_name: Optional[str]
    closed_by_name: Optional[str]
    created_at: datetime
    closed_at: Optional[datetime]
    expected: int
    found: int


class AuditOut(AuditSummaryOut):
    missing: List[MissingPiece]
    problems: List[ScanOut]   # scans that were not a clean FOUND
    recent: List[ScanOut]     # last scans, newest first


class ScanResponse(BaseModel):
    """What the scan screen shows after each beep."""
    ok: bool
    message: str
    scans: List[ScanOut]
    expected: int
    found: int
