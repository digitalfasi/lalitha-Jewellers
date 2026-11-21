from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

from sqlalchemy import JSON, Boolean, Date, DateTime, ForeignKey, Index, Integer, Numeric, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app._shared.models.base import Base, TimestampMixin

WEIGHT = Numeric(12, 3)
MONEY = Numeric(14, 2)

BILL_STATUS_FINAL = "FINAL"
BILL_STATUS_CANCELLED = "CANCELLED"

LINE_KIND_PIECE = "PIECE"
LINE_KIND_COMBO = "COMBO"

# Counter key in code_sequences. 4 letters, so it can never clash with a
# category prefix (2-3 letters). Bill numbers print as INV-00001.
BILL_COUNTER_KEY = "BILL"


class Shop(Base, TimestampMixin):
    """A retail shop that buys from the wholesaler."""
    __tablename__ = "shops"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False, unique=True)
    contact_person: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    gstin: Mapped[Optional[str]] = mapped_column(String(15), nullable=True)
    address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    city: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    # GST state code (two digits, e.g. 33 = Tamil Nadu). Taken from the GSTIN when there is one.
    state_code: Mapped[Optional[str]] = mapped_column(String(2), nullable=True)
    # The shop's usual deal, filled in on its bills and in the calculator.
    price_mode: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)  # TOUCH / WASTAGE
    deal_touch: Mapped[Optional[Decimal]] = mapped_column(Numeric(6, 2), nullable=True)
    deal_wastage: Mapped[Optional[Decimal]] = mapped_column(Numeric(6, 2), nullable=True)
    deal_making: Mapped[Optional[Decimal]] = mapped_column(MONEY, nullable=True)  # Rs per gram
    # Settles in fine gold: each bill adds its fine weight to the shop's gold account.
    settles_in_gold: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class Bill(Base, TimestampMixin):
    """A sale to a shop. Saved as FINAL, which marks every piece on it SOLD and
    every combo on it SOLD. Cancelling puts them back in stock. Amounts are
    stored as calculated at the time, so a bill never changes afterwards."""
    __tablename__ = "bills"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    bill_number: Mapped[str] = mapped_column(String(20), nullable=False, unique=True, index=True)
    shop_id: Mapped[str] = mapped_column(String(36), ForeignKey("shops.id", ondelete="RESTRICT"), nullable=False, index=True)
    # Snapshots: the bill keeps showing what was true on the day.
    shop_name: Mapped[str] = mapped_column(String(150), nullable=False)
    shop_gstin: Mapped[Optional[str]] = mapped_column(String(15), nullable=True)
    shop_address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    shop_phone: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    shop_state_code: Mapped[Optional[str]] = mapped_column(String(2), nullable=True)
    # The seller's details as they were when the bill was made.
    seller_name: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    seller_gstin: Mapped[Optional[str]] = mapped_column(String(15), nullable=True)
    seller_address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    seller_state_code: Mapped[Optional[str]] = mapped_column(String(2), nullable=True)
    bill_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(20), default=BILL_STATUS_FINAL, nullable=False, index=True)

    gold_rate: Mapped[Decimal] = mapped_column(MONEY, nullable=False)  # rupees per gram of fine gold
    gst_percent: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)

    total_pieces: Mapped[int] = mapped_column(Integer, nullable=False)
    total_gross: Mapped[Decimal] = mapped_column(WEIGHT, nullable=False)
    total_stone: Mapped[Decimal] = mapped_column(WEIGHT, nullable=False)
    total_net: Mapped[Decimal] = mapped_column(WEIGHT, nullable=False)
    total_fine: Mapped[Decimal] = mapped_column(WEIGHT, nullable=False)
    metal_amount: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    total_charges: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    # Stones: less weight x Rs per gram. HUID: hallmarked pieces x Rs per piece.
    stone_rate: Mapped[Decimal] = mapped_column(MONEY, nullable=False, default=0, server_default="0")
    stone_amount: Mapped[Decimal] = mapped_column(MONEY, nullable=False, default=0, server_default="0")
    huid_rate: Mapped[Decimal] = mapped_column(MONEY, nullable=False, default=0, server_default="0")
    huid_pieces: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    huid_amount: Mapped[Decimal] = mapped_column(MONEY, nullable=False, default=0, server_default="0")
    subtotal: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    gst_amount: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    # INTRA = CGST + SGST (same state), INTER = IGST (different state).
    tax_type: Mapped[str] = mapped_column(String(5), nullable=False, default="INTRA", server_default="INTRA")
    cgst_amount: Mapped[Decimal] = mapped_column(MONEY, nullable=False, default=0, server_default="0")
    sgst_amount: Mapped[Decimal] = mapped_column(MONEY, nullable=False, default=0, server_default="0")
    igst_amount: Mapped[Decimal] = mapped_column(MONEY, nullable=False, default=0, server_default="0")
    round_off: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    grand_total: Mapped[Decimal] = mapped_column(MONEY, nullable=False)

    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    cancelled_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    cancel_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    cancelled_by_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    lines: Mapped[List["BillLine"]] = relationship(lazy="selectin", order_by="BillLine.line_no")


