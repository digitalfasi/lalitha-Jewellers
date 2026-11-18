"""Who did what, suggested names, suggestions, templates, combo photos."""
import io

from PIL import Image

from tests.conftest import login_as

INV = "/api/v1/inventory"
COMBOS = "/api/v1/combos"


async def _stock(client):
    ids = {}
    for name, prefix in [("Chain", "CH"), ("Pendant", "PD"), ("Ring", "RG")]:
        ids[prefix] = (await client.post(f"{INV}/categories", json={"name": name, "code_prefix": prefix})).json()["id"]
    designs = {}
    for prefix, dn in [("CH", "Rope"), ("PD", "Lakshmi"), ("PD", "Om"), ("RG", "Band")]:
        designs[dn] = (await client.post(f"{INV}/designs", json={"category_id": ids[prefix], "name": dn})).json()["id"]
    rows = [("CH", "Rope", "22K"), ("CH", "Rope", "22K"), ("PD", "Lakshmi", "22K"), ("PD", "Lakshmi", "22K"),
            ("PD", "Om", "22K"), ("PD", "Om", "18K"), ("RG", "Band", "22K")]
    for prefix, dn, purity in rows:
        await client.post(f"{INV}/pieces", json={"category_id": ids[prefix], "design_id": designs[dn], "name": dn,
                                                 "purity": purity, "gross_weight": 5, "touch_percent": 92})
    return ids


async def test_history_records_who(anon, client):
    await _stock(client)
    staff = await login_as(anon, client, "ravi", "STAFF")
    async with staff:
        combo = (await staff.post(COMBOS, json={"piece_codes": ["CH0001", "PD0001"]})).json()
        await staff.post(f"{COMBOS}/{combo['id']}/swap", json={"out_code": "PD0001", "in_code": "PD0003"})
        # Dissolving needs a manager.
        assert (await staff.post(f"{COMBOS}/{combo['id']}/dissolve", json={})).status_code == 403
    events = (await client.get(f"{COMBOS}/{combo['id']}/history")).json()
    assert [e["by_name"] for e in events] == ["Ravi", "Ravi"]


async def test_suggested_name_follows_pieces(client):
    await _stock(client)
    combo = (await client.post(COMBOS, json={"piece_codes": ["CH0001", "PD0001"], "name": "Rope + Lakshmi"})).json()
    assert combo["suggested_name"] == "Rope chain + Lakshmi pendant"
    combo = (await client.post(f"{COMBOS}/{combo['id']}/swap", json={"out_code": "PD0001", "in_code": "PD0003"})).json()
    assert combo["name"] == "Rope + Lakshmi" and combo["suggested_name"] == "Rope chain + Om pendant"


async def test_suggestions_learn_from_past_sets(client):
    ids = await _stock(client)
    # Rope has been paired with Lakshmi before (then dissolved, freeing the pieces).
    past = (await client.post(COMBOS, json={"piece_codes": ["CH0002", "PD0002"]})).json()
    await client.post(f"{COMBOS}/{past['id']}/dissolve", json={})

    res = (await client.get(f"{COMBOS}/suggestions", params={"with_codes": "CH0001", "category_id": ids["PD"]})).json()
    codes = [s["item_code"] for s in res]
    assert codes[0] in ("PD0001", "PD0002")              # Lakshmi: same purity + paired before
    assert codes.index("PD0003") < codes.index("PD0004")  # 22K Om beats 18K Om
    top = res[0]
    assert "Same purity (22K)" in top["reasons"] and any("Paired with Rope" in r for r in top["reasons"])
    assert all(s["category_name"] == "Pendant" for s in res)

    # No category given: the usual partner category ranks above an unrelated one.
    res = (await client.get(f"{COMBOS}/suggestions", params={"with_codes": "CH0001", "limit": 20})).json()
    ring = next(s for s in res if s["item_code"] == "RG0001")
    lak = next(s for s in res if s["item_code"] == "PD0001")
    assert lak["score"] > ring["score"]


async def test_templates(client):
    ids = await _stock(client)
    t = await client.post(f"{COMBOS}/templates", json={"name": "Chain + Pendant", "slots": [
        {"category_id": ids["CH"]}, {"category_id": ids["PD"], "label": "Pendant"}]})
    assert t.status_code == 201, t.text
    assert [s["category_name"] for s in t.json()["slots"]] == ["Chain", "Pendant"]
    assert (await client.post(f"{COMBOS}/templates", json={"name": "chain + pendant", "slots": [
        {"category_id": ids["CH"]}, {"category_id": ids["PD"]}]})).status_code == 409
    assert (await client.post(f"{COMBOS}/templates", json={"name": "One slot", "slots": [
        {"category_id": ids["CH"]}]})).status_code == 422
    assert len((await client.get(f"{COMBOS}/templates")).json()) == 1


async def test_combo_photo(client):
    await _stock(client)
    combo = (await client.post(COMBOS, json={"piece_codes": ["CH0001", "PD0001"]})).json()
    buf = io.BytesIO()
    Image.new("RGBA", (300, 300), (200, 150, 0, 128)).save(buf, "PNG")
    res = await client.post(f"{COMBOS}/{combo['id']}/photo", files={"file": ("c.png", buf.getvalue(), "image/png")})
    assert res.status_code == 200 and res.json()["photo_url"].endswith(".png")
    label = (await client.get("/api/v1/tags/resolve/CB0001")).json()
    assert label["photo_url"] == res.json()["photo_url"]
