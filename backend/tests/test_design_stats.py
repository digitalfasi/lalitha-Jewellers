"""A design learns its usual touch % and typical weight from the pieces entered with it."""
INV = "/api/v1/inventory"


async def test_design_usual_touch_and_typical_net(client):
    cat = (await client.post(f"{INV}/categories", json={"name": "Chain", "code_prefix": "CH"})).json()["id"]
    rope = (await client.post(f"{INV}/designs", json={"category_id": cat, "name": "Rope"})).json()["id"]
    box = (await client.post(f"{INV}/designs", json={"category_id": cat, "name": "Box"})).json()["id"]
    for gross, touch in [(10, 92), (12, 92), (14, 91.6)]:
        await client.post(f"{INV}/pieces", json={"category_id": cat, "design_id": rope, "name": "Rope chain",
                                                 "purity": "22K", "gross_weight": gross, "touch_percent": touch})

    designs = {d["name"]: d for d in (await client.get(f"{INV}/designs", params={"category_id": cat})).json()}
    assert designs["Rope"]["usual_touch"] == 92.0          # used twice, 91.6 once
    assert designs["Rope"]["typical_net"] == 12.0
    assert designs["Rope"]["piece_count"] == 3
    # A design with no pieces yet has nothing to suggest.
    assert designs["Box"]["usual_touch"] is None and designs["Box"]["piece_count"] == 0
