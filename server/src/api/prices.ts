import { Router } from "express";
import { z } from "zod";
import { db as dbPromise } from "../db/db.js";
import type { FilmWithTopOffersDto } from "./types.js";

const querySchema = z.object({
  inStock: z
    .string()
    .optional()
    .transform((v) => (v === undefined ? true : v !== "false")),
  variant: z
    .enum(["36", "24", "multipack", "bulk", "any"])
    .optional()
    .transform((v) => v ?? "any"),
  /** `any` = color + B&W; `color` / `bw` = filter by films.type */
  filmType: z
    .enum(["any", "color", "bw"])
    .optional()
    .transform((v) => v ?? "any"),
});

export const pricesRouter = Router();

pricesRouter.get("/", async (req, res) => {
  const db = await dbPromise;
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid query params" });
  }
  const { inStock, variant, filmType } = parsed.data;

  const filmsResult = await db.query<{
    id: string;
    brand: string;
    name: string;
    iso: number | null;
    type: "color" | "bw";
    process: string | null;
  }>(
    `SELECT id, brand, name, iso, type, process
     FROM films
     WHERE enabled = TRUE
     ORDER BY brand, name, iso NULLS LAST`
  );

  const data: FilmWithTopOffersDto[] = [];

  for (const f of filmsResult.rows) {
    if (filmType !== "any" && f.type !== filmType) continue;

    // Latest snapshot per listing, then top 3 cheapest.
    const seenSinceSql =
      db.dialect === "postgres"
        ? "NOW() - INTERVAL '2 days'"
        : "datetime('now','-2 days')";

    const offersResult = await db.query<{
      store_id: string;
      store_name: string;
      price_cad_cents: number;
      url: string;
      pack_size: number | null;
      exposures: 24 | 36 | null;
      is_bulk: boolean | number;
      captured_at: string;
      in_stock: boolean | number;
    }>(
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
        AND (($2 = FALSE) OR (latest.in_stock = TRUE))
        AND (
          $3 = 'any' OR
          ($3 = 'bulk' AND l.is_bulk = TRUE) OR
          ($3 = 'multipack' AND l.pack_size IS NOT NULL AND l.pack_size > 1) OR
          ($3 = '36' AND l.exposures = 36 AND (l.pack_size IS NULL OR l.pack_size <= 1) AND l.is_bulk = FALSE) OR
          ($3 = '24' AND l.exposures = 24 AND (l.pack_size IS NULL OR l.pack_size <= 1) AND l.is_bulk = FALSE)
        )
      ORDER BY latest.price_cad_cents ASC
      LIMIT 3
      `,
      [f.id, inStock, variant]
    );

    data.push({
      filmId: f.id,
      brand: f.brand,
      name: f.name,
      iso: f.iso,
      type: f.type,
      process: f.process,
      offers: offersResult.rows.map((o) => ({
        storeId: o.store_id,
        storeName: o.store_name,
        priceCadCents: o.price_cad_cents,
        url: o.url,
        packSize: o.pack_size,
        exposures: o.exposures,
        isBulk: Boolean(o.is_bulk),
        lastCheckedAt: o.captured_at,
      })),
    });
  }

  return res.json({ films: data });
});

