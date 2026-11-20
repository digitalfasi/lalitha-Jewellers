"""The calculator's sums. Pure functions on Decimal, built on the same helpers and
rounding as the bills (billing/pricing.py), so a calculator answer and a bill agree:
weights and fine gold to 3 decimals (mg), money to 2 (paisa), totals to the rupee.
"""
from decimal import Decimal

from app.modules.billing.pricing import (
    GRAMS_PER_PAVAN, GRAMS_PER_TOLA, HUNDRED, PURITY_PERCENT, RUPEE, ROUND_HALF_UP,
    d, fine_of, gst_split, making_for, q2, q3, touch_from_wastage,
)
from app.modules.calc.schema import (
    FineIn, FineOut, GstIn, GstOut, MetalIn, MetalOut, MoneyIn, MoneyOut, OldGoldIn, OldGoldOut,
    RateRow, RatesOut,
)

ZERO = Decimal("0")


def pavan(grams: Decimal) -> Decimal:
    return q3(grams / GRAMS_PER_PAVAN)


def _rupee(x: Decimal):
    """(rounded total, round-off)."""
    total = x.quantize(RUPEE, rounding=ROUND_HALF_UP)
    return total, total - x


def fine(data: FineIn) -> FineOut:
    """One piece or lot: weight -> fine gold -> value -> GST -> total."""
    gross, stone = d(data.gross_weight), d(data.stone_weight)
    net = q3(gross - stone)
    if data.mode == "WASTAGE":
        touch = touch_from_wastage(data.purity, d(data.wastage_percent))
    else:
        touch = d(data.touch_percent)
    fine_g = fine_of(net, touch)
    rate = d(data.gold_rate)
    metal = q2(fine_g * rate)
    making = making_for(net, d(data.making_per_gram)) if data.making_per_gram else Decimal("0.00")
    other = q2(d(data.other_charges))
    subtotal = metal + making + other
    gst = q2(subtotal * d(data.gst_percent) / HUNDRED)
    cgst, sgst, igst = gst_split(gst, data.interstate)
    total, round_off = _rupee(subtotal + gst)
    return FineOut(
        net_weight=net, net_pavan=pavan(net), touch_percent=touch, fine_weight=fine_g, fine_pavan=pavan(fine_g),
        metal_amount=metal, making_amount=making, other_charges=other, subtotal=subtotal,
        gst_amount=gst, cgst_amount=cgst, sgst_amount=sgst, igst_amount=igst,
        round_off=round_off, total=total,
        # Per gram of the piece's own (net) weight, the way shops compare prices.
        per_gram=q2(subtotal / net) if net else Decimal("0.00"),
    )


def rates(fine_rate: Decimal) -> RatesOut:
    """Today's fine (24K) rate as the rate for each purity, per g / pavan / 10 g / tola.
    The 24K row is pure fine gold; the others are its gold content (22K = 91.6%)."""
    rows = []
    for purity, pct in PURITY_PERCENT.items():
        per_g = q2(fine_rate) if purity == "24K" else q2(fine_rate * pct / HUNDRED)
        rows.append(RateRow(
            purity=purity, purity_percent=pct, per_gram=per_g, per_pavan=q2(per_g * GRAMS_PER_PAVAN),
            per_10g=q2(per_g * 10), per_tola=q2(per_g * GRAMS_PER_TOLA),
        ))
    return RatesOut(fine_rate=q2(fine_rate), rows=rows)


def gst(data: GstIn) -> GstOut:
    """Add GST to a price, or take it out of a GST-inclusive price."""
    amount, pct = q2(d(data.amount)), d(data.gst_percent)
    if data.inclusive:
        base = q2(amount * HUNDRED / (HUNDRED + pct))
        tax = amount - base
        total = amount
    else:
        base = amount
        tax = q2(base * pct / HUNDRED)
        total = base + tax
    cgst, sgst, igst = gst_split(tax, data.interstate)
    return GstOut(base_amount=base, gst_amount=tax, cgst_amount=cgst, sgst_amount=sgst, igst_amount=igst, total=total)


def old_gold(data: OldGoldIn) -> OldGoldOut:
    """Old gold a shop hands over: less stones/dirt, less melting loss, at the tested
    purity -> fine credit -> its value at today's rate. Against a new bill, the balance."""
    weight, less = d(data.weight), d(data.less_weight)
    net = q3(weight - less)
    after_loss = q3(net * (HUNDRED - d(data.melting_loss_percent)) / HUNDRED)
    fine_g = fine_of(after_loss, d(data.purity_percent))
    value = q2(fine_g * d(data.gold_rate))
    out = OldGoldOut(net_weight=net, after_loss_weight=after_loss, fine_weight=fine_g, fine_pavan=pavan(fine_g),
                     value=value)
    if data.new_bill_amount is not None:
        balance = q2(d(data.new_bill_amount)) - value
        out.balance = abs(balance)
        out.balance_direction = "SHOP_PAYS" if balance > 0 else "WE_PAY" if balance < 0 else "SETTLED"
    return out


def money_to_gold(data: MoneyIn) -> MoneyOut:
    """How much gold an amount buys: as fine gold, and as jewellery at a touch."""
    amount, rate = q2(d(data.amount)), d(data.gold_rate)
    pct = d(data.gst_percent)
    # The amount includes GST, so only part of it buys gold.
    before_gst = q2(amount * HUNDRED / (HUNDRED + pct)) if pct else amount
    fine_g = q3(before_gst / rate)
    out = MoneyOut(amount_before_gst=before_gst, gst_amount=amount - before_gst, fine_weight=fine_g,
                   fine_pavan=pavan(fine_g))
    if data.touch_percent:
        jewel = q3(fine_g * HUNDRED / d(data.touch_percent))
        out.jewellery_weight, out.jewellery_pavan = jewel, pavan(jewel)
    return out


def metal_account(data: MetalIn) -> MetalOut:
    """A shop's fine-gold account: what it owes in fine grams, less the gold and cash it paid.
    Gold paid counts at its purity; cash counts at today's rate."""
    owed = q3(d(data.owed_fine))
    gold_fine = fine_of(d(data.gold_weight), d(data.gold_purity_percent)) if data.gold_weight else Decimal("0.000")
    rate = d(data.gold_rate)
    cash_fine = q3(d(data.cash) / rate) if data.cash else Decimal("0.000")
    balance = owed - gold_fine - cash_fine
    return MetalOut(
        gold_fine=gold_fine, cash_fine=cash_fine, paid_fine=gold_fine + cash_fine,
        balance_fine=abs(balance), balance_pavan=pavan(abs(balance)), balance_rupees=q2(abs(balance) * rate),
        balance_direction="SHOP_OWES" if balance > 0 else "WE_OWE" if balance < 0 else "SETTLED",
    )
