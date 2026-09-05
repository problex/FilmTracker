BEGIN;

-- Stores sell expired film cheaply. Without a flag it wins the "lowest 3 offers"
-- display and reads as fresh stock, so record it and exclude it from the headline
-- prices instead of dropping the listing.
ALTER TABLE listings ADD COLUMN IF NOT EXISTS is_expired BOOLEAN NOT NULL DEFAULT FALSE;
-- Free text as written by the store, e.g. "01/2025" or "May 2026"; NULL when the
-- listing says it is expired without naming a date.
ALTER TABLE listings ADD COLUMN IF NOT EXISTS expiry_label TEXT;

COMMIT;
