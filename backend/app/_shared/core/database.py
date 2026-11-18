from typing import AsyncGenerator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app._shared.core.config import settings, to_async_url

is_sqlite = settings.DATABASE_URL.startswith("sqlite")

engine_kwargs: dict = {"echo": settings.DEBUG}
if is_sqlite:
    engine_kwargs["poolclass"] = NullPool
else:
    engine_kwargs.update(
        pool_size=settings.DB_POOL_SIZE,
        max_overflow=settings.DB_MAX_OVERFLOW,
        pool_recycle=settings.DB_POOL_RECYCLE,
        pool_timeout=settings.DB_POOL_TIMEOUT,
        pool_pre_ping=True,
    )

engine = create_async_engine(to_async_url(settings.DATABASE_URL), **engine_kwargs)

AsyncSessionFactory = async_sessionmaker(
    bind=engine, class_=AsyncSession, expire_on_commit=False, autoflush=False
)


async def get_async_db() -> AsyncGenerator[AsyncSession, None]:
    """Request-scoped session; rolled back if the request raises."""
    async with AsyncSessionFactory() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise


async def check_database_connection() -> str:
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return "ok"
    except Exception as exc:  # reported by /health, never raised
        return f"error: {exc.__class__.__name__}"
