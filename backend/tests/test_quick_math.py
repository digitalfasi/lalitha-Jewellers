"""Excel-style quick math: the spec's examples, Excel errors, exact decimals and safety."""
from decimal import Decimal

import pytest

from app.modules.calc.formula import FormulaError, evaluate, numbers_in, tidy

API = "/api/v1/calc"


def calc(formula, **values):
    return tidy(evaluate(formula, {k: Decimal(str(v)) for k, v in values.items()}))


@pytest.mark.parametrize("formula,expected", [
    ("A + B", "210"), ("A - B", "190"), ("A * B", "2000"), ("A / B", "20"),
    ("(A * B) / 100", "20"), ("A * (1 + (B / 100))", "220"), ("A * (1 - (B / 100))", "180"),
    ("((B - A) / A) * 100", "-95"), ("SUM(A, B)", "210"), ("AVERAGE(A, B)", "105"),
    ("MIN(A, B)", "10"), ("MAX(A, B)", "200"), ("ABS(A - B)", "190"), ("ROUND(A, B)", "200"),
    ("IF(A > B, A, B)", "200"), ("=a*b", "2000"), ("A × B ÷ 100", "20"), ("A^2", "40000"), ("10% * A", "20"),
])
def test_spec_examples(formula, expected):
    assert calc(formula, A=200, B=10) == expected


def test_exact_decimals_and_excel_rounding():
    assert calc("0.1 + 0.2") == "0.3"
    assert calc("ROUND((A * B) / 100, 2)", A=250.5, B=12) == "30.06"
    assert calc("ROUND(2.5, 0)") == "3" and calc("ROUND(-2.5, 0)") == "-3"     # half away from zero
    assert calc("ROUNDUP(1.21, 1)") == "1.3" and calc("ROUNDDOWN(1.29, 1)") == "1.2"
    assert calc("ROUND(1234, -2)") == "1200"
    assert calc("SQRT(200)") == "14.1421356237"
    assert calc("IF(A = 5, 1, 0)", A=5) == "1" and calc("A <> 5", A=4) == "TRUE"


@pytest.mark.parametrize("formula,code", [
    ("A / B", "#DIV/0!"), ("SQRT(-1)", "#VALUE!"), ("A +", "#VALUE!"), ("FOO(A)", "#NAME?"), ("Z + 1", "#NAME?"),
    ("__import__('os')", "#NAME?"), ("().__class__", "#VALUE!"), ("'abc'", "#VALUE!"), ("A.real", "#VALUE!"),
    ("[1, 2]", "#VALUE!"), ("lambda: 1", "#VALUE!"), ("AVERAGE()", "#DIV/0!"), ("POWER(2, 5000)", "#VALUE!"),
])
def test_errors_are_excel_codes(formula, code):
    with pytest.raises(FormulaError) as e:
        evaluate(formula, {"A": Decimal(5), "B": Decimal(0)})
    assert e.value.code == code


def test_if_only_works_out_the_chosen_branch():
    assert calc("IF(B = 0, 0, A / B)", A=5, B=0) == "0"


def test_numbers_in_pasted_text():
    assert numbers_in("13.7\n16.35\t₹1,02,345.50 and -2") == [Decimal("13.7"), Decimal("16.35"), Decimal("102345.50"), Decimal("-2")]


async def test_endpoints(client):
    res = (await client.post(f"{API}/formula", json={"formula": "=ROUND((A*B)/100, 2)", "values": {"A": 250.5, "B": 12}})).json()
    assert res == {"status": "ok", "formula_used": "ROUND((A*B)/100, 2)", "result": "30.06", "error": None, "hint": None}
    res = (await client.post(f"{API}/formula", json={"formula": "A/B", "values": {"A": 1, "B": 0}})).json()
    assert res["status"] == "error" and res["error"] == "#DIV/0!"

    grid = {g["key"]: g for g in (await client.post(f"{API}/grid", json={"a": 200, "b": 10})).json()}
    assert grid["pct_of"]["result"] == "20" and grid["pct_change"]["result"] == "-95"
    grid = {g["key"]: g for g in (await client.post(f"{API}/grid", json={"a": 0, "b": 0})).json()}
    assert grid["div"]["error"] == "#DIV/0!"

    st = (await client.post(f"{API}/stats", json={"text": "15.84\n18.96\n22.75"})).json()
    assert st["count"] == 3 and st["sum"] == "57.55" and st["min"] == "15.84" and st["max"] == "22.75"

    saved = await client.post(f"{API}/formulas", json={"name": "Stone charge", "formula": "=A * 515", "hint": "A = less (g)"})
    assert saved.status_code == 201 and saved.json()["letters"] == ["A"] and saved.json()["formula"] == "A * 515"
    assert (await client.post(f"{API}/formulas", json={"name": "stone charge", "formula": "A"})).status_code == 409
    assert (await client.post(f"{API}/formulas", json={"name": "Broken", "formula": "FOO(A)"})).status_code == 422
    assert [f["name"] for f in (await client.get(f"{API}/formulas")).json()] == ["Stone charge"]
    assert (await client.delete(f"{API}/formulas/{saved.json()['id']}")).status_code == 204


