import { Router } from "express";
import { z } from "zod";
import { db as dbPromise } from "../db/db.js";
import type { ExpiredDealDto } from "./types.js";

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
