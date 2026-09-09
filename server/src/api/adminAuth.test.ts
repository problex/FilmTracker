import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertAdminTokenConfigured, requireAdmin } from "./adminAuth.js";

/**
 * `/api/admin/*` was reachable unauthenticated from the public internet, where
 * `POST /api/admin/scrape` starts a twenty-minute scrape against ten stores. These
 * tests exist so that cannot come back quietly.
 */

type FakeRes = {
  statusCode: number | null;
  body: unknown;
  status: (c: number) => FakeRes;
  json: (b: unknown) => FakeRes;
};

function res(): FakeRes {
  const r: FakeRes = {
    statusCode: null,
    body: null,
    status(c) {
      r.statusCode = c;
      return r;
    },
    json(b) {
      r.body = b;
      return r;
    },
  };
  return r;
}

function req(headers: Record<string, string> = {}) {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return { get: (name: string) => lower[name.toLowerCase()] } as never;
}

const ORIGINAL = process.env.ADMIN_TOKEN;

beforeEach(() => {
  process.env.ADMIN_TOKEN = "correct-horse-battery-staple";
});

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.ADMIN_TOKEN;
  else process.env.ADMIN_TOKEN = ORIGINAL;
});

describe("requireAdmin", () => {
  it("passes a correct token", () => {
    const next = vi.fn();
    const r = res();
    requireAdmin(req({ "x-admin-token": "correct-horse-battery-staple" }), r as never, next);

    expect(next).toHaveBeenCalledOnce();
    expect(r.statusCode).toBe(null);
  });

  it("accepts the same token as a bearer, for curl and cron", () => {
    const next = vi.fn();
    requireAdmin(
      req({ authorization: "Bearer correct-horse-battery-staple" }),
      res() as never,
      next
    );
    expect(next).toHaveBeenCalledOnce();
  });

  it("rejects a missing, wrong, or differently-sized token", () => {
    const cases: Record<string, string>[] = [
      {},
      { "x-admin-token": "" },
      { "x-admin-token": "wrong" },
      { "x-admin-token": "correct-horse-battery-stapl" },
      { "x-admin-token": "correct-horse-battery-staple-extra" },
      // A prefix must not pass: the length check has to reject before comparing.
      { "x-admin-token": "correct" },
    ];

    for (const headers of cases) {
      const next = vi.fn();
      const r = res();
      requireAdmin(req(headers), r as never, next);

      expect(next, `${JSON.stringify(headers)} should not pass`).not.toHaveBeenCalled();
      expect(r.statusCode).toBe(401);
    }
  });

  /**
   * The failure mode that matters: an unset token must never mean "allow everyone".
   */
  it("refuses to serve when no token is configured", () => {
    delete process.env.ADMIN_TOKEN;
    const next = vi.fn();
    const r = res();
    requireAdmin(req({ "x-admin-token": "anything" }), r as never, next);

    expect(next).not.toHaveBeenCalled();
    expect(r.statusCode).toBe(503);
  });

  it("fails startup when no token is configured", () => {
    delete process.env.ADMIN_TOKEN;
    expect(() => assertAdminTokenConfigured()).toThrow(/ADMIN_TOKEN/);

    process.env.ADMIN_TOKEN = "   ";
    expect(() => assertAdminTokenConfigured(), "whitespace is not a token").toThrow(/ADMIN_TOKEN/);
  });
});
