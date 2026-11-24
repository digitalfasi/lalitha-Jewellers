"""Excel-style formulas on exact decimals, evaluated safely.

Understood: numbers, boxes A-H, ANS (last answer), sheet cells A1-J20 and ranges (A1:A5),
live values (RATE, RATE22…, STONE, HUID), + - * / ^, comparisons and the Excel functions
below. Nothing is ever run as Python: the text is parsed into a tree and every node is
checked against this whitelist. Errors read as Excel shows them: #DIV/0!, #VALUE!, #NAME?, #REF!.
"""
import ast
import re
from decimal import ROUND_CEILING, ROUND_DOWN, ROUND_FLOOR, ROUND_HALF_UP, ROUND_UP, Decimal, InvalidOperation, localcontext
from typing import Callable, Dict, List, Optional

DIV0, VALUE, NAME, REF = "#DIV/0!", "#VALUE!", "#NAME?", "#REF!"
MAX_LEN = 500
MAX_NODES = 300
LETTERS = tuple("ABCDEFGH")
SHEET_COLS = "ABCDEFGHIJ"
SHEET_ROWS = 20
CELL = re.compile(r"^([A-J])([1-9]|1\d|20)$")
LIVE_NAMES = ("RATE", "RATE22", "RATE20", "RATE18", "RATE14", "STONE", "HUID")


class FormulaError(Exception):
    def __init__(self, code: str, hint: str):
        super().__init__(hint)
        self.code, self.hint = code, hint


def _prep(text: str) -> str:
    """Turn what people type (Excel or calculator style) into something the parser reads."""
    s = (text or "").strip()
    if s.startswith("="):
        s = s[1:]
    s = s.replace("×", "*").replace("÷", "/").replace("−", "-").replace("–", "-").replace("^", "**").replace("$", "")
    s = re.sub(r"\b([A-Ja-j])(\d{1,2})\s*:\s*([A-Ja-j])(\d{1,2})\b", r"RANGE(\1\2, \3\4)", s)  # A1:A5
    s = s.replace("<>", "!=")
    s = re.sub(r"(?<![<>=!])=(?!=)", "==", s)              # Excel's = is a comparison
    s = re.sub(r"(\d+(?:\.\d+)?)\s*%", r"(\1/100)", s)       # 15% means 0.15, as in Excel
    return s


def _d(v) -> Decimal:
    if isinstance(v, bool):
        return Decimal(1 if v else 0)
    if isinstance(v, list):
        raise FormulaError(VALUE, "A range can only go inside SUM, AVERAGE, MIN, MAX, COUNT or SUMPRODUCT.")
    return v


def _flat(args) -> List[Decimal]:
    out = []
    for a in args:
        out.extend(a if isinstance(a, list) else [_d(a)])
    return out


def _round(v, digits, mode) -> Decimal:
    return _d(v).quantize(Decimal(1).scaleb(-int(_d(digits))), rounding=mode)


def _multiple(v, m, mode) -> Decimal:
    v, m = _d(v), _d(m)
    if m == 0:
        return Decimal(0)
    return (v / m).quantize(Decimal(1), rounding=mode) * m


def _sqrt(v):
    v = _d(v)
    if v < 0:
        raise FormulaError(VALUE, "Can't take the square root of a negative number.")
    return v.sqrt()


def _power(x, y):
    x, y = _d(x), _d(y)
    if abs(y) > 1000:
        raise FormulaError(VALUE, "That power is too big.")
    if x == 0 and y < 0:
        raise FormulaError(DIV0, "0 to a negative power divides by zero.")
    if x < 0 and y != y.to_integral_value():
        raise FormulaError(VALUE, "A negative number can't take a fractional power.")
    return x ** y


def _div(a, b):
    if _d(b) == 0:  # Excel shows #DIV/0! for 0/0 too
        raise FormulaError(DIV0, "Something is divided by 0.")
    return _d(a) / _d(b)


def _average(*a):
    a = _flat(a)
    if not a:
        raise FormulaError(DIV0, "AVERAGE needs at least one number.")
    return sum(a) / len(a)


