import { Router } from "express";
import { z } from "zod";
import { createMailer } from "../mail/mailer.js";
import {
  clearSessionCookie,
  consumeLoginToken,
  createLoginToken,
  createSession,
  destroySession,
  findOrCreateUser,
  normaliseEmail,
  readCookie,
  SESSION_COOKIE,
  setSessionCookie,
  type AuthedRequest,
} from "../auth/session.js";

export const authRouter = Router();

const requestSchema = z.object({
  // `.trim()` before `.email()`: people paste addresses with surrounding whitespace,
  // and zod's email check rejects those. Because this endpoint always answers ok, a
  // rejection here is invisible — it looked exactly like a delivered email.
  email: z.string().trim().email().max(320),
});

function publicBaseUrl() {
  return (process.env.PUBLIC_BASE_URL ?? "http://localhost:5173").replace(/\/+$/, "");
}

/**
 * Rate limits, in memory.
 *
 * Sending mail on an unauthenticated POST is a way to have your domain used to spam
 * someone else's inbox, and to burn a sending quota. Two windows: one per address, so
 * a single inbox cannot be flooded, and a wider one per IP, so a script cannot cycle
 * through addresses.
 *
 * In memory is honest for a single-container deployment — it resets on restart, which
 * is a far smaller problem than the dependency a shared store would add here.
 */
const WINDOW_MS = 60 * 60_000;
const MAX_PER_EMAIL = 5;
const MAX_PER_IP = 20;

const hits = new Map<string, number[]>();

function overLimit(key: string, max: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(key, recent);

  // Opportunistic cleanup; this map only ever holds an hour of keys.
  if (hits.size > 5_000) {
    for (const [k, times] of hits) {
      if (times.every((t) => now - t >= WINDOW_MS)) hits.delete(k);
    }
  }

  return recent.length > max;
}

function loginEmail(link: string) {
  return {
    subject: "Your FilmTracker sign-in link",
    text: [
      "Here is your sign-in link for FilmTracker:",
      "",
      link,
      "",
      "It works once and expires in 15 minutes.",
      "If you didn't ask for this, you can ignore this email — nothing has changed.",
    ].join("\n"),
  };
}

authRouter.post("/request-link", async (req, res) => {
  const parsed = requestSchema.safeParse(req.body);

  // Always the same answer. Whether an address has an account is not something an
  // unauthenticated caller should be able to test, and the timing difference between
  // "sent" and "not sent" is not worth leaking either.
  const ok = { ok: true as const };

  if (!parsed.success) {
    // Logged, not returned: the caller still gets a plain ok, but a malformed address
    // should not vanish without trace.
    console.warn("Sign-in link requested with an invalid email payload");
    return res.json(ok);
  }

  const email = normaliseEmail(parsed.data.email);
  const ip = req.ip ?? "unknown";

  if (overLimit(`email:${email}`, MAX_PER_EMAIL) || overLimit(`ip:${ip}`, MAX_PER_IP)) {
    console.warn(`Sign-in link rate limited (ip=${ip})`);
    return res.json(ok);
  }

  try {
    const userId = await findOrCreateUser(email);
    const token = await createLoginToken(userId);
    const link = `${publicBaseUrl()}/api/auth/callback?token=${encodeURIComponent(token)}`;
    const { subject, text } = loginEmail(link);
    await createMailer().send({ to: email, subject, text });
  } catch (e) {
    // Still a plain ok: a mail failure is ours to see in the logs, not a signal to
    // hand back to whoever is probing.
    console.error("Failed to send sign-in link:", e instanceof Error ? e.message : e);
  }

  return res.json(ok);
});

authRouter.get("/callback", async (req, res) => {
  const token = typeof req.query.token === "string" ? req.query.token : null;
  if (!token) return res.status(400).send("Missing token");

  const userId = await consumeLoginToken(token);
  if (!userId) {
    return res
      .status(400)
      .send("That sign-in link has expired or was already used. Request a new one.");
  }

  const session = await createSession(userId);
  setSessionCookie(res, session.id, session.expiresAt);

  // Back to the app, without the token sitting in history or a referrer header.
  return res.redirect(302, `${publicBaseUrl()}/#/account`);
});

authRouter.post("/logout", async (req, res) => {
  const id = readCookie(req, SESSION_COOKIE);
  if (id) await destroySession(id);
  clearSessionCookie(res);
  return res.json({ ok: true });
});

authRouter.get("/me", (req: AuthedRequest, res) => {
  if (!req.user) return res.json({ user: null });
  return res.json({ user: { email: req.user.email } });
});
