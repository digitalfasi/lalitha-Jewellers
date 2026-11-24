"""Bill arithmetic. Pure functions on Decimal; no database.

v1 rule (to be confirmed with the wholesaler, who will walk through their slip):
    touch  = as entered, or purity % + wastage %   (two ways shops quote the same thing)
    fine   = net weight x touch % / 100            (3 decimals, per piece)
    metal  = line fine x gold rate (Rs per g fine) (2 decimals, per line)
    stones = less (stone) weight x Rs per gram       (per line, the "RS" column on the trade's slip)
    amount = metal + stones + charges (Rs entered per line, plus making Rs/g x net when given)
    HUID   = hallmarked pieces x Rs per piece         (once, on the whole bill)
    GST    = subtotal x GST %                      (on the whole bill: gold, making and stones alike,
                                                    as GST on jewellery is charged on the full value)
             same state: half CGST + half SGST; other state: all IGST
    total  = subtotal + GST, rounded to the rupee; the difference is round-off
"""
from dataclasses import dataclass, field
from decimal import ROUND_HALF_UP, Decimal
from typing import List, Optional

MG = Decimal("0.001")
PAISA = Decimal("0.01")
RUPEE = Decimal("1")
HUNDRED = Decimal("100")


def d(value) -> Decimal:
    return value if isinstance(value, Decimal) else Decimal(str(value))


def q3(x: Decimal) -> Decimal:
    return x.quantize(MG, rounding=ROUND_HALF_UP)


def q2(x: Decimal) -> Decimal:
    return x.quantize(PAISA, rounding=ROUND_HALF_UP)


def fine_of(net: Decimal, touch: Decimal) -> Decimal:
    return q3(net * touch / HUNDRED)


# Gold content of each purity, in % - the hallmark grades (22K = "916").
PURITY_PERCENT = {
    "24K": Decimal("99.9"), "22K": Decimal("91.6"), "20K": Decimal("83.3"),
    "18K": Decimal("75.0"), "14K": Decimal("58.5"),
}
GRAMS_PER_PAVAN = Decimal("8")      # one sovereign
GRAMS_PER_TOLA = Decimal("11.664")


def touch_from_wastage(purity: str, wastage: Decimal) -> Decimal:
    """"22K + 8% wastage" is the same deal as "99.6 touch"."""
    return PURITY_PERCENT[purity] + d(wastage)


def making_for(net: Decimal, per_gram: Decimal) -> Decimal:
    return q2(d(net) * d(per_gram))


def gst_split(gst: Decimal, interstate: bool):
    """(cgst, sgst, igst). Same state: half each, SGST takes the odd paisa."""
    zero = Decimal("0.00")
    if interstate:
        return zero, zero, gst
    cgst = q2(gst / 2)
    return cgst, gst - cgst, zero


@dataclass
class PieceCalc:
    piece: object  # inventory Piece
    touch: Decimal
    fine: Decimal


@dataclass
class LineCalc:
    kind: str
    code: str
    description: str
    purity: str
    charges: Decimal
    pieces: List[PieceCalc]
    combo: Optional[object] = None  # combos Combo (whole-combo line, or one piece of a split combo)
    hsn: Optional[str] = None
    gross: Decimal = field(init=False)
    stone: Decimal = field(init=False)
    net: Decimal = field(init=False)
    fine: Decimal = field(init=False)
    touch: Decimal = field(init=False)
    metal: Decimal = field(init=False)
    stone_amount: Decimal = field(init=False)
    amount: Decimal = field(init=False)

    def price(self, gold_rate: Decimal, stone_rate: Decimal = Decimal("0")) -> "LineCalc":
        self.gross = sum((d(p.piece.gross_weight) for p in self.pieces), Decimal("0"))
        self.stone = sum((d(p.piece.stone_weight) for p in self.pieces), Decimal("0"))
        self.net = sum((d(p.piece.net_weight) for p in self.pieces), Decimal("0"))
        self.fine = sum((p.fine for p in self.pieces), Decimal("0"))
        if len(self.pieces) == 1:
            self.touch = self.pieces[0].touch  # as entered, not re-derived from the rounded fine
        else:  # a combo line: the blend of its pieces
            self.touch = (self.fine / self.net * HUNDRED).quantize(MG, rounding=ROUND_HALF_UP) if self.net else Decimal("0")
        self.metal = q2(self.fine * gold_rate)
        self.stone_amount = q2(self.stone * d(stone_rate))
        self.amount = self.metal + self.stone_amount + q2(self.charges)
        return self


@dataclass
class Totals:
    total_pieces: int
    total_gross: Decimal
    total_stone: Decimal
    total_net: Decimal
    total_fine: Decimal
    metal_amount: Decimal
    total_charges: Decimal
    stone_rate: Decimal
    stone_amount: Decimal
    huid_rate: Decimal
    huid_pieces: int
    huid_amount: Decimal
    subtotal: Decimal
    gst_amount: Decimal
    tax_type: str            # INTRA (CGST + SGST) or INTER (IGST)
    cgst_amount: Decimal
    sgst_amount: Decimal
    igst_amount: Decimal
    round_off: Decimal
    grand_total: Decimal


def huid_count(lines: List[LineCalc]) -> int:
    return sum(1 for l in lines for p in l.pieces if getattr(p.piece, "huid", None))


def totals(lines: List[LineCalc], gst_percent: Decimal, interstate: bool = False,
           huid_rate: Decimal = Decimal("0"), stone_rate: Decimal = Decimal("0"),
           huid_pieces: Optional[int] = None) -> Totals:
    s = lambda attr: sum((getattr(l, attr) for l in lines), Decimal("0"))  # noqa: E731
    huid_pieces = huid_count(lines) if huid_pieces is None else huid_pieces
    huid_amount = q2(huid_pieces * d(huid_rate))
    subtotal = s("amount") + huid_amount
    gst = q2(subtotal * gst_percent / HUNDRED)
    cgst, sgst, igst = gst_split(gst, interstate)
    before = subtotal + gst
    grand = before.quantize(RUPEE, rounding=ROUND_HALF_UP)
    return Totals(
        total_pieces=sum(len(l.pieces) for l in lines),
        total_gross=s("gross"), total_stone=s("stone"), total_net=s("net"), total_fine=s("fine"),
        metal_amount=s("metal"), total_charges=q2(sum((d(l.charges) for l in lines), Decimal("0"))),
        stone_rate=d(stone_rate), stone_amount=s("stone_amount"), huid_rate=d(huid_rate), huid_pieces=huid_pieces, huid_amount=huid_amount, subtotal=subtotal, gst_amount=gst, tax_type="INTER" if interstate else "INTRA",
        cgst_amount=cgst, sgst_amount=sgst, igst_amount=igst, round_off=grand - before, grand_total=grand,
    )
