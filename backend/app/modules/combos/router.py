from typing import List, Optional

from fastapi import APIRouter, Depends, File, Query, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app._shared.core.database import get_async_db
from app.modules.auth.deps import require_role
from app.modules.auth.model import MANAGERS
from app.modules.combos.schema import (
    AvailablePieceOut,
    ComboCreate,
    ComboEventOut,
    ComboList,
    ComboOut,
    ComboStatus,
    ComboUpdate,
    DissolveIn,
    NewSetIn,
    PieceCodeIn,
    PieceComboHistoryOut,
    SuggestionOut,
    SwapIn,
    TemplateIn,
    TemplateOut,
)
from app.modules.combos.service import ComboService, TemplateService

# Signed-in staff only (applied in api/v1/router.py). Dissolving needs a manager.
router = APIRouter(prefix="/combos", tags=["combos"])


@router.get("", response_model=ComboList)
async def list_combos(
    q: Optional[str] = Query(None, max_length=100, description="Combo code, name, or a member's item code"),
    status: Optional[ComboStatus] = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_async_db),
):
    return await ComboService.list(db, q=q, status=status, limit=limit, offset=offset)


@router.post("", response_model=ComboOut, status_code=status.HTTP_201_CREATED)
async def create_combo(data: ComboCreate, db: AsyncSession = Depends(get_async_db)):
    return await ComboService.create(db, data)


@router.post("/new-set", response_model=ComboOut, status_code=status.HTTP_201_CREATED)
async def create_new_set(data: NewSetIn, db: AsyncSession = Depends(get_async_db)):
    """New stock arriving as a set: save its pieces and the combo together."""
    return await ComboService.create_set(db, data)


@router.get("/available-pieces", response_model=List[AvailablePieceOut])
async def available_pieces(
    q: Optional[str] = Query(None, max_length=100),
    category_id: Optional[str] = None,
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_async_db),
):
    """In-stock pieces not in any combo: what the piece picker offers."""
    return await ComboService.available_pieces(db, q, limit, category_id)


@router.get("/suggestions", response_model=List[SuggestionOut])
async def suggestions(
    with_codes: str = Query("", max_length=500, description="Comma-separated codes already chosen"),
    category_id: Optional[str] = None,
    limit: int = Query(8, ge=1, le=50),
    db: AsyncSession = Depends(get_async_db),
):
    """Free pieces ranked as a match for the chosen ones."""
    return await ComboService.suggestions(db, with_codes.split(","), category_id, limit)


@router.get("/templates", response_model=List[TemplateOut])
async def list_templates(include_inactive: bool = False, db: AsyncSession = Depends(get_async_db)):
    return await TemplateService.list(db, include_inactive)


@router.post("/templates", response_model=TemplateOut, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(require_role(*MANAGERS))])
async def create_template(data: TemplateIn, db: AsyncSession = Depends(get_async_db)):
    return await TemplateService.create(db, data)


@router.put("/templates/{template_id}", response_model=TemplateOut, dependencies=[Depends(require_role(*MANAGERS))])
async def update_template(template_id: str, data: TemplateIn, db: AsyncSession = Depends(get_async_db)):
    return await TemplateService.update(db, template_id, data)


@router.get("/piece-history/{piece_code}", response_model=List[PieceComboHistoryOut])
async def piece_history(piece_code: str, db: AsyncSession = Depends(get_async_db)):
    """Every combo a piece has been in, newest first; current one flagged."""
    return await ComboService.piece_history(db, piece_code)


@router.get("/by-code/{code}", response_model=ComboOut)
async def get_combo_by_code(code: str, db: AsyncSession = Depends(get_async_db)):
    return await ComboService.get_by_code(db, code)


@router.get("/{combo_id}", response_model=ComboOut)
async def get_combo(combo_id: str, db: AsyncSession = Depends(get_async_db)):
    return await ComboService.get(db, combo_id)


@router.patch("/{combo_id}", response_model=ComboOut)
async def update_combo(combo_id: str, data: ComboUpdate, db: AsyncSession = Depends(get_async_db)):
    return await ComboService.update(db, combo_id, data)


@router.get("/{combo_id}/history", response_model=List[ComboEventOut])
async def combo_history(combo_id: str, db: AsyncSession = Depends(get_async_db)):
    return await ComboService.events(db, combo_id)


@router.post("/{combo_id}/link", response_model=ComboOut)
async def link_piece(combo_id: str, data: PieceCodeIn, db: AsyncSession = Depends(get_async_db)):
    return await ComboService.link(db, combo_id, data)


@router.post("/{combo_id}/unlink", response_model=ComboOut)
async def unlink_piece(combo_id: str, data: PieceCodeIn, db: AsyncSession = Depends(get_async_db)):
    return await ComboService.unlink(db, combo_id, data)


@router.post("/{combo_id}/swap", response_model=ComboOut)
async def swap_piece(combo_id: str, data: SwapIn, db: AsyncSession = Depends(get_async_db)):
    return await ComboService.swap(db, combo_id, data)


@router.post("/{combo_id}/dissolve", response_model=ComboOut, dependencies=[Depends(require_role(*MANAGERS))])
async def dissolve_combo(combo_id: str, data: DissolveIn, db: AsyncSession = Depends(get_async_db)):
    return await ComboService.dissolve(db, combo_id, data)


@router.post("/{combo_id}/photo", response_model=ComboOut)
async def upload_combo_photo(combo_id: str, file: UploadFile = File(...), db: AsyncSession = Depends(get_async_db)):
    return await ComboService.set_photo(db, combo_id, file)


@router.delete("/{combo_id}/photo", response_model=ComboOut)
async def delete_combo_photo(combo_id: str, db: AsyncSession = Depends(get_async_db)):
    return await ComboService.remove_photo(db, combo_id)
