import { createHmac, timingSafeEqual } from "node:crypto";
import { db as dbPromise } from "../db/db.js";
import { createMailer } from "../mail/mailer.js";
import { dropPercentBetween, evaluateAlert } from "./evaluate.js";

/**
 * Runs after each scrape: works out what got cheaper, and tells the people who asked.
 *
 * Deliberately not part of `runScrape()`. A mail outage or a bad API key must not be
 * able to mark a perfectly good scrape as failed, and the health check reads scrape
 * status.
 */

type BestOffer = {
  film_id: string;
  brand: string;
  film_name: string;
  format: string;
  url: string;
  store_name: string;
  price_cad_cents: number;
  unit_cents: number;
};

function dropPercentSetting() {
  const raw = Number(process.env.ALERT_DROP_PERCENT);
  return Number.isFinite(raw) && raw > 0 && raw < 100 ? raw : 10;
}

function publicBaseUrl() {
  return (process.env.PUBLIC_BASE_URL ?? "http://localhost:5173").replace(/\/+$/, "");
}

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Unsubscribe links are an HMAC of the user id rather than a stored column: nothing to
 * migrate or backfill, and rotating the secret invalidates every outstanding link.
 */
function unsubscribeSecret() {
  return process.env.ALERT_SECRET ?? process.env.ADMIN_TOKEN ?? "";
}

export function unsubscribeSignature(userId: string) {
  return createHmac("sha256", unsubscribeSecret()).update(`unsubscribe:${userId}`).digest("hex");
}

