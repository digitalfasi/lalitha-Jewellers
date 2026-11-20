"""Calculator sums, checked against hand-worked examples, and the bill's wastage + making way."""
from tests.test_billing import draft, setup  # noqa: F401  (fixture)

CALC = "/api/v1/calc"
API = "/api/v1/billing"


def n(x):
    return float(x)


async def test_fine_by_touch(client):
    res = await client.post(f"{CALC}/fine", json={
        "gross_weight": 12.45, "stone_weight": 0.45, "touch_percent": 92, "gold_rate": 7480,
        "other_charges": 250})
    assert res.status_code == 200, res.text
    r = res.json()
    assert n(r["net_weight"]) == 12.0 and n(r["net_pavan"]) == 1.5
    assert n(r["fine_weight"]) == 11.04                 # 12 x 92%
    assert n(r["metal_amount"]) == 82579.2              # 11.04 x 7480
    assert n(r["subtotal"]) == 82829.2                  # + 250
    assert n(r["gst_amount"]) == 2484.88                # 3%
    assert n(r["cgst_amount"]) == 1242.44 and n(r["sgst_amount"]) == 1242.44 and n(r["igst_amount"]) == 0
    assert n(r["total"]) == 85314 and n(r["round_off"]) == -0.08
    assert n(r["per_gram"]) == 6902.43                  # subtotal / net


async def test_fine_by_wastage_and_making(client):
    res = await client.post(f"{CALC}/fine", json={
        "gross_weight": 10, "mode": "WASTAGE", "purity": "22K", "wastage_percent": 8,
        "making_per_gram": 150, "gold_rate": 7000, "interstate": True})
    r = res.json()
    assert n(r["touch_percent"]) == 99.6                 # 91.6 + 8
    assert n(r["fine_weight"]) == 9.96
    assert n(r["metal_amount"]) == 69720 and n(r["making_amount"]) == 1500
    assert n(r["gst_amount"]) == 2136.6 and n(r["igst_amount"]) == 2136.6 and n(r["cgst_amount"]) == 0
    assert n(r["total"]) == 73357                        # 73356.60 rounded


async def test_fine_needs_what_its_mode_needs(client):
    base = {"gross_weight": 5, "gold_rate": 7000}
    assert (await client.post(f"{CALC}/fine", json=base)).status_code == 422
    assert (await client.post(f"{CALC}/fine", json={**base, "mode": "WASTAGE", "purity": "22K"})).status_code == 422
    res = await client.post(f"{CALC}/fine", json={**base, "touch_percent": 92, "stone_weight": 6})
    assert res.status_code == 422


async def test_rates_table(client):
    r = (await client.get(f"{CALC}/rates", params={"fine_rate": 7480})).json()
    rows = {x["purity"]: x for x in r["rows"]}
    assert n(rows["24K"]["per_gram"]) == 7480 and n(rows["24K"]["per_pavan"]) == 59840
    assert n(rows["22K"]["per_gram"]) == 6851.68         # 7480 x 91.6%
    assert n(rows["22K"]["per_pavan"]) == 54813.44
    assert n(rows["22K"]["per_10g"]) == 68516.8
    assert n(rows["18K"]["per_gram"]) == 5610


async def test_gst_add_and_take_out(client):
    r = (await client.post(f"{CALC}/gst", json={"amount": 100000})).json()
    assert n(r["gst_amount"]) == 3000 and n(r["total"]) == 103000 and n(r["cgst_amount"]) == 1500
    r = (await client.post(f"{CALC}/gst", json={"amount": 103000, "inclusive": True})).json()
    assert n(r["base_amount"]) == 100000 and n(r["gst_amount"]) == 3000 and n(r["total"]) == 103000
    r = (await client.post(f"{CALC}/gst", json={"amount": 1001, "interstate": True})).json()
    assert n(r["igst_amount"]) == 30.03 and n(r["sgst_amount"]) == 0
    r = (await client.post(f"{CALC}/gst", json={"amount": 1001})).json()
    assert n(r["cgst_amount"]) + n(r["sgst_amount"]) == 30.03   # the odd paisa isn't lost


