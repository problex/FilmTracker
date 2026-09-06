BEGIN;

CREATE TABLE IF NOT EXISTS discovered_titles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title_key TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  store_ids TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'new',
  first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_at TEXT
);

CREATE INDEX IF NOT EXISTS discovered_titles_status_idx ON discovered_titles (status);

COMMIT;
