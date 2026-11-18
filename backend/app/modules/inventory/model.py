from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app._shared.models.base import Base, TimestampMixin

# Weights are grams to 3 decimals (milligram), the way the trade writes them.
WEIGHT = Numeric(10, 3)

PIECE_STATUS_IN_STOCK = "IN_STOCK"
PIECE_STATUS_SOLD = "SOLD"          # set only by billing
PIECE_STATUS_INACTIVE = "INACTIVE"  # manual retire: entry mistake, returned to supplier


class Category(Base, TimestampMixin):
    """A kind of piece (Chain, Pendant, Ring...). Its code_prefix starts every
    Item Code in the category, e.g. CH -> CH0001. The prefix is locked once a
    piece has been coded with it, because printed tags already carry it."""
    __tablename__ = "categories"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    code_prefix: Mapped[str] = mapped_column(String(3), nullable=False, unique=True)
    # HSN printed on bills for this category. 7113 = articles of jewellery.
    hsn_code: Mapped[str] = mapped_column(String(8), nullable=False, default="7113", server_default="7113")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class Design(Base, TimestampMixin):
    """A model within a category (e.g. 'Rope chain 18in'). Many physical pieces
    share one design; when a combo needs 'another one of these', staff pick a
    different in-stock piece of the same design."""
    __tablename__ = "designs"
    __table_args__ = (UniqueConstraint("category_id", "name", name="uq_designs_category_name"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    category_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("categories.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    design_no: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    category: Mapped[Category] = relationship(lazy="joined")


class CodeSequence(Base, TimestampMixin):
    """One counter per code prefix. Allocation locks the row FOR UPDATE inside
    the caller's transaction, so two pieces saved at once never get the same
    number; the unique item_code constraint is the database backstop.
    Combos will use their own prefix (CB) from this same table."""
    __tablename__ = "code_sequences"

    prefix: Mapped[str] = mapped_column(String(10), primary_key=True)
    last_value: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


LOT_COUNTER_KEY = "LOTS"  # 4 letters: can never clash with a 2-3 letter category prefix


class Karigar(Base, TimestampMixin):
    """A maker or supplier the wholesaler gets pieces from."""
    __tablename__ = "karigars"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False, unique=True)
    phone: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    city: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class Lot(Base, TimestampMixin):
    """One delivery of stock (LOT-0001), usually from one karigar. Pieces point
    to the lot they came in, so quality and payments can be traced back."""
    __tablename__ = "lots"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    lot_no: Mapped[str] = mapped_column(String(20), nullable=False, unique=True, index=True)
    karigar_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("karigars.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    received_on: Mapped[date] = mapped_column(Date, nullable=False)
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    karigar: Mapped[Optional[Karigar]] = relationship(lazy="joined")


class Piece(Base, TimestampMixin):
    """One physical piece in stock. Tracked individually: every piece has its
    own Item Code and its own weights."""
    __tablename__ = "pieces"
    __table_args__ = (UniqueConstraint("huid", name="uq_pieces_huid"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    item_code: Mapped[str] = mapped_column(String(20), nullable=False, unique=True, index=True)
    category_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("categories.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    design_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("designs.id", ondelete="SET NULL"), nullable=True, index=True
    )
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    purity: Mapped[str] = mapped_column(String(10), nullable=False)
    gross_weight: Mapped[Decimal] = mapped_column(WEIGHT, nullable=False)
    # Stone / non-metal weight inside gross. Net is always gross - stone.
    stone_weight: Mapped[Decimal] = mapped_column(WEIGHT, nullable=False, default=Decimal("0"))
    net_weight: Mapped[Decimal] = mapped_column(WEIGHT, nullable=False)
    # Touch / tunch %, optional until the billing rules are settled.
    touch_percent: Mapped[Optional[Decimal]] = mapped_column(Numeric(6, 2), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default=PIECE_STATUS_IN_STOCK, nullable=False, index=True)
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Hallmark Unique ID: 6 letters/digits, one per hallmarked piece.
    huid: Mapped[Optional[str]] = mapped_column(String(6), nullable=True)
    lot_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("lots.id", ondelete="RESTRICT", name="fk_pieces_lot_id_lots"), nullable=True, index=True
    )
    photo_path: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    created_by_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    # The physical tag: when it was last printed and which combo code went on
    # its back (NULL = printed with no combo). A tag needs printing when it never
    # was, or when the piece's combo has changed since.
    tag_printed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    tag_back_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    category: Mapped[Category] = relationship(lazy="joined")
    design: Mapped[Optional[Design]] = relationship(lazy="joined")
    lot: Mapped[Optional[Lot]] = relationship(lazy="joined")
