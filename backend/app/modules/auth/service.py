import uuid
from datetime import datetime, timezone
from typing import List

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app._shared.core.security import create_access_token, hash_password, verify_password
from app._shared.exceptions.base import (
    ConflictException,
    ForbiddenException,
    NotFoundException,
    UnauthorizedException,
    ValidationException,
)
from app.modules.auth.model import ROLE_OWNER, User
from app.modules.auth.schema import (
    LoginIn,
    PasswordChangeIn,
    SetupIn,
    TokenOut,
    UserCreate,
    UserOut,
    UserUpdate,
)


def _token(user: User) -> TokenOut:
    token, expires = create_access_token(user.id, user.role)
    return TokenOut(access_token=token, expires_at=expires, user=UserOut.model_validate(user))


async def _count(db: AsyncSession, *where) -> int:
    return (await db.execute(select(func.count()).select_from(User).where(*where))).scalar_one()


async def _get(db: AsyncSession, user_id: str) -> User:
    user = (await db.execute(select(User).where(User.id == user_id).execution_options(populate_existing=True))).scalar_one_or_none()
    if not user:
        raise NotFoundException("User not found.")
    return user


async def _save(db: AsyncSession) -> None:
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise ConflictException("That username is already taken.")


class AuthService:
    @staticmethod
    async def needs_setup(db: AsyncSession) -> bool:
        return await _count(db) == 0

    @staticmethod
    async def setup(db: AsyncSession, data: SetupIn) -> TokenOut:
        if not await AuthService.needs_setup(db):
            raise ConflictException("The app is already set up. Sign in instead.")
        user = User(id=str(uuid.uuid4()), username=data.username, full_name=data.full_name,
                    password_hash=hash_password(data.password), role=ROLE_OWNER, is_active=True,
                    last_login_at=datetime.now(timezone.utc))
        db.add(user)
        await _save(db)
        return _token(await _get(db, user.id))

    @staticmethod
    async def login(db: AsyncSession, data: LoginIn) -> TokenOut:
        user = (await db.execute(select(User).where(User.username == data.username))).scalar_one_or_none()
        # Same message whether the username or the password is wrong.
        if not user or not verify_password(data.password, user.password_hash):
            raise UnauthorizedException("Wrong username or password.")
        if not user.is_active:
            raise ForbiddenException("This account is switched off. Ask the owner.")
        user.last_login_at = datetime.now(timezone.utc)
        await db.commit()
        return _token(await _get(db, user.id))

    @staticmethod
    async def change_password(db: AsyncSession, user: User, data: PasswordChangeIn) -> None:
        if not verify_password(data.current_password, user.password_hash):
            raise ValidationException("Your current password is wrong.", field="current_password")
        user.password_hash = hash_password(data.new_password)
        await db.commit()


class UserService:
    @staticmethod
    async def list(db: AsyncSession) -> List[UserOut]:
        rows = (await db.execute(select(User).order_by(User.is_active.desc(), User.full_name))).scalars().all()
        return [UserOut.model_validate(u) for u in rows]

    @staticmethod
    async def create(db: AsyncSession, data: UserCreate) -> UserOut:
        user = User(id=str(uuid.uuid4()), username=data.username, full_name=data.full_name,
                    password_hash=hash_password(data.password), role=data.role, is_active=True)
        db.add(user)
        await _save(db)
        return UserOut.model_validate(await _get(db, user.id))

    @staticmethod
    async def update(db: AsyncSession, user_id: str, data: UserUpdate, me: User) -> UserOut:
        user = await _get(db, user_id)
        fields = data.model_dump(exclude_unset=True)
        losing_owner = user.role == ROLE_OWNER and user.is_active and (
            ("role" in fields and fields["role"] != ROLE_OWNER) or fields.get("is_active") is False
        )
        if losing_owner and await _count(db, User.role == ROLE_OWNER, User.is_active.is_(True)) <= 1:
            raise ValidationException("This is the only owner. Make someone else an owner first.")
        if user.id == me.id and fields.get("is_active") is False:
            raise ValidationException("You can't switch off your own account.")
        if "password" in fields:
            pw = fields.pop("password")
            if pw:
                user.password_hash = hash_password(pw)
        for key, value in fields.items():
            if value is not None:
                setattr(user, key, value)
        await _save(db)
        return UserOut.model_validate(await _get(db, user.id))
