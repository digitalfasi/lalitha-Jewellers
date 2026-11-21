"""A bill as an A4 tax-invoice PDF, for download, WhatsApp and email.

Mirrors the bill page in the web app (BillView.jsx): a change to what a bill
shows has to be made in both places. Poppins is bundled because the fonts
built into PDF have no rupee sign.
"""
import io
from pathlib import Path
from typing import List, Optional

from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

from app._shared.core.uploads import upload_root
from app.modules.billing.schema import BillOut

FONT_DIR = Path(__file__).resolve().parents[2] / "assets" / "fonts"
REG, BOLD = "BillSans", "BillSansBold"
W, H = A4
M = 12 * mm
INK, MUTED, LINE, ACCENT = HexColor("#1E1E1E"), HexColor("#6F6B62"), HexColor("#D9D5CB"), HexColor("#9F1D35")

# x positions (right edge for numbers) of the item table
COLS = [("#", M, "l"), ("Item", M + 7 * mm, "l"), ("HSN", M + 66 * mm, "l"), ("Purity", M + 78 * mm, "l"), ("Gross", M + 101 * mm, "r"),
        ("Less", M + 116 * mm, "r"), ("Net", M + 131 * mm, "r"), ("%", M + 145 * mm, "r"),
        ("Fine", M + 160 * mm, "r"), ("Amount", W - M, "r")]


def _fonts() -> None:
    if REG not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont(REG, str(FONT_DIR / "Poppins-Regular.ttf")))
        pdfmetrics.registerFont(TTFont(BOLD, str(FONT_DIR / "Poppins-Bold.ttf")))


def _inr(v: float) -> str:
    """Indian grouping: 1,23,456.00"""
    neg = v < 0
    whole, frac = f"{abs(v):.2f}".split(".")
    if len(whole) > 3:
        head, tail = whole[:-3], whole[-3:]
        groups = []
        while len(head) > 2:
            groups.insert(0, head[-2:])
            head = head[:-2]
        if head:
            groups.insert(0, head)
        whole = ",".join(groups) + "," + tail
    return ("-" if neg else "") + whole + "." + frac


def _g(v: float) -> str:
    return f"{v:.3f}"


def _wrap(text: str, font: str, size: float, width: float) -> List[str]:
    words, lines, cur = (text or "").split(), [], ""
    for w in words:
        trial = f"{cur} {w}".strip()
        if pdfmetrics.stringWidth(trial, font, size) <= width:
            cur = trial
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines or [""]


