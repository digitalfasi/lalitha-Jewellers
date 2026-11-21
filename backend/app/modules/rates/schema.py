from datetime import date, datetime
from typing import Dict, List, Optional

from pydantic import BaseModel, Field, field_validator


class RateIn(BaseModel):
    rate: float = Field(..., gt=0, le=10_000_000, description="Rupees per gram of fine gold")
    notes: Optional[str] = Field(None, max_length=500)
    # The owner's own rate for other purities; leave one out to work it out from the 24K rate.
    purity_rates: Optional[Dict[str, Optional[float]]] = None

    @field_validator("purity_rates")
    @classmethod
    def _purities(cls, v):
        if not v:
            return None
        out = {}
        for k, r in v.items():
            if k not in ("22K", "20K", "18K", "14K"):
                raise ValueError(f"Unknown purity {k}")
            if r is not None:
                if not 0 < r <= 10_000_000:
                    raise ValueError(f"{k} rate must be above 0")
                out[k] = round(float(r), 2)
        return out or None

    @field_validator("notes", mode="before")
    @classmethod
    def _s(cls, v):
        return v.strip() if isinstance(v, str) else v


class RateOut(BaseModel):
    rate_date: date
    rate: float
    # Every purity's rate per gram (24K = the fine rate), and which ones the owner typed.
    purity_rates: Dict[str, float] = {}
    custom_purities: List[str] = []
    notes: Optional[str]
    set_by_name: Optional[str]
    updated_at: datetime


class TodayOut(BaseModel):
    """Today's rate, or the latest earlier one as a hint when today's isn't set."""
    date: date
    today: Optional[RateOut]
    last: Optional[RateOut]
