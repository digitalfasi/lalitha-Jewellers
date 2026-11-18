from typing import List

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app._shared.core.database import get_async_db
from app.modules.tags.schema import LabelBatchOut, LabelOut, PendingTagOut, PrintedIn, PrintedOut
from app.modules.tags.service import MAX_BATCH, TagService

# Signed-in staff only (applied in api/v1/router.py).
router = APIRouter(prefix="/tags", tags=["tags"])


class LabelBatchIn(BaseModel):
    codes: List[str] = Field(..., min_length=1, max_length=MAX_BATCH)
    expand_combos: bool = False


@router.get("/resolve/{code}", response_model=LabelOut)
async def resolve_code(code: str, db: AsyncSession = Depends(get_async_db)):
    """Scan lookup: an Item Code or a Combo Code -> the piece or combo."""
    return await TagService.resolve(db, code)


@router.post("/labels", response_model=LabelBatchOut)
async def label_batch(data: LabelBatchIn, db: AsyncSession = Depends(get_async_db)):
    """Label data for a print run. Order kept, repeats dropped, unknown codes listed."""
    return await TagService.labels(db, data.codes, data.expand_combos)


@router.get("/pending", response_model=List[PendingTagOut])
async def pending_tags(db: AsyncSession = Depends(get_async_db)):
    """Tags to print: new pieces, and pieces whose combo changed since their tag was printed."""
    return await TagService.pending(db)


@router.post("/printed", response_model=PrintedOut)
async def tags_printed(data: PrintedIn, db: AsyncSession = Depends(get_async_db)):
    """Staff confirm the tags came out of the printer and are on the pieces."""
    return await TagService.mark_printed(db, data.codes)
