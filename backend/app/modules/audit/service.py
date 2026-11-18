import uuid
from typing import List, Optional, Set

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app._shared.core.actor import actor_name
from app._shared.exceptions.base import ConflictException, NotFoundException
from app.modules.audit.model import (
    AUDIT_CLOSED,
    AUDIT_COUNTER_KEY,
    AUDIT_OPEN,
    SCAN_FOUND,
    SCAN_NOT_IN_STOCK,
    SCAN_OTHER_CATEGORY,
    SCAN_UNKNOWN,
    AuditScan,
    StockAudit,
)
from app.modules.audit.schema import (
    AuditCreate,
    AuditOut,
    AuditSummaryOut,
    MissingPiece,
    ScanIn,
    ScanOut,
    ScanResponse,
)
from app.modules.combos.model import COMBO_PREFIX, utcnow
from app.modules.combos.repository import ComboItemRepository, ComboRepository
from app.modules.inventory.model import PIECE_STATUS_IN_STOCK, Category, Piece
from app.modules.inventory.repository import CodeSequenceRepository, PieceRepository

_WORD = {"SOLD": "sold", "INACTIVE": "retired"}


def _scan_out(s: AuditScan) -> ScanOut:
    return ScanOut(id=s.id, scanned_code=s.scanned_code, item_code=s.item_code, via_combo_code=s.via_combo_code,
                   result=s.result, note=s.note, by_name=s.by_name, at=s.at)


async def _get(db: AsyncSession, audit_id: str) -> StockAudit:
    a = (await db.execute(select(StockAudit).where(StockAudit.id == audit_id)
                          .execution_options(populate_existing=True))).scalar_one_or_none()
    if not a:
        raise NotFoundException("Stock count not found.")
    return a


def _scope(a: StockAudit) -> list:
    conds = [Piece.status == PIECE_STATUS_IN_STOCK]
    if a.category_id:
        conds.append(Piece.category_id == a.category_id)
    return conds


async def _expected_count(db: AsyncSession, a: StockAudit) -> int:
    return (await db.execute(select(func.count(Piece.id)).where(*_scope(a)))).scalar_one()


def _found_ids(a: StockAudit) -> Set[str]:
    return {s.piece_id for s in a.scans if s.result == SCAN_FOUND and s.piece_id}


async def _category_name(db: AsyncSession, category_id: Optional[str]) -> Optional[str]:
    if not category_id:
        return None
    c = await db.get(Category, category_id)
    return c.name if c else None


async def _summary(db: AsyncSession, a: StockAudit) -> AuditSummaryOut:
    if a.status == AUDIT_CLOSED and a.result:
        expected, found = a.result["expected"], a.result["found"]
    else:
        expected, found = await _expected_count(db, a), len(_found_ids(a))
    return AuditSummaryOut(
        id=a.id, audit_no=a.audit_no, name=a.name, category_id=a.category_id,
        category_name=await _category_name(db, a.category_id), status=a.status,
        started_by_name=a.started_by_name, closed_by_name=a.closed_by_name, created_at=a.created_at,
        closed_at=a.closed_at, expected=expected, found=found,
    )


async def _missing(db: AsyncSession, a: StockAudit) -> List[MissingPiece]:
    found = _found_ids(a)
    rows = (await db.execute(select(Piece).where(*_scope(a)).order_by(Piece.item_code))).unique().scalars().all()
    missing = [p for p in rows if p.id not in found]
    combos = await ComboItemRepository.active_combo_codes(db, [p.id for p in missing])
    return [MissingPiece(item_code=p.item_code, name=p.name, category_name=p.category.name,
                         net_weight=float(p.net_weight), combo_code=combos.get(p.id)) for p in missing]


