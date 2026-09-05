import { db as dbPromise } from "../db/db.js";
import { filmSeeds } from "../catalog/films.js";
import { storeSeeds } from "../catalog/stores.js";
import { theCameraStoreAdapter } from "../stores/theCameraStore.js";
import { beauPhotoAdapter } from "../stores/beauPhoto.js";
import { adenCameraAdapter } from "../stores/adenCamera.js";
import { pophoAdapter } from "../stores/popho.js";
import { studioArgentiqueAdapter } from "../stores/studioArgentique.js";
import { grainationAdapter } from "../stores/graination.js";
import { filmWarehouseAdapter } from "../stores/filmWarehouse.js";
import { donsPhotoAdapter } from "../stores/donsPhoto.js";
import { kerrisdaleAdapter } from "../stores/kerrisdale.js";
import { pinnedListings } from "../stores/pinnedListings.js";
import { withPage } from "../stores/dakisBrowser.js";
import { PRODUCT_EXTRACT_JS, GENERIC_TITLE_RX, stripStoreSuffix } from "../stores/dakisShop.js";
import { isBulkRoll, parseExpiry, parseExposures, parseMoneyToCents, parsePackSize } from "../stores/shared.js";
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
  isExpired: boolean;
  expiryLabel: string | null;
  priceCadCents: number;
  inStock: boolean;
}) {
  const db = await dbPromise;

  if (db.dialect === "postgres") {
    const listingId = randomUUID();
    const result = await db.query<UpsertedListing>(
      `
      INSERT INTO listings (id, store_id, film_id, url, title_raw, pack_size, exposures, is_bulk, is_expired, expiry_label, last_seen_at, last_in_stock_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $10, $11, NOW(), CASE WHEN $9 THEN NOW() ELSE NULL END)
      ON CONFLICT (store_id, url) DO UPDATE SET
        film_id = EXCLUDED.film_id,
        title_raw = EXCLUDED.title_raw,
        pack_size = EXCLUDED.pack_size,
        exposures = EXCLUDED.exposures,
        is_bulk = EXCLUDED.is_bulk,
        is_expired = EXCLUDED.is_expired,
        expiry_label = EXCLUDED.expiry_label,
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
        params.isExpired,
        params.expiryLabel,
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
      `INSERT INTO listings (id, store_id, film_id, url, title_raw, pack_size, exposures, is_bulk, is_expired, expiry_label, last_seen_at, last_in_stock_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $10, $11, CURRENT_TIMESTAMP, CASE WHEN $9 THEN CURRENT_TIMESTAMP ELSE NULL END)`,
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
        params.isExpired ? 1 : 0,
        params.expiryLabel,
      ]
    );
  } else {
    await db.query(
      `UPDATE listings
       SET film_id=$1, title_raw=$2, pack_size=$3, exposures=$4, is_bulk=$5, is_expired=$8, expiry_label=$9,
           last_seen_at=CURRENT_TIMESTAMP,
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
        params.isExpired ? 1 : 0,
        params.expiryLabel,
      ]
    );
  }
  await db.query(
    `INSERT INTO price_snapshots (listing_id, price_cad_cents, in_stock) VALUES ($1, $2, $3)`,
    [id, params.priceCadCents, params.inStock ? 1 : 0]
  );
}

/**
 * Exposure count for a listing: what the title said, else the film's single-length
 * default. Bulk rolls are excluded — they are sold by length, not exposures.
 */
function resolveExposures(
  candidate: { exposures: 24 | 36 | null; isBulk: boolean },
  filmId: string
): 24 | 36 | null {
  if (candidate.exposures != null) return candidate.exposures;
  if (candidate.isBulk) return null;
  return filmSeeds.find((f) => f.id === filmId)?.defaultExposures ?? null;
}

/** Pack size for a listing: what the title said, else the film's fixed-bundle size. */
function resolvePackSize(candidate: { packSize: number | null }, filmId: string): number | null {
  if (candidate.packSize != null) return candidate.packSize;
  return filmSeeds.find((f) => f.id === filmId)?.defaultPackSize ?? null;
}

