# Film Price Tracker (Canada) — Development Plan

## Goal (v1)
Track **popular 35mm film** prices from **Canadian stores only** and display, for each film, the **lowest 3 in-stock offers** (CAD) with links and timestamps.

## Stores (locked)
- Aden Camera (Toronto, ON) ✅ *implemented (Shopify)*
- Beau Photo (Vancouver, BC) ✅ *implemented (WooCommerce)*
- Dons Photo (Canada) ⚠️ *implemented (browser adapter) — only completes ~1 film per run*
- DowntownCamera (Toronto, ON) ⏸️ *adapter file exists, not wired into `runScrape()`*
- Graination (Toronto, ON) ❌ *implemented but returning 0 listings — see Known issues*
- Kerrisdale Cameras (Vancouver, BC) ❌ *no successful scrape since 2026-07-28*
- Lord Photo (Saint-Jean-sur-Richelieu, QC) ⏸️ *adapter file exists, not wired into `runScrape()`*
- Popho Camera (Montréal, QC) ✅ *implemented (Shopify)*
- Studio Argentique (Montréal, QC) ✅ *implemented (Shopify)*
- TheCameraStore (Calgary, AB) ⚠️ *implemented — truncates at ~10 of 16 films per run*

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
  - planned: `is_expired` + `expiry_label` (*Phase 1*)
- `price_snapshots`: time series of price + stock
- `scrape_runs`: bookkeeping for each run + per-store status — ⚠️ **table exists but is never written to** (*Phase 0*)
- `film_candidates`: proposed catalog entries awaiting approval (planned, *Phase 4c*)

## API (v1)
- `GET /api/health`
- `GET /api/films`
- `GET /api/prices?inStock=true|false&variant=any|36|24|multipack|bulk&filmType=any|color|bw` → per film: top 3 offers
- `GET /api/films/:id/offers` → all current offers for one film (detail view)
- `GET /api/films/:id/price-history?inStock=true|false&variant=…` → **daily lowest in-stock price** (UTC buckets) for the **last 6 months**, matching the same variant / in-stock filters as `/api/prices` (Postgres + SQLite)
- `GET /api/stores/health` (admin-ish, optional — not implemented yet; see *Phase 4a*)
- `POST /api/admin/scrape` → runs scrape for implemented stores (no public UI button; server/CLI only)
- `GET /api/deals/expired` → expired-stock deals vs. cheapest fresh price (planned, *Phase 1.5*)

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

---

# Catalog expansion & automation (planned, 2026-09-05)

## Known issues (measured, not assumed)

**The scrape loop is over budget and silently dropping films.** `runScrape()` iterates
*store × film*, calling `fetchCandidatesForFilm()` once per film. A single Shopify
film-search costs **~5.5s** (1 search request + up to 20 `/products/<handle>.js`
fetches). At 17 films that is ~95s against the **90s** `STORE_BUDGET_MS`, so the
loop hits its budget and `break`s partway through the catalog.

Evidence — The Camera Store listing freshness cuts off *exactly* at `filmSeeds`
index 10:

| `filmSeeds` index | Films | Last seen |
|---|---|---|
| 0–9 | Portra ×3, Ektar, ColorPlus, Gold, UltraMax, Ektacolor ×3 | fresh |
| 10–15 | Tri-X, T-MAX 100/400, HP5, Delta 400, Kentmere PAN 400 | **stale — never re-scraped** |

Consequences:
- The entire **B&W half of the catalog** is never refreshed at The Camera Store.
- **Films are dropped in `filmSeeds` array order**, so anything appended to the end
  of the catalog is scraped last — i.e. never. *Adding films without fixing this
  first accomplishes nothing.*
- Truncation is **silent**: it records a per-film error in the returned summary,
  but nothing is persisted and the stale rows simply remain.

Also outstanding:
- **`scrape_runs` is never written to** (0 rows). The table and its schema
  (`status`, `totals` JSONB, `error_summary`) exist but no code inserts into it.
- **Graination** returns 0 listings; all 20 of its rows sit at the
  `markStoreListingsStale()` epoch sentinel.
