import { Router } from "express";
import { z } from "zod";
import { db as dbPromise } from "../db/db.js";

export const filmsRouter = Router();

const priceHistoryQuerySchema = z.object({
  inStock: z
    .string()
    .optional()
    .transform((v) => (v === undefined ? true : v !== "false")),
  variant: z
    .enum(["36", "24", "multipack", "bulk", "any"])
    .optional()
    .transform((v) => v ?? "any"),
});

const offersQuerySchema = z.object({
  inStock: z
    .string()
    .optional()
    .transform((v) => (v === undefined ? true : v !== "false")),
  variant: z
    .enum(["36", "24", "multipack", "bulk", "any"])
    .optional()
    .transform((v) => v ?? "any"),
});

filmsRouter.get("/", async (_req, res) => {
  const db = await dbPromise;
  const result = await db.query(
    `SELECT id, brand, name, iso, type, process
     FROM films
     WHERE enabled = TRUE
     ORDER BY brand, name, iso NULLS LAST`
  );
  return res.json({ films: result.rows });
});

/** Lowest in-stock snapshot price per calendar day (UTC), last 6 months, matching variant filter. */
filmsRouter.get("/:id/price-history", async (req, res) => {
  const parsed = priceHistoryQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid query params" });
  }
  const { inStock: requireInStock, variant } = parsed.data;
  const filmId = req.params.id;
  const db = await dbPromise;

  const variantClause =
    db.dialect === "postgres"
      ? `(
          $3::text = 'any' OR
          ($3::text = 'bulk' AND l.is_bulk = TRUE) OR
          ($3::text = 'multipack' AND l.pack_size IS NOT NULL AND l.pack_size > 1) OR
          ($3::text = '36' AND l.exposures = 36 AND (l.pack_size IS NULL OR l.pack_size <= 1) AND l.is_bulk = FALSE) OR
          ($3::text = '24' AND l.exposures = 24 AND (l.pack_size IS NULL OR l.pack_size <= 1) AND l.is_bulk = FALSE)
        )`
      : `(
          ? = 'any' OR
          (? = 'bulk' AND l.is_bulk = 1) OR
          (? = 'multipack' AND l.pack_size IS NOT NULL AND l.pack_size > 1) OR
          (? = '36' AND l.exposures = 36 AND (l.pack_size IS NULL OR l.pack_size <= 1) AND l.is_bulk = 0) OR
          (? = '24' AND l.exposures = 24 AND (l.pack_size IS NULL OR l.pack_size <= 1) AND l.is_bulk = 0)
        )`;

  if (db.dialect === "postgres") {
    const historyResult = await db.query<{ day: string; min_price_cad_cents: number }>(
      `
      SELECT
        to_char(day_start, 'YYYY-MM-DD') AS day,
        min_price_cad_cents
      FROM (
        SELECT
          date_trunc('day', ps.captured_at AT TIME ZONE 'UTC') AS day_start,
          MIN(ps.price_cad_cents)::integer AS min_price_cad_cents
        FROM price_snapshots ps
        JOIN listings l ON l.id = ps.listing_id
        WHERE l.film_id = $1
          AND ps.captured_at >= (NOW() AT TIME ZONE 'UTC') - INTERVAL '6 months'
          AND ((NOT $2::boolean) OR (ps.in_stock = TRUE))
          AND ${variantClause}
        GROUP BY 1
      ) daily
      ORDER BY day ASC
      `,
      [filmId, requireInStock, variant]
    );
    return res.json({
      filmId,
      variant,
      requireInStock,
      points: historyResult.rows.map((r) => ({
        date: r.day,
        minPriceCadCents: r.min_price_cad_cents,
      })),
    });
  }

  const inStockInt = requireInStock ? 1 : 0;
  const historyResult = await db.query<{ day: string; min_price_cad_cents: number }>(
    `
    SELECT
      date(ps.captured_at) AS day,
      MIN(ps.price_cad_cents) AS min_price_cad_cents
    FROM price_snapshots ps
    JOIN listings l ON l.id = ps.listing_id
    WHERE l.film_id = ?
      AND ps.captured_at >= datetime('now', '-6 months')
      AND ((? = 0) OR (ps.in_stock = 1))
      AND ${variantClause}
    GROUP BY date(ps.captured_at)
    ORDER BY date(ps.captured_at) ASC
    `,
    [filmId, inStockInt, variant, variant, variant, variant, variant]
  );

  return res.json({
    filmId,
    variant,
    requireInStock,
    points: historyResult.rows.map((r) => ({
      date: r.day,
      minPriceCadCents: r.min_price_cad_cents,
    })),
  });
});

