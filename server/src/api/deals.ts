import { Router } from "express";
import { z } from "zod";
import { db as dbPromise } from "../db/db.js";
import type { ExpiredDealDto, MultipackDealDto } from "./types.js";

/**
 * Expired-stock deals.
 *
 * Expired film is excluded from the headline prices (see `api/prices.ts`) because it
 * would win the lowest-price display while reading as fresh stock. It is still worth
 * buying though, so surface it separately — but only where it is actually a deal:
 *
 *  - in stock, since most expired listings are sold out and a deal you cannot buy is noise;
 *  - with a fresh price for the same film **and the same pack size** to compare
 *    against, because the discount is the product — "$21.99 expired" on its own means
 *    nothing, and pricing an expired 3-pack against a fresh single roll makes every
 *    multipack look like a markup;
 *  - beyond a minimum discount, since barely-cheaper expired film is risk, not a saving.
 */
const querySchema = z.object({
  /** Minimum saving vs. the cheapest fresh offer, in percent. */
  minDiscount: z
    .coerce
    .number()
    .min(0)
    .max(99)
    .optional()
    .transform((v) => v ?? 15),
});

export const dealsRouter = Router();

const multipackQuerySchema = z.object({
  /** Minimum per-roll saving vs. the cheapest comparable single roll, in percent. */
  minSaving: z.coerce.number().min(0).max(99).optional().transform((v) => v ?? 10),
  /**
   * Savings above this are treated as bad data rather than bargains. Scraped
   * multipacks have produced a "5-pack" that was really a single roll and a 3-pack
   * priced from a different product on the same page; both looked like the best
   * deals on the site because implausible savings sort to the top.
   */
  maxSaving: z.coerce.number().min(1).max(100).optional().transform((v) => v ?? 70),
});

/**
 * Multipacks that work out cheaper per roll than buying singles.
 *
 * Compared like for like: same film, same exposure count, neither bulk nor expired,
 * both in stock. The single-roll price is the cheapest across all stores, since that
 * is the real alternative to buying the pack.
 */