- **Kerrisdale** and **DowntownCamera** have no successful scrape since 2026-07-28.
- **Orphan film row**: `kodak-ektacolor` exists in `films` with 0 listings and is no
  longer in `filmSeeds`; it renders in the UI with no prices.
- **`process: "e6"`** is defined in `FilmSeed` but no catalog entry uses it — slide
  film is an untapped category the schema already supports.
- **No tests anywhere** in the repo (no test runner, no fixtures).

## Phase 0 — Make the pipeline able to absorb more films *(prerequisite)*

Invert the per-film loop into a per-store bulk fetch. Both platforms expose whole
catalogs in one or two requests, which makes film count essentially free and
removes the truncation entirely.

- **Shopify** (`aden-camera`, `popho`, `studio-argentique`):
  `GET /collections/all/products.json?limit=250&page=N` returns every product with
  variants, prices (cents) and availability. Fetch once per store, then match all
  films locally. Measured catalog sizes: Popho 138, Studio Argentique 750, Aden ~900.
  Per-store cost drops from ~95s to ~3s.
- **WooCommerce** (`graination`, `beau-photo`):
  `GET /wp-json/wc/store/v1/products?per_page=100&search=…` returns structured JSON
  with `prices.price` already in cents, `is_in_stock`, and `permalink` — cleaner than
  the current HTML regex parsing. Graination reports 267 products via `X-WP-Total`.
  This is expected to fix Graination outright.
- **Browser stores** (`dons-photo`, `kerrisdale`) stay per-film; they are inherently
  slow and need separate treatment.

### Phase 0 follow-up — Beau Photo *(not done)*

Beau Photo needs more than a transport swap, so it was left on the per-film path:

- Its Store API works and exposes 2,317 products (24 pages at `per_page=100`).
- But its titles omit the format entirely — `"Candido 400 Colour Film"`,
  `"Fujifilm Colour 200"`, `"Fujifilm Neopan 100 Acros II"` — so `looksLike35mm()`
  rejects them and the store yields only a handful of listings.
- Categories (`Colour Film and Paper`, `Black & White Film and Paper`) identify
  *film* but not *format*, and include paper; the store also sells 120.

So this needs format inference (category + title + possibly the product page)
rather than the title regex. Blocks Candido — see Phase 2.
- **Make truncation loud**: persist each run to `scrape_runs` (this is Milestone 4's
  "scrape run logs") and record budget-exceeded as a `partial` status rather than
  letting it pass unnoticed.

## Phase 1 — Add widely-stocked films + expired-stock handling

Candidates ranked by **actual availability** across the three Shopify catalogs
(sampled 2026-09-05), not by popularity articles.

Stocked at **all 3** stores:

| Film | Type | Notes |
|---|---|---|
| Fujifilm 200 / Fujicolor 200 | color, c41 | Fujifilm is entirely absent from the catalog today |
| Fujifilm 400 / Fujicolor 400 | color, c41 | |
| Harman Phoenix 200 | color, c41 | |
| Kodak Ektachrome E100 | color, **e6** | first e6 entry |
| Fujifilm Velvia 100 | color, **e6** | |
| CineStill 800T | color, c41 | tungsten-balanced |
| CineStill 400D | color, c41 | |
| CineStill 50D | color, c41 | |
| Ilford FP4 Plus 125 | bw | |
| Ilford Delta 100 | bw | |
| Ilford Delta 3200 | bw | |
| Ilford XP2 Super 400 | bw | C-41 process B&W |
| Kodak T-MAX P3200 | bw | |

**Alias caution**: `matchesFilmAliases()` (in `stores/shared.ts`) requires every alias
token ≥3 chars to appear *as a substring* of the title, so generic aliases over-match.
Two known hazards, both activated by this phase:

- `"fujifilm 200"` is far looser than the existing Kodak aliases — Fuji entries need
  tighter aliases, verified against a real catalogue before merging.
- **ISO numbers match inside other numbers.** Alias `"delta 100"` matches
  *"Ilford Delta 400 | 35mm | 100ft roll"*, because `100` occurs in `100ft`. Adding
  Delta 100 alongside the existing Delta 400 therefore risks mis-assigning bulk rolls.
  In bulk mode the first film in `filmSeeds` order wins, which makes the outcome
  order-dependent rather than wrong-by-default — but it should be fixed properly by
  matching ISO on a word boundary rather than by substring.

