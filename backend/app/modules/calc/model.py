from typing import Optional

from sqlalchemy import JSON, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app._shared.models.base import Base, TimestampMixin


class SavedFormula(Base, TimestampMixin):
    """A formula the owner saved once ("Stone charge = A × 515"), a one-tap button for all staff."""
    __tablename__ = "calc_formulas"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(60), nullable=False, unique=True)
    formula: Mapped[str] = mapped_column(String(500), nullable=False)
    # What A, B, C… mean here, e.g. "A = less weight", shown under the boxes.
    hint: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    sort: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    folder: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)  # e.g. "Stones", "Exchange"
    labels: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)    # {"A": "Less (g)", "B": "Rate"}
    example: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)   # {"values": {...}, "result": "1102.1"}
    history: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)   # earlier versions, newest first
    created_by_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)


class CalcUserData(Base, TimestampMixin):
    """One person's calculator: their tape, their sheet and their pinned formulas, on every device."""
    __tablename__ = "calc_user_data"

    user_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    tape: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    sheet: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    pins: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)


class CalcItem(Base, TimestampMixin):
    """A saved calculator item: a named sheet, or a recent quote or sum to reopen later."""
    __tablename__ = "calc_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    kind: Mapped[str] = mapped_column(String(10), nullable=False, index=True)  # SHEET, QUOTE, CALC
    title: Mapped[str] = mapped_column(String(150), nullable=False)
    data: Mapped[dict] = mapped_column(JSON, nullable=False)
    total: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    shop_name: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    created_by_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
