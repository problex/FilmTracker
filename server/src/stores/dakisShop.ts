import type { FilmSeed } from "../catalog/films.js";
import type { ListingCandidate, StoreAdapter } from "./types.js";

/**
 * Read the product from the rendered DOM rather than from page text.
 *
 * `document.title` carries the product name; the price lives in
 * `.d-product-price-regular`. Deliberately not any `[class*="price"]` element —
 * the page also renders `.warranty-price` ("Price: $49.99") for an extended-warranty
 * upsell, which would silently replace the film price on every listing.
 */
export const PRODUCT_EXTRACT_JS = `(() => {
  var el = document.querySelector(".d-product-price-regular")
        || document.querySelector(".d-product-price-regular-container");
  var price = el ? (el.textContent || "").trim() : null;
  var body = document.body ? (document.body.innerText || "") : "";
  var inStock = /add to cart/i.test(body) && !/(out of stock|sold out|unavailable)/i.test(body);
  return JSON.stringify({ title: document.title || "", price: price, inStock: inStock });
})()`;

/** Product pages that failed to render keep the platform's placeholder title. */
export const GENERIC_TITLE_RX = /^(shop product|product|shop)$/i;

/**
 * "Kodak Gold 200 Film 135-24 exp - Don's Photo" -> "Kodak Gold 200 Film 135-24 exp"
 *
 * Compared with punctuation and spacing removed: the seed name is "Dons Photo" while
 * the page title writes "Don's Photo", so an exact match strips nothing.
 */
export function stripStoreSuffix(title: string, storeName: string) {
  const squash = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, "");
  const target = squash(storeName);
  if (!target) return title.trim();

  const idx = Math.max(title.lastIndexOf(" - "), title.lastIndexOf(" | "), title.lastIndexOf(" – "));
  if (idx <= 0) return title.trim();

  // startsWith, not equality: the page title may carry a legal suffix the store seed
  // does not ("DowntownCamera" vs "DOWNTOWN CAMERA LIMITED").
  const tail = squash(title.slice(idx + 3));
  return tail.startsWith(target) ? title.slice(0, idx).trim() : title.trim();
}

/**
 * Longest plausible product title. A backstop: before the DOM selectors above, this
 * adapter fell back to the entire rendered page, producing listings whose price came
 * from the first product on a search page and whose pack size came from a different
 * product further down. Real titles top out around 110 characters.
 */
const MAX_TITLE_LEN = 160;
/**
 * Search results and category listings, which are not individual products.
 *
 * Decided on the path only: product URLs are `/shop/<slug>/<uuid>` and legitimately
 * carry a `?query=` param from the search that found them, so testing the query
 * string rejects real products.
 */
function isListingPage(rawUrl: string) {
  let path: string;
  try {
    path = new URL(rawUrl).pathname.replace(/\/+$/, "");
  } catch {
    return true;
  }
  if (/\/categories(\/|$)/i.test(path)) return true;
  if (/\/search$/i.test(path)) return true;
  // Bare "/shop" with no product slug is the search-results page.
  return /^\/shop$/i.test(path);
}
import {
  isBulkRoll,
  looksLike35mm,
  matchesFilmAliases,
  parseExpiry,
  parseExposures,
  parseMoneyToCents,
  parsePackSize,
} from "./shared.js";
import { withPage } from "./dakisBrowser.js";

function buildShopQueryUrl(baseUrl: string, q: string) {
  const u = new URL("/shop", baseUrl);
  u.searchParams.set("query", q);
  return u.toString();
}

function normalizeWhitespace(s: string) {
  return s.replace(/\s+/g, " ").trim();
}

export function createDakisShopAdapter(params: {
  storeId: string;
  storeName: string;
  baseUrl: string;
  shopPath?: string;
}): StoreAdapter {
  const { storeId, storeName, baseUrl } = params;
  const shopPath = params.shopPath ?? "/shop";

  return {
    storeId,
    storeName,
    baseUrl,

    async fetchCandidatesForFilm(film: FilmSeed): Promise<ListingCandidate[]> {
      const q = `${film.aliases[0] ?? `${film.brand} ${film.name}`} 135`;
      const shopUrl = (() => {
        const u = new URL(shopPath, baseUrl);
        u.searchParams.set("query", q);
        return u.toString();
      })();

      return await withPage(async (page) => {
        await page.goto(shopUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
        // Give client-side search time to render.
        await page.waitForTimeout(4000);
        await page.waitForSelector("a[href*='/shop/']", { timeout: 25000 }).catch(() => undefined);

        // Collect product links from the rendered DOM.
        const links = await page.$$eval("a[href*='/shop/']", (as) =>
          as
            .map((a) => (a as any).href as string)
            .filter(Boolean)
        );
        const unique = Array.from(new Set(links)).slice(0, 12);

        const out: ListingCandidate[] = [];
        for (const url of unique) {
          // Search and category pages are not products; scraping them yields a
          // mash-up of every item shown.
          if (isListingPage(url)) continue;

          // quick relevance gate
          const lower = url.toLowerCase();
          if (!film.aliases.some((a) => lower.includes(a.split(" ")[0].toLowerCase()))) {
            // still might match; continue
          }

          await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
          await page.waitForTimeout(3000);

          const raw = await page.evaluate(PRODUCT_EXTRACT_JS);
          let detail: { title: string; price: string | null; inStock: boolean };
          try {
            detail = JSON.parse(typeof raw === "string" ? raw : String(raw));
          } catch {
            continue;
          }

          // A product page that never rendered its product keeps the generic title
          // and has no price element.
          const mergedTitle = normalizeWhitespace(stripStoreSuffix(detail.title, storeName));
          if (!mergedTitle || GENERIC_TITLE_RX.test(mergedTitle)) continue;
          if (mergedTitle.length > MAX_TITLE_LEN) continue;

          const priceCadCents = detail.price ? parseMoneyToCents(detail.price) : null;
          if (priceCadCents == null) continue;

          if (!looksLike35mm(mergedTitle)) continue;

          const inStock = detail.inStock;

          // Ensure film match (shared matcher: ISO tokens on word boundaries).
          if (!matchesFilmAliases(mergedTitle, film.aliases)) continue;

          out.push({
            url,
            titleRaw: mergedTitle,
            priceCadCents,
            currency: "CAD",
            inStock,
            packSize: parsePackSize(mergedTitle),
            exposures: parseExposures(mergedTitle),
            // Title only, for the same reason as kerrisdale.ts.
            isBulk: isBulkRoll(mergedTitle),
            ...parseExpiry(mergedTitle),
            lastCheckedAt: new Date(),
          });

          if (out.length >= 3) break;
        }

        return out;
      });
    },
  };
}

