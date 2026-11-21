"""Quick quote, estimates, shop deals, gold accounts, profit and karigar check."""
from tests.conftest import login_as
from tests.test_billing import draft, setup  # noqa: F401  (fixture)

INV = "/api/v1/inventory"
COMBOS = "/api/v1/combos"
API = "/api/v1/billing"


async def _combo(client, codes):
    res = await client.post(COMBOS, json={"piece_codes": codes})
    assert res.status_code == 201, res.text
    return res.json()


async def test_quick_quote_prices_what_it_can(client, setup):  # noqa: F811
    combo = await _combo(client, ["CH0001", "PD0002"])
    body = {"gold_rate": 7000, "lines": [
        {"code": "CH0001"},                         # in a set -> the whole set
        {"code": "CH0002"},                         # no touch -> a problem, not a failure
        {"code": "PD0001"},
        {"code": "ZZ9999"},                         # unknown
    ]}
    q = (await client.post(f"{API}/quick-quote", json=body)).json()
    assert q["swapped"] == {"CH0001": combo["combo_code"]}
    assert [l["code"] for l in q["lines"]] == [combo["combo_code"], "PD0001"]
    assert sorted(p["code"] for p in q["problems"]) == ["CH0002", "ZZ9999"]
    assert q["totals"]["total_fine"] == round(9.384 + 0.865 + 14.111, 3)
    # A touch typed for the problem line fixes it.
    body["lines"][1]["touch_percent"] = 91.6
    q = (await client.post(f"{API}/quick-quote", json=body)).json()
    assert [p["code"] for p in q["problems"]] == ["ZZ9999"]


async def test_estimate_then_bill(client, setup):  # noqa: F811
    shop = setup["shop"]
    est = (await client.post(f"{API}/estimates", json={
        "shop_id": shop["id"], "gold_rate": 7000, "lines": [{"code": "CH0001", "charges": 500}]})).json()
    assert est["estimate_number"] == "EST-00001" and est["status"] == "OPEN" and est["is_valid"]
    same = await client.post(f"{API}/quote", json=draft(shop["id"], [{"code": "CH0001", "charges": 500}]))
    assert est["grand_total"] == same.json()["totals"]["grand_total"]
    # The piece is not reserved by an estimate.
    assert (await client.get(f"{INV}/pieces/by-code/CH0001")).json()["status"] == "IN_STOCK"

    bill = await client.post(f"{API}/bills", json=draft(shop["id"], est["lines"], estimate_id=est["id"]))
    assert bill.status_code == 201, bill.text
    est = (await client.get(f"{API}/estimates/{est['id']}")).json()
    assert est["status"] == "BILLED" and est["bill_number"] == bill.json()["bill_number"]
    assert [e["estimate_number"] for e in (await client.get(f"{API}/estimates?status=BILLED")).json()] == ["EST-00001"]


async def test_shop_deal_saved(client):
    shop = (await client.post(f"{API}/shops", json={
        "name": "Deal Shop", "price_mode": "WASTAGE", "deal_wastage": 0, "deal_making": 120, "settles_in_gold": True,
    })).json()
    assert shop["price_mode"] == "WASTAGE" and shop["deal_wastage"] == 0 and shop["deal_making"] == 120
    assert shop["settles_in_gold"] is True and shop["gold_balance"] == 0
    shop = (await client.patch(f"{API}/shops/{shop['id']}", json={"price_mode": None, "settles_in_gold": False})).json()
    assert shop["price_mode"] is None and shop["settles_in_gold"] is False and shop["deal_making"] == 120


