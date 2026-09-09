BEGIN;

CREATE TABLE IF NOT EXISTS film_best_price (
  film_id TEXT PRIMARY KEY,
  best_cents INTEGER NOT NULL,
  unit TEXT NOT NULL,
  computed_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (film_id) REFERENCES films(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS alert_state (
  user_id TEXT NOT NULL,
  film_id TEXT NOT NULL,
  last_alerted_cents INTEGER,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, film_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (film_id) REFERENCES films(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS alert_deliveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  film_id TEXT NOT NULL,
  price_cad_cents INTEGER NOT NULL,
  channel TEXT NOT NULL DEFAULT 'email',
  sent_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (film_id) REFERENCES films(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS alert_deliveries_user_idx ON alert_deliveries (user_id, sent_at);

COMMIT;
