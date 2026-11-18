from typing import List, Optional, Tuple

from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.inventory.model import (
    PIECE_STATUS_IN_STOCK,
    Category,
    CodeSequence,
    Design,
    Lot,
    Piece,
)


class CategoryRepository:
    @staticmethod
    async def list(db: AsyncSession) -> List[Tuple[Category, int]]:
        counts = (
            select(Piece.category_id, func.count(Piece.id).label("n"))
            .group_by(Piece.category_id)
            .subquery()
        )
        rows = await db.execute(
            select(Category, func.coalesce(counts.c.n, 0))
            .outerjoin(counts, counts.c.category_id == Category.id)
            .order_by(Category.name)
        )
        return [(c, n) for c, n in rows.all()]

    @staticmethod
    async def get(db: AsyncSession, category_id: str) -> Optional[Category]:
        return await db.get(Category, category_id)

    @staticmethod
    async def find_by_name(db: AsyncSession, name: str) -> Optional[Category]:
        res = await db.execute(select(Category).where(func.lower(Category.name) == name.lower()))
        return res.scalar_one_or_none()

    @staticmethod
    async def find_by_prefix(db: AsyncSession, prefix: str) -> Optional[Category]:
        res = await db.execute(select(Category).where(Category.code_prefix == prefix))
        return res.scalar_one_or_none()

    @staticmethod
    async def piece_count(db: AsyncSession, category_id: str) -> int:
        res = await db.execute(select(func.count(Piece.id)).where(Piece.category_id == category_id))
        return res.scalar_one()


class DesignRepository:
    @staticmethod
    async def list(db: AsyncSession, category_id: Optional[str] = None) -> List[Tuple[Design, int]]:
        counts = (
            select(Piece.design_id, func.count(Piece.id).label("n"))
            .where(Piece.status == PIECE_STATUS_IN_STOCK)
            .group_by(Piece.design_id)
            .subquery()
        )
        stmt = (
            select(Design, func.coalesce(counts.c.n, 0))
            .outerjoin(counts, counts.c.design_id == Design.id)
            .order_by(Design.name)
        )
        if category_id:
            stmt = stmt.where(Design.category_id == category_id)
        rows = await db.execute(stmt)
        return [(d, n) for d, n in rows.unique().all()]

    @staticmethod
    async def get(db: AsyncSession, design_id: str) -> Optional[Design]:
        return await db.get(Design, design_id, populate_existing=True)

    @staticmethod
    async def find_by_name(db: AsyncSession, category_id: str, name: str) -> Optional[Design]:
        res = await db.execute(
            select(Design).where(Design.category_id == category_id, func.lower(Design.name) == name.lower())
        )
        return res.scalars().first()

    @staticmethod
    async def in_stock_count(db: AsyncSession, design_id: str) -> int:
        res = await db.execute(
            select(func.count(Piece.id)).where(
                Piece.design_id == design_id, Piece.status == PIECE_STATUS_IN_STOCK
            )
        )
        return res.scalar_one()


class PieceRepository:
    @staticmethod
    async def list(
        db: AsyncSession,
        *,
        q: Optional[str],
        category_id: Optional[str],
        design_id: Optional[str],
        status: Optional[str],
        lot_id: Optional[str] = None,
        karigar_id: Optional[str] = None,
        limit: int,
        offset: int,
    ) -> Tuple[List[Piece], int]:
        conds = []
        if q:
            like = f"%{q.strip().lower()}%"
            conds.append(or_(func.lower(Piece.item_code).like(like), func.lower(Piece.name).like(like),
                             func.lower(Piece.huid).like(like)))
        if category_id:
            conds.append(Piece.category_id == category_id)
        if design_id:
            conds.append(Piece.design_id == design_id)
        if status:
            conds.append(Piece.status == status)
        if lot_id:
            conds.append(Piece.lot_id == lot_id)
        if karigar_id:
            conds.append(Piece.lot_id.in_(select(Lot.id).where(Lot.karigar_id == karigar_id)))

        total = (await db.execute(select(func.count(Piece.id)).where(*conds))).scalar_one()
        rows = await db.execute(
            select(Piece).where(*conds).order_by(Piece.created_at.desc(), Piece.item_code.desc())
            .limit(limit).offset(offset)
        )
        return list(rows.unique().scalars()), total

    @staticmethod
    async def get(db: AsyncSession, piece_id: str) -> Optional[Piece]:
        return await db.get(Piece, piece_id, populate_existing=True)

    @staticmethod
    async def get_by_code(db: AsyncSession, code: str) -> Optional[Piece]:
        res = await db.execute(select(Piece).where(Piece.item_code == code.strip().upper()))
        return res.unique().scalar_one_or_none()


class CodeSequenceRepository:
    @staticmethod
    async def next_value(db: AsyncSession, key: str) -> int:
        """Reserve the next number for this counter key.
        The counter row is locked FOR UPDATE (Postgres), so concurrent saves
        are serialised. The caller commits; a failed save rolls it back."""
        stmt = select(CodeSequence).where(CodeSequence.prefix == key).with_for_update()
        row = (await db.execute(stmt)).scalar_one_or_none()
        if row is None:
            try:
                async with db.begin_nested():
                    row = CodeSequence(prefix=key, last_value=0)
                    db.add(row)
                    await db.flush()
            except IntegrityError:  # another request created it first
                row = (await db.execute(stmt)).scalar_one()
        row.last_value += 1
        await db.flush()
        return row.last_value

    @staticmethod
    async def next_code(db: AsyncSession, prefix: str) -> str:
        """Next code for this prefix: <prefix><4+ digits>, e.g. CH0001."""
        return f"{prefix}{await CodeSequenceRepository.next_value(db, prefix):04d}"