filmsRouter.get("/:id/offers", async (req, res) => {
  const parsed = offersQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid query params" });
  }
  const { inStock: requireInStock, variant } = parsed.data;

  const db = await dbPromise;
  const filmId = req.params.id;

  const seenSinceSql =
    db.dialect === "postgres" ? "NOW() - INTERVAL '7 days'" : "datetime('now','-7 days')";

  const variantClause =
    db.dialect === "postgres"
      ? `(
          $3::text = 'any' OR
          ($3::text = 'bulk' AND l.is_bulk = TRUE) OR
          ($3::text = 'multipack' AND l.pack_size IS NOT NULL AND l.pack_size > 1) OR
          ($3::text = '36' AND l.exposures = 36 AND (l.pack_size IS NULL OR l.pack_size <= 1) AND l.is_bulk = FALSE) OR
          ($3::text = '24' AND l.exposures = 24 AND (l.pack_size IS NULL OR l.pack_size <= 1) AND l.is_bulk = FALSE)
        )`
      : `(
          ? = 'any' OR
          (? = 'bulk' AND l.is_bulk = 1) OR
          (? = 'multipack' AND l.pack_size IS NOT NULL AND l.pack_size > 1) OR
          (? = '36' AND l.exposures = 36 AND (l.pack_size IS NULL OR l.pack_size <= 1) AND l.is_bulk = 0) OR
          (? = '24' AND l.exposures = 24 AND (l.pack_size IS NULL OR l.pack_size <= 1) AND l.is_bulk = 0)
        )`;

  type OffersRow = {
    store_id: string;
    store_name: string;
    price_cad_cents: number;
    url: string;
    pack_size: number | null;
    exposures: 24 | 36 | null;
    is_bulk: boolean | number;
    captured_at: string;
    in_stock: boolean | number;
  };

  const offersResult =
    db.dialect === "postgres"
      ? await db.query<OffersRow>(
          `
          WITH latest AS (
            SELECT listing_id, price_cad_cents, in_stock, captured_at
            FROM (
              SELECT
                ps.listing_id,
                ps.price_cad_cents,
                ps.in_stock,
                ps.captured_at,
                ROW_NUMBER() OVER (PARTITION BY ps.listing_id ORDER BY ps.captured_at DESC) AS rn
              FROM price_snapshots ps
              JOIN listings l ON l.id = ps.listing_id
              WHERE l.film_id = $1
            ) t
            WHERE rn = 1
          )
          SELECT
            s.id AS store_id,
            s.name AS store_name,
            latest.price_cad_cents,
            l.url,
            l.pack_size,
            l.exposures,
            l.is_bulk,
            latest.captured_at,
            latest.in_stock
          FROM latest
          JOIN listings l ON l.id = latest.listing_id
          JOIN stores s ON s.id = l.store_id
          WHERE l.last_seen_at >= ${seenSinceSql}
            AND ((NOT $2::boolean) OR (latest.in_stock = TRUE))
            AND ${variantClause}
          ORDER BY latest.price_cad_cents ASC
          `,
          [filmId, requireInStock, variant]
        )
      : await db.query<OffersRow>(
          `
          WITH latest AS (
            SELECT listing_id, price_cad_cents, in_stock, captured_at
            FROM (
              SELECT
                ps.listing_id,
                ps.price_cad_cents,
                ps.in_stock,
                ps.captured_at,
                ROW_NUMBER() OVER (PARTITION BY ps.listing_id ORDER BY ps.captured_at DESC) AS rn
              FROM price_snapshots ps
              JOIN listings l ON l.id = ps.listing_id
              WHERE l.film_id = ?
            ) t
            WHERE rn = 1
          )
          SELECT
            s.id AS store_id,
            s.name AS store_name,
            latest.price_cad_cents,
            l.url,
            l.pack_size,
            l.exposures,
            l.is_bulk,
            latest.captured_at,
            latest.in_stock
          FROM latest
          JOIN listings l ON l.id = latest.listing_id
          JOIN stores s ON s.id = l.store_id
          WHERE l.last_seen_at >= ${seenSinceSql}
            AND ((? = 0) OR (latest.in_stock = 1))
            AND ${variantClause}
          ORDER BY latest.price_cad_cents ASC
          `,
          [filmId, requireInStock ? 1 : 0, variant, variant, variant, variant, variant]
        );

  return res.json({
    filmId,
    offers: offersResult.rows.map((o) => ({
      storeId: o.store_id,
      storeName: o.store_name,
      priceCadCents: o.price_cad_cents,
      url: o.url,
      packSize: o.pack_size,
      exposures: o.exposures,
      isBulk: Boolean(o.is_bulk),
      lastCheckedAt: o.captured_at,
      inStock: Boolean(o.in_stock),
    })),
  });
});

