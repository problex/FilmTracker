BEGIN;

-- The baseline a drop is measured against: the best price per film at the end of the
-- previous scrape. Comparing successive runs is far steadier than reading back through
-- price_snapshots, where a listing appearing or vanishing looks like a price change.
CREATE TABLE IF NOT EXISTS film_best_price (
  film_id TEXT PRIMARY KEY REFERENCES films(id) ON DELETE CASCADE,
  -- Cents per comparable unit: the ticket price for 35mm, the price per shot for
  -- instant. Comparing a Polaroid five-pack against a single by ticket price would
  -- report a restock as a price rise.
  best_cents INTEGER NOT NULL,
  unit TEXT NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- What each follower was last told, so a film that simply sits cheap is announced
-- once rather than at every scrape. NULL means re-armed: the next qualifying fall
-- will be sent.
CREATE TABLE IF NOT EXISTS alert_state (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  film_id TEXT NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  last_alerted_cents INTEGER,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, film_id)
);

-- Audit: what actually went out. Kept separate from alert_state because state is
-- overwritten every run and this is the record of what a person was sent.
CREATE TABLE IF NOT EXISTS alert_deliveries (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  film_id TEXT NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  price_cad_cents INTEGER NOT NULL,
  channel TEXT NOT NULL DEFAULT 'email',
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS alert_deliveries_user_idx ON alert_deliveries (user_id, sent_at);

COMMIT;
