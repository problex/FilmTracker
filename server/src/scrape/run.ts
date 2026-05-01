import { db as dbPromise } from "../db/db.js";
import { filmSeeds } from "../catalog/films.js";
import { theCameraStoreAdapter } from "../stores/theCameraStore.js";
import { beauPhotoAdapter } from "../stores/beauPhoto.js";
import { adenCameraAdapter } from "../stores/adenCamera.js";
import { pophoAdapter } from "../stores/popho.js";
import { studioArgentiqueAdapter } from "../stores/studioArgentique.js";
import { grainationAdapter } from "../stores/graination.js";
import { donsPhotoAdapter } from "../stores/donsPhoto.js";
import { kerrisdaleAdapter } from "../stores/kerrisdale.js";
import { pinnedListings } from "../stores/pinnedListings.js";
import { withPage, extractRenderedText } from "../stores/dakisBrowser.js";
import { isBulkRoll, parseExposures, parseMoneyToCents, parsePackSize } from "../stores/shared.js";
import { randomUUID } from "node:crypto";

type UpsertedListing = { id: string };

async function ensureFilmsSeeded() {
  const db = await dbPromise;

  for (const f of filmSeeds) {
    await db.query(
      `
      INSERT INTO films (id, brand, name, iso, type, process)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (id) DO UPDATE SET
        brand = EXCLUDED.brand,
        name = EXCLUDED.name,
        iso = EXCLUDED.iso,
        type = EXCLUDED.type,
        process = EXCLUDED.process
      `,
      [f.id, f.brand, f.name, f.iso, f.type, f.process]
    );

    for (const a of f.aliases) {
      await db.query(
        `
        INSERT INTO film_aliases (film_id, alias)
        VALUES ($1, $2)
        ON CONFLICT (film_id, alias) DO NOTHING
        `,
        [f.id, a]
      );
    }
  }
}

async function upsertListingAndSnapshot(params: {
  storeId: string;
  filmId: string;
  url: string;
  titleRaw: string;
  packSize: number | null;
  exposures: 24 | 36 | null;
  isBulk: boolean;
  priceCadCents: number;
  inStock: boolean;
}) {
  const db = await dbPromise;

  if (db.dialect === "postgres") {
    const listingId = randomUUID();
    const result = await db.query<UpsertedListing>(
      `
      INSERT INTO listings (id, store_id, film_id, url, title_raw, pack_size, exposures, is_bulk, last_seen_at, last_in_stock_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), CASE WHEN $9 THEN NOW() ELSE NULL END)
      ON CONFLICT (store_id, url) DO UPDATE SET
        film_id = EXCLUDED.film_id,
        title_raw = EXCLUDED.title_raw,
        pack_size = EXCLUDED.pack_size,
        exposures = EXCLUDED.exposures,
        is_bulk = EXCLUDED.is_bulk,
        last_seen_at = NOW(),
        last_in_stock_at = CASE WHEN EXCLUDED.last_in_stock_at IS NULL THEN listings.last_in_stock_at ELSE EXCLUDED.last_in_stock_at END
      RETURNING id
      `,
      [
        listingId,
        params.storeId,
        params.filmId,
        params.url,
        params.titleRaw,
        params.packSize,
        params.exposures,
        params.isBulk,
        params.inStock,
      ]
    );

    const id = result.rows[0]?.id;
    if (!id) throw new Error("Upsert listing failed (no id returned)");

    await db.query(
      `INSERT INTO price_snapshots (listing_id, price_cad_cents, in_stock) VALUES ($1, $2, $3)`,
      [id, params.priceCadCents, params.inStock]
    );
    return;
  }

  // SQLite fallback
  const existing = await db.query<{ id: string }>(
    `SELECT id FROM listings WHERE store_id = $1 AND url = $2`,
    [params.storeId, params.url]
  );
  const id = existing.rows[0]?.id ?? randomUUID();
  if (existing.rows.length === 0) {
    await db.query(
      `INSERT INTO listings (id, store_id, film_id, url, title_raw, pack_size, exposures, is_bulk, last_seen_at, last_in_stock_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, CASE WHEN $9 THEN CURRENT_TIMESTAMP ELSE NULL END)`,
      [
        id,
        params.storeId,
        params.filmId,
        params.url,
        params.titleRaw,
        params.packSize,
        params.exposures,
        params.isBulk ? 1 : 0,
        params.inStock,
      ]
    );
  } else {
    await db.query(
      `UPDATE listings
       SET film_id=$1, title_raw=$2, pack_size=$3, exposures=$4, is_bulk=$5, last_seen_at=CURRENT_TIMESTAMP,
           last_in_stock_at=CASE WHEN $6 THEN CURRENT_TIMESTAMP ELSE last_in_stock_at END
       WHERE id=$7`,
      [
        params.filmId,
        params.titleRaw,
        params.packSize,
        params.exposures,
        params.isBulk ? 1 : 0,
        params.inStock,
        id,
      ]
    );
  }
  await db.query(
    `INSERT INTO price_snapshots (listing_id, price_cad_cents, in_stock) VALUES ($1, $2, $3)`,
    [id, params.priceCadCents, params.inStock ? 1 : 0]
  );
}

