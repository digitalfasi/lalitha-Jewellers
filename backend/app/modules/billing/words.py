"""Rupees in words, Indian style (lakh, crore), as printed on a tax invoice."""
from decimal import ROUND_HALF_UP, Decimal

_ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven",
         "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"]
_TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]


def _below_100(n: int) -> str:
    if n < 20:
        return _ONES[n]
    return (_TENS[n // 10] + (" " + _ONES[n % 10] if n % 10 else "")).strip()


def _below_1000(n: int) -> str:
    hundreds, rest = divmod(n, 100)
    parts = []
    if hundreds:
        parts.append(f"{_ONES[hundreds]} Hundred")
    if rest:
        parts.append(_below_100(rest))
    return " ".join(parts)


def _integer(n: int) -> str:
    if n == 0:
        return "Zero"
    parts = []
    for size, word in ((10_000_000, "Crore"), (100_000, "Lakh"), (1000, "Thousand")):
        if n >= size:
            parts.append(f"{_integer(n // size) if size == 10_000_000 else _below_100(n // size)} {word}")
            n %= size
    if n:
        parts.append(_below_1000(n))
    return " ".join(parts)


def rupees_in_words(amount) -> str:
    value = Decimal(str(amount)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    rupees = int(value)
    paise = int((value - rupees) * 100)
    text = f"Rupees {_integer(rupees)}"
    if paise:
        text += f" and {_below_100(paise)} Paise"
    return text + " Only"
