"""Daily gold rate, business details, GST split, HSN / HUID, PDF, who-did-what."""
from datetime import date

from app.modules.billing.words import rupees_in_words

INV = "/api/v1/inventory"
API = "/api/v1/billing"
TODAY = date.today().isoformat()


async def _stock(client):
    cat = (await client.post(f"{INV}/categories", json={"name": "Chain", "code_prefix": "CH", "hsn_code": "711319"})).json()
    piece = (await client.post(f"{INV}/pieces", json={"category_id": cat["id"], "name": "Rope chain", "purity": "22K",
                                                      "gross_weight": 10, "touch_percent": 92, "huid": "ab12cd"})).json()
    assert piece["huid"] == "AB12CD"
    return piece


async def test_bill_uses_the_days_rate(client):
    await _stock(client)
    res = await client.post(f"{API}/quote", json={"bill_date": TODAY, "lines": [{"code": "CH0001"}]})
    assert res.status_code == 422 and "No gold rate is set" in res.json()["error"]["message"]

    await client.put(f"/api/v1/rates/{TODAY}", json={"rate": 7000})
    today = (await client.get("/api/v1/rates/today", params={"on": TODAY})).json()
    assert today["today"]["rate"] == 7000 and today["today"]["set_by_name"] == "Test Owner"

    q = (await client.post(f"{API}/quote", json={"bill_date": TODAY, "lines": [{"code": "CH0001"}]})).json()
    assert q["gold_rate"] == 7000 and q["gold_rate_from_day"] is True
    assert q["lines"][0]["metal_amount"] == 64400.0  # 9.2 g fine x 7000
    # A rate typed on the bill wins.
    q = (await client.post(f"{API}/quote", json={"gold_rate": 7100, "lines": [{"code": "CH0001"}]})).json()
    assert q["gold_rate"] == 7100 and q["gold_rate_from_day"] is False


async def test_gst_split_by_state_and_snapshots(client):
    await _stock(client)
    biz = await client.put("/api/v1/business", json={
        "name": "Sri Durga Wholesale", "gstin": "33aabcd1234e1z5", "address": "1 NSC Bose Road", "city": "Chennai",
        "pan": "AABCD1234E", "bank_name": "SBI", "bank_account": "123456789", "bank_ifsc": "sbin0001234"})
    assert biz.status_code == 200, biz.text
    assert biz.json()["state_code"] == "33" and biz.json()["state_name"] == "Tamil Nadu"

    local = (await client.post(f"{API}/shops", json={"name": "Local Shop", "gstin": "33AAAAA1111A1Z1"})).json()
    other = (await client.post(f"{API}/shops", json={"name": "Bangalore Shop", "gstin": "29AAAAA2222A1Z2"})).json()
    assert local["state_code"] == "33" and other["state_name"] == "Karnataka"

    base = {"gold_rate": 7000, "gst_percent": 3, "lines": [{"code": "CH0001", "charges": 600}]}
    intra = (await client.post(f"{API}/quote", json={**base, "shop_id": local["id"]})).json()["totals"]
    assert intra["tax_type"] == "INTRA"
    assert intra["cgst_amount"] + intra["sgst_amount"] == intra["gst_amount"] and intra["igst_amount"] == 0
    assert intra["cgst_amount"] == 975.0  # 3% of 65,000 = 1,950, half each

    bill = (await client.post(f"{API}/bills", json={**base, "shop_id": other["id"]})).json()
    t = bill["totals"]
    assert t["tax_type"] == "INTER" and t["igst_amount"] == 1950.0 and t["cgst_amount"] == 0
    assert bill["seller_name"] == "Sri Durga Wholesale" and bill["seller_gstin"] == "33AABCD1234E1Z5"
    assert bill["shop_state_name"] == "Karnataka"
    assert bill["lines"][0]["hsn_code"] == "711319"
    assert bill["lines"][0]["pieces"][0]["huid"] == "AB12CD"
    assert bill["created_by_name"] == "Test Owner"
    assert bill["amount_in_words"] == "Rupees Sixty Six Thousand Nine Hundred Fifty Only"

    # Editing the business later doesn't change the saved bill.
    await client.put("/api/v1/business", json={"name": "Renamed Co"})
    assert (await client.get(f"{API}/bills/{bill['id']}")).json()["seller_name"] == "Sri Durga Wholesale"

    pdf = await client.get(f"{API}/bills/{bill['id']}/pdf")
    assert pdf.status_code == 200 and pdf.headers["content-type"] == "application/pdf"
    assert pdf.content[:4] == b"%PDF"

    # Email is off in tests: a clear message, not a crash.
    res = await client.post(f"{API}/bills/{bill['id']}/email", json={"to": "shop@example.com"})
    assert res.status_code == 422 and "isn't set up" in res.json()["error"]["message"]

    res = await client.post(f"{API}/bills/{bill['id']}/cancel", json={"reason": "Wrong shop"})
    assert res.json()["cancelled_by_name"] == "Test Owner"
    hist = (await client.get(f"{API}/piece-bills/CH0001")).json()
    assert hist[0]["bill_number"] == bill["bill_number"] and hist[0]["status"] == "CANCELLED"


def test_amount_in_words():
    assert rupees_in_words(170223) == "Rupees One Lakh Seventy Thousand Two Hundred Twenty Three Only"
    assert rupees_in_words(12500000.5) == "Rupees One Crore Twenty Five Lakh and Fifty Paise Only"
    assert rupees_in_words(0) == "Rupees Zero Only"


async def test_business_validation(client):
    res = await client.put("/api/v1/business", json={"name": "X Gold", "bank_ifsc": "BAD"})
    assert res.status_code == 422
    res = await client.put("/api/v1/business", json={"name": "X Gold", "state_code": "99"})
    assert res.status_code == 422
