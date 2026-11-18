import os
import tempfile

# Point the app at a throwaway SQLite file BEFORE app modules are imported
# (settings are read at import time). Env vars win over .env.
_DB_FILE = os.path.join(tempfile.mkdtemp(prefix="wholesale_test_"), "test.db")
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{_DB_FILE}"
os.environ["UPLOAD_DIR"] = os.path.join(os.path.dirname(_DB_FILE), "uploads")
os.environ["SMTP_HOST"] = ""
os.environ["SECRET_KEY"] = "test-secret-key-that-is-long-enough-for-hs256"

import pytest  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402

from app._shared.core.database import engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Base  # noqa: E402


@pytest.fixture(autouse=True)
async def fresh_db():
    """Every test starts with empty tables."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield


OWNER = {"username": "owner", "full_name": "Test Owner", "password": "owner-pass-123"}


@pytest.fixture
async def anon():
    """Not signed in."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


@pytest.fixture
async def client(anon):
    """Signed in as the owner (created through first-time setup)."""
    res = await anon.post("/api/v1/auth/setup", json=OWNER)
    assert res.status_code == 201, res.text
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test",
                           headers={"Authorization": f"Bearer {res.json()['access_token']}"}) as c:
        yield c


async def login_as(anon, owner_client, username: str, role: str) -> AsyncClient:
    """Create a staff account with the owner and return a client signed in as it."""
    pw = f"{username}-pass-123"
    res = await owner_client.post("/api/v1/auth/users", json={"username": username, "full_name": username.title(),
                                                               "password": pw, "role": role})
    assert res.status_code == 201, res.text
    token = (await anon.post("/api/v1/auth/login", json={"username": username, "password": pw})).json()["access_token"]
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test",
                       headers={"Authorization": f"Bearer {token}"})
