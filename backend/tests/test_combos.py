import pytest
from sqlalchemy.exc import IntegrityError

from app._shared.core.database import AsyncSessionFactory
from app.modules.combos.model import ComboItem

INV = "/api/v1/inventory"
API = "/api/v1/combos"


@pytest.fixture
async def stock(client):
    """Two chains (CH0001, CH0002), two pendants (PD0001, PD0002), one ring (RG0001)."""
    cats = {}
    for name, prefix in [("Chain", "CH"), ("Pendant", "PD"), ("Ring", "RG")]:
        cats[prefix] = (await client.post(f"{INV}/categories", json={"name": name, "code_prefix": prefix})).json()
    pieces = {}
    for prefix, name, gross, stone in [
        ("CH", "Rope chain", 10.2, 0), ("CH", "Box chain", 8.5, 0),
        ("PD", "Dollar", 15.84, 2.14), ("PD", "Mango", 1.02, 0.18), ("RG", "Stone ring", 4.0, 0.5),
    ]:
        res = await client.post(f"{INV}/pieces", json={
            "category_id": cats[prefix]["id"], "name": name, "purity": "22K",
            "gross_weight": gross, "stone_weight": stone,
        })
        p = res.json()
        pieces[p["item_code"]] = p
    return pieces


async def make_combo(client, codes, **extra):
    return await client.post(API, json={"piece_codes": codes, **extra})


def codes_of(combo, key="pieces"):
    return sorted(p["item_code"] for p in combo[key])


async def test_create_combo_gets_cb_code_and_totals(client, stock):
    res = await make_combo(client, ["ch0001", "PD0001"], name="Rope + Dollar")
    assert res.status_code == 201, res.text
    combo = res.json()
    assert combo["combo_code"] == "CB0001"
    assert combo["status"] == "ACTIVE"
    assert codes_of(combo) == ["CH0001", "PD0001"]
    assert combo["totals"] == {"pieces": 2, "gross_weight": 26.04, "stone_weight": 2.14, "net_weight": 23.9}

    second = (await make_combo(client, ["CH0002", "PD0002"])).json()
    assert second["combo_code"] == "CB0002"


async def test_combo_needs_two_distinct_pieces(client, stock):
    assert (await make_combo(client, ["CH0001"])).status_code == 422
    res = await make_combo(client, ["CH0001", "ch0001"])
    assert res.status_code == 422
    assert (await make_combo(client, ["CH0001", "XX0001"])).status_code == 404


async def test_piece_can_be_in_only_one_combo(client, stock):
    await make_combo(client, ["CH0001", "PD0001"])
    res = await make_combo(client, ["CH0001", "PD0002"])
    assert res.status_code == 409
    assert "CB0001" in res.json()["error"]["message"]
    # Nothing was half-created: PD0002 is still free and no code was used up.
    ok = (await make_combo(client, ["CH0002", "PD0002"])).json()
    assert ok["combo_code"] == "CB0002"


async def test_inactive_piece_cannot_be_linked(client, stock):
    await client.patch(f"{INV}/pieces/{stock['PD0002']['id']}", json={"status": "INACTIVE"})
    res = await make_combo(client, ["CH0002", "PD0002"])
    assert res.status_code == 409
    assert "inactive" in res.json()["error"]["message"]


async def test_link_unlink_and_minimum_size(client, stock):
    combo = (await make_combo(client, ["CH0001", "PD0001"])).json()
    cid = combo["id"]

    res = await client.post(f"{API}/{cid}/link", json={"piece_code": "RG0001"})
    assert codes_of(res.json()) == ["CH0001", "PD0001", "RG0001"]

    res = await client.post(f"{API}/{cid}/unlink", json={"piece_code": "RG0001"})
    body = res.json()
    assert codes_of(body) == ["CH0001", "PD0001"]
    assert codes_of(body, "past_pieces") == ["RG0001"]

    # Down to two: unlinking one more would leave a single piece.
    res = await client.post(f"{API}/{cid}/unlink", json={"piece_code": "PD0001"})
    assert res.status_code == 422
    # Unlinking something that isn't a member.
    res = await client.post(f"{API}/{cid}/unlink", json={"piece_code": "CH0002"})
    assert res.status_code == 422


