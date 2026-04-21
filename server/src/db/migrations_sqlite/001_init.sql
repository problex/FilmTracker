BEGIN;

CREATE TABLE IF NOT EXISTS stores (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  province TEXT,
  base_url TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  crawl_delay_ms INTEGER NOT NULL DEFAULT 1000,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS films (
  id TEXT PRIMARY KEY,
  brand TEXT NOT NULL,
  name TEXT NOT NULL,
  iso INTEGER,
  type TEXT NOT NULL,
  process TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS film_aliases (
  film_id TEXT NOT NULL,
  alias TEXT NOT NULL,
  PRIMARY KEY (film_id, alias),
  FOREIGN KEY (film_id) REFERENCES films(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS listings (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  film_id TEXT NOT NULL,
  url TEXT NOT NULL,
  title_raw TEXT NOT NULL,
  pack_size INTEGER,
  currency TEXT NOT NULL DEFAULT 'CAD',
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_in_stock_at TEXT,
  UNIQUE (store_id, url),
  FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
  FOREIGN KEY (film_id) REFERENCES films(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS price_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id TEXT NOT NULL,
  price_cad_cents INTEGER NOT NULL,
  in_stock INTEGER NOT NULL,
  captured_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS scrape_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT,
  status TEXT NOT NULL DEFAULT 'running',
  totals TEXT NOT NULL DEFAULT '{}',
  error_summary TEXT
);

COMMIT;

