import { Router } from "express";
import { db as dbPromise } from "../db/db.js";
import { filmSeeds } from "../catalog/films.js";
import type { StoreHealthDto, HealthIssueDto } from "./types.js";

/**
 * Scrape health, computed from `scrape_runs` and current listing state.
 *
 * Deliberately deterministic — no model involved. The failures this catches are
 * countable: a store returning nothing, a store covering less of the catalogue than
 * last time, a run truncating, a film losing every offer. Those were all happening
 * silently before `scrape_runs` was wired up.
 */

/** A store returning fewer listings than this fraction of its previous run has regressed. */
const DROP_RATIO = 0.7;
/** Listings older than this are not considered current. */
const FRESH_WINDOW_HOURS = 48;

type RunTotals = {
  stores?: {
    storeId: string;
    inserted: number;
    truncated: boolean;
    mode: string;
    durationMs: number;
    errorCount: number;
  }[];
  insertedTotal?: number;
};

type RunRow = {
  id: number | string;
  status: string;
  started_at: string;
  finished_at: string | null;
  error_summary: string | null;
  totals: RunTotals | string;
};

function parseTotals(totals: RunTotals | string): RunTotals {
  if (typeof totals !== "string") return totals ?? {};
  try {
    return JSON.parse(totals) as RunTotals;
  } catch {
    return {};
  }
}

export const storesHealthRouter = Router();

storesHealthRouter.get("/health", async (_req, res) => {
  const db = await dbPromise;

  // Latest finished run, plus the one before it for comparison.
  const runs = await db.query<RunRow>(
    `SELECT id, status, started_at, finished_at, error_summary, totals
     FROM scrape_runs
     WHERE finished_at IS NOT NULL
     ORDER BY id DESC
     LIMIT 2`
  );

  const latest = runs.rows[0] ?? null;
  const previous = runs.rows[1] ?? null;

  const freshSinceSql =
    db.dialect === "postgres"
      ? `NOW() - INTERVAL '${FRESH_WINDOW_HOURS} hours'`
      : `datetime('now','-${FRESH_WINDOW_HOURS} hours')`;

  const freshRows = await db.query<{ store_id: string; store_name: string; fresh: number }>(
    `SELECT s.id AS store_id, s.name AS store_name,
            COUNT(l.id) FILTER (WHERE l.last_seen_at >= ${freshSinceSql}) AS fresh
     FROM stores s
     LEFT JOIN listings l ON l.store_id = s.id
     GROUP BY s.id, s.name
     ORDER BY s.id`
  );

  const filmRows = await db.query<{ film_id: string; fresh: number }>(
    `SELECT f.id AS film_id,
            COUNT(l.id) FILTER (WHERE l.last_seen_at >= ${freshSinceSql}) AS fresh
     FROM films f
     LEFT JOIN listings l ON l.film_id = f.id
     WHERE f.enabled = TRUE
     GROUP BY f.id`
  );

  const latestTotals = latest ? parseTotals(latest.totals) : {};
  const prevTotals = previous ? parseTotals(previous.totals) : {};
  const prevByStore = new Map((prevTotals.stores ?? []).map((s) => [s.storeId, s]));
  const latestByStore = new Map((latestTotals.stores ?? []).map((s) => [s.storeId, s]));

  const issues: HealthIssueDto[] = [];
  const stores: StoreHealthDto[] = [];

  for (const row of freshRows.rows) {
    const run = latestByStore.get(row.store_id);
    const prev = prevByStore.get(row.store_id);
    const fresh = Number(row.fresh);
    const inserted = run?.inserted ?? null;
    const previousInserted = prev?.inserted ?? null;

    // Stores with no adapter (seeded but never scraped) are not failures.
    const hasAdapter = run != null || prev != null || fresh > 0;

    if (hasAdapter && inserted === 0) {
      issues.push({
        severity: "error",
        storeId: row.store_id,
        kind: "no_listings",
        detail: `${row.store_name} returned 0 listings in the latest run`,
      });
    }
    if (run?.truncated) {
      issues.push({
        severity: "warn",
        storeId: row.store_id,
        kind: "truncated",
        detail: `${row.store_name} hit its time budget and did not cover the whole catalogue`,
      });
    }
    if (
      inserted != null &&
      previousInserted != null &&
      previousInserted > 0 &&
      inserted < previousInserted * DROP_RATIO
    ) {
      issues.push({
        severity: "error",
        storeId: row.store_id,
        kind: "listing_drop",
        detail: `${row.store_name} returned ${inserted} listings, down from ${previousInserted}`,
      });
    }
    if (hasAdapter && fresh === 0) {
      issues.push({
        severity: "error",
        storeId: row.store_id,
        kind: "stale",
        detail: `${row.store_name} has no listings seen in the last ${FRESH_WINDOW_HOURS}h`,
      });
    }

    stores.push({
      storeId: row.store_id,
      storeName: row.store_name,
      freshListings: fresh,
      inserted,
      previousInserted,
      truncated: run?.truncated ?? null,
      mode: run?.mode ?? null,
      durationMs: run?.durationMs ?? null,
      errorCount: run?.errorCount ?? null,
    });
  }

  const filmsWithoutOffers = filmRows.rows
    .filter((f) => Number(f.fresh) === 0)
    .map((f) => f.film_id)
    .sort();

  for (const filmId of filmsWithoutOffers) {
    issues.push({
      severity: "warn",
      storeId: null,
      kind: "film_no_offers",
      detail: `${filmId} has no current offers at any store`,
    });
  }

  // A film in the catalogue but absent from the database means seeding did not run.
  const seededIds = new Set(filmRows.rows.map((f) => f.film_id));
  for (const f of filmSeeds) {
    if (!seededIds.has(f.id)) {
      issues.push({
        severity: "error",
        storeId: null,
        kind: "film_not_seeded",
        detail: `${f.id} is in filmSeeds but not in the films table`,
      });
    }
  }

  const errors = issues.filter((i) => i.severity === "error").length;
  const status = errors > 0 ? "error" : issues.length > 0 ? "warn" : "ok";

  return res.json({
    status,
    lastRun: latest
      ? {
          id: Number(latest.id),
          status: latest.status,
          startedAt: latest.started_at,
          finishedAt: latest.finished_at,
          errorSummary: latest.error_summary,
        }
      : null,
    films: {
      total: filmRows.rows.length,
      withOffers: filmRows.rows.length - filmsWithoutOffers.length,
      withoutOffers: filmsWithoutOffers,
    },
    stores,
    issues,
  });
});
