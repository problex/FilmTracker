BEGIN;

-- Which films the site shows by default, and which stores bother scraping them.
--
-- 'core' is the curated, widely-stocked set; 'extended' is everything else. The
-- distinction exists for two reasons at once: a list of hundreds of films is not
-- browsable, and the two browser-driven stores load a page per film at ~12s each, so
-- scraping an extended catalogue at those stores would take hours. Extended films are
-- still covered by the seven bulk stores, which cost nothing extra per film.
ALTER TABLE films ADD COLUMN IF NOT EXISTS tier TEXT NOT NULL DEFAULT 'core';

CREATE INDEX IF NOT EXISTS films_tier_idx ON films (tier);

COMMIT;
