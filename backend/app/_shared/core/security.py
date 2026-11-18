from datetime import datetime, timedelta, timezone
from typing import Any, Dict

import bcrypt
import jwt

from app._shared.core.config import settings


def hash_password(password: str) -> str:
    raw = password.encode("utf-8")
    if len(raw) > 72:  # bcrypt's limit; longer input is refused, not silently cut
        raise ValueError("Password cannot be longer than 72 bytes.")
    return bcrypt.hashpw(raw, bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    try:
        raw = password.encode("utf-8")
        return len(raw) <= 72 and bcrypt.checkpw(raw, hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(user_id: str, role: str) -> tuple[str, datetime]:
    now = datetime.now(timezone.utc)
    expires = now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload: Dict[str, Any] = {
        "sub": user_id, "role": role, "type": "access",
        "iat": int(now.timestamp()), "exp": int(expires.timestamp()),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM), expires


def decode_access_token(token: str) -> Dict[str, Any]:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except jwt.PyJWTError as exc:
        raise ValueError(str(exc)) from exc
    if payload.get("type") != "access" or not payload.get("sub"):
        raise ValueError("Not an access token.")
    return payload