def _mod(a, b):
    a, b = _d(a), _d(b)
    if b == 0:
        raise FormulaError(DIV0, "MOD divides by 0.")
    return a - b * (a / b).to_integral_value(rounding=ROUND_FLOOR)  # Excel: sign follows the divisor


def _sumproduct(*ranges):
    lists = [r if isinstance(r, list) else [_d(r)] for r in ranges]
    if len({len(x) for x in lists}) != 1:
        raise FormulaError(VALUE, "SUMPRODUCT needs ranges of the same size.")
    total = Decimal(0)
    for row in zip(*lists):
        p = Decimal(1)
        for x in row:
            p *= x
        total += p
    return total


FUNCTIONS = {
    "SUM": lambda *a: sum(_flat(a), Decimal(0)),
    "AVERAGE": _average,
    "COUNT": lambda *a: Decimal(len(_flat(a))),
    "MIN": lambda *a: min(_flat(a)),
    "MAX": lambda *a: max(_flat(a)),
    "ABS": lambda v: abs(_d(v)),
    "POWER": _power,
    "SQRT": _sqrt,
    "ROUND": lambda v, n=2: _round(v, n, ROUND_HALF_UP),     # half up, as Excel rounds
    "ROUNDUP": lambda v, n=0: _round(v, n, ROUND_UP),        # away from zero
    "ROUNDDOWN": lambda v, n=0: _round(v, n, ROUND_DOWN),    # toward zero
    "MROUND": lambda v, m: _multiple(v, m, ROUND_HALF_UP),   # to the nearest 0.05, 10…
    "CEILING": lambda v, m=1: _multiple(v, m, ROUND_CEILING),
    "FLOOR": lambda v, m=1: _multiple(v, m, ROUND_FLOOR),
    "INT": lambda v: _d(v).to_integral_value(rounding=ROUND_FLOOR),
    "MOD": _mod,
    "SUMPRODUCT": _sumproduct,
    "AND": lambda *a: all(a),
    "OR": lambda *a: any(a),
    "NOT": lambda v: not v,
}
FUNCTION_NAMES = sorted([*FUNCTIONS, "IF"])

_BIN = {
    ast.Add: lambda a, b: _d(a) + _d(b),
    ast.Sub: lambda a, b: _d(a) - _d(b),
    ast.Mult: lambda a, b: _d(a) * _d(b),
    ast.Div: _div,
    ast.Pow: _power,
}
_CMP = {
    ast.Eq: lambda a, b: a == b, ast.NotEq: lambda a, b: a != b,
    ast.Lt: lambda a, b: a < b, ast.LtE: lambda a, b: a <= b,
    ast.Gt: lambda a, b: a > b, ast.GtE: lambda a, b: a >= b,
}

Lookup = Callable[[str], Optional[Decimal]]