async function markStoreListingsStale(storeId: string) {
  const db = await dbPromise;
  if (db.dialect === "postgres") {
    await db.query(`UPDATE listings SET last_seen_at = to_timestamp(0) WHERE store_id = $1`, [storeId]);
    return;
  }
  await db.query(`UPDATE listings SET last_seen_at = datetime('1970-01-01') WHERE store_id = $1`, [
    storeId,
  ]);
}

export async function runScrape() {
  // Ensure any newly-added films exist before scraping (FK constraint on listings.film_id).
  await ensureFilmsSeeded();

  const adapters = [
    theCameraStoreAdapter,
    beauPhotoAdapter,
    adenCameraAdapter,
    pophoAdapter,
    studioArgentiqueAdapter,
    grainationAdapter,
    donsPhotoAdapter,
    kerrisdaleAdapter,
  ] as const;
  const perStore: {
    storeId: string;
    inserted: number;
    errors: { filmId: string; message: string }[];
  }[] = [];

  for (const adapter of adapters) {
    await markStoreListingsStale(adapter.storeId);

    let inserted = 0;
    const errors: { filmId: string; message: string }[] = [];
    const storeStart = Date.now();
    const isBrowserStore = ["dons-photo", "kerrisdale", "lord-photo", "downtown-camera"].includes(adapter.storeId);
    const STORE_BUDGET_MS = isBrowserStore ? 180_000 : 90_000;
    const FILM_TIMEOUT_MS = isBrowserStore ? 45_000 : 25_000;

    for (const film of filmSeeds) {
      if (Date.now() - storeStart > STORE_BUDGET_MS) {
        errors.push({ filmId: film.id, message: "Store scrape budget exceeded; partial results" });
        break;
      }
      try {
        const candidates = await Promise.race([
          adapter.fetchCandidatesForFilm(film),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Film scrape timeout")), FILM_TIMEOUT_MS)
          ),
        ]);
        for (const c of candidates) {
          await upsertListingAndSnapshot({
            storeId: adapter.storeId,
            filmId: film.id,
            url: c.url,
            titleRaw: c.titleRaw,
            packSize: c.packSize,
            exposures: c.exposures,
            isBulk: c.isBulk,
            priceCadCents: c.priceCadCents,
            inStock: c.inStock,
          });
          inserted += 1;
        }
      } catch (e) {
        errors.push({
          filmId: film.id,
          message: e instanceof Error ? e.message : "Scrape failed",
        });
      }
    }

    perStore.push({ storeId: adapter.storeId, inserted, errors });
  }

  // Pinned URL scrapes (exact product pages)
  if (pinnedListings.length > 0) {
    const storeStart = Date.now();
    const STORE_BUDGET_MS = 120_000;
    const errors: { filmId: string; message: string }[] = [];
    let inserted = 0;

    for (const p of pinnedListings) {
      if (Date.now() - storeStart > STORE_BUDGET_MS) {
        errors.push({ filmId: p.filmId, message: "Pinned scrape budget exceeded; partial results" });
        break;
      }

      try {
        const listing = await withPage(async (page) => {
          await page.goto(p.url, { waitUntil: "domcontentloaded", timeout: 45000 });
          await page.waitForTimeout(3000);
          const text = await extractRenderedText(page);

          const priceStr =
            text.match(/Price:\s*\$([0-9][0-9,]*(?:\.[0-9]{2})?)/i)?.[1] ??
            text.match(/\$([0-9][0-9,]*(?:\.[0-9]{2})?)/)?.[1] ??
            null;
          const priceCadCents = priceStr ? parseMoneyToCents(priceStr) : null;

          const inStock = (() => {
            const t = text.toLowerCase();
            if (t.includes("out of stock") || t.includes("sold out")) return false;
            if (t.includes("in stock")) return true;
            return true; // unknown -> assume true
          })();

          const titleLine =
            text
              .split("\n")
              .map((s) => s.trim())
              .find((l) => l.length > 6) ?? "Film";

          const titleRaw = titleLine;
          const exposures = parseExposures(titleRaw) ?? parseExposures(text);
          const packSize = parsePackSize(titleRaw) ?? parsePackSize(text);
          const bulk = isBulkRoll(titleRaw) || isBulkRoll(text);

          return { titleRaw, priceCadCents, inStock, exposures, packSize, bulk };
        });

        if (listing.priceCadCents == null) {
          throw new Error("Could not parse price");
        }

        await upsertListingAndSnapshot({
          storeId: p.storeId,
          filmId: p.filmId,
          url: p.url,
          titleRaw: listing.titleRaw,
          packSize: listing.packSize,
          exposures: listing.exposures,
          isBulk: listing.bulk,
          priceCadCents: listing.priceCadCents,
          inStock: listing.inStock,
        });
        inserted += 1;
      } catch (e) {
        errors.push({ filmId: p.filmId, message: e instanceof Error ? e.message : "Pinned scrape failed" });
      }
    }

    perStore.push({ storeId: "pinned", inserted, errors });
  }

  return { stores: perStore };
}

