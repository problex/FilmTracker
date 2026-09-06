BEGIN;

-- 35mm film products the stores sell that the catalogue does not recognise.
--
-- Populated by a set difference against the bulk catalogues the scrape already
-- downloads, so it costs nothing extra. Deliberately raw titles rather than proposed
-- catalogue entries: aliases are the matching key, and a wrong one silently reassigns
-- other films' listings, so writing them stays a human decision.
CREATE TABLE IF NOT EXISTS discovered_titles (
  id BIGSERIAL PRIMARY KEY,
  -- Lowercased, whitespace-collapsed title; one row per distinct product.
  title_key TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  store_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'new', -- new|added|ignored
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS discovered_titles_status_idx ON discovered_titles (status);

COMMIT;
