from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator


class RateIn(BaseModel):
    rate: float = Field(..., gt=0, le=10_000_000, description="Rupees per gram of fine gold")
    notes: Optional[str] = Field(None, max_length=500)

    @field_validator("notes", mode="before")
    @classmethod
    def _s(cls, v):
        return v.strip() if isinstance(v, str) else v


class RateOut(BaseModel):
    rate_date: date
    rate: float
    notes: Optional[str]
    set_by_name: Optional[str]
    updated_at: datetime


class TodayOut(BaseModel):
    """Today's rate, or the latest earlier one as a hint when today's isn't set."""
    date: date
    today: Optional[RateOut]
    last: Optional[RateOut]