type StoreResult = {
  storeId: string;
  inserted: number;
  /** True when the store hit its time budget and did not cover the whole catalogue. */
  truncated: boolean;
  mode: "bulk" | "per-film";
  durationMs: number;
  errors: { filmId: string; message: string }[];
};

async function startScrapeRun(): Promise<number | null> {
  const db = await dbPromise;
  const result = await db.query<{ id: number | string }>(
    `INSERT INTO scrape_runs (status) VALUES ('running') RETURNING id`
  );
  const id = result.rows[0]?.id;
  return id == null ? null : Number(id);
}

async function finishScrapeRun(runId: number | null, stores: StoreResult[]) {
  if (runId == null) return;
  const db = await dbPromise;

  const truncated = stores.filter((s) => s.truncated);
  const failed = stores.filter((s) => s.inserted === 0);
  const status = truncated.length > 0 || failed.length > 0 ? "partial" : "success";

  const summary: string[] = [];
  for (const s of failed) summary.push(`${s.storeId}: 0 listings`);
  for (const s of truncated) summary.push(`${s.storeId}: budget exceeded, catalogue not fully covered`);

  const totals = JSON.stringify({
    stores: stores.map((s) => ({
      storeId: s.storeId,
      inserted: s.inserted,
      truncated: s.truncated,
      mode: s.mode,
      durationMs: s.durationMs,
      errorCount: s.errors.length,
    })),
    insertedTotal: stores.reduce((n, s) => n + s.inserted, 0),
  });

  const finishedAt = db.dialect === "postgres" ? "NOW()" : "datetime('now')";
  const totalsExpr = db.dialect === "postgres" ? "$2::jsonb" : "$2";

  await db.query(
    `UPDATE scrape_runs
     SET finished_at = ${finishedAt}, status = $1, totals = ${totalsExpr}, error_summary = $3
     WHERE id = $4`,
    [status, totals, summary.length > 0 ? summary.join("; ") : null, runId]
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
    filmWarehouseAdapter,
    donsPhotoAdapter,
    kerrisdaleAdapter,
  ] as const;
  const perStore: StoreResult[] = [];
  const runId = await startScrapeRun();

  for (const adapter of adapters) {
    await markStoreListingsStale(adapter.storeId);

    let inserted = 0;
    let truncated = false;
    const errors: { filmId: string; message: string }[] = [];
    const storeStart = Date.now();
    const isBrowserStore = ["dons-photo", "kerrisdale", "lord-photo", "downtown-camera"].includes(adapter.storeId);
    const STORE_BUDGET_MS = isBrowserStore ? 180_000 : 90_000;
    const FILM_TIMEOUT_MS = isBrowserStore ? 45_000 : 25_000;
    // One catalogue fetch covers every film, so this scales with catalogue size,
    // not with how many films we track. Bounded work (a fixed page count plus a
    // variation lookup per match), so it gets a generous ceiling — Beau Photo's
    // 2,300-product catalogue alone takes ~55s.
    const CATALOG_TIMEOUT_MS = 180_000;
    const useBulk = typeof adapter.fetchCandidatesForAllFilms === "function";

    if (useBulk) {
      try {
        const byFilmId = await Promise.race([
          adapter.fetchCandidatesForAllFilms!(filmSeeds),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Catalogue fetch timeout")), CATALOG_TIMEOUT_MS)
          ),
        ]);

        for (const film of filmSeeds) {
          for (const c of byFilmId.get(film.id) ?? []) {
            await upsertListingAndSnapshot({
              storeId: adapter.storeId,
              filmId: film.id,
              url: c.url,
              titleRaw: c.titleRaw,
              packSize: resolvePackSize(c, film.id),
              exposures: resolveExposures(c, film.id),
              isBulk: c.isBulk,
              isExpired: c.isExpired,
              expiryLabel: c.expiryLabel,
              priceCadCents: c.priceCadCents,
              inStock: c.inStock,
            });
            inserted += 1;
          }
        }
      } catch (e) {
        errors.push({
          filmId: "*",
          message: e instanceof Error ? e.message : "Catalogue scrape failed",
        });
      }
    } else {
      for (const film of filmSeeds) {
        if (Date.now() - storeStart > STORE_BUDGET_MS) {
          truncated = true;
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
              packSize: resolvePackSize(c, film.id),
              exposures: resolveExposures(c, film.id),
              isBulk: c.isBulk,
              isExpired: c.isExpired,
              expiryLabel: c.expiryLabel,
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
    }

    perStore.push({
      storeId: adapter.storeId,
      inserted,
      truncated,
      mode: useBulk ? "bulk" : "per-film",
      durationMs: Date.now() - storeStart,
      errors,
    });
  }

  // Pinned URL scrapes (exact product pages)
  if (pinnedListings.length > 0) {
    const storeStart = Date.now();
    const STORE_BUDGET_MS = 120_000;
    const errors: { filmId: string; message: string }[] = [];
    let inserted = 0;
    let truncated = false;

    for (const p of pinnedListings) {
      if (Date.now() - storeStart > STORE_BUDGET_MS) {
        truncated = true;
        errors.push({ filmId: p.filmId, message: "Pinned scrape budget exceeded; partial results" });
        break;
      }

      try {
        const listing = await withPage(async (page) => {
          await page.goto(p.url, { waitUntil: "domcontentloaded", timeout: 45000 });
          await page.waitForTimeout(3000);

          // Pinned URLs are Dakis product pages, so read them with the same DOM
          // selectors as the store adapter. Taking the first long line of rendered
          // text instead recorded this listing's title as "Downtown Toronto" — the
          // store's own page header — for months.
          const raw = await page.evaluate(PRODUCT_EXTRACT_JS);
          const detail = JSON.parse(typeof raw === "string" ? raw : String(raw)) as {
            title: string;
            price: string | null;
            inStock: boolean;
          };

          const priceCadCents = detail.price ? parseMoneyToCents(detail.price) : null;
          const inStock = detail.inStock;

          const storeName = storeSeeds.find((s) => s.id === p.storeId)?.name ?? "";
          const stripped = stripStoreSuffix(detail.title ?? "", storeName);
          const titleRaw = !stripped || GENERIC_TITLE_RX.test(stripped) ? "" : stripped;
          if (!titleRaw) throw new Error("Pinned page did not render a product title");
          const exposures = parseExposures(titleRaw);
          const packSize = parsePackSize(titleRaw);
          const bulk = isBulkRoll(titleRaw);

          return {
            titleRaw,
            priceCadCents,
            inStock,
            exposures,
            packSize,
            bulk,
            ...parseExpiry(titleRaw),
          };
        });

        if (listing.priceCadCents == null) {
          throw new Error("Could not parse price");
        }

        await upsertListingAndSnapshot({
          storeId: p.storeId,
          filmId: p.filmId,
          url: p.url,
          titleRaw: listing.titleRaw,
          packSize: resolvePackSize({ packSize: listing.packSize }, p.filmId),
          exposures: resolveExposures({ exposures: listing.exposures, isBulk: listing.bulk }, p.filmId),
          isBulk: listing.bulk,
          isExpired: listing.isExpired,
          expiryLabel: listing.expiryLabel,
          priceCadCents: listing.priceCadCents,
          inStock: listing.inStock,
        });
        inserted += 1;
      } catch (e) {
        errors.push({ filmId: p.filmId, message: e instanceof Error ? e.message : "Pinned scrape failed" });
      }
    }

    perStore.push({
      storeId: "pinned",
      inserted,
      truncated,
      mode: "per-film",
      durationMs: Date.now() - storeStart,
      errors,
    });
  }

  await finishScrapeRun(runId, perStore);

  return { stores: perStore };
}

