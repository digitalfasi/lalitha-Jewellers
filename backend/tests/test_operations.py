"""Lots and karigars, bulk entry, HUID, photos, stock audit."""
import io

from PIL import Image

INV = "/api/v1/inventory"
AUD = "/api/v1/audits"


async def _cats(client):
    ch = (await client.post(f"{INV}/categories", json={"name": "Chain", "code_prefix": "CH"})).json()
    pd = (await client.post(f"{INV}/categories", json={"name": "Pendant", "code_prefix": "PD"})).json()
    return ch["id"], pd["id"]


def _row(cat, name="Rope chain", gross=10, **extra):
    return {"category_id": cat, "name": name, "purity": "22K", "gross_weight": gross, "touch_percent": 92, **extra}


async def test_lot_and_bulk_entry(client):
    ch, pd = await _cats(client)
    k = (await client.post(f"{INV}/karigars", json={"name": "Kumar Works", "city": "Coimbatore"})).json()
    lot = (await client.post(f"{INV}/lots", json={"karigar_id": k["id"], "remarks": "Diwali lot"})).json()
    assert lot["lot_no"] == "LOT-0001"

    res = await client.post(f"{INV}/pieces/bulk", json={"lot_id": lot["id"], "pieces": [
        _row(ch), _row(ch, gross=12, huid="HU0001"), _row(pd, "Lakshmi pendant", 4)]})
    assert res.status_code == 201, res.text
    items = res.json()["items"]
    assert [p["item_code"] for p in items] == ["CH0001", "CH0002", "PD0001"]
    assert items[0]["lot_no"] == "LOT-0001" and items[0]["karigar_name"] == "Kumar Works"
    assert items[0]["created_by_name"] == "Test Owner"

    lot = (await client.get(f"{INV}/lots/{lot['id']}")).json()
    assert lot["piece_count"] == 3 and lot["total_gross"] == 26.0
    assert (await client.get(f"{INV}/pieces", params={"karigar_id": k["id"]})).json()["total"] == 3


async def test_bulk_is_all_or_nothing(client):
    ch, _ = await _cats(client)
    res = await client.post(f"{INV}/pieces/bulk", json={"pieces": [_row(ch), _row(ch, gross=1, stone_weight=2)]})
    assert res.status_code == 422 and res.json()["error"]["message"].startswith("Row 2:")
    assert (await client.get(f"{INV}/pieces")).json()["total"] == 0
    # Same HUID twice in one batch.
    res = await client.post(f"{INV}/pieces/bulk", json={"pieces": [_row(ch, huid="AAA111"), _row(ch, huid="aaa111")]})
    assert res.status_code == 422 and "also on row 1" in res.json()["error"]["message"]
    # Codes weren't used up by the failed batches... only by saved ones.
    first = (await client.post(f"{INV}/pieces", json=_row(ch))).json()
    assert first["item_code"] == "CH0001"


async def test_huid_unique(client):
    ch, _ = await _cats(client)
    await client.post(f"{INV}/pieces", json=_row(ch, huid="XY1234"))
    res = await client.post(f"{INV}/pieces", json=_row(ch, huid="xy1234"))
    assert res.status_code == 409 and "CH0001" in res.json()["error"]["message"]
    assert (await client.post(f"{INV}/pieces", json=_row(ch, huid="12345"))).status_code == 422
    assert (await client.get(f"{INV}/pieces", params={"q": "xy12"})).json()["total"] == 1


async def test_piece_photo(client):
    ch, _ = await _cats(client)
    piece = (await client.post(f"{INV}/pieces", json=_row(ch))).json()
    buf = io.BytesIO()
    Image.new("RGB", (2400, 1200), "gold").save(buf, "JPEG")
    res = await client.post(f"{INV}/pieces/{piece['id']}/photo", files={"file": ("p.jpg", buf.getvalue(), "image/jpeg")})
    assert res.status_code == 200, res.text
    url = res.json()["photo_url"]
    assert url.startswith("/uploads/pieces/") and url.endswith(".jpg")
    img = await client.get(url)
    assert img.status_code == 200 and max(Image.open(io.BytesIO(img.content)).size) == 1600  # shrunk

    res = await client.post(f"{INV}/pieces/{piece['id']}/photo", files={"file": ("x.jpg", b"not an image", "image/jpeg")})
    assert res.status_code == 422
    res = await client.delete(f"{INV}/pieces/{piece['id']}/photo")
    assert res.json()["photo_url"] is None
    assert (await client.get(url)).status_code == 404


async def test_stock_audit(client):
    ch, pd = await _cats(client)
    for row in (_row(ch), _row(ch), _row(pd, "Om", 2), _row(pd, "Heart", 3)):
        await client.post(f"{INV}/pieces", json=row)
    await client.post("/api/v1/combos", json={"piece_codes": ["CH0002", "PD0002"]})
    # PD0001 is retired, so it should not be on the shelf.
    pd1 = (await client.get(f"{INV}/pieces/by-code/PD0001")).json()
    await client.patch(f"{INV}/pieces/{pd1['id']}", json={"status": "INACTIVE"})

    audit = (await client.post(AUD, json={"name": "Weekly count"})).json()
    assert audit["audit_no"] == "AUD-0001" and audit["expected"] == 3

    r = (await client.post(f"{AUD}/{audit['id']}/scan", json={"code": "cb0001"})).json()
    assert r["ok"] and r["found"] == 2  # a combo tag counts both its pieces
    r = (await client.post(f"{AUD}/{audit['id']}/scan", json={"code": "CH0002"})).json()
    assert r["found"] == 2 and "already counted" in r["message"]
    r = (await client.post(f"{AUD}/{audit['id']}/scan", json={"code": "PD0001"})).json()
    assert not r["ok"] and r["scans"][0]["result"] == "NOT_IN_STOCK"
    r = (await client.post(f"{AUD}/{audit['id']}/scan", json={"code": "ZZ9999"})).json()
    assert r["scans"][0]["result"] == "UNKNOWN"

    report = (await client.get(f"{AUD}/{audit['id']}")).json()
    assert [m["item_code"] for m in report["missing"]] == ["CH0001"]
    assert {p["result"] for p in report["problems"]} == {"NOT_IN_STOCK", "UNKNOWN"}

    closed = (await client.post(f"{AUD}/{audit['id']}/close")).json()
    assert closed["status"] == "CLOSED" and closed["closed_by_name"] == "Test Owner"
    assert closed["expected"] == 3 and closed["found"] == 2
    # The result is frozen: later stock changes don't alter it.
    await client.post(f"{INV}/pieces", json=_row(ch))
    again = (await client.get(f"{AUD}/{audit['id']}")).json()
    assert again["expected"] == 3 and [m["item_code"] for m in again["missing"]] == ["CH0001"]
    assert (await client.post(f"{AUD}/{audit['id']}/scan", json={"code": "CH0001"})).status_code == 409


async def test_audit_by_category(client):
    ch, pd = await _cats(client)
    await client.post(f"{INV}/pieces", json=_row(ch))
    await client.post(f"{INV}/pieces", json=_row(pd, "Om", 2))
    audit = (await client.post(AUD, json={"category_id": pd})).json()
    assert audit["expected"] == 1 and audit["category_name"] == "Pendant"
    r = (await client.post(f"{AUD}/{audit['id']}/scan", json={"code": "CH0001"})).json()
    assert r["scans"][0]["result"] == "OTHER_CATEGORY"
