# DFX Wholesale — Frontend

Web app for the wholesaler's staff: inventory, combos (link / unlink pieces), tag printing and billing.

Stack: Next.js (App Router), React 19, Tailwind CSS 4. `jsbarcode` and `qrcode` are included for tag labels.

## Run locally

```bash
npm install
copy .env.example .env.local
npm run dev
```

Open http://localhost:3000. The badge at the top shows whether the backend
(`../backend`, default http://localhost:8000) is reachable.

## Layout

```
src/
  app/                  routes (layout, pages)
  _shared/api/client.js fetch wrapper used by every module
  _shared/components/   shared UI
  modules/              one folder per feature: inventory, combos, tags, billing
```
