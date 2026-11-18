from fastapi import APIRouter

from app._shared.core.config import settings
from app._shared.core.database import check_database_connection

router = APIRouter(tags=["health"])


@router.get("/health")
async def health():
    return {
        "status": "ok",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "database": await check_database_connection(),
    }
