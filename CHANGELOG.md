# Changelog

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
