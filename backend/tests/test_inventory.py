API = "/api/v1/inventory"


async def make_category(client, name="Chain", prefix="CH"):
    res = await client.post(f"{API}/categories", json={"name": name, "code_prefix": prefix})
    assert res.status_code == 201, res.text
    return res.json()


async def make_piece(client, category_id, **extra):
    body = {"category_id": category_id, "name": "Rope chain", "purity": "22K", "gross_weight": 10.2, **extra}
    return await client.post(f"{API}/pieces", json=body)


# ---------------------------------------------------------------- categories

async def test_category_prefix_is_uppercased(client):
    cat = await make_category(client, prefix="pd", name="Pendant")
    assert cat["code_prefix"] == "PD"
    assert cat["prefix_locked"] is False


async def test_duplicate_prefix_and_name_rejected(client):
    await make_category(client)
    res = await client.post(f"{API}/categories", json={"name": "Necklace", "code_prefix": "ch"})
    assert res.status_code == 409
    res = await client.post(f"{API}/categories", json={"name": "chain", "code_prefix": "CN"})
    assert res.status_code == 409


async def test_combo_prefix_reserved_and_bad_prefix(client):
    res = await client.post(f"{API}/categories", json={"name": "Combo", "code_prefix": "CB"})
    assert res.status_code == 422
    res = await client.post(f"{API}/categories", json={"name": "Chain", "code_prefix": "C1"})
    assert res.status_code == 422
    assert res.json()["error"]["field"] == "code_prefix"


async def test_prefix_locked_once_a_piece_is_coded(client):
    cat = await make_category(client)
    res = await client.patch(f"{API}/categories/{cat['id']}", json={"code_prefix": "CN"})
    assert res.status_code == 200 and res.json()["code_prefix"] == "CN"

    assert (await make_piece(client, cat["id"])).status_code == 201
    res = await client.patch(f"{API}/categories/{cat['id']}", json={"code_prefix": "CX"})
    assert res.status_code == 409
    # Renaming is still fine.
    res = await client.patch(f"{API}/categories/{cat['id']}", json={"name": "Chains"})
    assert res.status_code == 200 and res.json()["prefix_locked"] is True


# -------------------------------------------------------------------- pieces

async def test_item_codes_count_up_per_prefix(client):
    chain = await make_category(client)
    pendant = await make_category(client, "Pendant", "PD")
    codes = [
        (await make_piece(client, chain["id"])).json()["item_code"],
        (await make_piece(client, chain["id"])).json()["item_code"],
        (await make_piece(client, pendant["id"], name="Dollar")).json()["item_code"],
        (await make_piece(client, chain["id"])).json()["item_code"],
    ]
    assert codes == ["CH0001", "CH0002", "PD0001", "CH0003"]


async def test_client_cannot_choose_item_code(client):
    cat = await make_category(client)
    res = await make_piece(client, cat["id"], item_code="ZZ9999")
    assert res.status_code == 201
    assert res.json()["item_code"] == "CH0001"


async def test_net_weight_is_gross_minus_stone(client):
    cat = await make_category(client)
    res = await make_piece(client, cat["id"], gross_weight=15.84, stone_weight=2.14, touch_percent=103)
    body = res.json()
    assert body["net_weight"] == 13.7
    assert body["touch_percent"] == 103

    res = await client.patch(f"{API}/pieces/{body['id']}", json={"stone_weight": 0.84})
    assert res.json()["net_weight"] == 15.0


async def test_stone_must_be_less_than_gross(client):
    cat = await make_category(client)
    res = await make_piece(client, cat["id"], gross_weight=5, stone_weight=5)
    assert res.status_code == 422
    assert res.json()["error"]["field"] == "stone_weight"


async def test_design_must_match_category(client):
    chain = await make_category(client)
    pendant = await make_category(client, "Pendant", "PD")
    res = await client.post(f"{API}/designs", json={"category_id": pendant["id"], "name": "Dollar round"})
    design = res.json()
    res = await make_piece(client, chain["id"], design_id=design["id"])
    assert res.status_code == 422

    res = await make_piece(client, pendant["id"], design_id=design["id"], name="Dollar")
    assert res.status_code == 201 and res.json()["design_name"] == "Dollar round"
    designs = (await client.get(f"{API}/designs", params={"category_id": pendant["id"]})).json()
    assert designs[0]["in_stock_count"] == 1


async def test_lookup_by_code_and_search(client):
    cat = await make_category(client)
    await make_piece(client, cat["id"], name="Rope chain")
    await make_piece(client, cat["id"], name="Box chain")

    res = await client.get(f"{API}/pieces/by-code/ch0002")
    assert res.status_code == 200 and res.json()["name"] == "Box chain"
    assert (await client.get(f"{API}/pieces/by-code/CH0099")).status_code == 404

    res = await client.get(f"{API}/pieces", params={"q": "rope"})
    assert res.json()["total"] == 1
    res = await client.get(f"{API}/pieces", params={"q": "CH000"})
    assert res.json()["total"] == 2


async def test_status_inactive_and_filter(client):
    cat = await make_category(client)
    piece = (await make_piece(client, cat["id"])).json()
    await make_piece(client, cat["id"])

    res = await client.patch(f"{API}/pieces/{piece['id']}", json={"status": "INACTIVE"})
    assert res.json()["status"] == "INACTIVE"
    # SOLD is billing's job, never set by hand.
    res = await client.patch(f"{API}/pieces/{piece['id']}", json={"status": "SOLD"})
    assert res.status_code == 422

    res = await client.get(f"{API}/pieces", params={"status": "IN_STOCK"})
    assert res.json()["total"] == 1


async def test_inactive_category_blocks_new_pieces(client):
    cat = await make_category(client)
    await client.patch(f"{API}/categories/{cat['id']}", json={"is_active": False})
    res = await make_piece(client, cat["id"])
    assert res.status_code == 422
