BEGIN;

-- Every price query finds a listing's newest snapshot, and /api/prices and the film
-- detail view find listings by film. Neither had an index, so each lookup scanned the
-- whole snapshot table, which grows by one row per listing per scrape: by 2026-09
-- the 35mm page took 1.3s to load and was still getting slower.
CREATE INDEX IF NOT EXISTS price_snapshots_listing_captured_idx
  ON price_snapshots (listing_id, captured_at DESC);

CREATE INDEX IF NOT EXISTS listings_film_idx ON listings (film_id);

COMMIT;
