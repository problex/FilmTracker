BEGIN;

-- Mirrors migrations/003_add_expired.sql. SQLite has no ADD COLUMN IF NOT EXISTS,
-- so this follows the same one-shot pattern as 002_add_exposures.sql.
ALTER TABLE listings ADD COLUMN is_expired INTEGER NOT NULL DEFAULT 0;
ALTER TABLE listings ADD COLUMN expiry_label TEXT;

COMMIT;
