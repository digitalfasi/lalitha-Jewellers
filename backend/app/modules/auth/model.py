from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from app._shared.models.base import Base, TimestampMixin

# What each role may do (enforced in routers with require_role):
#   OWNER   - everything, plus staff accounts and business details
#   MANAGER - cancel bills, dissolve combos, set the gold rate, retire pieces, close audits
#   STAFF   - stock entry, link / unlink / swap, tags, bills, audit scanning
ROLE_OWNER = "OWNER"
ROLE_MANAGER = "MANAGER"
ROLE_STAFF = "STAFF"
ROLES = (ROLE_OWNER, ROLE_MANAGER, ROLE_STAFF)
MANAGERS = (ROLE_OWNER, ROLE_MANAGER)


class User(Base, TimestampMixin):
    """A member of the wholesaler's staff. Only staff use this app."""
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    username: Mapped[str] = mapped_column(String(50), nullable=False, unique=True, index=True)  # stored lower-case
    full_name: Mapped[str] = mapped_column(String(100), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(100), nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False, default=ROLE_STAFF)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    last_login_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
