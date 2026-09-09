BEGIN;

-- Format is a hard divide rather than a filter: instant film has no comparable ISO,
-- is chosen by camera compatibility rather than by roll length, and is priced per
-- shot, so it is shown on its own page instead of in the 35mm list. Existing rows are
-- all 35mm, which is why that is the default.
ALTER TABLE films ADD COLUMN IF NOT EXISTS format TEXT NOT NULL DEFAULT '35mm';

CREATE INDEX IF NOT EXISTS films_format_idx ON films (format);

COMMIT;