class BillLine(Base):
    """One printed line. PIECE: a single piece (combo_code set when it is one
    piece of a combo billed piece-by-piece). COMBO: a whole combo on one line."""
    __tablename__ = "bill_lines"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    bill_id: Mapped[str] = mapped_column(String(36), ForeignKey("bills.id", ondelete="CASCADE"), nullable=False, index=True)
    line_no: Mapped[int] = mapped_column(Integer, nullable=False)
    kind: Mapped[str] = mapped_column(String(10), nullable=False)
    code: Mapped[str] = mapped_column(String(20), nullable=False)
    description: Mapped[str] = mapped_column(String(300), nullable=False)
    hsn_code: Mapped[Optional[str]] = mapped_column(String(8), nullable=True)
    combo_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("combos.id", ondelete="RESTRICT"), nullable=True, index=True)
    combo_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    purity: Mapped[str] = mapped_column(String(30), nullable=False)
    gross_weight: Mapped[Decimal] = mapped_column(WEIGHT, nullable=False)
    stone_weight: Mapped[Decimal] = mapped_column(WEIGHT, nullable=False)
    net_weight: Mapped[Decimal] = mapped_column(WEIGHT, nullable=False)
    # Effective touch of the line: fine / net. For a combo it blends its pieces.
    touch_percent: Mapped[Decimal] = mapped_column(Numeric(7, 3), nullable=False)
    fine_weight: Mapped[Decimal] = mapped_column(WEIGHT, nullable=False)
    metal_amount: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    charges: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    stone_amount: Mapped[Decimal] = mapped_column(MONEY, nullable=False, default=0, server_default="0")
    amount: Mapped[Decimal] = mapped_column(MONEY, nullable=False)

    pieces: Mapped[List["BillLinePiece"]] = relationship(lazy="selectin")


class BillLinePiece(Base):
    """Each physical piece on a bill, with the weights and touch it was sold at.
    `active` is cleared when the bill is cancelled; the partial unique index
    stops one piece being on two live bills even if two saves race."""
    __tablename__ = "bill_line_pieces"
    __table_args__ = (
        Index(
            "uq_bill_line_pieces_one_live_sale_per_piece",
            "piece_id",
            unique=True,
            sqlite_where=text("active = 1"),
            postgresql_where=text("active"),
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    line_id: Mapped[str] = mapped_column(String(36), ForeignKey("bill_lines.id", ondelete="CASCADE"), nullable=False, index=True)
    bill_id: Mapped[str] = mapped_column(String(36), ForeignKey("bills.id", ondelete="CASCADE"), nullable=False, index=True)
    piece_id: Mapped[str] = mapped_column(String(36), ForeignKey("pieces.id", ondelete="RESTRICT"), nullable=False, index=True)
    item_code: Mapped[str] = mapped_column(String(20), nullable=False)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    purity: Mapped[str] = mapped_column(String(10), nullable=False)
    gross_weight: Mapped[Decimal] = mapped_column(WEIGHT, nullable=False)
    stone_weight: Mapped[Decimal] = mapped_column(WEIGHT, nullable=False)
    net_weight: Mapped[Decimal] = mapped_column(WEIGHT, nullable=False)
    touch_percent: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False)
    fine_weight: Mapped[Decimal] = mapped_column(WEIGHT, nullable=False)
    huid: Mapped[Optional[str]] = mapped_column(String(6), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


ESTIMATE_COUNTER_KEY = "ESTM"
ESTIMATE_OPEN = "OPEN"
ESTIMATE_BILLED = "BILLED"


class Estimate(Base, TimestampMixin):
    """A saved quote (EST-00001): what was offered, at which rate, until when.
    Turned into a bill with one tap when the shop agrees; nothing is reserved."""
    __tablename__ = "estimates"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    estimate_number: Mapped[str] = mapped_column(String(20), nullable=False, unique=True, index=True)
    shop_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("shops.id", ondelete="RESTRICT"), nullable=True, index=True)
    shop_name: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    estimate_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    valid_until: Mapped[date] = mapped_column(Date, nullable=False)
    gold_rate: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    gst_percent: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    lines: Mapped[list] = mapped_column(JSON, nullable=False)  # BillLineIn dicts, as entered
    total_fine: Mapped[Decimal] = mapped_column(WEIGHT, nullable=False)
    grand_total: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    status: Mapped[str] = mapped_column(String(10), nullable=False, default=ESTIMATE_OPEN)
    bill_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("bills.id", ondelete="SET NULL"), nullable=True)
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)


GOLD_BILL = "BILL"            # a bill: the shop owes its fine gold
GOLD_BILL_CANCEL = "CANCEL"   # that bill cancelled
GOLD_IN = "GOLD"              # the shop gave gold
CASH_IN = "CASH"              # the shop gave cash, counted as fine at the day's rate
GOLD_ADJUST = "ADJUST"        # opening balance or correction


class GoldEntry(Base, TimestampMixin):
    """One line of a shop's fine-gold account. fine > 0: the shop owes more; < 0: it paid."""
    __tablename__ = "gold_entries"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    shop_id: Mapped[str] = mapped_column(String(36), ForeignKey("shops.id", ondelete="RESTRICT"), nullable=False, index=True)
    entry_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    kind: Mapped[str] = mapped_column(String(10), nullable=False)
    fine: Mapped[Decimal] = mapped_column(WEIGHT, nullable=False)
    gold_weight: Mapped[Optional[Decimal]] = mapped_column(WEIGHT, nullable=True)
    purity_percent: Mapped[Optional[Decimal]] = mapped_column(Numeric(6, 2), nullable=True)
    cash: Mapped[Optional[Decimal]] = mapped_column(MONEY, nullable=True)
    rate: Mapped[Optional[Decimal]] = mapped_column(MONEY, nullable=True)
    bill_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("bills.id", ondelete="RESTRICT"), nullable=True, index=True)
    bill_number: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
