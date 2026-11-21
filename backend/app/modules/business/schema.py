import re
from typing import Optional

from pydantic import BaseModel, Field, field_validator

from app._shared.core.gst_states import check_code


def _strip(v):
    return v.strip() if isinstance(v, str) else v


class BusinessIn(BaseModel):
    name: str = Field(..., min_length=2, max_length=150)
    address: Optional[str] = Field(None, max_length=500)
    city: Optional[str] = Field(None, max_length=100)
    pincode: Optional[str] = Field(None, max_length=10)
    state_code: Optional[str] = Field(None, max_length=2)
    gstin: Optional[str] = Field(None, max_length=15)
    pan: Optional[str] = Field(None, max_length=10)
    phone: Optional[str] = Field(None, max_length=20)
    email: Optional[str] = Field(None, max_length=150)
    bank_name: Optional[str] = Field(None, max_length=100)
    bank_account: Optional[str] = Field(None, max_length=30)
    bank_ifsc: Optional[str] = Field(None, max_length=11)
    bank_branch: Optional[str] = Field(None, max_length=100)
    bill_terms: Optional[str] = Field(None, max_length=2000)

    _s = field_validator("*", mode="before")(_strip)

    @field_validator("gstin", "pan", "bank_ifsc")
    @classmethod
    def _upper(cls, v):
        return v.upper() if v else None

    @field_validator("gstin")
    @classmethod
    def _gstin(cls, v):
        if v and (len(v) != 15 or not v.isalnum()):
            raise ValueError("GSTIN must be 15 letters and digits")
        return v

    @field_validator("pan")
    @classmethod
    def _pan(cls, v):
        if v and not re.fullmatch(r"[A-Z]{5}[0-9]{4}[A-Z]", v):
            raise ValueError("PAN looks like ABCDE1234F")
        return v

    @field_validator("bank_ifsc")
    @classmethod
    def _ifsc(cls, v):
        if v and not re.fullmatch(r"[A-Z]{4}0[A-Z0-9]{6}", v):
            raise ValueError("IFSC looks like SBIN0001234")
        return v

    @field_validator("state_code")
    @classmethod
    def _state(cls, v):
        return check_code(v)


class ChargesIn(BaseModel):
    """Bill settings the owner sets once; each bill can still change them."""
    default_hsn: str = Field("7113", max_length=8)
    huid_rate: Optional[float] = Field(None, ge=0, le=100_000, description="Rs per hallmarked piece")
    stone_rate: Optional[float] = Field(None, ge=0, le=1_000_000, description="Rs per gram of less (stone) weight")
    show_making: bool = False

    @field_validator("default_hsn", mode="before")
    @classmethod
    def _hsn(cls, v):
        v = (v or "").strip() or "7113"
        if not re.fullmatch(r"\d{4,8}", v):
            raise ValueError("HSN code is 4 to 8 digits, e.g. 7113")
        return v


class BusinessOut(BaseModel):
    name: str
    address: Optional[str]
    city: Optional[str]
    pincode: Optional[str]
    state_code: Optional[str]
    state_name: Optional[str]
    gstin: Optional[str]
    pan: Optional[str]
    phone: Optional[str]
    email: Optional[str]
    bank_name: Optional[str]
    bank_account: Optional[str]
    bank_ifsc: Optional[str]
    bank_branch: Optional[str]
    bill_terms: Optional[str]
    logo_url: Optional[str]
    is_set_up: bool          # name entered: bills can carry a proper header
    email_enabled: bool      # SMTP configured on the server: bills can be emailed
    default_hsn: str = "7113"
    huid_rate: Optional[float] = None
    stone_rate: Optional[float] = None
    show_making: bool = False
