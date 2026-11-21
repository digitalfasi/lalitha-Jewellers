from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app._shared.models.base import Base

TAG_NEW = "NEW"                    # first tag for the piece
TAG_COMBO_CHANGED = "COMBO_CHANGED"  # the back had to change (joined, left, or partners changed)
TAG_REPRINT = "REPRINT"            # nothing changed: the old tag was lost or damaged


class TagPrint(Base):
    """One tag printed for one piece, and why. Shown in the piece's history."""
    __tablename__ = "tag_prints"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    piece_id: Mapped[str] = mapped_column(String(36), ForeignKey("pieces.id", ondelete="RESTRICT"), nullable=False, index=True)
    item_code: Mapped[str] = mapped_column(String(20), nullable=False)
    printed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    reason: Mapped[str] = mapped_column(String(20), nullable=False)
    back_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    back_with: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    by_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
