# ClothPos

Offline-first checkout terminal for ClothStock. Catalog, cart, and sales live in a local SQLite database. Two independent async Tauri workers upload the persistent SQLite outbox to `POST /api/sync/push/` and poll `GET /api/sync/pull/` for catalog/stock events. Pulls are ordered and deduplicated by `seq_id`; frontend refresh events are emitted only when new events are applied. Network failures retain the local queue and retry with exponential backoff.

The React route layout is in `src/App.jsx`; checkout, sales, and settings are separate child routes. Shared POS state and sync status live in reusable hooks, with route state passed through React Router's outlet context.

## Run

```bash
cd ClothPos
npm install
npm run tauri dev
```

Browser-only UI preview (uses a localStorage mock, not SQLite):

```bash
npm run dev
```

Open http://127.0.0.1:1420

## Configure

On first launch, sign in with a ClothStock account and enter the **store code**
for an existing store assigned to that account. The terminal does not create a
store from the onboarding form; ask an owner to create the store or assign your
account if its code is not available.

1. Open **Sync & Settings**.
2. Set API URL (`http://localhost:8001` when using the repo `docker compose` stack).
3. Set store numeric ID and store code to match a ClothStock `Store`.
4. Sign in with a ClothStock staff account.
5. Click **Sync now** to import catalog + inventory.

Demo SKUs are seeded when the local catalog is empty so the terminal can be used immediately.

## Data

SQLite file: app data directory `/clothpos.sqlite`  
Migrations: `src-tauri/migrations/` (applied on startup)
