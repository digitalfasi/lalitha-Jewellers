from datetime import datetime
from typing import Dict, Iterable, List, Optional, Tuple

from sqlalchemy import exists, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.combos.model import Combo, ComboEvent, ComboItem
from app.modules.inventory.model import PIECE_STATUS_IN_STOCK, Piece

_active_item = ComboItem.unlinked_at.is_(None)


class ComboRepository:
    @staticmethod
    async def get(db: AsyncSession, combo_id: str, *, for_update: bool = False) -> Optional[Combo]:
        stmt = select(Combo).where(Combo.id == combo_id).execution_options(populate_existing=True)
        if for_update:
            # Serialises edits to one combo (Postgres; a no-op on SQLite).
            stmt = stmt.with_for_update(of=Combo)
        return (await db.execute(stmt)).scalar_one_or_none()

    @staticmethod
    async def get_by_code(db: AsyncSession, code: str) -> Optional[Combo]:
        res = await db.execute(select(Combo).where(Combo.combo_code == code.strip().upper()))
        return res.scalar_one_or_none()

    @staticmethod
    async def list(
        db: AsyncSession, *, q: Optional[str], status: Optional[str], limit: int, offset: int
    ) -> Tuple[List[Combo], int]:
        conds = []
        if q:
            like = f"%{q.strip().lower()}%"
            member_match = exists().where(
                ComboItem.combo_id == Combo.id,
                ComboItem.piece_id == Piece.id,
                func.lower(Piece.item_code).like(like),
            )
            conds.append(or_(func.lower(Combo.combo_code).like(like), func.lower(Combo.name).like(like), member_match))
        if status:
            conds.append(Combo.status == status)
        total = (await db.execute(select(func.count(Combo.id)).where(*conds))).scalar_one()
        rows = await db.execute(
            select(Combo).where(*conds).order_by(Combo.created_at.desc(), Combo.combo_code.desc())
            .limit(limit).offset(offset)
        )
        return list(rows.scalars()), total

    @staticmethod
    async def next_seq(db: AsyncSession, combo_id: str) -> int:
        res = await db.execute(select(func.coalesce(func.max(ComboEvent.seq), 0)).where(ComboEvent.combo_id == combo_id))
        return res.scalar_one() + 1

    @staticmethod
    async def events(db: AsyncSession, combo_id: str) -> List[ComboEvent]:
        res = await db.execute(select(ComboEvent).where(ComboEvent.combo_id == combo_id).order_by(ComboEvent.seq.desc()))
        return list(res.scalars())


class ComboItemRepository:
    @staticmethod
    async def active_for_piece(db: AsyncSession, piece_id: str) -> Optional[ComboItem]:
        res = await db.execute(
            select(ComboItem).options(selectinload(ComboItem.combo))
            .where(ComboItem.piece_id == piece_id, _active_item)
        )
        return res.unique().scalar_one_or_none()

    @staticmethod
    async def active_combo_codes(db: AsyncSession, piece_ids: Iterable[str]) -> Dict[str, str]:
        """piece_id -> code of the combo it is in now (pieces not in one are absent)."""
        ids = list(piece_ids)
        if not ids:
            return {}
        res = await db.execute(
            select(ComboItem.piece_id, Combo.combo_code)
            .join(Combo, Combo.id == ComboItem.combo_id)
            .where(ComboItem.piece_id.in_(ids), _active_item)
        )
        return dict(res.all())

    @staticmethod
    async def active_backs(db: AsyncSession, piece_ids: Iterable[str]) -> Dict[str, Tuple[str, str, datetime]]:
        """piece_id -> (combo code, partner codes now as "A + B", when the combo last changed).
        What the back of the piece's tag should say today."""
        ids = list(piece_ids)
        if not ids:
            return {}
        mine = (await db.execute(
            select(ComboItem.piece_id, ComboItem.combo_id).where(ComboItem.piece_id.in_(ids), _active_item)
        )).all()
        if not mine:
            return {}
        rows = (await db.execute(
            select(ComboItem.combo_id, ComboItem.piece_id, ComboItem.linked_at, ComboItem.unlinked_at,
                   Piece.item_code, Combo.combo_code)
            .join(Piece, Piece.id == ComboItem.piece_id).join(Combo, Combo.id == ComboItem.combo_id)
            .where(ComboItem.combo_id.in_({c for _, c in mine}))
        )).all()
        codes, changed, members = {}, {}, {}
        for cid, pid, linked, unlinked, item_code, combo_code in rows:
            codes[cid] = combo_code
            t = unlinked or linked
            changed[cid] = max(changed[cid], t) if cid in changed else t
            if unlinked is None:
                members.setdefault(cid, []).append((pid, item_code))
        return {
            pid: (codes[cid], " + ".join(sorted(c for p2, c in members.get(cid, []) if p2 != pid)), changed[cid])
            for pid, cid in mine
        }

    @staticmethod
    async def history_for_piece(db: AsyncSession, piece_id: str) -> List[Tuple[ComboItem, Combo]]:
        res = await db.execute(
            select(ComboItem, Combo)
            .join(Combo, Combo.id == ComboItem.combo_id)
            .where(ComboItem.piece_id == piece_id)
            .order_by(ComboItem.linked_at.desc())
        )
        return [(i, c) for i, c in res.unique().all()]

    @staticmethod
    async def available_pieces(db: AsyncSession, q: Optional[str], limit: int,
                               category_id: Optional[str] = None) -> List[Piece]:
        """In-stock pieces that are not in any combo right now."""
        in_combo = exists().where(ComboItem.piece_id == Piece.id, _active_item)
        conds = [Piece.status == PIECE_STATUS_IN_STOCK, ~in_combo]
        if category_id:
            conds.append(Piece.category_id == category_id)
        if q:
            like = f"%{q.strip().lower()}%"
            conds.append(or_(func.lower(Piece.item_code).like(like), func.lower(Piece.name).like(like)))
        res = await db.execute(select(Piece).where(*conds).order_by(Piece.item_code).limit(limit))
        return list(res.unique().scalars())


    @staticmethod
    async def pairings(db: AsyncSession, max_combos: int = 2000) -> List[Tuple[str, Optional[str], str]]:
        """(combo_id, design_id, category_id) for every piece ever linked in the
        most recent combos. Used to learn which designs and categories go together."""
        recent = select(Combo.id).order_by(Combo.created_at.desc()).limit(max_combos).subquery()
        res = await db.execute(
            select(ComboItem.combo_id, Piece.design_id, Piece.category_id)
            .join(Piece, Piece.id == ComboItem.piece_id)
            .where(ComboItem.combo_id.in_(select(recent.c.id)))
        )
        return [tuple(r) for r in res.all()]
