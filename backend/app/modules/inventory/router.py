from typing import List, Optional

from fastapi import APIRouter, Depends, File, Query, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app._shared.core.database import get_async_db
from app._shared.exceptions.base import ForbiddenException
from app.modules.auth.deps import current_user, require_role
from app.modules.auth.model import MANAGERS, User
from app.modules.inventory.schema import (
    CategoryCreate,
    CategoryOut,
    CategoryUpdate,
    DesignCreate,
    DesignOut,
    DesignUpdate,
    KarigarIn,
    KarigarOut,
    LotCreate,
    LotOut,
    LotUpdate,
    PieceBulkIn,
    PieceCreate,
    PieceList,
    PieceOut,
    PieceStatus,
    PieceUpdate,
)
from app.modules.inventory.service import CategoryService, DesignService, KarigarService, LotService, PieceService

# Signed-in staff only (applied in api/v1/router.py). Categories and retiring pieces need a manager.
router = APIRouter(prefix="/inventory", tags=["inventory"])


# ---------------------------------------------------------------- categories

@router.get("/categories", response_model=List[CategoryOut])
async def list_categories(db: AsyncSession = Depends(get_async_db)):
    return await CategoryService.list(db)


@router.post("/categories", response_model=CategoryOut, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(require_role(*MANAGERS))])
async def create_category(data: CategoryCreate, db: AsyncSession = Depends(get_async_db)):
    return await CategoryService.create(db, data)


@router.patch("/categories/{category_id}", response_model=CategoryOut, dependencies=[Depends(require_role(*MANAGERS))])
async def update_category(category_id: str, data: CategoryUpdate, db: AsyncSession = Depends(get_async_db)):
    return await CategoryService.update(db, category_id, data)


# ------------------------------------------------------------------- designs

@router.get("/designs", response_model=List[DesignOut])
async def list_designs(category_id: Optional[str] = None, db: AsyncSession = Depends(get_async_db)):
    return await DesignService.list(db, category_id)


@router.post("/designs", response_model=DesignOut, status_code=status.HTTP_201_CREATED)
async def create_design(data: DesignCreate, db: AsyncSession = Depends(get_async_db)):
    return await DesignService.create(db, data)


@router.patch("/designs/{design_id}", response_model=DesignOut)
async def update_design(design_id: str, data: DesignUpdate, db: AsyncSession = Depends(get_async_db)):
    return await DesignService.update(db, design_id, data)


# -------------------------------------------------------------------- pieces

@router.get("/pieces", response_model=PieceList)
async def list_pieces(
    q: Optional[str] = Query(None, max_length=100, description="Item code or name contains"),
    category_id: Optional[str] = None,
    design_id: Optional[str] = None,
    status: Optional[PieceStatus] = None,
    lot_id: Optional[str] = None,
    karigar_id: Optional[str] = None,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_async_db),
):
    return await PieceService.list(
        db, q=q, category_id=category_id, design_id=design_id, status=status, lot_id=lot_id,
        karigar_id=karigar_id, limit=limit, offset=offset,
    )


@router.get("/pieces/by-code/{code}", response_model=PieceOut)
async def get_piece_by_code(code: str, db: AsyncSession = Depends(get_async_db)):
    """What a barcode / QR scan calls."""
    return await PieceService.get_by_code(db, code)


@router.get("/pieces/{piece_id}", response_model=PieceOut)
async def get_piece(piece_id: str, db: AsyncSession = Depends(get_async_db)):
    return await PieceService.get(db, piece_id)


@router.post("/pieces", response_model=PieceOut, status_code=status.HTTP_201_CREATED)
async def create_piece(data: PieceCreate, db: AsyncSession = Depends(get_async_db)):
    return await PieceService.create(db, data)


@router.patch("/pieces/{piece_id}", response_model=PieceOut)
async def update_piece(piece_id: str, data: PieceUpdate, user: User = Depends(current_user),
                       db: AsyncSession = Depends(get_async_db)):
    if data.status == "INACTIVE" and user.role not in MANAGERS:
        raise ForbiddenException("Only the owner or a manager can retire a piece.")
    return await PieceService.update(db, piece_id, data)



@router.post("/pieces/bulk", response_model=PieceList, status_code=status.HTTP_201_CREATED)
async def create_pieces_bulk(data: PieceBulkIn, db: AsyncSession = Depends(get_async_db)):
    """Many pieces at once (a new lot, or pasted from Excel). All or nothing."""
    return await PieceService.create_bulk(db, data)


@router.post("/pieces/{piece_id}/photo", response_model=PieceOut)
async def upload_piece_photo(piece_id: str, file: UploadFile = File(...), db: AsyncSession = Depends(get_async_db)):
    return await PieceService.set_photo(db, piece_id, file)


@router.delete("/pieces/{piece_id}/photo", response_model=PieceOut)
async def delete_piece_photo(piece_id: str, db: AsyncSession = Depends(get_async_db)):
    return await PieceService.remove_photo(db, piece_id)


# ------------------------------------------------------- karigars and lots

@router.get("/karigars", response_model=List[KarigarOut])
async def list_karigars(include_inactive: bool = False, db: AsyncSession = Depends(get_async_db)):
    return await KarigarService.list(db, include_inactive)


@router.post("/karigars", response_model=KarigarOut, status_code=status.HTTP_201_CREATED)
async def create_karigar(data: KarigarIn, db: AsyncSession = Depends(get_async_db)):
    return await KarigarService.create(db, data)


@router.put("/karigars/{karigar_id}", response_model=KarigarOut)
async def update_karigar(karigar_id: str, data: KarigarIn, db: AsyncSession = Depends(get_async_db)):
    return await KarigarService.update(db, karigar_id, data)


@router.get("/lots", response_model=List[LotOut])
async def list_lots(karigar_id: Optional[str] = None, limit: int = Query(100, ge=1, le=500),
                    db: AsyncSession = Depends(get_async_db)):
    return await LotService.list(db, karigar_id, limit)


@router.post("/lots", response_model=LotOut, status_code=status.HTTP_201_CREATED)
async def create_lot(data: LotCreate, db: AsyncSession = Depends(get_async_db)):
    return await LotService.create(db, data)


@router.get("/lots/{lot_id}", response_model=LotOut)
async def get_lot(lot_id: str, db: AsyncSession = Depends(get_async_db)):
    return await LotService.get(db, lot_id)


@router.patch("/lots/{lot_id}", response_model=LotOut)
async def update_lot(lot_id: str, data: LotUpdate, db: AsyncSession = Depends(get_async_db)):
    return await LotService.update(db, lot_id, data)
