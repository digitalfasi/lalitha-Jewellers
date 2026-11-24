"""Calculator: quick sums for the counter. Nothing is saved.
A quote for real pieces is /billing/quote (same rules as the bill)."""
from decimal import Decimal

from typing import List

from fastapi import APIRouter, Depends, File, Query, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app._shared.core.database import get_async_db
from app.modules.auth.deps import current_user, require_role
from app.modules.auth.model import MANAGERS
from app.modules.calc import quick, service
from app.modules.calc.formula import FUNCTION_NAMES, LIVE_NAMES, PRESETS, tidy
from app.modules.calc.schema import (
    FineIn, FineOut, FormulaIn, FormulaOut, GridIn, GridItem, GstIn, GstOut, MetalIn, MetalOut, MoneyIn, MoneyOut,
    ImportedFormula, MyCalcIn, MyCalcOut, OldGoldIn, OldGoldOut, RatesOut, SavedFormulaEdit, SavedFormulaIn,
    SavedFormulaOut, SheetIn, StatsIn, StatsOut,
)
from app._shared.exceptions.base import ValidationException

router = APIRouter(prefix="/calc", tags=["Calculator"])


@router.post("/fine", response_model=FineOut)
async def fine(data: FineIn):
    return service.fine(data)


@router.get("/rates", response_model=RatesOut)
async def rates(fine_rate: Decimal = Query(..., gt=0, le=10_000_000)):
    return service.rates(fine_rate)


@router.post("/gst", response_model=GstOut)
async def gst(data: GstIn):
    return service.gst(data)


@router.post("/old-gold", response_model=OldGoldOut)
async def old_gold(data: OldGoldIn):
    return service.old_gold(data)


@router.post("/money-to-gold", response_model=MoneyOut)
async def money_to_gold(data: MoneyIn):
    return service.money_to_gold(data)


@router.post("/metal-account", response_model=MetalOut)
async def metal_account(data: MetalIn):
    return service.metal_account(data)


# ------------------------------------------------------- Excel-style quick math

@router.get("/presets")
async def presets(db: AsyncSession = Depends(get_async_db)):
    """The ready-made operations, the function names the formula box knows, and today's live values."""
    live = await quick.live_values(db)
    return {"presets": [{"key": k, "label": label, "formula": f} for k, label, f in PRESETS], "functions": FUNCTION_NAMES,
            "live": {k: (tidy(v) if v is not None else None) for k, v in live.items()}}


@router.post("/formula", response_model=FormulaOut)
async def formula(data: FormulaIn, db: AsyncSession = Depends(get_async_db)):
    """Work out an Excel-style formula. Math errors come back as #DIV/0!, #VALUE! or #NAME?, never as a failure."""
    return await quick.run_formula(db, data)


@router.post("/sheet")
async def sheet(data: SheetIn, db: AsyncSession = Depends(get_async_db)):
    """A small sheet (A1 to J20) worked out like Excel: {cell: {result} or {error, hint}}."""
    return await quick.run_sheet(db, data)


@router.get("/me", response_model=MyCalcOut)
async def my_calc(user=Depends(current_user), db: AsyncSession = Depends(get_async_db)):
    """This person's tape, sheet and pinned formulas, the same on every device."""
    return await quick.my_data(db, user.id)


@router.put("/me", response_model=MyCalcOut)
async def save_my_calc(data: MyCalcIn, user=Depends(current_user), db: AsyncSession = Depends(get_async_db)):
    return await quick.save_my_data(db, user.id, data)


@router.post("/grid", response_model=List[GridItem])
async def answer_grid(data: GridIn):
    """Every common answer for A and B at once."""
    return quick.grid(data)


@router.post("/stats", response_model=StatsOut)
async def list_stats(data: StatsIn):
    """Sum, average, count, min and max of every number in pasted text."""
    return quick.stats(data)


@router.get("/formulas", response_model=List[SavedFormulaOut])
async def saved_formulas(db: AsyncSession = Depends(get_async_db)):
    return await quick.SavedFormulaService.list(db)


@router.post("/formulas", response_model=SavedFormulaOut, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(require_role(*MANAGERS))])
async def save_formula(data: SavedFormulaIn, db: AsyncSession = Depends(get_async_db)):
    return await quick.SavedFormulaService.create(db, data)


@router.patch("/formulas/{formula_id}", response_model=SavedFormulaOut, dependencies=[Depends(require_role(*MANAGERS))])
async def edit_formula(formula_id: str, data: SavedFormulaEdit, db: AsyncSession = Depends(get_async_db)):
    return await quick.SavedFormulaService.edit(db, formula_id, data)


@router.post("/formulas/{formula_id}/undo", response_model=SavedFormulaOut, dependencies=[Depends(require_role(*MANAGERS))])
async def undo_formula(formula_id: str, db: AsyncSession = Depends(get_async_db)):
    """Back to the version before the last change."""
    return await quick.SavedFormulaService.undo(db, formula_id)


@router.post("/import-excel", response_model=List[ImportedFormula], dependencies=[Depends(require_role(*MANAGERS))])
async def import_excel(file: UploadFile = File(...)):
    """Read the formulas out of an .xlsx; nothing is saved until the owner picks which to keep."""
    content = await file.read(10_000_001)
    if len(content) > 10_000_000:
        raise ValidationException("That file is too big (10 MB at most).")
    return quick.read_excel_formulas(content)


@router.delete("/formulas/{formula_id}", status_code=status.HTTP_204_NO_CONTENT,
               dependencies=[Depends(require_role(*MANAGERS))])
async def delete_formula(formula_id: str, db: AsyncSession = Depends(get_async_db)):
    await quick.SavedFormulaService.delete(db, formula_id)
