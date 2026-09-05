import type { FilmSeed } from "../catalog/films.js";
import type { ListingCandidate, StoreAdapter } from "./types.js";

/** Longest plausible product title; anything longer is page text, not a product. */
const MAX_TITLE_LEN = 160;
/** Search results and category listings, which are not individual products. */
const LISTING_PAGE_RX = /\/categories\/|[?&]qu=|[?&]q=|\/search\b/i;
import {
  isBulkRoll,
  looksLike35mm,
  matchesFilmAliases,
  parseExpiry,
  parseExposures,
  parseMoneyToCents,
  parsePackSize,
} from "./shared.js";
import { extractRenderedText, withPage } from "./dakisBrowser.js";

function buildShopQueryUrl(baseUrl: string, q: string) {
  const u = new URL("/shop", baseUrl);
  u.searchParams.set("query", q);
  return u.toString();
}

function normalizeWhitespace(s: string) {
  return s.replace(/\s+/g, " ").trim();
}

function pickPriceFromText(text: string) {
  // Prefer "Price: $xx.xx" patterns if present, else first $xx.xx
  const m = text.match(/Price:\s*\$([0-9][0-9,]*(?:\.[0-9]{2})?)/i);
  if (m?.[1]) return m[1];
  const m2 = text.match(/\$([0-9][0-9,]*(?:\.[0-9]{2})?)/);
  return m2?.[1] ?? null;
}

function looksInStockFromText(text: string) {
  const t = text.toLowerCase();
  if (t.includes("out of stock") || t.includes("sold out")) return false;
  if (t.includes("in stock")) return true;
  // Unknown -> treat as in stock false to be safe
  return false;
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
          if (LISTING_PAGE_RX.test(url)) continue;

          // quick relevance gate
          const lower = url.toLowerCase();
          if (!film.aliases.some((a) => lower.includes(a.split(" ")[0].toLowerCase()))) {
            // still might match; continue
          }

          await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
          await page.waitForTimeout(3000);

          const text = normalizeWhitespace(await extractRenderedText(page));
          const priceStr = pickPriceFromText(text);
          const priceCadCents = priceStr ? parseMoneyToCents(priceStr) : null;
          if (priceCadCents == null) continue;

          // Title: first line often contains product name
          const titleLine = text.split("\n").map(normalizeWhitespace).find((l) => l.length > 6) ?? "Film";
          const titleRaw = titleLine;

          if (!looksLike35mm(titleRaw) && !looksLike35mm(text)) continue;

          const inStock = looksInStockFromText(text);
          const mergedTitle = `${titleRaw}`;

          // A product title is a short line. This adapter extracts the whole rendered
          // page when it cannot find one, which produced listings whose price came
          // from the first product on a search page and whose pack size came from a
          // different product further down — a 3-pack priced at the single-roll price.
          // Every other store's titles top out around 110 characters.
          if (mergedTitle.length > MAX_TITLE_LEN) continue;

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
            isBulk: isBulkRoll(mergedTitle) || isBulkRoll(text),
            ...parseExpiry(`${mergedTitle} ${text}`),
            lastCheckedAt: new Date(),
          });

          if (out.length >= 3) break;
        }

        return out;
      });
    },
  };
}

