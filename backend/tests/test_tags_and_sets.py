"""Tags made at stock entry, fold-over tag data, tags to (re)print, sets saved in one step."""
INV = "/api/v1/inventory"
COMBOS = "/api/v1/combos"
TAGS = "/api/v1/tags"


async def _cats(client):
    ch = (await client.post(f"{INV}/categories", json={"name": "Chain", "code_prefix": "CH"})).json()["id"]
    pd = (await client.post(f"{INV}/categories", json={"name": "Pendant", "code_prefix": "PD"})).json()["id"]
    return ch, pd


def _piece(cat, name, gross, **extra):
    return {"category_id": cat, "name": name, "purity": "22K", "gross_weight": gross, "touch_percent": 92, **extra}


async def _pending(client):
    return {p["code"]: p for p in (await client.get(f"{TAGS}/pending")).json()}


async def test_new_set_saves_pieces_and_combo_together(client):
    ch, pd = await _cats(client)
    res = await client.post(f"{COMBOS}/new-set", json={
        "pieces": [_piece(ch, "Rope chain", 10), _piece(pd, "Lakshmi pendant", 4, huid="AB1234")],
        "name": "Rope + Lakshmi"})
    assert res.status_code == 201, res.text
    combo = res.json()
    assert combo["combo_code"] == "CB0001"
    assert [p["item_code"] for p in combo["pieces"]] == ["CH0001", "PD0001"]
    assert combo["pieces"][1]["huid"] == "AB1234"


async def test_new_set_is_all_or_nothing(client):
    ch, pd = await _cats(client)
    res = await client.post(f"{COMBOS}/new-set", json={
        "pieces": [_piece(ch, "Rope chain", 10), _piece(pd, "Bad pendant", 1, stone_weight=2)]})
    assert res.status_code == 422 and res.json()["error"]["message"].startswith("Piece 2:")
    assert (await client.get(f"{INV}/pieces")).json()["total"] == 0
    assert (await client.get(COMBOS, params={"status": "ACTIVE"})).json()["total"] == 0
    # Nothing was used up: the next saves still get the first codes.
    combo = (await client.post(f"{COMBOS}/new-set", json={
        "pieces": [_piece(ch, "Rope chain", 10), _piece(pd, "Om", 2)]})).json()
    assert combo["combo_code"] == "CB0001" and combo["pieces"][0]["item_code"] == "CH0001"
    # One piece is not a set.
    res = await client.post(f"{COMBOS}/new-set", json={"pieces": [_piece(ch, "Solo", 5)]})
    assert res.status_code == 422


async def test_fold_over_label_has_combo_on_the_back(client):
    ch, pd = await _cats(client)
    await client.post(f"{COMBOS}/new-set", json={"pieces": [_piece(ch, "Rope chain", 10), _piece(pd, "Om", 2)],
                                                 "name": "Rope + Om"})
    chain = (await client.get(f"{TAGS}/resolve/CH0001")).json()
    assert chain["back"]["code"] == "CB0001" and chain["back"]["piece_codes"] == ["CH0001", "PD0001"]
    assert chain["back"]["title"] == "Rope + Om" and chain["back"]["net_weight"] == 12.0

    # A combo code expands to its pieces' tags, each with the combo on its back.
    batch = (await client.post(f"{TAGS}/labels", json={"codes": ["CB0001"], "expand_combos": True})).json()
    assert [l["code"] for l in batch["labels"]] == ["CH0001", "PD0001"]
    assert all(l["back"]["code"] == "CB0001" for l in batch["labels"])
    plain = (await client.post(f"{TAGS}/labels", json={"codes": ["CB0001"]})).json()
    assert [l["code"] for l in plain["labels"]] == ["CB0001"]


async def test_tags_to_print_follow_combo_changes(client):
    ch, pd = await _cats(client)
    for p in (_piece(ch, "Rope chain", 10), _piece(pd, "Om", 2), _piece(pd, "Heart", 3)):
        await client.post(f"{INV}/pieces", json=p)
    pending = await _pending(client)
    assert set(pending) == {"CH0001", "PD0001", "PD0002"} and pending["CH0001"]["state"] == "NEW"

    combo = (await client.post(COMBOS, json={"piece_codes": ["CH0001", "PD0001"]})).json()
    res = await client.post(f"{TAGS}/printed", json={"codes": ["CB0001", "PD0002"]})
    assert res.json() == {"marked": 3}
    assert await _pending(client) == {}
    label = (await client.get(f"{TAGS}/resolve/CH0001")).json()
    assert label["tag_state"] == "OK"

    # Swap PD0001 out for PD0002: both pendants' tags are now wrong on the back.
    await client.post(f"{COMBOS}/{combo['id']}/swap", json={"out_code": "PD0001", "in_code": "PD0002"})
    pending = await _pending(client)
    assert set(pending) == {"CH0001", "PD0001", "PD0002"}
    assert "no longer in a combo" in pending["PD0001"]["note"]
    assert "Now in CB0001" in pending["PD0002"]["note"]
    # The chain stays in CB0001, but its back says "with PD0001", which has left.
    assert pending["CH0001"]["back_was"] == "CB0001 with PD0001"
    assert pending["CH0001"]["back_now"] == "CB0001 with PD0002"

    await client.post(f"{TAGS}/printed", json={"codes": ["PD0001", "CB0001"]})
    assert await _pending(client) == {}


async def test_sold_pieces_need_no_tags(client):
    ch, _ = await _cats(client)
    await client.post(f"{INV}/pieces", json=_piece(ch, "Rope chain", 10))
    await client.post("/api/v1/billing/shops", json={"name": "Shop One"})
    shop = (await client.get("/api/v1/billing/shops")).json()[0]
    await client.post("/api/v1/billing/bills", json={"shop_id": shop["id"], "gold_rate": 7000, "lines": [{"code": "CH0001"}]})
    assert await _pending(client) == {}
