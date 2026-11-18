from fastapi import UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app._shared.core.config import settings
from app._shared.core.gst_states import code_from_gstin, state_name
from app._shared.core.uploads import delete_upload, save_image, upload_url
from app.modules.business.model import PROFILE_ID, BusinessProfile
from app.modules.business.schema import BusinessIn, BusinessOut


def _out(p: BusinessProfile) -> BusinessOut:
    return BusinessOut(
        name=p.name, address=p.address, city=p.city, pincode=p.pincode, state_code=p.state_code,
        state_name=state_name(p.state_code), gstin=p.gstin, pan=p.pan, phone=p.phone, email=p.email,
        bank_name=p.bank_name, bank_account=p.bank_account, bank_ifsc=p.bank_ifsc, bank_branch=p.bank_branch,
        bill_terms=p.bill_terms, logo_url=upload_url(p.logo_path), is_set_up=bool(p.name),
        email_enabled=bool(settings.SMTP_HOST),
    )


class BusinessService:
    @staticmethod
    async def load(db: AsyncSession) -> BusinessProfile:
        p = await db.get(BusinessProfile, PROFILE_ID)
        if p is None:
            p = BusinessProfile(id=PROFILE_ID, name="")
        return p

    @staticmethod
    async def get(db: AsyncSession) -> BusinessOut:
        return _out(await BusinessService.load(db))

    @staticmethod
    async def save(db: AsyncSession, data: BusinessIn) -> BusinessOut:
        p = await db.get(BusinessProfile, PROFILE_ID)
        if p is None:
            p = BusinessProfile(id=PROFILE_ID)
            db.add(p)
        for k, v in data.model_dump().items():
            setattr(p, k, v if v not in ("",) else None)
        p.name = data.name
        # The GSTIN already says which state the business is in.
        p.state_code = code_from_gstin(p.gstin) or p.state_code
        await db.commit()
        return _out(p)

    @staticmethod
    async def set_logo(db: AsyncSession, file: UploadFile) -> BusinessOut:
        p = await db.get(BusinessProfile, PROFILE_ID)
        if p is None:
            p = BusinessProfile(id=PROFILE_ID, name="")
            db.add(p)
        old = p.logo_path
        p.logo_path = await save_image(file, "logo")
        await db.commit()
        delete_upload(old)
        return _out(p)

    @staticmethod
    async def remove_logo(db: AsyncSession) -> BusinessOut:
        p = await db.get(BusinessProfile, PROFILE_ID)
        if p and p.logo_path:
            old, p.logo_path = p.logo_path, None
            await db.commit()
            delete_upload(old)
        return _out(p or BusinessProfile(id=PROFILE_ID, name=""))
