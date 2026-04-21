# Film Price Tracker (Canada) — Development Plan

## Goal (v1)
Track **popular 35mm film** prices from **Canadian stores only** and display, for each film, the **lowest 3 in-stock offers** (CAD) with links and timestamps.

## Stores (locked)
- Aden Camera (Toronto, ON) ✅ *implemented*
- Beau Photo (Vancouver, BC) ✅ *implemented*
- Dons Photo (Canada) ✅ *implemented (browser adapter)*
- DowntownCamera (Toronto, ON) ⏸️ *skipped for now*
- Graination (Toronto, ON) ✅ *implemented*
- Kerrisdale Cameras (Vancouver, BC) ✅ *implemented*
- Lord Photo (Saint-Jean-sur-Richelieu, QC) ⏸️ *skipped for now*
- Popho Camera (Montréal, QC) ✅ *implemented*
- Studio Argentique (Montréal, QC) ✅ *implemented*
- TheCameraStore (Calgary, AB) ✅ *implemented*

## Comparison rules (v1 current)
- **Format**: 35mm / 135 only (non-35mm excluded).
- **Stock**: in-stock only by default.
- **Currency**: CAD.
- **Shipping**: excluded.
- **Variants** (implemented):
  - 36 exposure
  - 24 exposure
  - multi-packs
  - bulk rolls
  - “any” (default)

## Architecture
Monorepo with:
- `server/`: Node.js + TypeScript + Express API + **scheduled scrapes** (see below)
- `web/`: React + Vite frontend
- Postgres database (local via Docker Compose; production via managed Postgres)

### Scrape scheduling (implemented)
- On API startup, the server starts a lightweight scheduler that runs `runScrape()` at **two wall-clock times per day** (server local time).
- Configure with **`SCRAPE_HOURS`**: comma-separated hours `0`–`23` (default `0,12` → midnight and noon). See `server/.env.example`.
- Scrapes can still be triggered manually via **`POST /api/admin/scrape`** or the CLI `npm run scrape` in `server/`.

### Deployment & networking (implemented)
- **API bind address**: `LISTEN_HOST` (default `0.0.0.0`) so the server accepts connections from LAN devices, not only localhost. See `server/.env.example`.
- **CORS**: `WEB_ORIGIN` supports a comma-separated list; **private LAN origins** (e.g. `192.168.x.x`, `10.x`, `172.16–31.x`) are allowed unless `ALLOW_LAN_ORIGINS=false`. Implemented in `server/src/corsOrigins.ts`.
- **Vite dev / preview**: `server.host` / `preview.host` listen on all interfaces; **`preview.proxy`** forwards `/api` to the backend so the web app can use relative `/api` URLs (works from LAN and Docker without baking `localhost` into the client).
- **Reverse proxy hostnames**: `VITE_ALLOWED_HOSTS` in `web/vite.config.ts` — unset / `all` / `true` allows any `Host` (e.g. behind nginx); otherwise use a comma-separated allowlist.
- **Docker Compose**: `web` sets `VITE_PREVIEW_API_PROXY=http://server:4000` so preview proxies to the API service.

### Local dev (current)
- `docker compose up -d --build`
- Web: `http://localhost:5173`
- API: `http://localhost:4000`

### Key backend components
- **Film catalog**: canonical film list + aliases
- **Store adapters**: one module per store implementing a shared contract
- **Normalization pipeline**: currency, stock, pack size, exposure parsing, bulk detection
- **Persistence**: store listings and price snapshots
- **API**: serve “lowest 3 offers per film” and basic health

## Data model (minimum)
- `stores`: store metadata + throttling
- `films`: canonical film entries
- `film_aliases`: alias strings for matching
- `listings`: store URLs mapped to a film + parsed pack size + exposures + bulk flag
- `price_snapshots`: time series of price + stock
- `scrape_runs`: bookkeeping for each run + per-store status

## API (v1)
- `GET /api/health`
- `GET /api/films`
- `GET /api/prices?inStock=true|false&variant=any|36|24|multipack|bulk&filmType=any|color|bw` → per film: top 3 offers
- `GET /api/films/:id/offers` → all current offers for one film (detail view)
- `GET /api/films/:id/price-history?inStock=true|false&variant=…` → **daily lowest in-stock price** (UTC buckets) for the **last 6 months**, matching the same variant / in-stock filters as `/api/prices` (Postgres + SQLite)
- `GET /api/stores/health` (admin-ish, optional — not implemented yet)
- `POST /api/admin/scrape` → runs scrape for implemented stores (no public UI button; server/CLI only)

## Store adapter contract (v1)
Input: `FilmProduct` (canonical + aliases)

Output: `ListingCandidate[]`
- `titleRaw`, `url`, `priceCad`, `currency`, `inStock`, `packSize`, `exposures`, `isBulk`, `lastCheckedAt`

Notes:
- Prefer structured sources (JSON-LD, embedded JSON) when available; fall back to HTML selectors.
- Rate limit and retries are required (some stores return HTTP 429).

## Web UI (current)
- **Film list**: filters for variant, color vs B&W, hide out-of-stock; table of films with top 3 offers.
- **Film detail (inline accordion)** — implemented in `web/src/ui/App.tsx` + `web/src/ui/styles.css`:
  - Clicking a film row (or **Enter** / **Space** when focused) inserts a **full-width detail row** (`<tr>` + `colSpan={3}`) **immediately under** that film’s data row, so the list stays in context and the page does not jump to the top.
  - The open row is highlighted (`.clickRowSelected`); the detail body uses a nested `.card` (`.filmDetailCard`) inside `.filmDetailCell`.
  - **Collapse** with **Back** or by **clicking the same film row again** (`aria-expanded` reflects open/closed).
  - Detail content: full offer list, **6‑month price history chart** (SVG via `web/src/ui/PriceHistoryChart.tsx`; lowest matching offer per day from `GET /api/films/:id/price-history`).
- **Admin**: no in-app “run scrape” control; scrapes are scheduled and/or triggered via API/CLI.

## Milestones
1. **Scaffold app + DB schema**
   - Monorepo, Postgres, migrations, API skeleton, minimal UI
2. **Implement 2 stores end-to-end** ✅
   - The Camera Store adapter
   - Beau Photo adapter (WooCommerce variation parsing)
3. **Add remaining 8 stores**
   - One store at a time, with fixtures/tests per store
4. **Reliability**
   - scrape run logs, store health, better matching diagnostics
5. **History + deployment + UX** ✅
   - **Price history chart** in film detail (`GET /api/films/:id/price-history` + `web/src/ui/PriceHistoryChart.tsx`)
   - **Inline film detail** in the main table (accordion row under the selected film; no separate detail block above the list)
   - Scheduled scrapes + LAN / reverse-proxy deployment settings (see above)
6. **Enhancements (v1.5+ backlog)**
   - optional per-roll normalization, alerts, richer history (e.g. per-store lines)

## Definition of done (v1)
- For each film in the curated catalog, the UI shows **up to 3 in-stock CAD offers** from the 10 stores above, with working links and last-checked time.
- Opening a film shows **all** matching offers and a **six-month lowest-price-by-day** chart (when snapshot data exists) **inline in the table** under that film, without losing scroll context at the top of the page.