async def test_old_gold_exchange(client):
    r = (await client.post(f"{CALC}/old-gold", json={
        "weight": 20, "less_weight": 0.5, "purity_percent": 90, "melting_loss_percent": 2,
        "gold_rate": 7000, "new_bill_amount": 150000})).json()
    assert n(r["net_weight"]) == 19.5
    assert n(r["after_loss_weight"]) == 19.11           # 19.5 less 2%
    assert n(r["fine_weight"]) == 17.199                 # 19.11 x 90%
    assert n(r["value"]) == 120393
    assert n(r["balance"]) == 29607 and r["balance_direction"] == "SHOP_PAYS"
    r = (await client.post(f"{CALC}/old-gold", json={
        "weight": 20, "purity_percent": 90, "gold_rate": 7000, "new_bill_amount": 100000})).json()
    assert r["balance_direction"] == "WE_PAY" and n(r["balance"]) == 26000


async def test_money_to_gold(client):
    r = (await client.post(f"{CALC}/money-to-gold", json={
        "amount": 103000, "gold_rate": 7000, "touch_percent": 92})).json()
    assert n(r["amount_before_gst"]) == 100000 and n(r["gst_amount"]) == 3000
    assert n(r["fine_weight"]) == 14.286                 # 100000 / 7000
    assert n(r["jewellery_weight"]) == 15.528            # 14.286 / 92%
    r = (await client.post(f"{CALC}/money-to-gold", json={"amount": 70000, "gold_rate": 7000, "gst_percent": 0})).json()
    assert n(r["fine_weight"]) == 10 and r["jewellery_weight"] is None


async def test_metal_account(client):
    r = (await client.post(f"{CALC}/metal-account", json={
        "owed_fine": 48.25, "gold_weight": 20, "gold_purity_percent": 99.5, "cash": 150000, "gold_rate": 7500})).json()
    assert n(r["gold_fine"]) == 19.9 and n(r["cash_fine"]) == 20
    assert n(r["balance_fine"]) == 8.35 and r["balance_direction"] == "SHOP_OWES"
    assert n(r["balance_rupees"]) == 62625
    r = (await client.post(f"{CALC}/metal-account", json={"owed_fine": 5, "cash": 75000, "gold_rate": 7500})).json()
    assert r["balance_direction"] == "WE_OWE" and n(r["balance_fine"]) == 5


async def test_calculator_needs_sign_in(anon):
    assert (await anon.post(f"{CALC}/gst", json={"amount": 100})).status_code == 401


# --------------------------------------------------------------- bills by wastage

async def test_bill_line_by_wastage_and_making(client, setup):  # noqa: F811
    # CH0001: 22K, net 10.2. 91.6 + 8 = 99.6 touch -> 10.159 fine; making 10.2 x 150 = 1530.
    lines = [{"code": "CH0001", "wastage_percent": 8, "making_per_gram": 150, "charges": 100}]
    q = (await client.post(f"{API}/quote", json=draft(None, lines))).json()
    line = q["lines"][0]
    assert line["touch_percent"] == 99.6 and line["fine_weight"] == 10.159
    assert line["charges"] == 1630.0                     # 1530 making + 100 typed
    assert line["amount"] == 10.159 * 7000 + 1630
    # Same price as typing the touch and the charges by hand.
    same = [{"code": "CH0001", "touch_percent": 99.6, "charges": 1630}]
    assert (await client.post(f"{API}/quote", json=draft(None, same))).json()["totals"] == q["totals"]


async def test_bill_line_touch_or_wastage_not_both(client, setup):  # noqa: F811
    lines = [{"code": "CH0001", "touch_percent": 92, "wastage_percent": 8}]
    assert (await client.post(f"{API}/quote", json=draft(None, lines))).status_code == 422
