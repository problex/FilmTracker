BEGIN;

CREATE TABLE IF NOT EXISTS stores (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  province TEXT,
  base_url TEXT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  crawl_delay_ms INTEGER NOT NULL DEFAULT 1000,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS films (
  id TEXT PRIMARY KEY,
  brand TEXT NOT NULL,
  name TEXT NOT NULL,
  iso INTEGER,
  type TEXT NOT NULL, -- "color" | "bw"
  process TEXT,       -- e.g. "c41" | "bw" | "e6"
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS film_aliases (
  film_id TEXT NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  PRIMARY KEY (film_id, alias)
);

CREATE TABLE IF NOT EXISTS listings (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  film_id TEXT NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  title_raw TEXT NOT NULL,
  pack_size INTEGER, -- null unknown; 1 single; 3 / 5 etc
  currency TEXT NOT NULL DEFAULT 'CAD',
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_in_stock_at TIMESTAMPTZ,
  UNIQUE (store_id, url)
);

CREATE TABLE IF NOT EXISTS price_snapshots (
  id BIGSERIAL PRIMARY KEY,
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  price_cad_cents INTEGER NOT NULL,
  in_stock BOOLEAN NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS scrape_runs (
  id BIGSERIAL PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running', -- running|success|partial|failed
  totals JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_summary TEXT
);

COMMIT;

