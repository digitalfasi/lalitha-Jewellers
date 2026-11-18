from datetime import datetime
from typing import List, Optional

from sqlalchemy import JSON, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app._shared.models.base import Base, TimestampMixin
from app.modules.combos.model import utcnow

AUDIT_COUNTER_KEY = "AUDT"  # 4 letters: never clashes with a category prefix

AUDIT_OPEN = "OPEN"
AUDIT_CLOSED = "CLOSED"

SCAN_FOUND = "FOUND"                    # in stock, in scope: counted
SCAN_NOT_IN_STOCK = "NOT_IN_STOCK"      # sold or retired, yet it is on the shelf
SCAN_UNKNOWN = "UNKNOWN"                # no piece or combo with this code
SCAN_OTHER_CATEGORY = "OTHER_CATEGORY"  # real piece, but outside this audit's category


class StockAudit(Base, TimestampMixin):
    """A stock count: staff scan everything on the shelves, and the app lists
    what should be there but wasn't scanned (missing) and anything odd that was.
    Optionally limited to one category. Closing it freezes the result."""
    __tablename__ = "stock_audits"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    audit_no: Mapped[str] = mapped_column(String(20), nullable=False, unique=True, index=True)
    name: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    category_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("categories.id", ondelete="RESTRICT"), nullable=True)
    status: Mapped[str] = mapped_column(String(10), nullable=False, default=AUDIT_OPEN, index=True)
    started_by_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    closed_by_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    closed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    # Snapshot taken on close: {"expected": n, "found": n, "missing": [...]}
    result: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    scans: Mapped[List["AuditScan"]] = relationship(lazy="selectin", order_by="AuditScan.at.desc()")


class AuditScan(Base):
    """One scan during an audit. A combo tag adds a row for each of its pieces."""
    __tablename__ = "audit_scans"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    audit_id: Mapped[str] = mapped_column(String(36), ForeignKey("stock_audits.id", ondelete="CASCADE"), nullable=False, index=True)
    scanned_code: Mapped[str] = mapped_column(String(30), nullable=False)
    piece_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("pieces.id", ondelete="RESTRICT"), nullable=True, index=True)
    item_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    via_combo_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    result: Mapped[str] = mapped_column(String(20), nullable=False)
    note: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    by_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
