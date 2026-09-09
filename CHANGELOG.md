# Changelog

## Unreleased

### Polaroid

- **Instant film, on its own page** at `#/polaroid`: Polaroid 600, SX-70 and i-Type in
  colour and black & white, from Aden Camera, Studio Argentique and Beau Photo. Sorted
  by **price per shot**, which is the only figure that compares a single pack against a
  twin pack against a five-pack, and labelled by the camera each pack fits — a 600 pack
  carries the battery a vintage 600 body needs, so 600 film works in i-Type cameras
  while i-Type film does not work in 600 ones.
- **Format is a hard divide in the model**, not a filter: `FilmSeed.format`, a
  `films.format` column, and `GET /api/prices?format=` defaulting to `35mm` so the main
  list and every existing caller are untouched. Candidate films are narrowed by format
  *before* alias matching, so a Polaroid title can never be assigned to a 35mm film.
- Pack maths for instant: 8 shots to a pack, with "Double Pack, 16 Exposures", "2pak",
  "eco 5 pack" and "2x Color - Value Pack" all parsed. Unparsed, a twin pack reads at
  double its true price per shot.
- Browser-driven stores skip instant film — none of them stock it, and each film they
  do not skip costs a page load.

### Operations

- **The repair agent's repair path is tested.** Run end to end against a staged
  silent-zero failure in a throwaway clone: it detected the error without `--force`,
  reproduced against the live store before changing anything, fixed the cause, wrote a
  regression test and opened a PR, without touching an alias, the database or a
  deploy. See PLAN.md §4d.
- **`scripts/run-tests.sh`** runs the server suite wherever Node happens to live —
  local `npm` if present, otherwise the same suite in a container. The repair agent was
  being told to run `npm test` on a host developed entirely through Docker, where no
  Node toolchain exists, so it could never verify a fix; it is now given this wrapper,
  and `repair-agent.sh` refuses to start an investigation it could not verify.

### Scraping

- **`ACCESSORY_RX` is not applied to instant film.** It vetoes "frame" to drop picture
  frames, but Polaroid names its film after the border of the print — "600 White
  Frame", "Color Frame", "Color I Round Frame". Reusing it would have dropped the real
  products while keeping the cameras, which reads as a store carrying no Polaroid
  rather than as an error.
- **Per-store format classifiers are respected rather than replaced.** Deriving a
  candidate's format from its title in the WooCommerce adapter undid what Beau Photo's
  and FilmWarehouse's custom classifiers exist for — their titles omit the format
  entirely. Caught by the existing suite before it shipped.
- **A WooCommerce page limit of 0 no longer means "fetch nothing".** `fetchWooCatalog`
  treats a non-positive limit as unset, so a store cannot be configured into returning
  an empty catalogue that reads as a clean scrape. Covered by a test that runs the
  *exported* FilmWarehouse adapter — every existing adapter test builds its own
  adapter and passes no page limit, so none of them exercised a shipped store config.

## v1.0.0 — 2026-09-06

First tagged release. Tracks **115 films across 10 Canadian stores**, with roughly
560 live listings and six months of price history.

### Scraping

- **Bulk catalogue mode.** Store adapters can fetch a whole catalogue in a couple of
  requests and match every film locally, instead of searching once per film. Eight of
  ten stores use it. Adding a film to those stores now costs nothing measurable —
  Beau Photo returned 19 more listings in *less* time after the catalogue grew.
- Shopify (`products.json`) and WooCommerce (Store API) adapters, plus per-store
  format detection where a store needs it: Beau Photo omits the format from most
  titles and contradicts itself in its categories, so it is read from the `35mm` tag
  and each variation's `Film Format` slug.
- **Sténopé Lab (Montréal) in French** — `36 poses`, `Pack 3`, `paquet de 5`,
  `Expiré 09/2024`, `100 pieds`.
- Browser-driven stores (Dons Photo, Kerrisdale) read products from the DOM rather
  than from page text, and skip extended-tier films.
- `scrape_runs` records every run: status, per-store totals, mode, duration, errors.

### Catalogue

- 115 films in two tiers: **52 core**, shown by default and scraped everywhere, and
  **63 extended**, shown on request and skipped by the slow browser stores. Without
  the split those two stores would take about 45 minutes longer per scrape.
- `npm run discover` reports 35mm film the stores sell that the catalogue does not
  track, as a set difference against catalogues already downloaded. No API key, no
  model, no extra requests.

### Site

- Lowest three in-stock offers per film, with a six-month price history chart inline
  under each film.
- **Expired-film deals** — in-stock expired or short-dated stock, compared against the
  cheapest fresh offer of the same film, pack size, bulk flag and exposure count.
- **Multipacks cheaper per roll** than the cheapest comparable single roll. Carries a
  maximum saving as well as a minimum, because the two largest apparent bargains in
  the data were both scraper defects.
- **Search** across brand, name, ISO and process, ignoring punctuation and spacing, and
  reaching across both tiers.
- **Mobile**: films stack as cards instead of scrolling sideways.

### Operations

- `GET /api/stores/health` and `scripts/health-check.sh` report scrape health from
  `scrape_runs` and current listing state. Deterministic; no model involved.
- `scripts/repair-agent.sh` asks Claude Code to investigate on a branch and open a PR
  when health reports an error. Its no-op path is verified; the repair path is not.
- 41 tests, including adapter tests against saved store responses. Mutation-checked:
  reintroducing an old matcher bug fails exactly the tests that encode it.
- Deployed on a Synology NAS via Docker Compose; see `DEPLOY.md`.

### Data-correctness fixes worth recording

Scrapers fail silently — a broken matcher returns plausible rows rather than an
error — so most of these were found by validating against thousands of real listing
titles, not by reading code.

- **Films were being priced as other films.** Kentmere PAN 100 and 200 were recorded
  as PAN 400 at four stores. Four distinct causes: an ISO matching inside another
  number (`delta 100` vs `100ft`), a rule that skipped two-character tokens so
  `cinestill 50` matched every CineStill, a bare brand alias catching Super 8, and
  `harman red` matching every listing marked `Expi**red**`.
- **Two-character tokens are never load-bearing.** The same collapse later made
  `flic film xx` match every Flic Film product and `lomography cn 400` match every
  Lomography film of that speed.
- **Whole pages scraped as single listings.** Dons Photo recorded a 3-pack at the
  single-roll price, with the pack size taken from a different product on the same
  search page; its titles averaged 1,285 characters.
- **The scrape was silently truncating.** A per-film search cost ~5.5s against a 90s
  budget, so films past roughly index 10 were never refreshed — the entire B&W half
  of the catalogue at one store.
- **Prices off by 100x, avoided.** Shopify's `products.json` returns dollars as
  strings where `/products/<handle>.js` returns integer cents.
- **Deal comparisons were apples-to-oranges.** Expired multipacks were measured
  against fresh single rolls, so no multipack could ever surface as a deal.
