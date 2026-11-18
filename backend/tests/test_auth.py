from tests.conftest import OWNER, login_as

AUTH = "/api/v1/auth"


async def test_status_setup_once_and_login(anon):
    assert (await anon.get(f"{AUTH}/status")).json() == {"needs_setup": True}
    res = await anon.post(f"{AUTH}/setup", json=OWNER)
    assert res.status_code == 201 and res.json()["user"]["role"] == "OWNER"
    assert (await anon.get(f"{AUTH}/status")).json() == {"needs_setup": False}
    # Setup can't be used again to make a second owner.
    assert (await anon.post(f"{AUTH}/setup", json={**OWNER, "username": "other"})).status_code == 409

    bad = await anon.post(f"{AUTH}/login", json={"username": "owner", "password": "wrong-pass"})
    assert bad.status_code == 401 and bad.json()["error"]["message"] == "Wrong username or password."
    ok = await anon.post(f"{AUTH}/login", json={"username": "OWNER", "password": OWNER["password"]})
    assert ok.status_code == 200 and ok.json()["user"]["username"] == "owner"


async def test_everything_needs_sign_in(anon):
    assert (await anon.get("/api/v1/health")).status_code == 200
    for path in ("/api/v1/inventory/pieces", "/api/v1/combos", "/api/v1/billing/bills", "/api/v1/rates/today",
                 "/api/v1/business", "/api/v1/audits"):
        res = await anon.get(path)
        assert res.status_code == 401, path
    res = await anon.get("/api/v1/inventory/pieces", headers={"Authorization": "Bearer not-a-token"})
    assert res.status_code == 401


async def test_roles(anon, client):
    staff = await login_as(anon, client, "ravi", "STAFF")
    manager = await login_as(anon, client, "meena", "MANAGER")
    async with staff, manager:
        # Staff can't manage users, categories, or the gold rate.
        assert (await staff.get(f"{AUTH}/users")).status_code == 403
        res = await staff.post("/api/v1/inventory/categories", json={"name": "Chain", "code_prefix": "CH"})
        assert res.status_code == 403 and "manager" in res.json()["error"]["message"]
        assert (await staff.put("/api/v1/rates/2026-11-18", json={"rate": 7400})).status_code == 403
        assert (await staff.put("/api/v1/business", json={"name": "X Gold"})).status_code == 403

        assert (await manager.post("/api/v1/inventory/categories", json={"name": "Chain", "code_prefix": "CH"})).status_code == 201
        assert (await manager.put("/api/v1/rates/2026-11-18", json={"rate": 7400})).status_code == 200
        assert (await manager.put("/api/v1/business", json={"name": "X Gold"})).status_code == 403


async def test_switched_off_account_and_last_owner(anon, client):
    staff = await login_as(anon, client, "ravi", "STAFF")
    async with staff:
        assert (await staff.get(f"{AUTH}/me")).status_code == 200
        users = (await client.get(f"{AUTH}/users")).json()
        ravi = next(u for u in users if u["username"] == "ravi")
        owner = next(u for u in users if u["username"] == "owner")
        await client.patch(f"{AUTH}/users/{ravi['id']}", json={"is_active": False})
        # The very next request is refused, even with a token that hasn't expired.
        assert (await staff.get(f"{AUTH}/me")).status_code == 403

    res = await client.patch(f"{AUTH}/users/{owner['id']}", json={"role": "STAFF"})
    assert res.status_code == 422 and "only owner" in res.json()["error"]["message"]


async def test_change_password(anon, client):
    res = await client.post(f"{AUTH}/me/password", json={"current_password": "nope", "new_password": "brand-new-pass"})
    assert res.status_code == 422
    res = await client.post(f"{AUTH}/me/password",
                            json={"current_password": OWNER["password"], "new_password": "brand-new-pass"})
    assert res.status_code == 204
    assert (await anon.post(f"{AUTH}/login", json={"username": "owner", "password": "brand-new-pass"})).status_code == 200
