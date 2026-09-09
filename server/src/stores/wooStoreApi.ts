import { filmFormat, type FilmSeed } from "../catalog/films.js";
import type { CandidatesByFilmId, ListingCandidate, StoreAdapter } from "./types.js";
import {
  fetchText,
  isBulkRoll,
  looksLike35mm,
  looksLikeInstantFilm,
  matchesFilmAliases,
  parseExpiry,
  parseExposures,
  parsePackSize,
  ACCESSORY_RX,
} from "./shared.js";

/**
 * WooCommerce Store API (`/wp-json/wc/store/v1/products`).
 *
 * Preferred over scraping WooCommerce HTML: prices arrive as integer minor units,
 * stock is an explicit boolean, and the whole catalogue is a couple of requests
 * rather than a search plus a product page per film.
 */
export type WooProduct = {
  id: number;
  name: string;
  permalink: string;
  is_in_stock: boolean;
  type?: string;
  /** Human-readable variation label, e.g. "Film Format: 35mm – 36 exp." */
  variation?: string;
  categories?: { name: string }[];
  tags?: { name: string }[];
  variations?: { id: number; attributes?: { name: string; value: string }[] }[];
  prices: {
    /** Minor units, as a string — scaled by `currency_minor_unit`. */
    price: string;
    currency_code: string;
    currency_minor_unit: number;
  };
};

const PAGE_SIZE = 100;
const MAX_PAGES = 12;

/**
 * WooCommerce HTML-encodes `name` — both named entities (`&amp;`) and numeric ones
 * (`&#8211;` en dash, `&#215;` multiplication sign, as seen in real listings).
 */
export function decodeEntities(s: string) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number.parseInt(dec, 10)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

/**
 * `prices.price` is in minor units scaled by `currency_minor_unit`, so "1699" with
 * minor unit 2 is $16.99. Normalise to cents rather than assuming 2 decimals.
 */
export function toCadCents(prices: WooProduct["prices"]) {
  if (!prices || typeof prices.price !== "string") return null;
  const raw = Number.parseInt(prices.price, 10);
  if (!Number.isFinite(raw)) return null;
  if (prices.currency_code && prices.currency_code !== "CAD") return null;

  const minorUnit = Number.isFinite(prices.currency_minor_unit) ? prices.currency_minor_unit : 2;
  return Math.round(raw * 10 ** (2 - minorUnit));
}

/** Fetch one product (or variation) by id. */
export async function fetchWooProduct(baseUrl: string, id: number): Promise<WooProduct | null> {
  const u = new URL(`/wp-json/wc/store/v1/products/${id}`, baseUrl);
  try {
    const parsed = JSON.parse(await fetchText(u.toString())) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as WooProduct;
  } catch {
    return null;
  }
}

export async function fetchWooCatalog(baseUrl: string, maxPages = MAX_PAGES): Promise<WooProduct[]> {
  // A page count of 0 skips the loop entirely, returning an empty catalogue that the
  // caller cannot tell apart from a store with nothing in stock — the silent-zero
  // failure this project keeps hitting. Fall back to the shared limit instead.
  const pageLimit = Number.isFinite(maxPages) && maxPages > 0 ? maxPages : MAX_PAGES;
  const out: WooProduct[] = [];

  for (let page = 1; page <= pageLimit; page += 1) {
    const u = new URL("/wp-json/wc/store/v1/products", baseUrl);
    u.searchParams.set("per_page", String(PAGE_SIZE));
    u.searchParams.set("page", String(page));

    const raw = await fetchText(u.toString());
    let batch: WooProduct[];
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) break;
      batch = parsed as WooProduct[];
    } catch {
      break;
    }

    if (batch.length === 0) break;
    out.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }

  return out;
}

/**
 * The format a candidate was admitted as.
 *
 * Deliberately not `detectFilmFormat()`: that requires the title to say "35mm", and
 * these stores routinely omit it — FilmWarehouse's "Ultramax 400 36exp 3pk" and Beau
 * Photo's "Candido 400 Colour Film" are 35mm, decided by the store's own classifier
 * from tags, categories and variation attributes. By the time a candidate exists that
 * decision has already been made, so re-deriving it here would throw away everything
 * those classifiers are for.
 */