class _Eval:
    def __init__(self, src: str, lookup: Lookup):
        self.src, self.lookup = src, lookup

    def name(self, raw: str):
        name = raw.upper()
        if name in ("TRUE", "FALSE"):
            return name == "TRUE"
        return self.lookup(name)

    def cells(self, a: ast.AST, b: ast.AST) -> List[Decimal]:
        if not (isinstance(a, ast.Name) and isinstance(b, ast.Name)):
            raise FormulaError(VALUE, "A range looks like A1:A5.")
        m1, m2 = CELL.match(a.id.upper()), CELL.match(b.id.upper())
        if not (m1 and m2):
            raise FormulaError(REF, "Ranges use cells A1 to J20.")
        c1, c2 = sorted([SHEET_COLS.index(m1[1]), SHEET_COLS.index(m2[1])])
        r1, r2 = sorted([int(m1[2]), int(m2[2])])
        out = []
        for c in range(c1, c2 + 1):
            for r in range(r1, r2 + 1):
                v = self.lookup(f"{SHEET_COLS[c]}{r}", in_range=True)
                if v is not None and not isinstance(v, bool):
                    out.append(v)  # empty and text cells are skipped, as in Excel
        return out

    def run(self, node):
        if isinstance(node, ast.Expression):
            return self.run(node.body)
        if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)) and not isinstance(node.value, bool):
            # Read the digits as typed, so 0.1 stays exactly 0.1.
            return Decimal(ast.get_source_segment(self.src, node) or str(node.value))
        if isinstance(node, ast.Name):
            return self.name(node.id)
        if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.USub, ast.UAdd)):
            v = _d(self.run(node.operand))
            return -v if isinstance(node.op, ast.USub) else v
        if isinstance(node, ast.BinOp) and type(node.op) in _BIN:
            return _BIN[type(node.op)](self.run(node.left), self.run(node.right))
        if isinstance(node, ast.Compare):
            left = self.run(node.left)
            for op, right_node in zip(node.ops, node.comparators):
                if type(op) not in _CMP:
                    raise FormulaError(VALUE, "That comparison isn't supported.")
                right = self.run(right_node)
                if not _CMP[type(op)](_d(left), _d(right)):
                    return False
                left = right
            return True
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and not node.keywords:
            name = node.func.id.upper()
            if name == "RANGE" and len(node.args) == 2:
                return self.cells(*node.args)
            if name == "IF":  # only the branch that is chosen is worked out, as in Excel
                if not 2 <= len(node.args) <= 3:
                    raise FormulaError(VALUE, "IF needs a test, a value if true and a value if false.")
                if self.run(node.args[0]):
                    return self.run(node.args[1])
                return self.run(node.args[2]) if len(node.args) == 3 else False
            if name not in FUNCTIONS:
                raise FormulaError(NAME, f"{node.func.id} isn't a function here. Try {', '.join(FUNCTION_NAMES[:6])}…")
            try:
                return FUNCTIONS[name](*[self.run(a) for a in node.args])
            except TypeError:
                raise FormulaError(VALUE, f"{name} got the wrong number of values.")
        raise FormulaError(VALUE, "Only numbers, boxes, + − × ÷ ^ and Excel functions are allowed.")


def _parse(text: str):
    if not (text or "").strip().lstrip("="):
        raise FormulaError(VALUE, "Type a formula.")
    if len(text) > MAX_LEN:
        raise FormulaError(VALUE, "That formula is too long.")
    src = _prep(text)
    try:
        tree = ast.parse(src, mode="eval")
    except SyntaxError:
        raise FormulaError(VALUE, "Check the brackets and signs.")
    if sum(1 for _ in ast.walk(tree)) > MAX_NODES:
        raise FormulaError(VALUE, "That formula is too long.")
    return src, tree


def _run(text: str, lookup):
    src, tree = _parse(text)
    with localcontext() as ctx:
        ctx.prec = 34
        try:
            result = _Eval(src, lookup).run(tree)
            if isinstance(result, list):
                raise FormulaError(VALUE, "A range needs SUM, AVERAGE, MIN, MAX or COUNT around it.")
            return result
        except FormulaError:
            raise
        except ZeroDivisionError:
            raise FormulaError(DIV0, "Something is divided by 0.")
        except (ArithmeticError, ValueError):
            raise FormulaError(VALUE, "That sum can't be worked out.")


def _dict_lookup(values: Dict[str, Optional[Decimal]]):
    names = {k.upper(): v for k, v in values.items()}

    def lookup(name, in_range=False):
        if name not in names:
            if name in LIVE_NAMES:
                raise FormulaError(VALUE, f"{name} isn't set yet (Settings).")
            raise FormulaError(NAME, f"{name} isn't a box here. Use A to H, ANS, or RATE / STONE / HUID.")
        v = names[name]
        if v is None:
            raise FormulaError(VALUE, f"{name} is empty.")
        return v
    return lookup


def evaluate(text: str, values: Dict[str, Optional[Decimal]]):
    """The answer (Decimal or bool), or FormulaError with Excel's code and a plain hint."""
    return _run(text, _dict_lookup(values))


