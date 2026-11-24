"""Quick math: Excel-style formulas, the A-and-B answer grid, pasted-list totals, saved formulas,
a small sheet, each person's tape, and reading formulas out of the owner's Excel file."""
import io
import re
import uuid
import zipfile
from datetime import date
from decimal import Decimal
from typing import Dict, List, Optional
from xml.etree import ElementTree as ET

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app._shared.core.actor import actor_name
from app._shared.exceptions.base import ConflictException, NotFoundException, ValidationException
from app.modules.calc.formula import (
    LETTERS, LIVE_NAMES, PRESETS, FormulaError, evaluate, evaluate_sheet, numbers_in, tidy,
)
from app.modules.calc.model import CalcUserData, SavedFormula
from app.modules.calc.schema import (
    FormulaIn, FormulaOut, GridIn, GridItem, ImportedFormula, MyCalcIn, MyCalcOut, SavedFormulaEdit,
    SavedFormulaIn, SavedFormulaOut, SheetIn, StatsIn, StatsOut,
)


# ------------------------------------------------------------- live values

async def live_values(db: AsyncSession) -> Dict[str, Optional[Decimal]]:
    """RATE (24K fine), RATE22…, STONE (Rs/g of less), HUID (Rs/piece): today's, from Settings."""
    from app.modules.business.service import BusinessService
    from app.modules.rates.service import RateService
    info = await RateService.today(db, date.today())
    row = info.today or info.last  # the last rate set, when today's isn't yet
    out: Dict[str, Optional[Decimal]] = {k: None for k in LIVE_NAMES}
    if row:
        out["RATE"] = Decimal(str(row.rate))
        for k in ("22K", "20K", "18K", "14K"):
            out[f"RATE{k[:2]}"] = Decimal(str(row.purity_rates[k]))
    biz = await BusinessService.load(db)
    out["STONE"] = Decimal(biz.stone_rate) if biz.stone_rate is not None else None
    out["HUID"] = Decimal(biz.huid_rate) if biz.huid_rate is not None else None
    return out


async def run_formula(db: AsyncSession, data: FormulaIn) -> FormulaOut:
    used = data.formula.strip().lstrip("=").strip()
    values = {**(await live_values(db)), **data.values}
    try:
        return FormulaOut(status="ok", formula_used=used, result=tidy(evaluate(data.formula, values)))
    except FormulaError as e:
        return FormulaOut(status="error", formula_used=used, error=e.code, hint=e.hint)


async def run_sheet(db: AsyncSession, data: SheetIn) -> Dict[str, dict]:
    if len(data.cells) > 400:
        raise ValidationException("The sheet has at most 200 cells.")
    return evaluate_sheet(data.cells, await live_values(db))


def grid(data: GridIn) -> List[GridItem]:
    values = {"A": data.a, "B": data.b}
    out = []
    for key, label, formula in PRESETS:
        try:
            out.append(GridItem(key=key, label=label, formula=formula, result=tidy(evaluate(formula, values))))
        except FormulaError as e:
            out.append(GridItem(key=key, label=label, formula=formula, error=e.code))
    return out


def stats(data: StatsIn) -> StatsOut:
    nums = numbers_in(data.text)[:5000]
    if not nums:
        return StatsOut(count=0, numbers=[])
    total = sum(nums, Decimal(0))
    return StatsOut(count=len(nums), sum=tidy(total), average=tidy(total / len(nums)), min=tidy(min(nums)),
                    max=tidy(max(nums)), numbers=[tidy(n) for n in nums])


# ---------------------------------------------------------- saved formulas

def _letters(formula: str) -> List[str]:
    """Boxes a formula uses, in A-H order (function names and cells like A1 are not boxes)."""
    found = {m.upper() for m in re.findall(r"(?<![A-Za-z_0-9])([A-Ha-h])(?![A-Za-z_0-9(])", formula)}
    return [x for x in LETTERS if x in found]


def _out(f: SavedFormula) -> SavedFormulaOut:
    return SavedFormulaOut(id=f.id, name=f.name, formula=f.formula, hint=f.hint, letters=_letters(f.formula),
                           labels=f.labels or {}, example=f.example, versions=len(f.history or []),
                           created_by_name=f.created_by_name)