async def test_swap_keeps_code_and_records_history(client, stock):
    combo = (await make_combo(client, ["CH0001", "PD0001"])).json()
    cid = combo["id"]

    res = await client.post(f"{API}/{cid}/swap", json={"out_code": "PD0001", "in_code": "PD0002", "note": "Buyer chose mango"})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["combo_code"] == "CB0001"
    assert codes_of(body) == ["CH0001", "PD0002"]
    assert codes_of(body, "past_pieces") == ["PD0001"]

    # PD0001 is free again and can go into a new combo.
    assert (await make_combo(client, ["CH0002", "PD0001"])).status_code == 201

    history = (await client.get(f"{API}/{cid}/history")).json()
    assert [e["event"] for e in history] == ["SWAPPED", "CREATED"]
    assert history[0]["item_code"] == "PD0001" and history[0]["other_item_code"] == "PD0002"
    assert history[0]["note"] == "Buyer chose mango"


async def test_swap_rejects_busy_or_same_piece(client, stock):
    a = (await make_combo(client, ["CH0001", "PD0001"])).json()
    await make_combo(client, ["CH0002", "PD0002"])
    res = await client.post(f"{API}/{a['id']}/swap", json={"out_code": "PD0001", "in_code": "PD0002"})
    assert res.status_code == 409
    res = await client.post(f"{API}/{a['id']}/swap", json={"out_code": "PD0001", "in_code": "PD0001"})
    assert res.status_code == 422


async def test_dissolve_frees_pieces_and_locks_combo(client, stock):
    combo = (await make_combo(client, ["CH0001", "PD0001"])).json()
    cid = combo["id"]
    res = await client.post(f"{API}/{cid}/dissolve", json={})
    body = res.json()
    assert body["status"] == "DISSOLVED" and body["pieces"] == []
    assert codes_of(body, "past_pieces") == ["CH0001", "PD0001"]

    assert (await client.post(f"{API}/{cid}/link", json={"piece_code": "RG0001"})).status_code == 409
    # Pieces are free; the new combo gets a new code, CB0001 is never reused.
    again = (await make_combo(client, ["CH0001", "PD0001"])).json()
    assert again["combo_code"] == "CB0002"


async def test_piece_history_shows_past_and_current(client, stock):
    first = (await make_combo(client, ["CH0001", "PD0001"])).json()
    await client.post(f"{API}/{first['id']}/swap", json={"out_code": "PD0001", "in_code": "PD0002"})
    await make_combo(client, ["CH0002", "PD0001"])

    hist = (await client.get(f"{API}/piece-history/pd0001")).json()
    assert [(h["combo_code"], h["current"]) for h in hist] == [("CB0002", True), ("CB0001", False)]


async def test_inventory_shows_combo_and_blocks_retire(client, stock):
    await make_combo(client, ["CH0001", "PD0001"])
    piece = (await client.get(f"{INV}/pieces/by-code/CH0001")).json()
    assert piece["combo_code"] == "CB0001"
    listed = {p["item_code"]: p["combo_code"] for p in (await client.get(f"{INV}/pieces")).json()["items"]}
    assert listed["CH0001"] == "CB0001" and listed["CH0002"] is None

    res = await client.patch(f"{INV}/pieces/{piece['id']}", json={"status": "INACTIVE"})
    assert res.status_code == 409


async def test_available_pieces_and_search(client, stock):
    await make_combo(client, ["CH0001", "PD0001"])
    avail = [p["item_code"] for p in (await client.get(f"{API}/available-pieces")).json()]
    assert avail == ["CH0002", "PD0002", "RG0001"]

    assert (await client.get(API, params={"q": "pd0001"})).json()["total"] == 1
    assert (await client.get(API, params={"q": "RG"})).json()["total"] == 0
    assert (await client.get(f"{API}/by-code/cb0001")).status_code == 200


async def test_database_blocks_second_active_link(client, stock):
    """The partial unique index is the backstop if two requests race."""
    combo = (await make_combo(client, ["CH0001", "PD0001"])).json()
    async with AsyncSessionFactory() as db:
        db.add(ComboItem(id="x", combo_id=combo["id"], piece_id=stock["CH0001"]["id"]))
        with pytest.raises(IntegrityError):
            await db.commit()
