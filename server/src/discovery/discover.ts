import { db as dbPromise } from "../db/db.js";
import { filmSeeds, type FilmSeed } from "../catalog/films.js";
import { looksLike35mm, matchesFilmAliases } from "../stores/shared.js";
import { adenCameraAdapter } from "../stores/adenCamera.js";
import { pophoAdapter } from "../stores/popho.js";
import { studioArgentiqueAdapter } from "../stores/studioArgentique.js";
import { grainationAdapter } from "../stores/graination.js";
import { filmWarehouseAdapter } from "../stores/filmWarehouse.js";
import { theCameraStoreAdapter } from "../stores/theCameraStore.js";
import { beauPhotoAdapter } from "../stores/beauPhoto.js";
import type { StoreAdapter } from "../stores/types.js";

/**
 * Find 35mm film the stores sell that the catalogue doesn't track.
 *
 * The expensive half is already paid for: the bulk adapters download each store's
 * whole catalogue during a normal scrape, so unrecognised products are a set
 * difference rather than a crawl.
 *
 * It reports raw titles and stops there. Turning a title into a catalogue entry means
 * choosing aliases, and aliases are the matching key — a loose one silently reassigns
 * other films' listings, which is how Kentmere PAN 100 and 200 came to be priced as
 * PAN 400 at four stores. That failure is invisible until the prices look wrong weeks
 * later, so the entry stays a human decision reviewed like any other code change.
 */

/**
 * Matches every product: the alias matcher skips tokens under three characters, so a
 * single-letter alias imposes no constraint. Used to enumerate a whole catalogue.
 */
const PROBE_FILM: FilmSeed = {
  id: "__probe__",
  brand: "",
  name: "",
  iso: null,
  type: "color",
  process: null,
  aliases: ["a"],
};

/**
 * `looksLike35mm()` cannot tell a film format from a lens focal length, which is fine
 * for the adapters — a product must also match a film alias — but discovery has no
 * such filter, and stores sell far more 35mm *lenses* than 35mm film.
 */
const LENS_OR_GEAR_RX =
  /\b(f\/?\d|t\d\.\d|\d+\s*-\s*\d+\s*mm|lens|hood|mount|nikon\s*z|sony\s*e\b|canon\s*(rf|ef)|leica\s*m\b|l-mount|usm|asph|apo|macro|teleconverter|body|camera)\b/i;

/** Services and darkroom supplies that mention film but are not film. */
const NOT_A_ROLL_RX =
  /\b(developing|development|processing|process(?:ed)?\b|scan(?:ning|s)?|print(?:ing|s)?|opener|canister|cassette|spool|holder|reel|tank|clip|sleeve|binder|storage|kit|chemistry|developer|fixer|stop bath|squeegee|changing bag|loader|gift card|voucher)\b/i;

/**
 * A roll of film says so: an exposure count, an ISO, or an explicit film phrase.
 * Requiring one of these is what separates "Adox HR-50 - 135 - 36ex" from
 * "7Artisans 35mm f1.2 - Nikon Z".
 */
const FILM_SIGNAL_RX =
  /\b(\d{1,3}\s*(?:exp|exposures?|ex)\b|iso\s*\d|\d+\s*iso|roll\s*film|negative\s*film|reversal\s*film|transparency\s*film|colou?r\s*film|b\s*&\s*w\s*film|black\s*(?:and|&)\s*white\s*(?:negative\s*)?film|slide\s*film|c-?41|e-?6|bulk)\b/i;

export function looksLikeFilmRoll(title: string) {
  if (LENS_OR_GEAR_RX.test(title)) return false;
  if (NOT_A_ROLL_RX.test(title)) return false;
  return FILM_SIGNAL_RX.test(title);
}

export type DiscoveredTitle = { title: string; storeIds: string[] };

function normaliseKey(title: string) {
  return title.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Bulk-mode stores only; this must not add scraping load. */
function bulkAdapters(): StoreAdapter[] {
  return [
    adenCameraAdapter,
    pophoAdapter,
    studioArgentiqueAdapter,
    grainationAdapter,
    filmWarehouseAdapter,
    theCameraStoreAdapter,
    beauPhotoAdapter,
  ].filter((a) => typeof a.fetchCandidatesForAllFilms === "function");
}

export async function findUnrecognisedTitles(): Promise<DiscoveredTitle[]> {
  const byKey = new Map<string, DiscoveredTitle>();

  for (const adapter of bulkAdapters()) {
    let everything;
    try {
      everything = await adapter.fetchCandidatesForAllFilms!([PROBE_FILM]);
    } catch {
      continue;
    }

    for (const c of [...everything.values()].flat()) {
      if (!looksLike35mm(c.titleRaw)) continue;
      if (!looksLikeFilmRoll(c.titleRaw)) continue;
      if (filmSeeds.some((f) => matchesFilmAliases(c.titleRaw, f.aliases))) continue;

      const key = normaliseKey(c.titleRaw);
      const existing = byKey.get(key);
      if (existing) {
        if (!existing.storeIds.includes(adapter.storeId)) existing.storeIds.push(adapter.storeId);
      } else {
        byKey.set(key, { title: c.titleRaw, storeIds: [adapter.storeId] });
      }
    }
  }

  return [...byKey.values()].sort((a, b) => a.title.localeCompare(b.title));
}

export type DiscoveryResult = {
  found: number;
  newTitles: number;
  titles: DiscoveredTitle[];
};

/**
 * Record what was found. Existing rows have their store list and last-seen refreshed
 * but keep their review status, so a title marked "ignored" stays ignored.
 */
export async function runDiscovery(opts: { persist?: boolean } = {}): Promise<DiscoveryResult> {
  const found = await findUnrecognisedTitles();
  if (!opts.persist) return { found: found.length, newTitles: 0, titles: found };

  const db = await dbPromise;
  const jsonCast = db.dialect === "postgres" ? "::jsonb" : "";
  const now = db.dialect === "postgres" ? "NOW()" : "datetime('now')";

  const existing = await db.query<{ title_key: string }>(`SELECT title_key FROM discovered_titles`);
  const known = new Set(existing.rows.map((r) => r.title_key));
  let newTitles = 0;

  for (const t of found) {
    const key = normaliseKey(t.title);
    if (!known.has(key)) newTitles += 1;

    await db.query(
      `INSERT INTO discovered_titles (title_key, title, store_ids, last_seen_at)
       VALUES ($1, $2, $3${jsonCast}, ${now})
       ON CONFLICT (title_key) DO UPDATE SET
         title = EXCLUDED.title,
         store_ids = EXCLUDED.store_ids,
         last_seen_at = ${now}`,
      [key, t.title, JSON.stringify(t.storeIds)]
    );
  }

  return { found: found.length, newTitles, titles: found };
}