def test_new_functions():
    assert calc("MROUND(12.37, 0.05)") == "12.35" and calc("CEILING(12.31, 0.5)") == "12.5" and calc("FLOOR(12.9)") == "12"
    assert calc("MOD(-7, 3)") == "2" and calc("INT(-2.5)") == "-3"


def test_sheet_cells_ranges_and_loops():
    from app.modules.calc.formula import evaluate_sheet
    out = evaluate_sheet({"A1": "Net", "A2": "13.7", "A3": "16.35", "B2": "103", "B3": "103",
                          "C2": "=A2*B2/100", "C3": "=A3*B3/100", "C4": "=SUM(C2:C3)", "D1": "=SUMPRODUCT(A2:A3, B2:B3)/100",
                          "E1": "=E2+1", "E2": "=E1", "F1": "=A1*2", "G1": "=C4*RATE"}, {"RATE": Decimal(15180)})
    assert out["C2"]["result"] == "14.111" and out["C4"]["result"] == "30.9515" and out["D1"]["result"] == "30.9515"
    assert out["E1"]["error"] == "#REF!" and out["F1"]["error"] == "#VALUE!" and out["A1"]["result"] == "Net"
    assert out["G1"]["result"] == "469843.77"


def _xlsx(cells):
    import io, zipfile
    rows = "".join(
        f'<c r="{r}"><f>{v[1:]}</f></c>' if v.startswith("=") else f'<c r="{r}" t="inlineStr"><is><t>{v}</t></is></c>'
        for r, v in cells.items())
    sheet = f'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row>{rows}</row></sheetData></worksheet>'
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("xl/worksheets/sheet1.xml", sheet)
    return buf.getvalue()


async def test_live_values_me_edit_undo_import_and_shop_recent(client):
    await client.put("/api/v1/rates/2026-11-23", json={"rate": 15180})
    await client.put("/api/v1/business/charges", json={"stone_rate": 515, "huid_rate": 77})
    res = (await client.post(f"{API}/formula", json={"formula": "A * STONE + HUID", "values": {"A": 2.14}})).json()
    assert res["result"] == "1179.1"
    assert (await client.get(f"{API}/presets")).json()["live"]["STONE"] == "515"

    me = (await client.put(f"{API}/me", json={"tape": [{"expr": "1+1", "result": "2"}], "pins": ["x"], "sheet": {"a1": "5"}})).json()
    assert me == {"tape": [{"expr": "1+1", "result": "2"}], "sheet": {"a1": "5"}, "pins": ["x"]}
    assert (await client.get(f"{API}/me")).json()["sheet"] == {"a1": "5"}

    f = (await client.post(f"{API}/formulas", json={"name": "Stones", "formula": "A*515", "labels": {"A": "Less (g)"},
                                                    "example": {"A": 2.14}})).json()
    assert f["labels"] == {"A": "Less (g)"} and f["example"] == {"values": {"A": "2.14"}, "result": "1102.1"}
    f = (await client.patch(f"{API}/formulas/{f['id']}", json={"formula": "A*STONE"})).json()
    assert f["formula"] == "A*STONE" and f["versions"] == 1
    f = (await client.post(f"{API}/formulas/{f['id']}/undo")).json()
    assert f["formula"] == "A*515" and f["versions"] == 0

    found = (await client.post(f"{API}/import-excel", files={"file": ("calc.xlsx", _xlsx(
        {"A1": "Net", "B1": "Touch", "C1": "Fine", "C2": "=A2*B2/100", "C3": "=A3*B3/100", "D1": "=SUM(C2:C9)"}),
        "application/octet-stream")})).json()
    assert found[0] == {"name": "Fine", "formula": "A*B/100", "labels": {"A": "Net", "B": "Touch"}, "source": "Sheet1!C2", "problem": None}
    assert len(found) == 2 and found[1]["problem"]          # the copy in C3 counts once; the range is flagged
    assert (await client.post(f"{API}/import-excel", files={"file": ("x.xlsx", b"not a zip")})).status_code == 422

    shop = (await client.post("/api/v1/billing/shops", json={"name": "Recent Shop"})).json()
    assert (await client.get(f"/api/v1/billing/shops/{shop['id']}/recent")).json() == []
