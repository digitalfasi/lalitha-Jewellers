# DFX Wholesale

Billing and inventory for a jewellery wholesaler: pieces with item codes, HUID and photos;
combos (sets) that are linked, unlinked and swapped with full history; fold-over tags with
QR codes and barcodes; tax-invoice bills to retail shops; stock counts; staff logins.

| Folder | What | Stack |
|---|---|---|
| [`backend/`](backend) | API | FastAPI, SQLAlchemy (async), Alembic, Postgres (SQLite locally) |
| [`frontend/`](frontend) | Web app | Next.js, React, Tailwind |

## Run locally

Backend (port 8000):

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
alembic upgrade head
python -m scripts.seed_demo        # optional demo data + demo logins (see the script)
uvicorn app.main:app --reload --port 8000
```

Frontend (port 3000):

```bash
cd frontend
npm install
copy .env.example .env.local       # NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
npm run dev
```

Tests: `cd backend && pytest`.

## Deploy

**Backend on Render** (blueprint in [`render.yaml`](render.yaml)): web service + Postgres + a 1 GB disk
for photos. Render → New → Blueprint → this repo. Then set `CORS_ORIGINS` to the frontend URL.
Migrations run automatically on each deploy.

**Frontend on Vercel**: New Project → this repo → Root Directory `frontend` →
environment variable `NEXT_PUBLIC_API_URL=https://<render-service>.onrender.com/api/v1` → Deploy.

**First sign-in**: open the frontend; with no users yet it shows *first-time setup*, which creates
the owner. Do this straight after the first deploy. Never run the demo seed on the live database.
