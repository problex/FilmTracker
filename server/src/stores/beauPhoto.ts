import { filmFormat, type FilmSeed } from "../catalog/films.js";
import type { CandidatesByFilmId, ListingCandidate, StoreAdapter } from "./types.js";
import {
  isBulkRoll,
  looksLikeInstantFilm,
  matchesFilmAliases,
  parseExpiry,
  parseExposures,
  parsePackSize,
} from "./shared.js";
import {
  decodeEntities,
  fetchWooCatalog,
  fetchWooProduct,
  toCadCents,
  type WooProduct,
} from "./wooStoreApi.js";

/**
 * Beau Photo (WooCommerce Store API).
 *
 * Format detection can't come from the title here: listings are named
 * "Candido 400 Colour Film", "Fujifilm Colour 200" — no "35mm" or "135" anywhere —
 * so the usual `looksLike35mm()` title test rejects almost the whole catalogue.
 *
 * Instead:
 *  - a "35mm" **tag** marks the product as (at least partly) 35mm, and every
 *    product in the film categories carries tags;
 *  - variable products expose a **Film Format** attribute per variation whose slug
 *    is the authoritative format: `35mm`, `35mm-100-roll`, `120`, `4x5-25`,
 *    `8x10-25`, `110`.
 *
 * Product `attributes` are not trustworthy — Candido is labelled "Colour Paper".
 */

const BASE_URL = "https://www.beauphoto.com";
/** ~2,300 products at 100/page. */
const MAX_PAGES = 30;

/** Accessories that live in the film categories and carry film-ish tags. */
const ACCESSORY_RX =
  /\b(adapter|adaptor|holder|reel|tank|squeegee|changing bag|clips?|cassette|loader|developer|fixer|toner|stop bath|chemistry|scanner|album|sleeve|binder|page|frame|camera|disposable|single[- ]use)\b/i;

/** Formats other than 35mm, used to veto mis-tagged simple products. */
const NON_35MM_RX = /\b(120|110|220|4\s?x\s?5|8\s?x\s?10|instax|sheet film|large format)\b/i;

function inFilmCategory(p: WooProduct) {
  return (p.categories ?? []).some((c) => /film/i.test(c.name ?? ""));
}

function hasTag(p: WooProduct, tag: string) {
  return (p.tags ?? []).some((t) => decodeEntities(t.name ?? "").toLowerCase() === tag.toLowerCase());
}

/** Film Format slug for a variation, e.g. "35mm" or "35mm-100-roll". */
function formatSlug(v: NonNullable<WooProduct["variations"]>[number]) {
  const attr = (v.attributes ?? []).find((a) => /film\s*format/i.test(a.name ?? ""));
  return attr?.value?.toLowerCase() ?? null;
}

/** `35mm` and `35mm-100-roll` are in scope; `120`/`110`/`4x5-25`/`8x10-25` are not. */
function is35mmSlug(slug: string | null) {
  return slug != null && /^35mm\b/.test(slug);
}

export const beauPhotoAdapter: StoreAdapter = {
  storeId: "beau-photo",
  storeName: "Beau Photo",
  baseUrl: BASE_URL,

  async fetchCandidatesForFilm(film: FilmSeed): Promise<ListingCandidate[]> {
    const all = await this.fetchCandidatesForAllFilms!([film]);
    return all.get(film.id) ?? [];
  },

  async fetchCandidatesForAllFilms(films: FilmSeed[]): Promise<CandidatesByFilmId> {
    const products = await fetchWooCatalog(BASE_URL, MAX_PAGES);
    const byFilmId: CandidatesByFilmId = new Map(films.map((f) => [f.id, []]));

    for (const p of products) {
      const name = decodeEntities(p.name ?? "");
      if (!name) continue;

      // Instant film clears none of the 35mm gates below: it carries no `35mm` tag,
      // sits outside the film categories, and its own product names contain "Frame",
      // which ACCESSORY_RX vetoes. Handled first, on its own terms.
      if (looksLikeInstantFilm(name)) {
        const instantFilm = films.find(
          (f) => filmFormat(f) === "instant" && matchesFilmAliases(name, f.aliases)
        );
        if (!instantFilm) continue;

        const priceCadCents = toCadCents(p.prices);
        if (priceCadCents == null || !p.permalink) continue;

        byFilmId.get(instantFilm.id)?.push({
          url: p.permalink,
          titleRaw: name,
          priceCadCents,
          currency: "CAD",
          inStock: Boolean(p.is_in_stock),
          packSize: parsePackSize(name),
          exposures: parseExposures(name),
          isBulk: false,
          ...parseExpiry(name),
          lastCheckedAt: new Date(),
        });
        continue;
      }

      if (!inFilmCategory(p) || !hasTag(p, "35mm")) continue;
      if (ACCESSORY_RX.test(name)) continue;

      const film = films.find((f) => matchesFilmAliases(name, f.aliases));
      if (!film) continue;

      const variations = (p.variations ?? []).filter((v) => is35mmSlug(formatSlug(v)));

      if (variations.length === 0) {
        // Simple product: no per-format variation, so the tag is all we have.
        // Veto anything whose name names a different format (the catalogue holds
        // mis-tagged entries such as "Cinestill 400D 120" tagged 35mm).
        if (p.variations && p.variations.length > 0) continue;
        if (NON_35MM_RX.test(name)) continue;

        const priceCadCents = toCadCents(p.prices);
        if (priceCadCents == null || !p.permalink) continue;

        byFilmId.get(film.id)?.push({
          url: p.permalink,
          titleRaw: name,
          priceCadCents,
          currency: "CAD",
          inStock: Boolean(p.is_in_stock),
          packSize: parsePackSize(name),
          exposures: parseExposures(name),
          isBulk: isBulkRoll(name),
          ...parseExpiry(name),
          lastCheckedAt: new Date(),
        });
        continue;
      }

      // Variable product: the parent price is only a range, so fetch each 35mm
      // variation for its own price and stock.
      for (const v of variations) {
        const slug = formatSlug(v) ?? "";
        const detail = await fetchWooProduct(BASE_URL, v.id);
        if (!detail) continue;

        const priceCadCents = toCadCents(detail.prices);
        if (priceCadCents == null) continue;

        const label = decodeEntities(detail.variation ?? "");
        const titleRaw = label ? `${name} — ${label}` : name;
        const url = detail.permalink ?? p.permalink;
        if (!url) continue;

        byFilmId.get(film.id)?.push({
          url,
          titleRaw,
          priceCadCents,
          currency: "CAD",
          inStock: Boolean(detail.is_in_stock),
          packSize: parsePackSize(titleRaw),
          exposures: parseExposures(titleRaw),
          // The slug is authoritative; the label writes it as "100′ roll" with a
          // prime character that the title-based test doesn't catch.
          isBulk: slug.includes("100-roll") || isBulkRoll(titleRaw),
          ...parseExpiry(titleRaw),
          lastCheckedAt: new Date(),
        });
      }
    }

    return byFilmId;
  },
};
