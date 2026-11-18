"""Imports every model so Alembic autogenerate sees all tables.

Add each module's models here as they are created, e.g.
    from app.modules.inventory.model import Piece  # noqa: F401
"""
from app._shared.models.base import Base  # noqa: F401
from app.modules.inventory.model import Category, CodeSequence, Design, Piece  # noqa: F401
from app.modules.combos.model import Combo, ComboEvent, ComboItem  # noqa: F401
from app.modules.billing.model import Bill, BillLine, BillLinePiece, Shop  # noqa: F401
from app.modules.inventory.model import Karigar, Lot  # noqa: F401
from app.modules.combos.model import ComboTemplate  # noqa: F401
from app.modules.auth.model import User  # noqa: F401
from app.modules.rates.model import GoldRate  # noqa: F401
from app.modules.business.model import BusinessProfile  # noqa: F401
from app.modules.audit.model import AuditScan, StockAudit  # noqa: F401