def _check(formula: str) -> str:
    """Make sure a formula works (every box = 1; a divide-by-zero with those numbers is fine)."""
    try:
        evaluate(formula, {x: Decimal(1) for x in (*LETTERS, "ANS", *LIVE_NAMES)})
    except FormulaError as e:
        if e.code != "#DIV/0!":
            raise ValidationException(f"{e.code} {e.hint}", field="formula")
    return formula.strip().lstrip("=").strip()


def _example(formula: str, values) -> Optional[dict]:
    if not values:
        return None
    vals = {k.upper(): v for k, v in values.items() if v is not None and k.upper() in LETTERS}
    try:
        return {"values": {k: tidy(v) for k, v in vals.items()}, "result": tidy(evaluate(formula, vals))}
    except FormulaError:
        return None


class SavedFormulaService:
    @staticmethod
    async def list(db: AsyncSession) -> List[SavedFormulaOut]:
        rows = (await db.execute(select(SavedFormula).order_by(SavedFormula.sort, SavedFormula.name))).scalars()
        return [_out(f) for f in rows]

    @staticmethod
    async def _name_free(db: AsyncSession, name: str, exclude: Optional[str] = None) -> None:
        stmt = select(SavedFormula.id).where(func.lower(SavedFormula.name) == name.lower())
        if exclude:
            stmt = stmt.where(SavedFormula.id != exclude)
        if (await db.execute(stmt)).first():
            raise ConflictException(f"A formula named '{name}' already exists.")

    @staticmethod
    async def create(db: AsyncSession, data: SavedFormulaIn) -> SavedFormulaOut:
        name = data.name.strip()
        await SavedFormulaService._name_free(db, name)
        formula = _check(data.formula)
        n = (await db.execute(select(func.count(SavedFormula.id)))).scalar() or 0
        f = SavedFormula(id=str(uuid.uuid4()), name=name, formula=formula, hint=(data.hint or "").strip() or None,
                         labels={k.upper(): v.strip() for k, v in (data.labels or {}).items() if v and v.strip()} or None,
                         example=_example(formula, data.example), sort=n, created_by_name=actor_name())
        db.add(f)
        await db.commit()
        return _out(f)

    @staticmethod
    async def edit(db: AsyncSession, formula_id: str, data: SavedFormulaEdit) -> SavedFormulaOut:
        """Every change keeps the version before it, so a mistake can be undone."""
        f = await db.get(SavedFormula, formula_id)
        if not f:
            raise NotFoundException("Formula not found.")
        before = {"name": f.name, "formula": f.formula, "hint": f.hint, "labels": f.labels}
        if data.name:
            await SavedFormulaService._name_free(db, data.name.strip(), exclude=f.id)
            f.name = data.name.strip()
        if data.formula:
            f.formula = _check(data.formula)
            if f.example:
                f.example = _example(f.formula, f.example.get("values"))
        if "hint" in data.model_fields_set:
            f.hint = (data.hint or "").strip() or None
        if data.labels is not None:
            f.labels = {k.upper(): v.strip() for k, v in data.labels.items() if v and v.strip()} or None
        f.history = [before, *(f.history or [])][:10]
        await db.commit()
        return _out(f)

    @staticmethod
    async def undo(db: AsyncSession, formula_id: str) -> SavedFormulaOut:
        f = await db.get(SavedFormula, formula_id)
        if not f:
            raise NotFoundException("Formula not found.")
        if not f.history:
            raise ConflictException("There is no earlier version.")
        prev, *rest = f.history
        f.name, f.formula, f.hint, f.labels = prev["name"], prev["formula"], prev.get("hint"), prev.get("labels")
        f.history = rest
        await db.commit()
        return _out(f)

    @staticmethod
    async def delete(db: AsyncSession, formula_id: str) -> None:
        f = await db.get(SavedFormula, formula_id)
        if not f:
            raise NotFoundException("Formula not found.")
        await db.delete(f)
        await db.commit()


# --------------------------------------------------- each person's calculator

async def my_data(db: AsyncSession, user_id: str) -> MyCalcOut:
    row = await db.get(CalcUserData, user_id)
    return MyCalcOut(tape=row.tape or [], sheet=row.sheet or {}, pins=row.pins or []) if row else MyCalcOut()


