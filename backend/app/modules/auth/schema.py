from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

Role = Literal["OWNER", "MANAGER", "STAFF"]


def _username(v):
    return v.strip().lower() if isinstance(v, str) else v


def _strip(v):
    return v.strip() if isinstance(v, str) else v


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    username: str
    full_name: str
    role: Role
    is_active: bool
    last_login_at: Optional[datetime] = None


class UserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=50, pattern=r"^[a-z0-9._-]+$")
    full_name: str = Field(..., min_length=2, max_length=100)
    password: str = Field(..., min_length=8, max_length=72)
    role: Role = "STAFF"

    _u = field_validator("username", mode="before")(_username)
    _s = field_validator("full_name", mode="before")(_strip)


class UserUpdate(BaseModel):
    full_name: Optional[str] = Field(None, min_length=2, max_length=100)
    role: Optional[Role] = None
    is_active: Optional[bool] = None
    # An owner can set a new password for someone who forgot theirs.
    password: Optional[str] = Field(None, min_length=8, max_length=72)

    _s = field_validator("full_name", mode="before")(_strip)


class SetupIn(BaseModel):
    """Creates the first owner. Allowed only while there are no users."""
    username: str = Field(..., min_length=3, max_length=50, pattern=r"^[a-z0-9._-]+$")
    full_name: str = Field(..., min_length=2, max_length=100)
    password: str = Field(..., min_length=8, max_length=72)

    _u = field_validator("username", mode="before")(_username)
    _s = field_validator("full_name", mode="before")(_strip)


class LoginIn(BaseModel):
    username: str = Field(..., min_length=1, max_length=50)
    password: str = Field(..., min_length=1, max_length=72)

    _u = field_validator("username", mode="before")(_username)


class PasswordChangeIn(BaseModel):
    current_password: str = Field(..., min_length=1, max_length=72)
    new_password: str = Field(..., min_length=8, max_length=72)


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_at: datetime
    user: UserOut


class AuthStatusOut(BaseModel):
    needs_setup: bool


class UserList(BaseModel):
    items: List[UserOut]
