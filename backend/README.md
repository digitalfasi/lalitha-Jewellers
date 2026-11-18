# DFX Wholesale — Backend

Billing and inventory API for a jewellery wholesaler. Retail shops are the buyers;
only the wholesaler's staff use the app.

Stack: FastAPI, SQLAlchemy 2 (async), Alembic, Postgres (SQLite for local dev).

## Run locally

```bash
python -m venv .venv
.venv\Scripts\activate        # Windows
pip install -r requirements.txt
copy .env.example .env
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

Health check: http://localhost:8000/api/v1/health — API docs: http://localhost:8000/docs

## Tests

```bash
pytest
```

## Layout

```
app/
  main.py               FastAPI app, CORS, error handler
  api/v1/router.py      registers every module's router
  _shared/              config, database, base model, exceptions, health
  models/__init__.py    imports all models (for Alembic autogenerate)
  modules/
    inventory/          categories, designs, pieces, item codes
    combos/             link / unlink / swap pieces, pairing history
    tags/               QR + barcode labels
    billing/            bills to retail shops
alembic/                migrations
tests/
```

New migration after changing models:

```bash
alembic revision --autogenerate -m "describe the change"
```