export function verifyUnsubscribe(userId: string, signature: string) {
  const expected = unsubscribeSignature(userId);
  const a = Buffer.from(signature, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Best current offer per film, by comparable unit.
 *
 * Same shape as the `latest` CTE in api/deals.ts and api/prices.ts: newest snapshot
 * per listing, then rank. `ROW_NUMBER` rather than `DISTINCT ON` so this runs on
 * SQLite too, matching the existing convention.
 */
async function loadBestOffers(): Promise<BestOffer[]> {
  const db = await dbPromise;
  const seenSince =
    db.dialect === "postgres" ? "NOW() - INTERVAL '2 days'" : "datetime('now','-2 days')";

  const result = await db.query<BestOffer>(
    `
    WITH latest AS (
      SELECT listing_id, price_cad_cents, in_stock
      FROM (
        SELECT ps.listing_id, ps.price_cad_cents, ps.in_stock,
               ROW_NUMBER() OVER (PARTITION BY ps.listing_id ORDER BY ps.captured_at DESC) AS rn
        FROM price_snapshots ps
      ) t
      WHERE rn = 1
    ),
    priced AS (
      SELECT
        l.film_id,
        f.brand,
        f.name AS film_name,
        f.format,
        l.url,
        s.name AS store_name,
        latest.price_cad_cents,
        CASE WHEN f.format = 'instant'
             THEN latest.price_cad_cents * 1.0
                  / (COALESCE(l.exposures, 8) * COALESCE(NULLIF(l.pack_size, 0), 1))
             ELSE latest.price_cad_cents * 1.0
        END AS unit_cents
      FROM latest
      JOIN listings l ON l.id = latest.listing_id
      JOIN films f ON f.id = l.film_id
      JOIN stores s ON s.id = l.store_id
      WHERE latest.in_stock = TRUE
        AND l.is_expired = FALSE
        AND l.last_seen_at >= ${seenSince}
    ),
    ranked AS (
      SELECT priced.*, ROW_NUMBER() OVER (PARTITION BY film_id ORDER BY unit_cents ASC) AS rn
      FROM priced
    )
    SELECT film_id, brand, film_name, format, url, store_name, price_cad_cents, unit_cents
    FROM ranked
    WHERE rn = 1
    `
  );

  return result.rows;
}

type Follow = {
  user_id: string;
  email: string;
  film_id: string;
  target_price_cad_cents: number | null;
  last_alerted_cents: number | null;
};

async function loadFollows(): Promise<Follow[]> {
  const db = await dbPromise;
  const result = await db.query<Follow>(
    `SELECT ff.user_id, u.email, ff.film_id, ff.target_price_cad_cents, st.last_alerted_cents
       FROM film_follows ff
       JOIN users u ON u.id = ff.user_id
       LEFT JOIN alert_state st ON st.user_id = ff.user_id AND st.film_id = ff.film_id`
  );
  return result.rows;
}

type PendingAlert = {
  film: BestOffer;
  previousCents: number | null;
  currentCents: number;
};

function alertEmail(email: string, userId: string, alerts: PendingAlert[]) {
  const lines: string[] = ["Prices dropped on film you follow:", ""];

  for (const a of alerts) {
    const perShot = a.film.format === "instant";
    const headline = perShot
      ? `${money(Math.round(a.currentCents))}/shot (${money(a.film.price_cad_cents)} a pack)`
      : money(a.film.price_cad_cents);
    const was =
      a.previousCents != null
        ? ` — down ${dropPercentBetween(a.previousCents, a.currentCents)}% from ${money(
            Math.round(a.previousCents)
          )}${perShot ? "/shot" : ""}`
        : "";

    lines.push(`${a.film.brand} ${a.film.film_name}`);
    lines.push(`  ${headline} at ${a.film.store_name}${was}`);
    lines.push(`  ${a.film.url}`);
    lines.push("");
  }

  const sig = unsubscribeSignature(userId);
  lines.push(`Manage what you follow: ${publicBaseUrl()}/#/account`);
  lines.push(
    `Stop all alerts: ${publicBaseUrl()}/api/alerts/unsubscribe?u=${encodeURIComponent(
      userId
    )}&t=${sig}`
  );

  return {
    to: email,
    subject:
      alerts.length === 1
        ? `${alerts[0]!.film.brand} ${alerts[0]!.film.film_name} dropped to ${money(
            alerts[0]!.film.price_cad_cents
          )}`
        : `${alerts.length} films you follow dropped in price`,
    text: lines.join("\n"),
  };
}

export type AlertRunSummary = {
  filmsPriced: number;
  followsChecked: number;
  emailsSent: number;
  alertsSent: number;
};

export async function runAlerts(): Promise<AlertRunSummary> {
  const db = await dbPromise;
  const dropPercent = dropPercentSetting();

  const offers = await loadBestOffers();
  const byFilm = new Map(offers.map((o) => [o.film_id, o]));

  const previousRows = await db.query<{ film_id: string; best_cents: number }>(
    `SELECT film_id, best_cents FROM film_best_price`
  );
  const previous = new Map(previousRows.rows.map((r) => [r.film_id, Number(r.best_cents)]));

  const follows = await loadFollows();
  const perUser = new Map<string, { email: string; alerts: PendingAlert[] }>();

  for (const follow of follows) {
    const offer = byFilm.get(follow.film_id);
    const currentCents = offer ? offer.unit_cents : null;

    const decision = evaluateAlert({
      currentCents: currentCents == null ? null : Math.round(currentCents),
      previousCents: previous.get(follow.film_id) ?? null,
      targetCents: follow.target_price_cad_cents,
      lastAlertedCents: follow.last_alerted_cents,
      dropPercent,
    });

    // Written every run, alert or not — re-arming is a state change too.
    await db.query(
      `INSERT INTO alert_state (user_id, film_id, last_alerted_cents, updated_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, film_id) DO UPDATE SET
         last_alerted_cents = EXCLUDED.last_alerted_cents,
         updated_at = EXCLUDED.updated_at`,
      [follow.user_id, follow.film_id, decision.lastAlertedCents, new Date().toISOString()]
    );

    if (!decision.alert || !offer || currentCents == null) continue;

    const entry = perUser.get(follow.user_id) ?? { email: follow.email, alerts: [] };
    entry.alerts.push({
      film: offer,
      previousCents: previous.get(follow.film_id) ?? null,
      currentCents,
    });
    perUser.set(follow.user_id, entry);
  }

  // One email per person listing everything that moved, rather than one per film —
  // three separate emails in a minute is how a useful alert becomes a filter rule.
  const mailer = createMailer();
  let emailsSent = 0;
  let alertsSent = 0;

  for (const [userId, { email, alerts }] of perUser) {
    try {
      await mailer.send(alertEmail(email, userId, alerts));
      emailsSent += 1;
      alertsSent += alerts.length;

      for (const a of alerts) {
        await db.query(
          `INSERT INTO alert_deliveries (user_id, film_id, price_cad_cents, channel)
           VALUES ($1, $2, $3, 'email')`,
          [userId, a.film.film_id, a.film.price_cad_cents]
        );
      }
    } catch (e) {
      // One bad address must not stop everyone else's mail. The state row was already
      // written, so a failed send is not retried into a loop — the next genuine drop
      // will still be reported.
      console.error(`Alert email failed for ${email}:`, e instanceof Error ? e.message : e);
    }
  }

  // Baseline for the next run, written last so a crash mid-send does not move it.
  for (const offer of offers) {
    await db.query(
      `INSERT INTO film_best_price (film_id, best_cents, unit, computed_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (film_id) DO UPDATE SET
         best_cents = EXCLUDED.best_cents,
         unit = EXCLUDED.unit,
         computed_at = EXCLUDED.computed_at`,
      [
        offer.film_id,
        Math.round(offer.unit_cents),
        offer.format === "instant" ? "per_shot" : "ticket",
        new Date().toISOString(),
      ]
    );
  }

  const summary: AlertRunSummary = {
    filmsPriced: offers.length,
    followsChecked: follows.length,
    emailsSent,
    alertsSent,
  };
  console.log(
    `Alerts: ${summary.alertsSent} alert(s) in ${summary.emailsSent} email(s) ` +
      `across ${summary.followsChecked} follow(s)`
  );
  return summary;
}
