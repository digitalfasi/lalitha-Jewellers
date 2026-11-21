import pytest

INV = "/api/v1/inventory"
COMBOS = "/api/v1/combos"
API = "/api/v1/billing"


@pytest.fixture
async def setup(client):
    """CH0001 (net 10.2, touch 92), CH0002 (net 8.5, no touch),
    PD0001 (net 13.7, touch 103), PD0002 (net 0.84, touch 103); one shop."""
    cats = {}
    for name, prefix in [("Chain", "CH"), ("Pendant", "PD")]:
        cats[prefix] = (await client.post(f"{INV}/categories", json={"name": name, "code_prefix": prefix})).json()["id"]
    for prefix, name, gross, stone, touch in [
        ("CH", "Rope chain", 10.2, 0, 92), ("CH", "Box chain", 8.5, 0, None),
        ("PD", "Dollar", 15.84, 2.14, 103), ("PD", "Mango", 1.02, 0.18, 103),
    ]:
        body = {"category_id": cats[prefix], "name": name, "purity": "22K", "gross_weight": gross, "stone_weight": stone}
        if touch:
            body["touch_percent"] = touch
        await client.post(f"{INV}/pieces", json=body)
    shop = (await client.post(f"{API}/shops", json={"name": "Lakshmi Jewellers", "city": "Chennai"})).json()
    return {"shop": shop}


def draft(shop_id, lines, **extra):
    return {"shop_id": shop_id, "gold_rate": 7000, "gst_percent": 3, "lines": lines, **extra}


async def status_of(client, code):
    return (await client.get(f"{INV}/pieces/by-code/{code}")).json()["status"]


# --------------------------------------------------------------------- shops

async def test_shop_crud_and_gstin(client):
    res = await client.post(f"{API}/shops", json={"name": "Sri Balaji", "gstin": "33abcde1234f1z5"})
    shop = res.json()
    assert shop["gstin"] == "33ABCDE1234F1Z5"
    assert (await client.post(f"{API}/shops", json={"name": "sri balaji"})).status_code == 409
    assert (await client.post(f"{API}/shops", json={"name": "X Shop", "gstin": "123"})).status_code == 422

    res = await client.patch(f"{API}/shops/{shop['id']}", json={"city": "Madurai", "gstin": ""})
    assert res.json()["city"] == "Madurai" and res.json()["gstin"] is None
    await client.patch(f"{API}/shops/{shop['id']}", json={"is_active": False})
    names = [s["name"] for s in (await client.get(f"{API}/shops")).json()]
    assert "Sri Balaji" not in names


# --------------------------------------------------------------------- maths

async def test_quote_arithmetic(client, setup):
    lines = [{"code": "CH0001", "charges": 500}, {"code": "PD0001", "charges": 300}]
    res = await client.post(f"{API}/quote", json=draft(None, lines))
    assert res.status_code == 200, res.text
    q = res.json()
    # 10.2 x 92% = 9.384 ; 13.7 x 103% = 14.111
    assert [l["fine_weight"] for l in q["lines"]] == [9.384, 14.111]
    assert q["lines"][0]["metal_amount"] == 65688.0  # 9.384 x 7000
    t = q["totals"]
    assert t["total_fine"] == 23.495
    assert t["metal_amount"] == 164465.0
    assert t["total_charges"] == 800.0
    assert t["subtotal"] == 165265.0
    assert t["gst_amount"] == 4957.95
    assert t["grand_total"] == 170223.0
    assert t["round_off"] == 0.05
    # A quote changes nothing.
    assert await status_of(client, "CH0001") == "IN_STOCK"


async def test_touch_needed_and_override(client, setup):
    res = await client.post(f"{API}/quote", json=draft(None, [{"code": "CH0002"}]))
    assert res.status_code == 422 and "no %" in res.json()["error"]["message"]
    res = await client.post(f"{API}/quote", json=draft(None, [{"code": "CH0002", "touch_percent": 91.6}]))
    assert res.json()["lines"][0]["fine_weight"] == 7.786  # 8.5 x 91.6%
    # A single piece shows the touch as entered, not one re-derived from the rounded fine.
    res = await client.post(f"{API}/quote", json=draft(None, [{"code": "PD0002"}]))
    line = res.json()["lines"][0]
    assert line["fine_weight"] == 0.865 and line["touch_percent"] == 103.0  # 0.84 x 103% = 0.8652


# --------------------------------------------------------------------- bills

async def test_bill_sells_pieces_and_numbers_count_up(client, setup):
    shop = setup["shop"]
    res = await client.post(f"{API}/bills", json=draft(shop["id"], [{"code": "CH0001"}]))
    assert res.status_code == 201, res.text
    bill = res.json()
    assert bill["bill_number"] == "INV-00001" and bill["status"] == "FINAL"
    assert bill["shop_name"] == "Lakshmi Jewellers"
    assert await status_of(client, "CH0001") == "SOLD"

    # Sold pieces cannot be billed again, nor edited in inventory.
    res = await client.post(f"{API}/bills", json=draft(shop["id"], [{"code": "CH0001"}]))
    assert res.status_code == 409
    second = (await client.post(f"{API}/bills", json=draft(shop["id"], [{"code": "PD0001"}]))).json()
    assert second["bill_number"] == "INV-00002"


