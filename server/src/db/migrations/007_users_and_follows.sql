BEGIN;

-- The first tables that know who is asking. Added for price alerts: someone has to
-- own a followed film and an email address to send to.
--
-- Sign-in is a passwordless email link, so there is no password column here and never
-- should be — nothing to hash, reset, reuse or leak, which is the right trade for a
-- site whose entire user list is the owner and a few friends.
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  -- Stored lowercased and trimmed; UNIQUE is what stops two accounts for one inbox.
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

-- Only the SHA-256 of the link token is stored. The token itself exists in the email
-- and nowhere else, so a database copy does not hand over a way to sign in as anyone.
CREATE TABLE IF NOT EXISTS login_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  -- Set on first use. A link that has been followed once is spent, so a forwarded or
  -- logged email cannot be replayed.
  used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS login_tokens_user_idx ON login_tokens (user_id);

-- An opaque random id in an httpOnly cookie, rather than a signed JWT, so a session
-- can actually be revoked — deleting the row ends it everywhere.
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);

-- target_price_cad_cents NULL means "tell me about a meaningful drop"; a value means
-- "tell me when it reaches this". Both are compared against the same per-film best
-- price the site displays.
CREATE TABLE IF NOT EXISTS film_follows (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  film_id TEXT NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  target_price_cad_cents INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, film_id)
);

-- The alert pass walks films that dropped and asks who follows them.
CREATE INDEX IF NOT EXISTS film_follows_film_idx ON film_follows (film_id);

COMMIT;
