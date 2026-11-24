"""The trade's own slip: gross - less = net, net x % = fine, fine x rate, stones by less weight, HUID per piece."""
from tests.test_billing import draft, setup  # noqa: F401  (fixture)

INV = "/api/v1/inventory"
API = "/api/v1/billing"


async def test_stone_and_huid_charges_from_settings(client, setup):  # noqa: F811
    res = await client.put("/api/v1/business/charges", json={"stone_rate": 515, "huid_rate": 77, "default_hsn": "7113"})
    assert res.status_code == 200 and res.json()["stone_rate"] == 515
    pid = (await client.get(f"{INV}/pieces/by-code/PD0001")).json()["id"]
    await client.patch(f"{INV}/pieces/{pid}", json={"huid": "AB12CD"})

    q = (await client.post(f"{API}/quote", json=draft(setup["shop"]["id"], [{"code": "PD0001"}], gst_percent=0))).json()
    line, t = q["lines"][0], q["totals"]
    assert line["net_weight"] == 13.7 and line["fine_weight"] == 14.111   # 13.70 x 103%
    assert line["stone_amount"] == 1102.10                                # 2.14 g less x Rs 515
    assert t["huid_pieces"] == 1 and t["huid_amount"] == 77
    assert t["subtotal"] == round(14.111 * 7000 + 1102.10 + 77, 2)

    # The owner can change both on this bill only.
    q = (await client.post(f"{API}/quote", json=draft(setup["shop"]["id"], [{"code": "PD0001"}],
                                                    stone_rate=0, huid_rate=45))).json()
    assert q["lines"][0]["stone_amount"] == 0 and q["totals"]["huid_amount"] == 45

    bill = (await client.post(f"{API}/bills", json=draft(setup["shop"]["id"], [{"code": "PD0001"}]))).json()
    assert bill["totals"]["stone_amount"] == 1102.10 and bill["totals"]["huid_rate"] == 77
    assert bill["lines"][0]["stone_amount"] == 1102.10


async def test_sub_category_percent_fills_in(client):
    cat = (await client.post(f"{INV}/categories", json={"name": "Getti stones", "code_prefix": "GS"})).json()
    sub = (await client.post(f"{INV}/designs", json={"category_id": cat["id"], "name": "Dollar",
                                                     "default_percent": 103})).json()
    assert sub["default_percent"] == 103
    piece = (await client.post(f"{INV}/pieces", json={"category_id": cat["id"], "design_id": sub["id"],
                                                      "purity": "22K", "gross_weight": 15.84, "stone_weight": 2.14})).json()
    assert piece["name"] == "Dollar" and piece["touch_percent"] == 103 and piece["net_weight"] == 13.7


async def test_rates_for_each_purity(client):
    r = (await client.put("/api/v1/rates/2026-11-21", json={"rate": 15180, "purity_rates": {"18K": 11000}})).json()
    assert r["purity_rates"]["24K"] == 15180
    assert r["purity_rates"]["22K"] == round(15180 * 0.916)
    assert r["purity_rates"]["18K"] == 11000 and r["custom_purities"] == ["18K"]


async def test_huid_pieces_typed_drafts_and_calc_items(client, setup):  # noqa: F811
    await client.put("/api/v1/business/charges", json={"huid_rate": 77})
    q = (await client.post(f"{API}/quote", json=draft(setup["shop"]["id"], [{"code": "PD0001"}], huid_pieces=30))).json()
    assert q["totals"]["huid_pieces"] == 30 and q["totals"]["huid_amount"] == 2310
    d = (await client.put(f"{API}/drafts/d1", json={"data": {"lines": ["PD0001"]}, "shop_name": "X", "line_count": 1})).json()
    assert d["line_count"] == 1 and [x["id"] for x in (await client.get(f"{API}/drafts")).json()] == ["d1"]
    assert (await client.delete(f"{API}/drafts/d1")).status_code == 204
    it = await client.put("/api/v1/calc/items/s1", json={"kind": "SHEET", "title": "Getti 20 Oct", "data": {"sheets": []}})
    assert it.status_code == 200
    assert (await client.get("/api/v1/calc/items?kind=SHEET&q=getti")).json()[0]["title"] == "Getti 20 Oct"
    assert (await client.get("/api/v1/calc/items/s1")).json()["data"] == {"sheets": []}
    f = (await client.post("/api/v1/calc/formulas", json={"name": "Stone", "formula": "A*515", "folder": "Stones"})).json()
    assert f["folder"] == "Stones"
