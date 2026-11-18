from typing import Callable, Optional

from fastapi import Depends, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app._shared.core.actor import set_actor
from app._shared.core.database import get_async_db
from app._shared.core.security import decode_access_token
from app._shared.exceptions.base import ForbiddenException, UnauthorizedException
from app.modules.auth.model import User

_bearer = HTTPBearer(auto_error=False)

ROLE_WORDS = {"OWNER": "the owner", "MANAGER": "a manager"}


async def current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(_bearer),
    db: AsyncSession = Depends(get_async_db),
) -> User:
    """Every API call except health and sign-in needs a valid token from an
    active user. The role is read from the database, not the token, so a role
    change or a switched-off account takes effect on the next request."""
    if not credentials or not credentials.credentials:
        raise UnauthorizedException("Please sign in.")
    try:
        payload = decode_access_token(credentials.credentials)
    except ValueError:
        raise UnauthorizedException("Your sign-in has expired. Please sign in again.")
    user = (await db.execute(select(User).where(User.id == payload["sub"]))).scalar_one_or_none()
    if not user:
        raise UnauthorizedException("Please sign in.")
    if not user.is_active:
        raise ForbiddenException("This account is switched off. Ask the owner.")
    set_actor(user.id, user.full_name)
    return user


def require_role(*roles: str) -> Callable:
    async def check(user: User = Depends(current_user)) -> User:
        if user.role not in roles:
            who = " or ".join(ROLE_WORDS.get(r, r.lower()) for r in roles)
            raise ForbiddenException(f"Only {who} can do this.")
        return user
    return check