async def test_bill_needs_shop_and_no_duplicates(client, setup):
    assert (await client.post(f"{API}/bills", json=draft(None, [{"code": "CH0001"}]))).status_code == 422
    res = await client.post(f"{API}/bills", json=draft(setup["shop"]["id"], [{"code": "CH0001"}, {"code": "ch0001"}]))
    assert res.status_code == 422 and "twice" in res.json()["error"]["message"]


async def test_combo_as_one_line(client, setup):
    await client.post(COMBOS, json={"piece_codes": ["CH0001", "PD0001"], "name": "Rope + Dollar"})
    res = await client.post(f"{API}/bills", json=draft(setup["shop"]["id"], [{"code": "CB0001", "charges": 800}]))
    assert res.status_code == 201, res.text
    bill = res.json()
    assert len(bill["lines"]) == 1
    line = bill["lines"][0]
    assert line["kind"] == "COMBO" and line["code"] == "CB0001"
    assert [p["item_code"] for p in line["pieces"]] == ["CH0001", "PD0001"]
    assert line["fine_weight"] == 23.495
    assert line["touch_percent"] == pytest.approx(98.305, abs=0.001)  # blended: 23.495 / 23.9
    assert bill["totals"]["grand_total"] == 170223.0

    combo = (await client.get(f"{COMBOS}/by-code/CB0001")).json()
    assert combo["status"] == "SOLD"
    assert await status_of(client, "PD0001") == "SOLD"
    # A sold combo is locked.
    assert (await client.post(f"{COMBOS}/{combo['id']}/swap", json={"out_code": "PD0001", "in_code": "PD0002"})).status_code == 409


async def test_combo_split_into_piece_lines(client, setup):
    await client.post(COMBOS, json={"piece_codes": ["CH0001", "PD0001"]})
    shop = setup["shop"]["id"]

    # Half a combo is refused.
    res = await client.post(f"{API}/bills", json=draft(shop, [{"code": "PD0001"}]))
    assert res.status_code == 422
    assert "CB0001" in res.json()["error"]["message"] and "CH0001" in res.json()["error"]["message"]

    # Both pieces as separate lines works, and sells the combo.
    res = await client.post(f"{API}/bills", json=draft(shop, [{"code": "CH0001", "charges": 500}, {"code": "PD0001", "charges": 300}]))
    assert res.status_code == 201, res.text
    lines = res.json()["lines"]
    assert [(l["kind"], l["code"], l["combo_code"]) for l in lines] == [("PIECE", "CH0001", "CB0001"), ("PIECE", "PD0001", "CB0001")]
    assert (await client.get(f"{COMBOS}/by-code/CB0001")).json()["status"] == "SOLD"


async def test_piece_and_its_combo_both_listed_is_a_duplicate(client, setup):
    await client.post(COMBOS, json={"piece_codes": ["CH0001", "PD0001"]})
    res = await client.post(f"{API}/bills", json=draft(setup["shop"]["id"], [{"code": "CB0001"}, {"code": "CH0001"}]))
    assert res.status_code == 422 and "twice" in res.json()["error"]["message"]


async def test_cancel_puts_stock_back(client, setup):
    await client.post(COMBOS, json={"piece_codes": ["CH0001", "PD0001"]})
    bill = (await client.post(f"{API}/bills", json=draft(setup["shop"]["id"], [{"code": "CB0001"}, {"code": "PD0002"}]))).json()

    res = await client.post(f"{API}/bills/{bill['id']}/cancel", json={"reason": "Shop returned the goods"})
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "CANCELLED" and res.json()["cancel_reason"] == "Shop returned the goods"
    for code in ("CH0001", "PD0001", "PD0002"):
        assert await status_of(client, code) == "IN_STOCK"
    assert (await client.get(f"{COMBOS}/by-code/CB0001")).json()["status"] == "ACTIVE"
    assert (await client.post(f"{API}/bills/{bill['id']}/cancel", json={"reason": "again"})).status_code == 409

    # The same stock can be billed again; the cancelled bill keeps its number.
    again = (await client.post(f"{API}/bills", json=draft(setup["shop"]["id"], [{"code": "CB0001"}]))).json()
    assert again["bill_number"] == "INV-00002"


async def test_list_bills_filters(client, setup):
    shop = setup["shop"]["id"]
    a = (await client.post(f"{API}/bills", json=draft(shop, [{"code": "CH0001"}]))).json()
    await client.post(f"{API}/bills", json=draft(shop, [{"code": "PD0001"}]))
    await client.post(f"{API}/bills/{a['id']}/cancel", json={"reason": "Mistake"})

    res = (await client.get(f"{API}/bills")).json()
    assert res["total"] == 2 and res["items"][0]["bill_number"] == "INV-00002"
    assert (await client.get(f"{API}/bills", params={"status": "FINAL"})).json()["total"] == 1
    assert (await client.get(f"{API}/bills", params={"q": "lakshmi"})).json()["total"] == 2
    assert (await client.get(f"{API}/bills", params={"q": "00001"})).json()["items"][0]["status"] == "CANCELLED"
