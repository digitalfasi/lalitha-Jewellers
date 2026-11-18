from typing import List

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app._shared.core.database import get_async_db
from app.modules.auth.deps import current_user, require_role
from app.modules.auth.model import ROLE_OWNER, User
from app.modules.auth.schema import (
    AuthStatusOut,
    LoginIn,
    PasswordChangeIn,
    SetupIn,
    TokenOut,
    UserCreate,
    UserOut,
    UserUpdate,
)
from app.modules.auth.service import AuthService, UserService

router = APIRouter(prefix="/auth", tags=["auth"])
owner_only = require_role(ROLE_OWNER)


@router.get("/status", response_model=AuthStatusOut)
async def auth_status(db: AsyncSession = Depends(get_async_db)):
    """Tells the sign-in screen whether to show first-time setup instead."""
    return AuthStatusOut(needs_setup=await AuthService.needs_setup(db))


@router.post("/setup", response_model=TokenOut, status_code=status.HTTP_201_CREATED)
async def setup(data: SetupIn, db: AsyncSession = Depends(get_async_db)):
    return await AuthService.setup(db, data)


@router.post("/login", response_model=TokenOut)
async def login(data: LoginIn, db: AsyncSession = Depends(get_async_db)):
    return await AuthService.login(db, data)


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(current_user)):
    return UserOut.model_validate(user)


@router.post("/me/password", status_code=status.HTTP_204_NO_CONTENT)
async def change_password(data: PasswordChangeIn, user: User = Depends(current_user),
                          db: AsyncSession = Depends(get_async_db)):
    await AuthService.change_password(db, user, data)


@router.get("/users", response_model=List[UserOut], dependencies=[Depends(owner_only)])
async def list_users(db: AsyncSession = Depends(get_async_db)):
    return await UserService.list(db)


@router.post("/users", response_model=UserOut, status_code=status.HTTP_201_CREATED, dependencies=[Depends(owner_only)])
async def create_user(data: UserCreate, db: AsyncSession = Depends(get_async_db)):
    return await UserService.create(db, data)


@router.patch("/users/{user_id}", response_model=UserOut)
async def update_user(user_id: str, data: UserUpdate, me: User = Depends(owner_only),
                      db: AsyncSession = Depends(get_async_db)):
    return await UserService.update(db, user_id, data, me)
