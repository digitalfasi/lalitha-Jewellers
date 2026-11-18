from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app._shared.models.base import Base, TimestampMixin
from app.modules.inventory.model import Piece

COMBO_PREFIX = "CB"  # reserved in inventory: no category may use it

COMBO_STATUS_ACTIVE = "ACTIVE"
COMBO_STATUS_DISSOLVED = "DISSOLVED"  # all pieces unlinked; the code is never reused
COMBO_STATUS_SOLD = "SOLD"            # set only by billing; locked from then on

EVENT_CREATED = "CREATED"
EVENT_LINKED = "LINKED"
EVENT_UNLINKED = "UNLINKED"
EVENT_SWAPPED = "SWAPPED"
EVENT_DISSOLVED = "DISSOLVED"

MIN_PIECES = 2


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Combo(Base, TimestampMixin):
    """A set of pieces sold together (chain + pendant, ring + stones...), with
    its own code (CB0001). The code stays with the combo while pieces are
    swapped in and out; every change is kept in combo_items / combo_events."""
    __tablename__ = "combos"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    combo_code: Mapped[str] = mapped_column(String(20), nullable=False, unique=True, index=True)
    name: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default=COMBO_STATUS_ACTIVE, nullable=False, index=True)
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    dissolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    photo_path: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)

    items: Mapped[List["ComboItem"]] = relationship(
        back_populates="combo", lazy="selectin", order_by="ComboItem.linked_at"
    )


class ComboItem(Base):
    """One piece's stay in one combo. Rows are never deleted: unlinking sets
    unlinked_at, so current members are the rows where it is NULL and past
    pairings are everything else. The partial unique index means a piece can
    be in at most one combo at a time, even if two people link it at once."""
    __tablename__ = "combo_items"
    __table_args__ = (
        Index(
            "uq_combo_items_one_active_combo_per_piece",
            "piece_id",
            unique=True,
            sqlite_where=text("unlinked_at IS NULL"),
            postgresql_where=text("unlinked_at IS NULL"),
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    combo_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("combos.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    piece_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("pieces.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    linked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
    unlinked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    combo: Mapped[Combo] = relationship(back_populates="items")
    piece: Mapped[Piece] = relationship(lazy="joined")


class ComboEvent(Base):
    """Readable timeline of a combo: created, linked, unlinked, swapped,
    dissolved. seq orders events within a combo (timestamps can tie).
    Item codes are snapshotted so the history reads the same forever."""
    __tablename__ = "combo_events"
    __table_args__ = (UniqueConstraint("combo_id", "seq", name="uq_combo_events_combo_seq"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    combo_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("combos.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    seq: Mapped[int] = mapped_column(Integer, nullable=False)
    event: Mapped[str] = mapped_column(String(20), nullable=False)
    piece_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("pieces.id", ondelete="RESTRICT"), nullable=True)
    item_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    # For SWAPPED: the piece that came in (piece_id / item_code is the one that left).
    other_piece_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("pieces.id", ondelete="RESTRICT"), nullable=True
    )
    other_item_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    by_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    by_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)  # snapshot: reads the same if renamed
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)


class ComboTemplate(Base, TimestampMixin):
    """A saved recipe for making a set, e.g. "Chain + Pendant" or
    "Necklace + 2 drops". slots is an ordered list of
    {"category_id": ..., "label": ...}; a category may appear more than once."""
    __tablename__ = "combo_templates"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    slots: Mapped[list] = mapped_column(JSON, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
