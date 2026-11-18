from typing import List

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app._shared.core.database import get_async_db
from app.modules.audit.schema import AuditCreate, AuditOut, AuditSummaryOut, ScanIn, ScanResponse
from app.modules.audit.service import AuditService
from app.modules.auth.deps import require_role
from app.modules.auth.model import MANAGERS

# Any staff can start a count and scan; closing (freezing the result) needs a manager.
router = APIRouter(prefix="/audits", tags=["stock audit"])


@router.get("", response_model=List[AuditSummaryOut])
async def list_audits(limit: int = Query(30, ge=1, le=200), db: AsyncSession = Depends(get_async_db)):
    return await AuditService.list(db, limit)


@router.post("", response_model=AuditOut, status_code=status.HTTP_201_CREATED)
async def start_audit(data: AuditCreate, db: AsyncSession = Depends(get_async_db)):
    return await AuditService.create(db, data)


@router.get("/{audit_id}", response_model=AuditOut)
async def get_audit(audit_id: str, db: AsyncSession = Depends(get_async_db)):
    return await AuditService.get(db, audit_id)


@router.post("/{audit_id}/scan", response_model=ScanResponse)
async def scan(audit_id: str, data: ScanIn, db: AsyncSession = Depends(get_async_db)):
    return await AuditService.scan(db, audit_id, data)


@router.delete("/{audit_id}/scans/{scan_id}", response_model=AuditOut)
async def undo_scan(audit_id: str, scan_id: str, db: AsyncSession = Depends(get_async_db)):
    return await AuditService.undo_scan(db, audit_id, scan_id)


@router.post("/{audit_id}/close", response_model=AuditOut, dependencies=[Depends(require_role(*MANAGERS))])
async def close_audit(audit_id: str, db: AsyncSession = Depends(get_async_db)):
    return await AuditService.close(db, audit_id)