async def test_gold_account(client, setup):  # noqa: F811
    shop = setup["shop"]
    await client.patch(f"{API}/shops/{shop['id']}", json={"settles_in_gold": True})
    bill = (await client.post(f"{API}/bills", json=draft(shop["id"], [{"code": "CH0001"}]))).json()   # 9.384 fine
    acc = (await client.get(f"{API}/shops/{shop['id']}/gold")).json()
    assert acc["balance"] == 9.384 and acc["entries"][0]["bill_number"] == bill["bill_number"]

    acc = (await client.post(f"{API}/shops/{shop['id']}/gold", json={
        "kind": "GOLD", "gold_weight": 5, "purity_percent": 99.5})).json()                   # -4.975
    acc = (await client.post(f"{API}/shops/{shop['id']}/gold", json={
        "kind": "CASH", "cash": 14000, "rate": 7000})).json()                                # -2.000
    assert acc["balance"] == 2.409
    assert [e["balance"] for e in acc["entries"]] == [2.409, 4.409, 9.384]                   # newest first

    # Cancelling the bill takes its gold back off.
    await client.post(f"{API}/bills/{bill['id']}/cancel", json={"reason": "Wrong shop"})
    acc = (await client.get(f"{API}/shops/{shop['id']}/gold")).json()
    assert acc["balance"] == round(2.409 - 9.384, 3)
    shops = (await client.get(f"{API}/shops")).json()
    assert shops[0]["gold_balance"] == acc["balance"]

    # A hand-made entry can be removed, a bill's cannot.
    cash = next(e for e in acc["entries"] if e["kind"] == "CASH")
    bill_entry = next(e for e in acc["entries"] if e["kind"] == "BILL")
    assert (await client.delete(f"{API}/shops/{shop['id']}/gold/{cash['id']}")).status_code == 200
    assert (await client.delete(f"{API}/shops/{shop['id']}/gold/{bill_entry['id']}")).status_code == 409


async def test_shop_not_on_gold_gets_no_entries(client, setup):  # noqa: F811
    shop = setup["shop"]
    await client.post(f"{API}/bills", json=draft(shop["id"], [{"code": "CH0001"}]))
    assert (await client.get(f"{API}/shops/{shop['id']}/gold")).json()["entries"] == []


async def test_profit_report(client, setup):  # noqa: F811
    piece = (await client.get(f"{INV}/pieces/by-code/CH0001")).json()
    await client.patch(f"{INV}/pieces/{piece['id']}", json={"cost_touch": 90})
    await client.post(f"{API}/bills", json=draft(setup["shop"]["id"], [{"code": "CH0001", "charges": 500},
                                                                       {"code": "PD0001"}]))
    r = (await client.get("/api/v1/reports/profit")).json()
    # CH0001: sold 9.384 (92%), cost 9.180 (90%) -> 0.204 g x 7000. PD0001 has no cost touch.
    assert r["sold_fine"] == 9.384 and r["cost_fine"] == 9.18 and r["margin_fine"] == 0.204
    assert r["margin_value"] == 1428.0 and r["charges"] == 500 and r["pieces_without_cost"] == 1


async def test_profit_is_for_managers(client, anon):
    staff = await login_as(anon, client, "ravi", "STAFF")
    assert (await staff.get("/api/v1/reports/profit")).status_code == 403


async def test_karigar_check_on_lot(client, setup):  # noqa: F811
    lot = (await client.post(f"{INV}/lots", json={"gold_given_fine": 10})).json()
    cat = (await client.get(f"{INV}/categories")).json()[0]["id"]
    await client.post(f"{INV}/pieces", json={"category_id": cat, "name": "Lot chain", "purity": "22K",
                                            "gross_weight": 10, "cost_touch": 92, "lot_id": lot["id"]})
    lot = (await client.get(f"{INV}/lots/{lot['id']}")).json()
    assert lot["returned_fine"] == 9.2 and lot["karigar_balance"] == 0.8


async def test_calc_extras(client):
    r = (await client.post("/api/v1/calc/fine", json={
        "gross_weight": 10, "touch_percent": 92, "touch_discount": 0.5, "gold_rate": 7000,
        "stone_rate": 2000, "stone_qty": 1.5, "hallmark_pieces": 2, "hallmark_rate": 45, "discount_amount": 90,
        "gst_percent": 0})).json()
    assert float(r["fine_weight"]) == 9.15                       # 91.5 touch
    assert float(r["stone_amount"]) == 3000 and float(r["hallmark_amount"]) == 90
    assert float(r["subtotal"]) == 9.15 * 7000 + 3000 + 90 - 90