function candidateFormat(titleRaw: string): "35mm" | "instant" {
  return looksLikeInstantFilm(titleRaw) ? "instant" : "35mm";
}

function toCandidate(
  p: WooProduct,
  is35mm: (p: WooProduct, title: string) => boolean
): ListingCandidate | null {
  const titleRaw = decodeEntities(p.name ?? "");
  if (!titleRaw) return null;

  // Instant film takes neither of the 35mm gates. ACCESSORY_RX vetoes "frame", which
  // is part of Polaroid's own product names ("600 White Frame"), and a store's custom
  // is35mm classifier reads 35mm tags and format attributes that instant film has no
  // reason to carry. `looksLikeInstantFilm` already rejects cameras and photo books.
  if (!looksLikeInstantFilm(titleRaw)) {
    if (ACCESSORY_RX.test(titleRaw)) return null;
    if (!is35mm(p, titleRaw)) return null;
  }

  const priceCadCents = toCadCents(p.prices);
  if (priceCadCents == null) return null;
  if (!p.permalink) return null;

  return {
    url: p.permalink,
    titleRaw,
    priceCadCents,
    currency: "CAD",
    inStock: Boolean(p.is_in_stock),
    packSize: parsePackSize(titleRaw),
    exposures: parseExposures(titleRaw),
    isBulk: isBulkRoll(titleRaw),
    ...parseExpiry(titleRaw),
    lastCheckedAt: new Date(),
  };
}

export function createWooStoreApiAdapter(params: {
  storeId: string;
  storeName: string;
  baseUrl: string;
  /**
   * Decide whether a product is 35mm. Defaults to reading the title, which is right
   * when the store puts the format there. Stores that omit it from some titles pass
   * their own classifier (see `filmWarehouse.ts`).
   */
  is35mm?: (p: WooProduct, title: string) => boolean;
  /**
   * Pages of 100 to walk; raise for large catalogues. Omit to use the shared limit —
   * a non-positive value is treated as "unset" rather than "fetch nothing".
   */
  maxPages?: number;
}): StoreAdapter {
  const { storeId, storeName, baseUrl } = params;
  const is35mm = params.is35mm ?? ((_p, title) => looksLike35mm(title));
  const maxPages = params.maxPages ?? MAX_PAGES;

  return {
    storeId,
    storeName,
    baseUrl,

    async fetchCandidatesForFilm(film: FilmSeed): Promise<ListingCandidate[]> {
      const u = new URL("/wp-json/wc/store/v1/products", baseUrl);
      u.searchParams.set("per_page", String(PAGE_SIZE));
      u.searchParams.set("search", `${film.aliases[0] ?? `${film.brand} ${film.name}`} 35mm`);

      const raw = await fetchText(u.toString());
      let products: WooProduct[];
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) return [];
        products = parsed as WooProduct[];
      } catch {
        return [];
      }

      const out: ListingCandidate[] = [];
      for (const p of products) {
        const candidate = toCandidate(p, is35mm);
        if (!candidate) continue;
        if (candidateFormat(candidate.titleRaw) !== filmFormat(film)) continue;
        if (!matchesFilmAliases(candidate.titleRaw, film.aliases)) continue;
        out.push(candidate);
      }
      return out;
    },

    async fetchCandidatesForAllFilms(films: FilmSeed[]): Promise<CandidatesByFilmId> {
      const products = await fetchWooCatalog(baseUrl, maxPages);
      const byFilmId: CandidatesByFilmId = new Map(films.map((f) => [f.id, []]));

      for (const p of products) {
        const candidate = toCandidate(p, is35mm);
        if (!candidate) continue;

        // Format first: a Polaroid title must never be offered to a 35mm film's
        // aliases, nor the reverse.
        const format = candidateFormat(candidate.titleRaw);
        const film = films.find(
          (f) => filmFormat(f) === format && matchesFilmAliases(candidate.titleRaw, f.aliases)
        );
        if (!film) continue;

        byFilmId.get(film.id)?.push(candidate);
      }

      return byFilmId;
    },
  };
}