### Expired stock — flag, don't filter

Several stores sell expired film cheaply. Without handling, an expired roll wins the
"lowest 3 offers" display and reads as fresh stock. Observed at Studio Argentique:

| Harman Phoenix 200 | Price |
|---|---|
| Expired May 2026 | **$10.99** |
| Fresh, same store | $16.99 |
| Fresh, Aden Camera | $18.99 |

Plan:
1. Migration `003` (both `migrations/` **and** `migrations_sqlite/`):
   `listings.is_expired BOOLEAN NOT NULL DEFAULT FALSE` + `listings.expiry_label TEXT`.
2. `parseExpiry()` in `stores/shared.ts` — four observed formats:
   `[Expired 01/2025]`, `[Expired 08/23]`, `- Expired May 2026`, `(expired)` (no date).
3. Thread `isExpired` / `expiryLabel` through `upsertListingAndSnapshot()` exactly as
   `isBulk` is handled today.
4. Add `AND l.is_expired = FALSE` to the top-3 query in `api/prices.ts`.

## Phase 1.5 — Expired-film deals callout

Turn the flag into a feature: `GET /api/deals/expired` returning expired listings
joined against the cheapest **fresh** price for the same film, with a discount %.
UI: a dismissible callout above the film table, hidden entirely when empty.

Three rules, based on what the data actually looks like:
- **In-stock only** — of 6 expired 35mm listings found across three stores, 5 were
  sold out.
- **Require a fresh comparison price** — the discount is the product; a bare expired
  price means nothing.
- **Minimum discount threshold (~15%)** — barely-cheaper expired film is risk, not a deal.

Expect this to be quiet at first: 5 of those 6 expired listings are for films *not yet
tracked* (CineStill 50D, Phoenix 200, T-MAX 3200, Fomapan 100/400). The box fills up
as Phase 1/2 land.

## Phase 2 — Second-tier films (2 of 3 stores)

Kentmere PAN 100 / PAN 200, Fujifilm Provia 100F, Velvia 50, Acros 100 II,
Harman RED 125, Kodak Pro Image 100, Kodacolor 100 / 200, Fomapan 100 / 200 / 400,
Lomography CN 400 / CN 800 / Metropolis, CineStill BwXX, and Flic Film
(Canadian — Aurora 400, Elektra 100, Cine Colour 250D / 500T).

### Candido — ⚠️ blocked on Beau Photo

**Candido 200 / 400 / 800** (Candido Collective, UK). All three are C-41 colour
negative respools of Kodak Vision3 with the remjet removed — the same idea as
CineStill: 200 ← Kodak 200T, 400 ← Kodak 250D, 800 ← Kodak 500T. 35mm, 36 exp.

Unlike everything else in Phase 1/2, Candido was **not** picked from the
availability survey — it is stocked at exactly one surveyed store, and that store
is the one that doesn't currently work:

| Store | Candido 200 | Candido 400 | Candido 800 |
|---|---|---|---|
| Beau Photo | $25.95, in stock | $25.95, in stock | $25.95, out of stock |
| Popho / Studio Argentique / Aden / Graination | — | — | — |

Two blockers, both in Beau Photo rather than in the catalogue entry:

1. **Titles carry no format marker.** The listings are literally
   `"Candido 400 Colour Film"` — no `35mm`, no `135` — so `looksLike35mm()`
   rejects them outright. This is the same reason Beau Photo only yields ~3–6
   listings overall.
2. **Beau Photo is still per-film mode** and its catalogue is 2,317 products
   (24 pages via the Store API), so it needs the bulk conversion too.

Its categories (`Colour Film and Paper` / `Black & White Film and Paper`) confirm
*film* but not *format*, and it sells 120 as well — so this needs real format
inference, not just a transport swap.

**Adding Candido to `filmSeeds` before that work lands would produce zero listings
at every store.** Sequence it after the Beau Photo adapter work.

## Phase 3 — Cleanup

