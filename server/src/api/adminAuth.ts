import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

/**
 * Guards `/api/admin/*`.
 *
 * These routes were open to anyone who could reach the API. That was survivable while
 * the site was LAN-only, but it is served publicly through the reverse proxy, so
 * `POST /api/admin/scrape` let any caller start a twenty-minute scrape — a free denial
 * of service against the NAS, and a good way to get the scraper IP-banned by ten
 * stores at once.
 *
 * A shared token rather than a user session: these are operator endpoints called by
 * cron and by hand, not by a signed-in reader, and tying them to the reader accounts
 * would mean a logged-in reader could trigger a scrape.
 */
export function readAdminToken(): string | null {
  const raw = process.env.ADMIN_TOKEN?.trim();
  return raw ? raw : null;
}

/**
 * Fails startup when no token is configured.
 *
 * Deliberately not a default-open fallback: the whole reason this middleware exists is
 * that an unauthenticated admin API is easy not to notice. A server that refuses to
 * boot gets fixed; one that quietly serves an open endpoint does not.
 */
export function assertAdminTokenConfigured(): void {
  if (readAdminToken()) return;
  throw new Error(
    "ADMIN_TOKEN is not set. /api/admin/* would be unauthenticated, and the API is " +
      "reachable from the internet. Set it in server/.env (openssl rand -hex 32)."
  );
}

/** Constant-time compare that tolerates differing lengths without leaking them. */
function tokensMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) {
    // Still burn a comparison so the failure takes the same shape as a wrong token.
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const expected = readAdminToken();
  if (!expected) {
    // assertAdminTokenConfigured() should have stopped startup; this is the belt to
    // that braces, so a misconfigured process cannot serve these routes open.
    return res.status(503).json({ error: "Admin API not configured" });
  }

  const header = req.get("x-admin-token");
  const bearer = req.get("authorization")?.replace(/^Bearer\s+/i, "");
  const provided = header ?? bearer;

  if (!provided || !tokensMatch(provided, expected)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  return next();
}
