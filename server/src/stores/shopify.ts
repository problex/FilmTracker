import { filmFormat, type FilmFormat, type FilmSeed } from "../catalog/films.js";
import type { CandidatesByFilmId, ListingCandidate, StoreAdapter } from "./types.js";
import {
  fetchText,
  isBulkRoll,
  detectFilmFormat,
  matchesFilmAliases,
  parseExpiry,
  parseExposures,
  parseMoneyToCents,
  parsePackSize,
} from "./shared.js";

type ShopifyProductJs = {
  title: string;
  handle: string;
  variants: {
    id: number;
    title: string;
    available: boolean;
    price: number; // cents
  }[];
};

/**
 * Shape returned by `/collections/all/products.json`.
 *
 * Note the price format differs from `/products/<handle>.js`: here `price` is a
 * *string in dollars* ("16.99"), there it is a *number in cents* (1699). Parse it,
 * don't reuse it directly.
 */
type ShopifyProductsJson = {
  products: {
    title: string;
    handle: string;
    variants: {
      id: number;
      title: string;
      available: boolean;
      price: string; // dollars, e.g. "16.99"
    }[];
  }[];
};

const CATALOG_PAGE_SIZE = 250;
const CATALOG_MAX_PAGES = 12;

function extractProductHandlesFromHtml(html: string) {
  const handles = new Set<string>();

  // Links like /products/<handle>
  const re = /href=\"\/products\/([a-z0-9][a-z0-9-]+)(?:\?[^"]*)?\"/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m[1]) handles.add(m[1]);
  }
  return [...handles];
}

async function fetchProductJson(baseUrl: string, handle: string): Promise<ShopifyProductJs | null> {
  const url = new URL(`/products/${handle}.js`, baseUrl).toString();
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 15000);
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        "user-agent": "FilmTracker/0.1 (+https://localhost) - price tracker",
        accept: "application/json,text/javascript,*/*",
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(id);
  }
  if (!res.ok) return null;
  return (await res.json()) as ShopifyProductJs;
}

function chooseBestVariant(p: ShopifyProductJs, format: FilmFormat) {
  // Choose the cheapest available variant matching the film's own format.
  const candidates = p.variants
    .filter((v) => v && typeof v.title === "string")
    .filter((v) => detectFilmFormat(`${p.title} ${v.title}`) === format)
    .sort((a, b) => a.price - b.price);
  return candidates[0] ?? null;
}

/** Fetch the store's whole catalogue via the paginated products.json endpoint. */
async function fetchCatalog(baseUrl: string) {
  const products: ShopifyProductsJson["products"] = [];

  for (let page = 1; page <= CATALOG_MAX_PAGES; page += 1) {
    const u = new URL("/collections/all/products.json", baseUrl);
    u.searchParams.set("limit", String(CATALOG_PAGE_SIZE));
    u.searchParams.set("page", String(page));

    const raw = await fetchText(u.toString());
    let parsed: ShopifyProductsJson;
    try {
      parsed = JSON.parse(raw) as ShopifyProductsJson;
    } catch {
      break;
    }

    const batch = parsed.products ?? [];
    if (batch.length === 0) break;
    products.push(...batch);
    if (batch.length < CATALOG_PAGE_SIZE) break;
  }

  return products;
}

/**
 * Cheapest variant of a products.json entry that is a format we track, with price in
 * cents and the format it was recognised as. The format travels with the variant so
 * the caller can restrict alias matching to films of that format.
 */
function chooseBestTrackedVariantFromCatalog(p: ShopifyProductsJson["products"][number]) {
  const candidates = p.variants
    .filter((v) => v && typeof v.title === "string")
    .map((v) => ({
      ...v,
      priceCadCents: parseMoneyToCents(v.price),
      format: detectFilmFormat(`${p.title} ${v.title}`),
    }))
    .filter((v) => v.priceCadCents != null && v.format != null)
    .sort((a, b) => (a.priceCadCents ?? 0) - (b.priceCadCents ?? 0));
  return candidates[0] ?? null;
}

export function createShopifyAdapter(params: {
  storeId: string;
  storeName: string;
  baseUrl: string;
  // Optional: a fixed collection/search path for film
  searchPath?: string;
}): StoreAdapter {
  const { storeId, storeName, baseUrl } = params;
  const searchPath = params.searchPath ?? "/search";

  return {
    storeId,
    storeName,
    baseUrl,

    async fetchCandidatesForFilm(film: FilmSeed): Promise<ListingCandidate[]> {
      const format = filmFormat(film);
      const q = `${film.aliases[0] ?? `${film.brand} ${film.name}`}${format === "35mm" ? " 35mm" : ""}`;
      const u = new URL(searchPath, baseUrl);
      u.searchParams.set("q", q);

      const html = await fetchText(u.toString());
      const handles = extractProductHandlesFromHtml(html).slice(0, 20);

      const out: ListingCandidate[] = [];
      for (const handle of handles) {
        const p = await fetchProductJson(baseUrl, handle).catch(() => null);
        if (!p) continue;

        const variant = chooseBestVariant(p, format);
        if (!variant) continue;

        const variantPart = variant.title && variant.title.toLowerCase() !== "default title" ? ` — ${variant.title}` : "";
        const titleRaw = `${p.title}${variantPart}`;
        if (!matchesFilmAliases(titleRaw, film.aliases)) continue;

        const url = new URL(`/products/${handle}`, baseUrl);
        url.searchParams.set("variant", String(variant.id));

        out.push({
          url: url.toString(),
          titleRaw,
          priceCadCents: variant.price,
          currency: "CAD",
          inStock: variant.available,
          packSize: parsePackSize(`${p.title} ${variant.title}`),
          exposures: parseExposures(`${p.title} ${variant.title}`),
          isBulk: isBulkRoll(`${p.title} ${variant.title}`),
          ...parseExpiry(titleRaw),
          lastCheckedAt: new Date(),
        });
      }

      return out;
    },

    async fetchCandidatesForAllFilms(films: FilmSeed[]): Promise<CandidatesByFilmId> {
      const products = await fetchCatalog(baseUrl);
      const byFilmId: CandidatesByFilmId = new Map(films.map((f) => [f.id, []]));

      for (const p of products) {
        if (!Array.isArray(p.variants) || typeof p.title !== "string") continue;

        const variant = chooseBestTrackedVariantFromCatalog(p);
        if (!variant || variant.priceCadCents == null || variant.format == null) continue;

        const variantPart =
          variant.title && variant.title.toLowerCase() !== "default title" ? ` — ${variant.title}` : "";
        const titleRaw = `${p.title}${variantPart}`;

        // Format first: a Polaroid title must never be offered to a 35mm film's
        // aliases, nor the reverse.
        const film = films.find(
          (f) => filmFormat(f) === variant.format && matchesFilmAliases(titleRaw, f.aliases)
        );
        if (!film) continue;

        const url = new URL(`/products/${p.handle}`, baseUrl);
        url.searchParams.set("variant", String(variant.id));

        byFilmId.get(film.id)?.push({
          url: url.toString(),
          titleRaw,
          priceCadCents: variant.priceCadCents,
          currency: "CAD",
          inStock: Boolean(variant.available),
          packSize: parsePackSize(`${p.title} ${variant.title}`),
          exposures: parseExposures(`${p.title} ${variant.title}`),
          isBulk: isBulkRoll(`${p.title} ${variant.title}`),
          ...parseExpiry(titleRaw),
          lastCheckedAt: new Date(),
        });
      }

      return byFilmId;
    },
  };
}