async def save_my_data(db: AsyncSession, user_id: str, data: MyCalcIn) -> MyCalcOut:
    row = await db.get(CalcUserData, user_id)
    if row is None:
        row = CalcUserData(user_id=user_id)
        db.add(row)
    if data.tape is not None:
        row.tape = [{"expr": str(x.get("expr", ""))[:300], "result": str(x.get("result", ""))[:60]} for x in data.tape][:50]
    if data.sheet is not None:
        row.sheet = {k.upper(): str(v)[:500] for k, v in data.sheet.items() if v}
    if data.pins is not None:
        row.pins = data.pins[:12]
    await db.commit()
    return await my_data(db, user_id)


# ------------------------------------------------- formulas from an Excel file

_NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
_REF = re.compile(r"(?<![A-Za-z_])\$?([A-Z]{1,3})\$?(\d{1,7})(?![\d(])")


def _xml(z: zipfile.ZipFile, name: str):
    data = z.read(name)
    if b"<!DOCTYPE" in data or b"<!ENTITY" in data:  # no entity tricks in uploaded files
        raise ValidationException("This file can't be read.")
    return ET.fromstring(data)


def read_excel_formulas(content: bytes) -> List[ImportedFormula]:
    """Every distinct formula in an .xlsx, rewritten for boxes A, B, C… with labels taken from
    the column heading (row 1) or the row's label (column A). Copies down a column count once."""
    try:
        z = zipfile.ZipFile(io.BytesIO(content))
    except zipfile.BadZipFile:
        raise ValidationException("That isn't an Excel file (.xlsx).")
    if sum(i.file_size for i in z.infolist()) > 50_000_000:
        raise ValidationException("That file is too big.")
    names = z.namelist()
    shared = []
    if "xl/sharedStrings.xml" in names:
        for si in _xml(z, "xl/sharedStrings.xml").iter(_NS + "si"):
            shared.append("".join(t.text or "" for t in si.iter(_NS + "t")))
    sheet_files = sorted((n for n in names if re.match(r"xl/worksheets/sheet\d+\.xml$", n)),
                         key=lambda n: int(re.findall(r"\d+", n)[-1]))[:10]
    out, seen = [], set()
    for sheet_no, sheet in enumerate(sheet_files, 1):
        texts, formulas = {}, []
        for c in _xml(z, sheet).iter(_NS + "c"):
            ref, f, v = c.get("r"), c.find(_NS + "f"), c.find(_NS + "v")
            if f is not None and f.text:
                formulas.append((ref, f.text))
            elif c.get("t") == "s" and v is not None and v.text and v.text.isdigit() and int(v.text) < len(shared):
                texts[ref] = shared[int(v.text)].strip()
            elif c.get("t") == "inlineStr":
                texts[ref] = "".join(t.text or "" for t in c.iter(_NS + "t")).strip()

        def label(ref: str) -> Optional[str]:
            col, row = re.match(r"([A-Z]+)(\d+)", ref).groups()
            return texts.get(f"{col}1") or texts.get(f"A{row}") or None

        for ref, text in formulas:
            source = f"Sheet{sheet_no}!{ref}"
            problem = None
            refs = list(dict.fromkeys(m.group(1) + m.group(2) for m in _REF.finditer(text)))
            if ":" in text or "!" in text:
                problem = "Uses a range or another sheet; adjust it after saving."
            if len(refs) > len(LETTERS):
                problem = "Uses more than 8 cells."
            mapping = {r: LETTERS[i] for i, r in enumerate(refs[:len(LETTERS)])}
            converted = _REF.sub(lambda m: mapping.get(m.group(1) + m.group(2), m.group(0)), text)
            if not problem:
                try:
                    _check(converted)
                except ValidationException as e:
                    problem = str(e.message if hasattr(e, "message") else e)
            key = converted.replace(" ", "").upper()
            if key in seen:
                continue
            seen.add(key)
            labels = {mapping[r]: label(r) for r in mapping if label(r)}
            out.append(ImportedFormula(name=(label(ref) or source)[:60], formula=converted, labels=labels,
                                       source=source, problem=problem))
            if len(out) >= 100:
                return out
    return out
