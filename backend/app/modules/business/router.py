from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app._shared.core.database import get_async_db
from app.modules.auth.deps import require_role
from app.modules.auth.model import ROLE_OWNER
from app.modules.business.schema import BusinessIn, BusinessOut
from app.modules.business.service import BusinessService

# Everyone signed in can read (bills print it); only the owner edits.
router = APIRouter(prefix="/business", tags=["business"])
owner_only = [Depends(require_role(ROLE_OWNER))]


@router.get("", response_model=BusinessOut)
async def get_business(db: AsyncSession = Depends(get_async_db)):
    return await BusinessService.get(db)


@router.put("", response_model=BusinessOut, dependencies=owner_only)
async def save_business(data: BusinessIn, db: AsyncSession = Depends(get_async_db)):
    return await BusinessService.save(db, data)


@router.post("/logo", response_model=BusinessOut, dependencies=owner_only)
async def upload_logo(file: UploadFile = File(...), db: AsyncSession = Depends(get_async_db)):
    return await BusinessService.set_logo(db, file)


@router.delete("/logo", response_model=BusinessOut, dependencies=owner_only)
async def delete_logo(db: AsyncSession = Depends(get_async_db)):
    return await BusinessService.remove_logo(db)