class AuditService:
    @staticmethod
    async def list(db: AsyncSession, limit: int) -> List[AuditSummaryOut]:
        rows = await db.execute(select(StockAudit).order_by(StockAudit.created_at.desc()).limit(limit))
        return [await _summary(db, a) for a in rows.scalars()]

    @staticmethod
    async def create(db: AsyncSession, data: AuditCreate) -> AuditOut:
        if data.category_id and not await db.get(Category, data.category_id):
            raise NotFoundException("Category not found.")
        n = await CodeSequenceRepository.next_value(db, AUDIT_COUNTER_KEY)
        a = StockAudit(id=str(uuid.uuid4()), audit_no=f"AUD-{n:04d}", name=data.name or None,
                       category_id=data.category_id, status=AUDIT_OPEN, started_by_name=actor_name())
        db.add(a)
        await db.commit()
        return await AuditService.get(db, a.id)

    @staticmethod
    async def get(db: AsyncSession, audit_id: str) -> AuditOut:
        a = await _get(db, audit_id)
        summary = await _summary(db, a)
        if a.status == AUDIT_CLOSED and a.result:
            missing = [MissingPiece(**m) for m in a.result.get("missing", [])]
        else:
            missing = await _missing(db, a)
        problems = [_scan_out(s) for s in a.scans if s.result != SCAN_FOUND]
        return AuditOut(**summary.model_dump(), missing=missing, problems=problems,
                        recent=[_scan_out(s) for s in a.scans[:25]])

    @staticmethod
    async def scan(db: AsyncSession, audit_id: str, data: ScanIn) -> ScanResponse:
        a = await _get(db, audit_id)
        if a.status != AUDIT_OPEN:
            raise ConflictException(f"{a.audit_no} is closed. Start a new stock count.")
        code, by = data.code, actor_name()
        found = _found_ids(a)
        added: List[AuditScan] = []
        messages: List[str] = []

        def add(piece: Optional[Piece], result: str, note: str, via: Optional[str] = None) -> None:
            s = AuditScan(id=str(uuid.uuid4()), audit_id=a.id, scanned_code=code,
                          piece_id=piece.id if piece else None, item_code=piece.item_code if piece else None,
                          via_combo_code=via, result=result, note=note, by_name=by, at=utcnow())
            db.add(s)
            added.append(s)
            messages.append(note)

        def check(piece: Piece, via: Optional[str] = None) -> None:
            if piece.id in found:
                messages.append(f"{piece.item_code} was already counted.")
            elif piece.status != PIECE_STATUS_IN_STOCK:
                add(piece, SCAN_NOT_IN_STOCK,
                    f"{piece.item_code} is {_WORD.get(piece.status, piece.status.lower())} but is on the shelf.", via)
            elif a.category_id and piece.category_id != a.category_id:
                add(piece, SCAN_OTHER_CATEGORY, f"{piece.item_code} is a {piece.category.name}, not in this count.", via)
            else:
                add(piece, SCAN_FOUND, f"{piece.item_code} {piece.name}", via)
                found.add(piece.id)

        if code.startswith(COMBO_PREFIX):
            combo = await ComboRepository.get_by_code(db, code)
            if not combo:
                add(None, SCAN_UNKNOWN, f"No piece or combo with code {code}.")
            else:
                members = [i.piece for i in combo.items if i.unlinked_at is None]
                if not members:
                    add(None, SCAN_UNKNOWN, f"{code} has no pieces now ({combo.status.lower()}).")
                for p in members:
                    check(p, combo.combo_code)
        else:
            piece = await PieceRepository.get_by_code(db, code)
            if piece:
                check(piece)
            else:
                add(None, SCAN_UNKNOWN, f"No piece or combo with code {code}.")

        await db.commit()
        ok = all(s.result == SCAN_FOUND for s in added)
        return ScanResponse(ok=ok, message=" ".join(messages), scans=[_scan_out(s) for s in added],
                            expected=await _expected_count(db, a), found=len(found))

    @staticmethod
    async def undo_scan(db: AsyncSession, audit_id: str, scan_id: str) -> AuditOut:
        a = await _get(db, audit_id)
        if a.status != AUDIT_OPEN:
            raise ConflictException(f"{a.audit_no} is closed.")
        scan = await db.get(AuditScan, scan_id)
        if not scan or scan.audit_id != a.id:
            raise NotFoundException("Scan not found.")
        await db.delete(scan)
        await db.commit()
        return await AuditService.get(db, a.id)

    @staticmethod
    async def close(db: AsyncSession, audit_id: str) -> AuditOut:
        a = await _get(db, audit_id)
        if a.status != AUDIT_OPEN:
            raise ConflictException(f"{a.audit_no} is already closed.")
        missing = await _missing(db, a)
        a.result = {"expected": await _expected_count(db, a), "found": len(_found_ids(a)),
                    "missing": [m.model_dump() for m in missing]}
        a.status = AUDIT_CLOSED
        a.closed_at = utcnow()
        a.closed_by_name = actor_name()
        await db.commit()
        return await AuditService.get(db, a.id)
