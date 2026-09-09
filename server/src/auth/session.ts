import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { db as dbPromise } from "../db/db.js";

export const SESSION_COOKIE = "ft_session";
const SESSION_DAYS = 90;
const LOGIN_TOKEN_MINUTES = 15;

/**
 * Postgres returns TIMESTAMPTZ as a Date; SQLite returns whatever string was stored.
 * Comparing these in SQL would need dialect-specific `NOW()` / `datetime('now')` and,
 * worse, would compare ISO strings against SQLite's space-separated format — which
 * silently mis-sorts. These tables are tiny, so the comparison happens in JS where it
 * is unambiguous.
 */
function toDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function isoIn(ms: number) {
  return new Date(Date.now() + ms).toISOString();
}

/** Only the hash is stored, so a database copy cannot be replayed as a sign-in. */
export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function normaliseEmail(raw: string) {
  return raw.trim().toLowerCase();
}

export async function findOrCreateUser(email: string): Promise<string> {
  const db = await dbPromise;
  const normalised = normaliseEmail(email);

  const existing = await db.query<{ id: string }>(`SELECT id FROM users WHERE email = $1`, [
    normalised,
  ]);
  if (existing.rows[0]) return existing.rows[0].id;

  const id = randomUUID();
  await db.query(`INSERT INTO users (id, email) VALUES ($1, $2)`, [id, normalised]);
  return id;
}

/** Returns the raw token to put in the link; only its hash reaches the database. */
export async function createLoginToken(userId: string): Promise<string> {
  const db = await dbPromise;
  const token = randomBytes(32).toString("base64url");

  await db.query(`INSERT INTO login_tokens (token_hash, user_id, expires_at) VALUES ($1, $2, $3)`, [
    hashToken(token),
    userId,
    isoIn(LOGIN_TOKEN_MINUTES * 60_000),
  ]);

  return token;
}

/**
 * Spends a login token. Single use and time limited, so a link sitting in an inbox or
 * a mail server log stops being a way in.
 */
export async function consumeLoginToken(token: string): Promise<string | null> {
  const db = await dbPromise;
  const hash = hashToken(token);

  const found = await db.query<{ user_id: string; expires_at: unknown; used_at: unknown }>(
    `SELECT user_id, expires_at, used_at FROM login_tokens WHERE token_hash = $1`,
    [hash]
  );
  const row = found.rows[0];
  if (!row || row.used_at) return null;

  const expires = toDate(row.expires_at);
  if (!expires || expires.getTime() < Date.now()) return null;

  await db.query(`UPDATE login_tokens SET used_at = $1 WHERE token_hash = $2`, [
    new Date().toISOString(),
    hash,
  ]);

  return row.user_id;
}

export async function createSession(userId: string): Promise<{ id: string; expiresAt: Date }> {
  const db = await dbPromise;
  const id = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);

  await db.query(`INSERT INTO sessions (id, user_id, expires_at) VALUES ($1, $2, $3)`, [
    id,
    userId,
    expiresAt.toISOString(),
  ]);
  await db.query(`UPDATE users SET last_login_at = $1 WHERE id = $2`, [
    new Date().toISOString(),
    userId,
  ]);

  return { id, expiresAt };
}

export async function destroySession(id: string) {
  const db = await dbPromise;
  await db.query(`DELETE FROM sessions WHERE id = $1`, [id]);
}

export type SessionUser = { id: string; email: string };

export async function lookupSession(id: string): Promise<SessionUser | null> {
  const db = await dbPromise;
  const found = await db.query<{ user_id: string; email: string; expires_at: unknown }>(
    `SELECT s.user_id, s.expires_at, u.email
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.id = $1`,
    [id]
  );
  const row = found.rows[0];
  if (!row) return null;

  const expires = toDate(row.expires_at);
  if (!expires || expires.getTime() < Date.now()) {
    await destroySession(id);
    return null;
  }

  return { id: row.user_id, email: row.email };
}

/**
 * Express 4 has no cookie reader without cookie-parser. One header, one format —
 * not worth a dependency.
 */
export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.cookie;
  if (!header) return null;

  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

/** `Secure` would make the cookie undeliverable over plain http in local dev. */
function cookieIsSecure() {
  return (process.env.PUBLIC_BASE_URL ?? "").startsWith("https://");
}

export function setSessionCookie(res: Response, id: string, expiresAt: Date) {
  res.cookie(SESSION_COOKIE, id, {
    httpOnly: true,
    secure: cookieIsSecure(),
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure: cookieIsSecure(),
    sameSite: "lax",
    path: "/",
  });
}

export type AuthedRequest = Request & { user?: SessionUser };

/** Attaches `req.user` when signed in, without requiring it. */
export async function attachUser(req: AuthedRequest, _res: Response, next: NextFunction) {
  const id = readCookie(req, SESSION_COOKIE);
  if (id) {
    try {
      const user = await lookupSession(id);
      if (user) req.user = user;
    } catch {
      // A session lookup failure must not take down a public page.
    }
  }
  next();
}

export function requireUser(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: "Sign in required" });
  return next();
}
