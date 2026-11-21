from typing import Optional

from decimal import Decimal

from sqlalchemy import Boolean, Numeric, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column

from app._shared.models.base import Base, TimestampMixin

PROFILE_ID = "main"  # there is one wholesaler, so one row


class BusinessProfile(Base, TimestampMixin):
    """The wholesaler's own details, printed on every bill. A bill copies what
    it needs when it is saved, so later edits never change old bills."""
    __tablename__ = "business_profile"

    id: Mapped[str] = mapped_column(String(10), primary_key=True, default=PROFILE_ID)
    name: Mapped[str] = mapped_column(String(150), nullable=False, default="")
    address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    city: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    pincode: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    state_code: Mapped[Optional[str]] = mapped_column(String(2), nullable=True)
    gstin: Mapped[Optional[str]] = mapped_column(String(15), nullable=True)
    pan: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    bank_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    bank_account: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    bank_ifsc: Mapped[Optional[str]] = mapped_column(String(11), nullable=True)
    bank_branch: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    bill_terms: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    logo_path: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    # Bill settings the owner can change.
    default_hsn: Mapped[str] = mapped_column(String(8), nullable=False, default="7113", server_default="7113")
    huid_rate: Mapped[Optional[Decimal]] = mapped_column(Numeric(14, 2), nullable=True)    # Rs per hallmarked piece
    stone_rate: Mapped[Optional[Decimal]] = mapped_column(Numeric(14, 2), nullable=True)   # Rs per gram of less
    show_making: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"), nullable=False)