- Delete the orphan `kodak-ektacolor` row.
- Wire up or delete `stores/downtownCamera.ts` and `stores/lordPhoto.ts`.
- Diagnose Kerrisdale (`scripts/diagnose-kerrisdale.ts` already exists).

## Phase 4 — Automated monitoring & maintenance

Split by blast radius. **Most of this is deliberately not an LLM job.**

### 4a. Daily health checks — deterministic, no LLM
Wire up `scrape_runs` (Phase 0) and assert on it after each run: store returned zero
listings, freshness ratio fell vs. the previous run, budget truncation fired, a film
lost all offers, a price moved >40%. This is plain SQL — it catches every bug listed
in *Known issues* above, costs nothing, and cannot hallucinate. Surface via the
already-planned `GET /api/stores/health`.

### 4b. Golden-fixture adapter tests — prerequisite for 4d
No test runner exists yet. Save a real HTML/JSON response per store as a fixture and
assert the adapter extracts a known price/stock value. Scrapers fail *silently* — a
broken selector returns zero rows, which is indistinguishable from "store has no
stock" — so this is the only reliable signal that an adapter still works. Milestone 3
already called for "fixtures/tests per store"; this is that work.

### 4c. Claude-assisted film discovery — in-app, propose only
Phase 0 makes this nearly free: the bulk catalogs already contain every product each
store sells. Diff them against `filmSeeds` to get unrecognised 35mm products, then use
Claude to turn messy titles (e.g. `"Flic Film - Kodak Vision3 250D | 35mm - 36 Exposures"`)
into structured `FilmSeed` records (brand, name, iso, type, process, aliases).

- Single-call classification/extraction — use the official SDK (`@anthropic-ai/sdk`)
  with **structured outputs** (`output_config.format` via `client.messages.parse()`)
  so results are schema-valid rather than parsed prose.
- Model: `claude-opus-5`. Tune `output_config.effort` down before considering a
  cheaper model if volume ever grows.
- **Write to a `film_candidates` table for human approval — never auto-merge.**
  Aliases *are* the matching key; one sloppy alias silently absorbs unrelated listings
  into the wrong film and only shows up weeks later as bad prices.
- Cost is negligible: only unrecognised titles are sent, so steady state is a handful
  of new products per day.

### 4d. Scheduled repair agent — out-of-app, PR only
A scheduled Claude Code agent (cloud routine) that reads the 4a health report,
reproduces the failure, patches the adapter, runs the 4b tests, and **opens a PR**.
Never auto-merge, and never let the running server rewrite its own adapters.

This fits the existing deploy path: merge → NAS `git pull` → `docker compose up -d --build`
(see `DEPLOY.md`).

**Order matters**: 4a and 4b must exist before 4d, or the agent has no signal for
whether a patch fixed or broke anything.

---

## Milestones
1. **Scaffold app + DB schema**
   - Monorepo, Postgres, migrations, API skeleton, minimal UI
2. **Implement 2 stores end-to-end** ✅
   - The Camera Store adapter
   - Beau Photo adapter (WooCommerce variation parsing)
3. **Add remaining 8 stores**
   - One store at a time, with fixtures/tests per store
   - ⚠️ Fixtures/tests were never written — see *Phase 4b*
4. **Reliability**
   - scrape run logs, store health, better matching diagnostics
   - ⚠️ Not started; `scrape_runs` is still unwritten — see *Phase 0* and *Phase 4a*
5. **History + deployment + UX** ✅
   - **Price history chart** in film detail (`GET /api/films/:id/price-history` + `web/src/ui/PriceHistoryChart.tsx`)
   - **Inline film detail** in the main table (accordion row under the selected film; no separate detail block above the list)
   - Scheduled scrapes + LAN / reverse-proxy deployment settings (see above)
6. **Enhancements (v1.5+ backlog)**
   - optional per-roll normalization, alerts, richer history (e.g. per-store lines)

## Definition of done (v1)
- For each film in the curated catalog, the UI shows **up to 3 in-stock CAD offers** from the 10 stores above, with working links and last-checked time.
- Opening a film shows **all** matching offers and a **six-month lowest-price-by-day** chart (when snapshot data exists) **inline in the table** under that film, without losing scroll context at the top of the page.

