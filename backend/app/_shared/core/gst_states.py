"""GST state codes (the first two digits of a GSTIN)."""
from typing import Optional

STATES = {
    "01": "Jammu and Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh",
    "05": "Uttarakhand", "06": "Haryana", "07": "Delhi", "08": "Rajasthan", "09": "Uttar Pradesh",
    "10": "Bihar", "11": "Sikkim", "12": "Arunachal Pradesh", "13": "Nagaland", "14": "Manipur",
    "15": "Mizoram", "16": "Tripura", "17": "Meghalaya", "18": "Assam", "19": "West Bengal",
    "20": "Jharkhand", "21": "Odisha", "22": "Chhattisgarh", "23": "Madhya Pradesh", "24": "Gujarat",
    "26": "Dadra and Nagar Haveli and Daman and Diu", "27": "Maharashtra", "29": "Karnataka",
    "30": "Goa", "31": "Lakshadweep", "32": "Kerala", "33": "Tamil Nadu", "34": "Puducherry",
    "35": "Andaman and Nicobar Islands", "36": "Telangana", "37": "Andhra Pradesh", "38": "Ladakh",
}


def state_name(code: Optional[str]) -> Optional[str]:
    return STATES.get(code) if code else None


def code_from_gstin(gstin: Optional[str]) -> Optional[str]:
    if gstin and len(gstin) >= 2 and gstin[:2] in STATES:
        return gstin[:2]
    return None


def check_code(code: Optional[str]) -> Optional[str]:
    """Validator helper: blank -> None, unknown -> ValueError."""
    if not code:
        return None
    code = code.strip().zfill(2)
    if code not in STATES:
        raise ValueError("Unknown GST state code")
    return code
