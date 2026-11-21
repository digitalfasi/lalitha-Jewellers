INV = "/api/v1/inventory"
API = "/api/v1/tags"


async def _stock(client):
    ids = {}
    for name, prefix in [("Chain", "CH"), ("Pendant", "PD")]:
        ids[prefix] = (await client.post(f"{INV}/categories", json={"name": name, "code_prefix": prefix})).json()["id"]
    for prefix, name, gross, stone, purity in [
        ("CH", "Rope chain", 10.2, 0, "22K"), ("PD", "Dollar", 15.84, 2.14, "22K"), ("PD", "Mango", 1.02, 0.18, "18K"),
    ]:
        await client.post(f"{INV}/pieces", json={
            "category_id": ids[prefix], "name": name, "purity": purity, "gross_weight": gross, "stone_weight": stone,
        })


async def test_resolve_piece_and_combo(client):
    await _stock(client)
    await client.post("/api/v1/combos", json={"piece_codes": ["CH0001", "PD0002"]})

    piece = (await client.get(f"{API}/resolve/ pd0001 ")).json()
    assert piece["kind"] == "PIECE" and piece["code"] == "PD0001"
    assert piece["net_weight"] == 13.7 and piece["printable"] is True and piece["combo_code"] is None

    chain = (await client.get(f"{API}/resolve/CH0001")).json()
    assert chain["combo_code"] == "CB0001"

    combo = (await client.get(f"{API}/resolve/cb0001")).json()
    assert combo["kind"] == "COMBO"
    assert combo["title"] == "Chain + Pendant"
    assert combo["piece_codes"] == ["CH0001", "PD0002"]
    assert combo["purity"] == "22K / 18K"
    assert combo["gross_weight"] == 11.22 and combo["net_weight"] == 11.04

    assert (await client.get(f"{API}/resolve/ZZ0001")).status_code == 404
    assert (await client.get(f"{API}/resolve/CB0099")).status_code == 404


async def test_label_batch_keeps_order_drops_repeats_lists_missing(client):
    await _stock(client)
    res = await client.post(f"{API}/labels", json={"codes": ["pd0002", "CH0001", "PD0002", "XX1", " "]})
    body = res.json()
    assert [l["code"] for l in body["labels"]] == ["PD0002", "CH0001"]
    assert body["missing"] == ["XX1"]


async def test_label_not_printable_once_stock_has_left(client):
    await _stock(client)
    piece = (await client.get(f"{INV}/pieces/by-code/CH0001")).json()
    await client.patch(f"{INV}/pieces/{piece['id']}", json={"status": "INACTIVE"})
    assert (await client.get(f"{API}/resolve/CH0001")).json()["printable"] is False

    combo = (await client.post("/api/v1/combos", json={"piece_codes": ["PD0001", "PD0002"]})).json()
    await client.post(f"/api/v1/combos/{combo['id']}/dissolve", json={})
    label = (await client.get(f"{API}/resolve/CB0001")).json()
    assert label["printable"] is False and label["piece_codes"] == []


async def test_partner_change_flags_the_whole_combo(client):
    """CH0001 + PD0001 printed; PD0002 joins, PD0001 leaves: CH0001's back is stale too."""
    await _stock(client)
    combo = (await client.post("/api/v1/combos", json={"piece_codes": ["CH0001", "PD0001"]})).json()
    await client.post(f"{API}/printed", json={"codes": ["CH0001", "PD0001", "PD0002"]})
    assert (await client.get(f"{API}/pending")).json() == []

    await client.post(f"/api/v1/combos/{combo['id']}/link", json={"piece_code": "PD0002"})
    await client.post(f"/api/v1/combos/{combo['id']}/unlink", json={"piece_code": "PD0001"})
    pending = {p["code"]: p for p in (await client.get(f"{API}/pending")).json()}
    assert set(pending) == {"CH0001", "PD0001", "PD0002"}
    assert pending["CH0001"]["back_was"] == "CB0001 with PD0001"
    assert pending["CH0001"]["back_now"] == "CB0001 with PD0002"
    assert pending["PD0001"]["back_was_code"] == "CB0001" and pending["PD0001"]["back_now"] is None
    # Shelf order: Chain before Pendant.
    assert list(pending)[0] == "CH0001"

    await client.post(f"{API}/printed", json={"codes": ["CB0001", "PD0001"]})
    assert (await client.get(f"{API}/pending")).json() == []
    # Printing again with nothing changed is a reprint.
    await client.post(f"{API}/printed", json={"codes": ["CH0001"]})
    hist = (await client.get(f"{API}/history/CH0001")).json()
    assert [h["reason"] for h in hist] == ["REPRINT", "COMBO_CHANGED", "NEW"]
    assert hist[0]["back_with"] == "PD0002"