dealsRouter.get("/multipacks", async (req, res) => {
  const parsed = multipackQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "Invalid query params" });
  const { minSaving, maxSaving } = parsed.data;

  const db = await dbPromise;
  const seenSinceSql =
    db.dialect === "postgres" ? "NOW() - INTERVAL '2 days'" : "datetime('now','-2 days')";

  const result = await db.query<{
    film_id: string;
    brand: string;
    name: string;
    store_id: string;
    store_name: string;
    url: string;
    title_raw: string;
    pack_size: number;
    exposures: number | null;
    price_cad_cents: number;
    per_roll_cad_cents: number;
    single_price_cad_cents: number;
    single_store_name: string;
  }>(
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
    live AS (
      SELECT l.id, l.film_id, l.store_id, l.url, l.title_raw,
             COALESCE(l.pack_size, 1) AS pack_size,
             COALESCE(l.exposures, 0) AS exposures,
             latest.price_cad_cents AS cents
      FROM latest
      JOIN listings l ON l.id = latest.listing_id
      WHERE l.last_seen_at >= ${seenSinceSql}
        AND latest.in_stock = TRUE
        AND l.is_bulk = FALSE
        AND l.is_expired = FALSE
    ),
    -- Cheapest single roll per film and exposure count, with the store that has it.
    -- ROW_NUMBER rather than DISTINCT ON, so this runs on SQLite as well.
    singles AS (
      SELECT film_id, exposures, cents, store_id
      FROM (
        SELECT film_id, exposures, cents, store_id,
               ROW_NUMBER() OVER (PARTITION BY film_id, exposures ORDER BY cents ASC) AS rn
        FROM live
        WHERE pack_size = 1
      ) t
      WHERE rn = 1
    )
    SELECT
      p.film_id, f.brand, f.name,
      s.id AS store_id, s.name AS store_name,
      p.url, p.title_raw, p.pack_size,
      NULLIF(p.exposures, 0) AS exposures,
      p.cents AS price_cad_cents,
      (p.cents / p.pack_size) AS per_roll_cad_cents,
      sg.cents AS single_price_cad_cents,
      ss.name AS single_store_name
    FROM live p
    JOIN singles sg ON sg.film_id = p.film_id AND sg.exposures = p.exposures
    JOIN films f ON f.id = p.film_id
    JOIN stores s ON s.id = p.store_id
    JOIN stores ss ON ss.id = sg.store_id
    WHERE p.pack_size > 1
      AND f.enabled = TRUE
      AND (p.cents / p.pack_size) * 100 <= sg.cents * (100 - $1)
      AND (p.cents / p.pack_size) * 100 >= sg.cents * (100 - $2)
    ORDER BY (sg.cents - (p.cents / p.pack_size)) * 1.0 / sg.cents DESC
    `,
    [minSaving, maxSaving]
  );

  const deals: MultipackDealDto[] = result.rows.map((r) => ({
    filmId: r.film_id,
    brand: r.brand,
    name: r.name,
    storeId: r.store_id,
    storeName: r.store_name,
    url: r.url,
    titleRaw: r.title_raw,
    packSize: r.pack_size,
    exposures: r.exposures,
    priceCadCents: r.price_cad_cents,
    perRollCadCents: r.per_roll_cad_cents,
    singlePriceCadCents: r.single_price_cad_cents,
    singleStoreName: r.single_store_name,
    savingPercent: Math.round(
      ((r.single_price_cad_cents - r.per_roll_cad_cents) / r.single_price_cad_cents) * 100
    ),
  }));

  return res.json({ deals, minSaving, maxSaving });
});

dealsRouter.get("/expired", async (req, res) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "Invalid query params" });
  const { minDiscount } = parsed.data;

  const db = await dbPromise;
  const seenSinceSql =
    db.dialect === "postgres" ? "NOW() - INTERVAL '2 days'" : "datetime('now','-2 days')";

  const result = await db.query<{
    film_id: string;
    brand: string;
    name: string;
    store_id: string;
    store_name: string;
    url: string;
    title_raw: string;
    expiry_label: string | null;
    pack_size: number;
    is_bulk: boolean | number;
    price_cad_cents: number;
    fresh_price_cad_cents: number;
  }>(
    `
    WITH latest AS (
      SELECT listing_id, price_cad_cents, in_stock
      FROM (
        SELECT
          ps.listing_id,
          ps.price_cad_cents,
          ps.in_stock,
          ROW_NUMBER() OVER (PARTITION BY ps.listing_id ORDER BY ps.captured_at DESC) AS rn
        FROM price_snapshots ps
      ) t
      WHERE rn = 1
    ),
    -- Cheapest in-stock, non-expired offer per film *per comparable unit*: a single
    -- roll is compared with single rolls, a 3-pack of 36exp with the same, bulk
    -- with bulk. Exposure count matters too: a 36exp 3-pack measured against a
    -- cheaper 24exp 3-pack understates the saving.
    fresh AS (
      SELECT
        l.film_id,
        COALESCE(l.pack_size, 1) AS pack_size,
        l.is_bulk,
        COALESCE(l.exposures, 0) AS exposures,
        MIN(latest.price_cad_cents) AS fresh_price_cad_cents
      FROM latest
      JOIN listings l ON l.id = latest.listing_id
      WHERE l.is_expired = FALSE
        AND l.last_seen_at >= ${seenSinceSql}
        AND latest.in_stock = TRUE
      GROUP BY l.film_id, COALESCE(l.pack_size, 1), l.is_bulk, COALESCE(l.exposures, 0)
    )
    SELECT
      l.film_id,
      f.brand,
      f.name,
      s.id AS store_id,
      s.name AS store_name,
      l.url,
      l.title_raw,
      l.expiry_label,
      COALESCE(l.pack_size, 1) AS pack_size,
      l.is_bulk,
      latest.price_cad_cents,
      fresh.fresh_price_cad_cents
    FROM latest
    JOIN listings l ON l.id = latest.listing_id
    JOIN films f ON f.id = l.film_id
    JOIN stores s ON s.id = l.store_id
    JOIN fresh
      ON fresh.film_id = l.film_id
     AND fresh.pack_size = COALESCE(l.pack_size, 1)
     AND fresh.is_bulk = l.is_bulk
     AND fresh.exposures = COALESCE(l.exposures, 0)
    WHERE l.is_expired = TRUE
      AND l.last_seen_at >= ${seenSinceSql}
      AND latest.in_stock = TRUE
      AND f.enabled = TRUE
      AND latest.price_cad_cents * 100 <= fresh.fresh_price_cad_cents * (100 - $1)
    ORDER BY
      (fresh.fresh_price_cad_cents - latest.price_cad_cents) * 1.0 / fresh.fresh_price_cad_cents DESC
    `,
    [minDiscount]
  );

  const deals: ExpiredDealDto[] = result.rows.map((r) => ({
    filmId: r.film_id,
    brand: r.brand,
    name: r.name,
    storeId: r.store_id,
    storeName: r.store_name,
    url: r.url,
    titleRaw: r.title_raw,
    expiryLabel: r.expiry_label,
    packSize: r.pack_size,
    isBulk: Boolean(r.is_bulk),
    priceCadCents: r.price_cad_cents,
    freshPriceCadCents: r.fresh_price_cad_cents,
    discountPercent: Math.round(
      ((r.fresh_price_cad_cents - r.price_cad_cents) / r.fresh_price_cad_cents) * 100
    ),
  }));

  return res.json({ deals, minDiscount });
});