def evaluate_sheet(cells: Dict[str, str], live: Dict[str, Optional[Decimal]]) -> Dict[str, dict]:
    """A small sheet: each cell holds a number, a label or =formula referring to other cells.
    Returns {cell: {"result": text} or {"error": code, "hint": text}} for every non-empty cell."""
    raw = {k.upper(): (v or "").strip() for k, v in cells.items() if CELL.match(k.upper()) and (v or "").strip()}
    done: Dict[str, object] = {}
    busy: set = set()
    live_up = {k.upper(): v for k, v in live.items()}

    def value_of(ref: str):
        if ref in done:
            v = done[ref]
            if isinstance(v, FormulaError):
                raise FormulaError(v.code, f"{ref} has an error.")
            return v
        text = raw.get(ref, "")
        if not text:
            return None
        if not text.startswith("="):
            try:
                v = Decimal(text.replace(",", ""))
            except InvalidOperation:
                v = True  # a label: skipped in ranges, an error in sums
            done[ref] = v
            return v
        if ref in busy:
            raise FormulaError(REF, f"{ref} refers back to itself.")
        busy.add(ref)
        try:
            v = _run(text, lookup)
        except FormulaError as e:
            done[ref] = e
            busy.discard(ref)
            raise
        busy.discard(ref)
        done[ref] = v
        return v

    def lookup(name, in_range=False):
        if CELL.match(name):
            v = value_of(name)
            if in_range:
                return v
            if v is None:
                return Decimal(0)  # an empty cell counts as 0, as in Excel
            if v is True and not raw.get(name, "").upper() == "TRUE":
                raise FormulaError(VALUE, f"{name} is a label, not a number.")
            return v
        if name in live_up:
            if live_up[name] is None:
                raise FormulaError(VALUE, f"{name} isn't set yet (Settings).")
            return live_up[name]
        raise FormulaError(NAME, f"{name} isn't a cell. Cells are A1 to J20.")

    out = {}
    for ref, text in raw.items():
        try:
            v = value_of(ref)
            if text.startswith("=") or isinstance(v, Decimal):
                out[ref] = {"result": tidy(v)}
            else:
                out[ref] = {"result": text}
        except FormulaError as e:
            out[ref] = {"error": e.code, "hint": e.hint}
    return out


def tidy(v) -> str:
    """Exact text of an answer: no float noise, no needless zeros, at most 10 decimals."""
    if isinstance(v, bool):
        return "TRUE" if v else "FALSE"
    v = Decimal(v)
    if v != v.to_integral_value() and v.as_tuple().exponent < -10:
        v = v.quantize(Decimal("1e-10"), rounding=ROUND_HALF_UP)
    s = format(v.normalize(), "f")
    return "0" if s in ("-0", "") else s


# Quick answers shown together for A and B, and the spec's presets.
PRESETS: List[tuple] = [
    ("add", "A + B", "A + B"),
    ("sub", "A − B", "A - B"),
    ("mul", "A × B", "A * B"),
    ("div", "A ÷ B", "A / B"),
    ("pct_of", "B% of A", "(A * B) / 100"),
    ("add_pct", "A + B%", "A * (1 + (B / 100))"),
    ("sub_pct", "A − B%", "A * (1 - (B / 100))"),
    ("pct_change", "% change A → B", "((B - A) / A) * 100"),
    ("avg", "Average", "AVERAGE(A, B)"),
    ("max", "Bigger", "MAX(A, B)"),
    ("min", "Smaller", "MIN(A, B)"),
    ("round", "A rounded to B decimals", "ROUND(A, B)"),
]

_NUM = re.compile(r"-?\d[\d,]*(?:\.\d+)?|-?\.\d+")


def numbers_in(text: str) -> List[Decimal]:
    """Every number in pasted text: an Excel column, a WhatsApp message, ₹1,02,345.50 and the like."""
    out = []
    for m in _NUM.findall((text or "").replace("₹", " ").replace("−", "-")):
        try:
            out.append(Decimal(m.replace(",", "")))
        except InvalidOperation:
            continue
    return out
