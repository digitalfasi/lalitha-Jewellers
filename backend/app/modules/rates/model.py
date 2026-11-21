from datetime import date
from decimal import Decimal
from typing import Optional

from sqlalchemy import JSON, Date, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app._shared.models.base import Base, TimestampMixin


class GoldRate(Base, TimestampMixin):
    """The day's gold rate: rupees per gram of fine (24K) gold. Set once each
    morning; every bill dated that day starts from it. One row per date."""
    __tablename__ = "gold_rates"

    rate_date: Mapped[date] = mapped_column(Date, primary_key=True)
    rate: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    # {"22K": 6850.0, ...}: rates the owner typed for other purities. Missing = 24K rate x purity %.
    purity_rates: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    set_by_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