class _Doc:
    def __init__(self, bill: BillOut, logo_path: Optional[str], terms: Optional[str], bank: List[str]):
        self.b, self.logo_path, self.terms, self.bank = bill, logo_path, terms, bank
        self.buf = io.BytesIO()
        self.c = canvas.Canvas(self.buf, pagesize=A4)
        self.c.setTitle(f"{bill.bill_number} - {bill.shop_name}")
        self.page = 1

    def text(self, x, y, s, size=8.5, bold=False, color=INK, align="l"):
        c = self.c
        c.setFont(BOLD if bold else REG, size)
        c.setFillColor(color)
        if align == "r":
            c.drawRightString(x, y, s)
        elif align == "c":
            c.drawCentredString(x, y, s)
        else:
            c.drawString(x, y, s)

    def rule(self, y, color=LINE, width=0.6):
        self.c.setStrokeColor(color)
        self.c.setLineWidth(width)
        self.c.line(M, y, W - M, y)

    def header(self) -> float:
        b, y = self.b, H - M
        x = M
        if self.logo_path:
            try:
                img = ImageReader(str(upload_root() / self.logo_path))
                iw, ih = img.getSize()
                h = 16 * mm
                w = min(40 * mm, h * iw / ih)
                self.c.drawImage(img, M, y - h, width=w, height=h, mask="auto",
                                 preserveAspectRatio=True, anchor="sw")
                x = M + w + 4 * mm
            except Exception:
                pass
        self.text(x, y - 5 * mm, b.seller_name or "Your business name", 14, True, ACCENT)
        yy = y - 9.5 * mm
        for line in _wrap(b.seller_address or "", REG, 8, 95 * mm)[:2]:
            self.text(x, yy, line, 8, color=MUTED)
            yy -= 3.6 * mm
        bits = [f"GSTIN {b.seller_gstin}" if b.seller_gstin else None,
                f"{b.seller_state_name} ({b.seller_state_code})" if b.seller_state_code else None]
        self.text(x, yy, "  ·  ".join(v for v in bits if v), 8, color=MUTED)

        self.text(W - M, y - 5 * mm, "TAX INVOICE", 13, True, align="r")
        self.text(W - M, y - 10 * mm, b.bill_number, 11, True, align="r")
        self.text(W - M, y - 14 * mm, b.bill_date.strftime("%d %b %Y"), 9, align="r")
        if self.page > 1:
            self.text(W - M, y - 18 * mm, f"Page {self.page}", 8, color=MUTED, align="r")
        y -= 23 * mm
        self.rule(y)
        return y - 5 * mm

    def party(self, y: float) -> float:
        b = self.b
        self.text(M, y, "BILL TO", 7.5, True, MUTED)
        self.text(M, y - 5 * mm, b.shop_name, 11, True)
        yy = y - 9 * mm
        for line in _wrap(b.shop_address or "", REG, 8.5, 100 * mm)[:2]:
            self.text(M, yy, line, 8.5)
            yy -= 3.8 * mm
        if b.shop_phone:
            self.text(M, yy, f"Phone {b.shop_phone}", 8.5)
            yy -= 3.8 * mm
        if b.shop_gstin:
            self.text(M, yy, f"GSTIN {b.shop_gstin}", 8.5)
            yy -= 3.8 * mm
        right = W - M
        place = f"{b.shop_state_name} ({b.shop_state_code})" if b.shop_state_code else (b.seller_state_name or "-")
        self.text(right, y, "PLACE OF SUPPLY", 7.5, True, MUTED, "r")
        self.text(right, y - 5 * mm, place, 9, align="r")
        self.text(right, y - 9.5 * mm, f"Gold rate  ₹{_inr(b.gold_rate)} / g fine", 8.5, align="r")
        if b.status == "CANCELLED":
            self.text(right, y - 14 * mm, "CANCELLED", 11, True, HexColor("#B42318"), "r")
        return min(yy, y - 16 * mm) - 3 * mm

    def table_head(self, y: float) -> float:
        self.rule(y + 3.5 * mm, INK, 0.8)
        for label, x, al in COLS:
            self.text(x, y, label.upper(), 7, True, MUTED, al)
        self.rule(y - 2 * mm)
        return y - 6 * mm

    def new_page(self) -> float:
        self.text(W - M, M - 4 * mm, "Continued on next page", 7.5, color=MUTED, align="r")
        self.c.showPage()
        self.page += 1
        return self.table_head(self.header())

    def build(self) -> bytes:
        _fonts()
        b = self.b
        y = self.table_head(self.party(self.header()))
        for line in b.lines:
            desc = f"{line.code}  {line.description}"
            sub = []
            if line.kind == "COMBO":
                sub += [f"{p.item_code} {p.name} · net {_g(p.net_weight)} @ {p.touch_percent:g}%"
                        + (f" · HUID {p.huid}" if p.huid else "") for p in line.pieces]
            elif line.pieces and line.pieces[0].huid:
                sub.append(f"HUID {line.pieces[0].huid}")
            if getattr(line, "stone_amount", 0):
                sub.append(f"Stones ₹{_inr(line.stone_amount)}")
            if line.charges:
                sub.append(f"Charges ₹{_inr(line.charges)}")
            desc_lines = _wrap(desc, BOLD, 8.5, 57 * mm)
            need = (len(desc_lines) * 4 + len(sub) * 3.5 + 3) * mm
            if y - need < 70 * mm:
                y = self.new_page()
            self.text(COLS[0][1], y, str(line.line_no), 8.5, color=MUTED)
            for i, dl in enumerate(desc_lines):
                self.text(COLS[1][1], y - i * 4 * mm, dl, 8.5, bold=(i == 0))
            vals = [line.hsn_code or "", line.purity, _g(line.gross_weight), _g(line.stone_weight), _g(line.net_weight),
                    f"{line.touch_percent:g}", _g(line.fine_weight), _inr(line.amount)]
            for (label, x, al), v in zip(COLS[2:], vals):
                self.text(x, y, v, 7.5 if label == "Purity" and len(v) > 4 else 8.5,
                          bold=(label in ("Fine", "Amount")), align=al)
            yy = y - len(desc_lines) * 4 * mm
            for s in sub:
                self.text(COLS[1][1], yy, s[:95], 7.5, color=MUTED)
                yy -= 3.5 * mm
            y = yy - 1.5 * mm
            self.rule(y + 0.8 * mm)
            y -= 4 * mm

        t = b.totals
        if y < 75 * mm:
            y = self.new_page()
        self.rule(y + 3.2 * mm, INK, 0.8)
        self.text(COLS[1][1], y, f"{t.total_pieces} pieces", 8.5, True)
        for (label, x, al), v in zip(COLS[4:9], [t.total_gross, t.total_stone, t.total_net, None, t.total_fine]):
            if v is not None:
                self.text(x, y, _g(v), 8.5, True, align=al)
        self.text(W - M, y, _inr(t.subtotal - (t.huid_amount or 0)), 8.5, True, align="r")
        y -= 8 * mm

        # totals box (right) and words / bank / terms (left)
        rows = [(f"Gold ({_g(t.total_fine)} g fine x {_inr(b.gold_rate)})", _inr(t.metal_amount))]
        if t.stone_amount:
            rows.append((f"Stones ({_g(t.total_stone)} g x {_inr(t.stone_rate)})", _inr(t.stone_amount)))
        if t.huid_amount:
            rows.append((f"HUID ({t.huid_pieces} x {_inr(t.huid_rate)})", _inr(t.huid_amount)))
        if t.total_charges:
            rows.append(("Other charges", _inr(t.total_charges)))
        rows.append(("Taxable value", _inr(t.subtotal)))
        half = b.gst_percent / 2
        if t.tax_type == "INTER":
            rows.append((f"IGST {b.gst_percent:g}%", _inr(t.igst_amount)))
        else:
            rows += [(f"CGST {half:g}%", _inr(t.cgst_amount)), (f"SGST {half:g}%", _inr(t.sgst_amount))]
        rows.append(("Round off", _inr(t.round_off)))
        top = y
        lx = W - M - 70 * mm
        for label, v in rows:
            self.text(lx, y, label, 8.5, color=MUTED)
            self.text(W - M, y, v, 8.5, align="r")
            y -= 4.6 * mm
        self.c.setStrokeColor(INK)
        self.c.line(lx, y + 2.6 * mm, W - M, y + 2.6 * mm)
        y -= 2.5 * mm
        self.text(lx, y, "Total", 11, True)
        self.text(W - M, y, f"₹{_inr(t.grand_total)}", 12, True, ACCENT, "r")

        ly = top
        for line in _wrap(b.amount_in_words, BOLD, 8.5, 100 * mm):
            self.text(M, ly, line, 8.5, True)
            ly -= 4 * mm
        ly -= 2 * mm
        if self.bank:
            self.text(M, ly, "BANK DETAILS", 7, True, MUTED)
            ly -= 4 * mm
            for line in self.bank:
                self.text(M, ly, line, 8)
                ly -= 3.6 * mm
            ly -= 2 * mm
        if b.remarks:
            self.text(M, ly, "REMARKS", 7, True, MUTED)
            ly -= 4 * mm
            for line in _wrap(b.remarks, REG, 8, 100 * mm)[:3]:
                self.text(M, ly, line, 8)
                ly -= 3.6 * mm

        # footer
        fy = 24 * mm
        if self.terms:
            self.text(M, fy + 6 * mm, "TERMS", 7, True, MUTED)
            for i, line in enumerate(_wrap(self.terms, REG, 7.5, 110 * mm)[:4]):
                self.text(M, fy + 2 * mm - i * 3.4 * mm, line, 7.5, color=MUTED)
        self.text(W - M, fy + 6 * mm, f"For {b.seller_name or ''}".strip(), 8.5, True, align="r")
        self.text(W - M, fy - 6 * mm, "Authorised signatory", 7.5, color=MUTED, align="r")
        if b.created_by_name:
            self.text(M, M - 4 * mm, f"Billed by {b.created_by_name}", 7, color=MUTED)
        self.c.showPage()
        self.c.save()
        return self.buf.getvalue()


def bill_pdf(bill: BillOut, logo_path: Optional[str], terms: Optional[str], bank: List[str]) -> bytes:
    return _Doc(bill, logo_path, terms, bank).build()
